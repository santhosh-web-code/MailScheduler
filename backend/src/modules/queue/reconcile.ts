import { prisma } from '../../config';
import { emailQueue } from './emailQueue';

export async function reconcileQueue(): Promise<{
  checked: number;
  reconciled: number;
  alreadyActiveInRedis: number;
}> {
  console.log('[Reconciliation] Starting queue reconciliation scan...');

  try {

    const pendingJobs = await prisma.emailJob.findMany({
      where: {
        status: { in: ['scheduled', 'queued', 'rate_limited'] },
      },
    });

    let reconciledCount = 0;
    let activeInRedisCount = 0;

    for (const dbJob of pendingJobs) {
      let isExistingInRedis = false;

      if (dbJob.bullJobId) {
        try {
          const redisJob = await emailQueue.getJob(dbJob.bullJobId);
          if (redisJob) {
            isExistingInRedis = true;
            activeInRedisCount++;
          }
        } catch (err) {
          console.warn(
            `[Reconciliation] Warning: Failed to query Redis for bullJobId ${dbJob.bullJobId}:`,
            (err as Error).message
          );
        }
      }

      if (!isExistingInRedis) {
        const remainingDelayMs = Math.max(0, dbJob.scheduledFor.getTime() - Date.now());

        console.log(
          `[Reconciliation] Orphaned/missing job detected: [Job ID: ${dbJob.id}] to <${dbJob.recipientEmail}>. Re-enqueueing (remaining delay: ${remainingDelayMs}ms)...`
        );

        const enqueuedJob = await emailQueue.add(
          'send-email',
          {
            jobId: dbJob.id,
            batchId: dbJob.batchId,
            recipientEmail: dbJob.recipientEmail,
            subject: dbJob.subject,
            bodyHtml: dbJob.bodyHtml,
            scheduledFor: dbJob.scheduledFor.toISOString(),
          },
          {
            jobId: dbJob.id, // Idempotent key
            delay: remainingDelayMs,
          }
        );

        await prisma.emailJob.update({
          where: { id: dbJob.id },
          data: {
            bullJobId: enqueuedJob.id,
            status: 'queued',
          },
        });

        reconciledCount++;
      }
    }

    console.log(
      `[Reconciliation] Scan completed. Total pending in DB: ${pendingJobs.length} | Active in Redis: ${activeInRedisCount} | Re-enqueued: ${reconciledCount}`
    );

    return {
      checked: pendingJobs.length,
      reconciled: reconciledCount,
      alreadyActiveInRedis: activeInRedisCount,
    };
  } catch (error) {
    console.error('[Reconciliation] Error during queue reconciliation:', error);

    return { checked: 0, reconciled: 0, alreadyActiveInRedis: 0 };
  }
}

export default reconcileQueue;
