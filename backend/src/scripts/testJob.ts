import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config';
import { emailQueue, EMAIL_QUEUE_NAME } from '../modules/queue/emailQueue';
import { redisConnection } from '../modules/queue/redisConnection';

async function main() {
  const recipientEmail =
    process.argv[2] ||
    process.env.TEST_RECIPIENT ||
    process.env.SMTP_FROM_EMAIL ||
    'santhoshnanisanka@gmail.com';

  console.log('========================================================');
  console.log('🧪 ReachInbox Real Gmail SMTP Test Job Dispatcher');
  console.log('========================================================');
  console.log(`- Mail Provider : ${process.env.MAIL_PROVIDER || 'smtp'}`);
  console.log(`- SMTP Host     : ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`- SMTP Port     : ${process.env.SMTP_PORT || '587'}`);
  console.log(`- SMTP User     : ${process.env.SMTP_USER || 'Not set'}`);
  console.log(`- SMTP From     : "${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`);
  console.log(`- Recipient     : ${recipientEmail}`);
  console.log('========================================================\n');

  // 1. Resolve User and Sender in DB
  const fromEmail = process.env.SMTP_FROM_EMAIL || 'santhoshnanisanka@gmail.com';
  const fromName = process.env.SMTP_FROM_NAME || 'Santhosh';

  let sender = await prisma.emailSender.findFirst({
    where: { fromAddress: fromEmail },
    include: { user: true },
  });

  if (!sender) {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: `test-user-${Date.now()}`,
          email: fromEmail,
          name: fromName,
        },
      });
    }
    sender = await prisma.emailSender.create({
      data: {
        userId: user.id,
        fromAddress: fromEmail,
        fromName: fromName,
      },
      include: { user: true },
    });
  }

  console.log(`[TestJob] Using sender: "${sender.fromName}" <${sender.fromAddress}> (ID: ${sender.id})`);

  // 2. Create Batch in DB
  const batch = await prisma.emailBatch.create({
    data: {
      userId: sender.userId,
      senderId: sender.id,
      subject: 'ReachInbox Real Gmail SMTP Verification',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-top: 0;">🚀 ReachInbox Email Scheduler Verification</h2>
          <p>Hello,</p>
          <p>This email confirms that ReachInbox has successfully connected to your real Gmail SMTP account and dispatched an outreach message through the BullMQ worker pipeline.</p>
          <div style="background: #ffffff; padding: 16px; border: 1px solid #e2e8f0; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Sender:</strong> ${sender.fromName} &lt;${sender.fromAddress}&gt;</p>
            <p style="margin: 4px 0;"><strong>Recipient:</strong> ${recipientEmail}</p>
            <p style="margin: 4px 0;"><strong>Dispatched At:</strong> ${new Date().toISOString()}</p>
            <p style="margin: 4px 0;"><strong>Transport:</strong> Gmail SMTP (smtp.gmail.com:587)</p>
          </div>
          <p style="color: #64748b; font-size: 13px;">ReachInbox Email Scheduler &bull; BullMQ &bull; NodeMailer</p>
        </div>
      `,
      startTime: new Date(),
      status: 'in_progress',
    },
  });

  // 3. Create EmailJob in DB
  const emailJob = await prisma.emailJob.create({
    data: {
      batchId: batch.id,
      recipientEmail,
      subject: batch.subject,
      bodyHtml: batch.bodyHtml,
      status: 'scheduled',
      scheduledFor: new Date(),
    },
  });

  console.log(`[TestJob] Created EmailJob in MySQL (ID: ${emailJob.id}, Status: ${emailJob.status})`);

  // 4. Initialize Worker to process jobs
  const { emailWorker } = await import('../modules/queue/emailWorker');

  // 5. Enqueue Job to BullMQ
  const bullJob = await emailQueue.add(
    'send-email',
    {
      jobId: emailJob.id,
      batchId: batch.id,
      recipientEmail,
      subject: batch.subject,
      bodyHtml: batch.bodyHtml,
      senderId: sender.id,
      scheduledFor: emailJob.scheduledFor.toISOString(),
    },
    {
      jobId: `test-job-${emailJob.id}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    }
  );

  console.log(`[TestJob] Dispatched BullMQ Job (ID: ${bullJob.id}) to queue "${EMAIL_QUEUE_NAME}". Waiting for execution...`);

  // 6. Wait for job completion or failure (poll DB status)
  const startTime = Date.now();
  const timeoutMs = 45000;
  let finalJobRecord = null;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    finalJobRecord = await prisma.emailJob.findUnique({
      where: { id: emailJob.id },
    });

    if (finalJobRecord && (finalJobRecord.status === 'sent' || finalJobRecord.status === 'failed')) {
      break;
    }
  }

  console.log('\n========================================================');
  console.log('📊 FINAL EXECUTION REPORT');
  console.log('========================================================');
  if (finalJobRecord) {
    console.log(`- Job ID       : ${finalJobRecord.id}`);
    console.log(`- Recipient    : ${finalJobRecord.recipientEmail}`);
    console.log(`- Status       : ${finalJobRecord.status.toUpperCase()}`);
    console.log(`- Scheduled At : ${finalJobRecord.scheduledFor.toISOString()}`);
    console.log(`- Sent At      : ${finalJobRecord.sentAt ? finalJobRecord.sentAt.toISOString() : 'N/A'}`);
    if (finalJobRecord.errorMessage) {
      console.log(`- Error Message: ${finalJobRecord.errorMessage}`);
    }

    if (finalJobRecord.status === 'sent') {
      console.log('\n✅ Real email successfully sent via Gmail SMTP transport!');
      console.log('   EmailJob.status -> "sent" and sentAt successfully recorded in DB.');
    } else {
      console.log('\n❌ Email job failed. Check error message above.');
    }
  } else {
    console.log('⚠️ Timed out waiting for job status update in database.');
  }
  console.log('========================================================\n');

  try {
    await emailWorker.close();
    await emailQueue.close();
    await redisConnection.quit();
    await prisma.$disconnect();
  } catch (_closeErr) {}

  process.exit(finalJobRecord?.status === 'sent' ? 0 : 1);
}

main().catch(async (err) => {
  console.error('❌ Failed to execute test script:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
