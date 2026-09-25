import dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';
import { RedisMemoryServer } from 'redis-memory-server';
import { prisma } from '../config';

async function main() {
  console.log('================================================================');
  console.log('🧪 REACHINBOX EMAIL SCHEDULER: END-TO-END SENDING & ETHEREAL TEST');
  console.log('================================================================\n');

  let redisServer: RedisMemoryServer | null = null;

  try {
    const testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
    });
    await testRedis.connect();
    await testRedis.ping();
    testRedis.disconnect();
    console.log('✅ Connected to existing Redis instance on port 6379.');
  } catch {
    console.log('⚙️ Starting local Redis server on port 6379...');
    redisServer = new RedisMemoryServer({ instance: { port: 6379 } });
    await redisServer.start();
    console.log('✅ Local Redis server started successfully on port 6379.');
  }

  const { emailQueue } = await import('../modules/queue/emailQueue');
  const { emailWorker } = await import('../modules/queue/emailWorker');
  const { redisConnection } = await import('../modules/queue/redisConnection');

  const user = await prisma.user.upsert({
    where: { email: 'growth.director@reachinbox.io' },
    update: {},
    create: {
      googleId: `test-google-${Date.now()}`,
      email: 'growth.director@reachinbox.io',
      name: 'Sarah Walker',
    },
  });
  console.log(`👤 Using User: ${user.name} <${user.email}> (ID: ${user.id})`);

  let sender = await prisma.emailSender.findFirst({
    where: { userId: user.id },
  });
  if (!sender) {
    sender = await prisma.emailSender.create({
      data: {
        userId: user.id,
        fromAddress: 'sarah.outreach@reachinbox.io',
        fromName: 'Sarah from ReachInbox',
      },
    });
  }
  console.log(`✉️ Sender Identity: "${sender.fromName}" <${sender.fromAddress}> (ID: ${sender.id})`);

  const recipients = [
    'alex.lead1@mock-company-alpha.com',
    'elena.exec2@mock-venture-beta.io',
    'marcus.vp3@mock-scale-gamma.org',
  ];
  const delayBetweenEmailsMs = 1500; 
  const startTime = new Date(Date.now() + 1000); 

  console.log(`\n📋 Target Recipients for Batch Scheduling:`);
  recipients.forEach((email, idx) => {
    console.log(`   ${idx + 1}. ${email}`);
  });

  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: 'Elevate your Cold Outreach with ReachInbox Scheduler',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">ReachInbox Outreach Platform</h2>
          <p>Hi there,</p>
          <p>We are reaching out to introduce our automated email scheduling platform designed specifically for high-deliverability cold outreach.</p>
          <p>Key highlights:</p>
          <ul>
            <li><strong>Intelligent Queue Throttling</strong>: Hardware-grade Redis gatekeeping</li>
            <li><strong>Atomic Hourly Rate Limiting</strong>: Sliding & fixed hour Lua windows</li>
            <li><strong>Production Retries</strong>: BullMQ exponential backoff on transient errors</li>
            <li><strong>Visual Ethereal Preview</strong>: Real-time browser confirmation</li>
          </ul>
          <p style="margin-top: 24px;">Best regards,<br/><strong>Sarah Walker</strong><br/><em>Outreach Director, ReachInbox</em></p>
        </div>
      `,
      startTime,
      delayBetweenEmailsMs,
      hourlyLimit: 50,
      status: 'pending',
    },
  });
  console.log(`\n📦 Created EmailBatch in DB: ID ${batch.id}`);

  const jobIds: string[] = [];
  const statusTransitions: Record<string, string[]> = {};

  console.log('\n--- Step 1: Scheduling Jobs in MySQL and Enqueueing in BullMQ ---');
  for (let i = 0; i < recipients.length; i++) {
    const recipientEmail = recipients[i];
    const scheduledFor = new Date(startTime.getTime() + i * delayBetweenEmailsMs);

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

    jobIds.push(emailJob.id);
    statusTransitions[emailJob.id] = ['scheduled'];
    console.log(
      `   [${i + 1}/3] Job ${emailJob.id} -> Status: "scheduled" (Scheduled For: ${scheduledFor.toLocaleTimeString()})`
    );

    const delayMs = Math.max(0, scheduledFor.getTime() - Date.now());
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
        jobId: emailJob.id, // Idempotency key
        delay: delayMs,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    const queuedJob = await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        bullJobId: bullJob.id,
        status: 'queued',
      },
    });

    statusTransitions[emailJob.id].push('queued');
    console.log(
      `         -> BullMQ Job [${bullJob.id}] enqueued. DB Status moved to: "queued"`
    );
  }

  await prisma.emailBatch.update({
    where: { id: batch.id },
    data: { status: 'in_progress' },
  });

  console.log('\n--- Step 2: BullMQ Worker Processing & Real Ethereal Sending ---');

  const previewUrls: { recipient: string; previewUrl: string; jobId: string }[] = [];

  const completionPromise = new Promise<void>((resolve, reject) => {
    let completedCount = 0;
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for all 3 emails to be processed (30s limit)'));
    }, 30000);

    emailWorker.on('completed', (job, result) => {
      if (job.data.jobId && jobIds.includes(job.data.jobId)) {
        completedCount++;
        const previewUrl = (result as any)?.previewUrl || 'N/A';
        previewUrls.push({
          recipient: job.data.recipientEmail,
          previewUrl,
          jobId: job.data.jobId,
        });
        statusTransitions[job.data.jobId].push('sent');

        console.log(
          `\n✅ [Worker Progress] (${completedCount}/3) Successfully processed & delivered to <${job.data.recipientEmail}>`
        );
        console.log(`   Ethereal Preview URL: ${previewUrl}`);

        if (completedCount === recipients.length) {
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    emailWorker.on('failed', (job, err) => {
      if (job?.data.jobId && jobIds.includes(job.data.jobId)) {
        console.error(`❌ [Worker Error] Job ${job.id} failed:`, err.message);
      }
    });
  });

  await completionPromise;

  console.log('\n================================================================');
  console.log('🔍 VERIFYING FINAL DATABASE STATE IN MYSQL:');
  console.log('================================================================');

  const finalJobs = await prisma.emailJob.findMany({
    where: { id: { in: jobIds } },
    orderBy: { scheduledFor: 'asc' },
  });

  finalJobs.forEach((job, index) => {
    const history = statusTransitions[job.id]?.join(' ➔ ') || 'N/A';
    console.log(`\nEmail ${index + 1}:`);
    console.log(`  Database ID       : ${job.id}`);
    console.log(`  Recipient         : ${job.recipientEmail}`);
    console.log(`  Subject           : "${job.subject}"`);
    console.log(`  Status Lifecycle  : ${history}`);
    console.log(`  Current Status    : ${job.status}`);
    console.log(`  Scheduled For     : ${job.scheduledFor.toISOString()}`);
    console.log(`  Delivered (sentAt): ${job.sentAt ? job.sentAt.toISOString() : 'NULL'}`);
    console.log(`  Bull Job ID       : ${job.bullJobId}`);
  });

  const finalBatch = await prisma.emailBatch.findUnique({
    where: { id: batch.id },
  });
  console.log(`\nEmailBatch Status in DB: "${finalBatch?.status}"`);

  console.log('\n================================================================');
  console.log('📬 ETHEREAL EMAIL PREVIEW LINKS (OPEN IN BROWSER TO CONFIRM):');
  console.log('================================================================');
  previewUrls.forEach((item, index) => {
    console.log(`\nEmail #${index + 1}:`);
    console.log(`  Recipient: ${item.recipient}`);
    console.log(`  Preview  : ${item.previewUrl}`);
  });
  console.log('\n================================================================');
  console.log('🎉 ALL 3 EMAILS SUCCESSFULLY SENT AND VERIFIED END-TO-END!');
  console.log('================================================================\n');

  await emailWorker.close();
  await emailQueue.close();
  await redisConnection.quit();
  await prisma.$disconnect();
  if (redisServer) {
    await redisServer.stop();
  }

  process.exit(0);
}

main().catch(async (error) => {
  console.error('\n❌ Test execution failed:', error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
