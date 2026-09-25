import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config';
import { emailQueue, EMAIL_QUEUE_NAME } from '../modules/queue/emailQueue';
import { redisConnection } from '../modules/queue/redisConnection';

async function resetTestData() {
  console.log('========================================================');
  console.log('🧹 REACHINBOX TEST DATA CLEANUP & RESET SCRIPT');
  console.log('========================================================\n');

  // 1. Check existing counts in database
  const priorJobCount = await prisma.emailJob.count();
  const priorBatchCount = await prisma.emailBatch.count();
  const userCount = await prisma.user.count();
  const senderCount = await prisma.emailSender.count();

  console.log('📊 Current Database Status:');
  console.log(`- EmailJob rows   : ${priorJobCount}`);
  console.log(`- EmailBatch rows : ${priorBatchCount}`);
  console.log(`- EmailSender rows: ${senderCount}`);
  console.log(`- User rows       : ${userCount}\n`);

  // 2. Delete all EmailJob rows from MySQL
  console.log('🗑️ Deleting all EmailJob rows from MySQL...');
  const deletedJobs = await prisma.emailJob.deleteMany({});
  console.log(`✅ Successfully deleted ${deletedJobs.count} EmailJob rows.`);

  // 3. Delete all EmailBatch rows from MySQL
  console.log('🗑️ Deleting all EmailBatch rows from MySQL...');
  const deletedBatches = await prisma.emailBatch.deleteMany({});
  console.log(`✅ Successfully deleted ${deletedBatches.count} EmailBatch rows.\n`);

  // 4. Drain & clean BullMQ "email-send" queue
  console.log(`🔄 Draining and clearing BullMQ queue "${EMAIL_QUEUE_NAME}"...`);
  try {
    await emailQueue.drain(true);
    await emailQueue.clean(0, 100000, 'completed');
    await emailQueue.clean(0, 100000, 'failed');
    await emailQueue.clean(0, 100000, 'delayed');
    await emailQueue.clean(0, 100000, 'wait');
    await emailQueue.clean(0, 100000, 'active');

    try {
      await emailQueue.obliterate({ force: true });
      console.log(`✅ Queue "${EMAIL_QUEUE_NAME}" obliterated and reset.`);
    } catch {
      console.log(`✅ Queue "${EMAIL_QUEUE_NAME}" drained and cleaned.`);
    }
  } catch (queueErr) {
    console.warn('⚠️ Warning while cleaning BullMQ queue:', (queueErr as Error).message);
  }

  // 5. Clear Redis rate-limit counters (keys matching rate:*)
  console.log('\n🧹 Clearing Redis rate-limit keys (rate:*)...');
  const rateKeys = await redisConnection.keys('rate:*');
  if (rateKeys.length > 0) {
    await redisConnection.del(...rateKeys);
    console.log(`✅ Cleared ${rateKeys.length} Redis rate:* key(s):`, rateKeys);
  } else {
    console.log('✅ No rate:* keys found in Redis.');
  }

  // 6. Clear Redis idempotency keys (keys matching idempotency:*)
  console.log('🧹 Clearing Redis idempotency keys (idempotency:*)...');
  const idempotencyKeys = await redisConnection.keys('idempotency:*');
  if (idempotencyKeys.length > 0) {
    await redisConnection.del(...idempotencyKeys);
    console.log(`✅ Cleared ${idempotencyKeys.length} Redis idempotency:* key(s).`);
  } else {
    console.log('✅ No idempotency:* keys found in Redis.');
  }

  // 7. Verify final database state
  const finalJobCount = await prisma.emailJob.count();
  const finalBatchCount = await prisma.emailBatch.count();
  const finalSenderCount = await prisma.emailSender.count();
  const finalUserCount = await prisma.user.count();

  console.log('\n========================================================');
  console.log('📊 FINAL RESET VERIFICATION');
  console.log('========================================================');
  console.log(`- Scheduled & Sent Jobs (EmailJob) : ${finalJobCount} (Expected: 0)`);
  console.log(`- Batches (EmailBatch)             : ${finalBatchCount} (Expected: 0)`);
  console.log(`- Email Senders (Preserved)        : ${finalSenderCount}`);
  console.log(`- Users (Preserved)                : ${finalUserCount}`);
  console.log('========================================================\n');

  await emailQueue.close();
  await redisConnection.quit();
  await prisma.$disconnect();

  console.log('✨ Cleanup completed successfully.');
}

resetTestData().catch(async (err) => {
  console.error('❌ Error executing reset script:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
