import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config';
import { emailQueue } from '../modules/queue/emailQueue';

async function main() {
  console.log('========================================================');
  console.log('🧪 Testing Prisma + BullMQ Real Scheduling & Stagger Flow');
  console.log('========================================================\n');

  const user = await prisma.user.upsert({
    where: { email: 'reachinbox.demo@example.com' },
    update: {},
    create: {
      googleId: 'dummy-google-id-123456',
      email: 'reachinbox.demo@example.com',
      name: 'Demo Outreach User',
    },
  });

  let sender = await prisma.emailSender.findFirst({
    where: { userId: user.id },
  });
  if (!sender) {
    sender = await prisma.emailSender.create({
      data: {
        userId: user.id,
        fromAddress: 'outreach@reachinbox.io',
        fromName: 'Sarah from Outreach',
      },
    });
  }

  const recipients = [
    'sarah.cto@startup-one.io',
    'michael.vp@fintech-corp.com',
    'elena.founder@ai-labs.org',
  ];
  const delayBetweenEmailsMs = 3000;
  const startTime = new Date(Date.now() + 3000); 

  console.log(`Scheduling Batch for 3 recipients:`);
  console.log(`- Start Time : ${startTime.toISOString()} (~3s from now)`);
  console.log(`- Delay      : ${delayBetweenEmailsMs}ms between sends\n`);

  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: 'Quick question regarding your engineering roadmap',
      bodyHtml: '<p>Hi there,<br/>Would love to share insights on email deliverability.</p>',
      startTime,
      delayBetweenEmailsMs,
      hourlyLimit: 50,
      status: 'pending',
    },
  });

  console.log(`✅ Created EmailBatch [ID: ${batch.id}]`);

  const createdJobs = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipientEmail = recipients[i];
    const scheduledFor = new Date(startTime.getTime() + i * delayBetweenEmailsMs);
    const delayMs = Math.max(0, scheduledFor.getTime() - Date.now());

    const emailJob = await prisma.emailJob.create({
      data: {
        batchId: batch.id,
        recipientEmail,
        subject: batch.subject,
        bodyHtml: batch.bodyHtml,
        status: 'scheduled',
        scheduledFor,
      },
    });

    const bullJob = await emailQueue.add(
      'send-email',
      {
        jobId: emailJob.id,
        batchId: batch.id,
        recipientEmail,
        subject: batch.subject,
        bodyHtml: batch.bodyHtml,
        senderId: sender.id,
        scheduledFor: scheduledFor.toISOString(),
        delayBetweenEmailsMs,
      },
      {
        jobId: emailJob.id, // Idempotent key
        delay: delayMs,
      }
    );

    const updatedJob = await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        bullJobId: bullJob.id,
        status: 'queued',
      },
    });

    createdJobs.push(updatedJob);
    console.log(
      `  [${i + 1}/3] Job [ID: ${updatedJob.id}] -> <${recipientEmail}> scheduledFor: ${scheduledFor.toLocaleTimeString()} (delay: ~${Math.round(delayMs / 1000)}s)`
    );
  }

  await prisma.emailBatch.update({
    where: { id: batch.id },
    data: { status: 'in_progress' },
  });

  console.log('\n--------------------------------------------------------');
  console.log('✅ All 3 jobs committed to MySQL and enqueued to BullMQ!');
  console.log('--------------------------------------------------------');
  console.log('Worker Verification & Mid-delay Restart Test:');
  console.log('1. Run the worker in another terminal: npm run worker');
  console.log('2. Kill the worker mid-way (Ctrl+C) before all 3 fire.');
  console.log('3. Restart the worker (npm run worker).');
  console.log('4. Verify that reconcileQueue runs at startup and:');
  console.log('   - Already-scheduled BullMQ jobs resume on time.');
  console.log('   - EmailJob.status in MySQL moves to "sent" exactly once per row without duplicates.');
  console.log('========================================================\n');

  await emailQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Error during test scheduling:', e);
  await prisma.$disconnect();
  process.exit(1);
});
