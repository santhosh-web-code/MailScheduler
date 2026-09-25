import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config';
import { redisConnection } from '../modules/queue/redisConnection';
import { emailQueue } from '../modules/queue/emailQueue';
import { getHourKey } from '../modules/rateLimit/hourlyLimiter';

async function main() {
  console.log('========================================================');
  console.log('🧪 Multi-Worker Atomic Rate Limiting & Race Condition Test');
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

  const currentHourKey = getHourKey(sender.id);
  await redisConnection.del(currentHourKey);
  console.log(`[Test] Cleared rate key "${currentHourKey}" in Redis.\n`);

  const TOTAL_JOBS = 20;
  const HOURLY_LIMIT = 5;
  const now = new Date();

  console.log(`Test Parameters:`);
  console.log(`- Total Emails to Enqueue : ${TOTAL_JOBS}`);
  console.log(`- Batch Hourly Limit       : ${HOURLY_LIMIT}`);
  console.log(`- Expected Sent This Hour  : EXACTLY ${HOURLY_LIMIT}`);
  console.log(`- Expected Rescheduled     : EXACTLY ${TOTAL_JOBS - HOURLY_LIMIT} (status: "rate_limited")\n`);

  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: 'Race Condition Throttle Test',
      bodyHtml: '<p>Testing atomic rate limiter across concurrent workers.</p>',
      startTime: now,
      delayBetweenEmailsMs: 100, // Minimal delay to test concurrent collision
      hourlyLimit: HOURLY_LIMIT,
      status: 'pending',
    },
  });

  console.log(`Created EmailBatch [ID: ${batch.id}]`);

  for (let i = 1; i <= TOTAL_JOBS; i++) {
    const recipientEmail = `prospect-${i}@enterprise-scale.io`;

    const job = await prisma.emailJob.create({
      data: {
        batchId: batch.id,
        recipientEmail,
        subject: batch.subject,
        bodyHtml: batch.bodyHtml,
        status: 'scheduled',
        scheduledFor: now,
      },
    });

    const bullJob = await emailQueue.add(
      'send-email',
      {
        jobId: job.id,
        batchId: batch.id,
        recipientEmail,
        subject: batch.subject,
        bodyHtml: batch.bodyHtml,
        senderId: sender.id,
        scheduledFor: now.toISOString(),
      },
      {
        jobId: job.id,
        delay: 0, // Immediately available to trigger simultaneous execution
      }
    );

    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        bullJobId: bullJob.id,
        status: 'queued',
      },
    });
  }

  await prisma.emailBatch.update({
    where: { id: batch.id },
    data: { status: 'in_progress' },
  });

  console.log(`✅ Successfully queued ${TOTAL_JOBS} concurrent jobs to "email-send".\n`);
  console.log('--------------------------------------------------------');
  console.log('Instructions to Verify:');
  console.log('1. Start or observe the worker terminal: npm run worker');
  console.log('2. The worker will pick up all 20 ready jobs with concurrency=5.');
  console.log(`3. Exactly ${HOURLY_LIMIT} will succeed and mark EmailJob.status="sent".`);
  console.log(`4. Exactly ${TOTAL_JOBS - HOURLY_LIMIT} will be rate-limited and rescheduled to the next window (status="rate_limited").`);
  console.log('5. If Slack is connected, a rate-limit alert is posted to Slack incoming webhook.');
  console.log('========================================================\n');

  await emailQueue.close();
  await redisConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Test execution error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
