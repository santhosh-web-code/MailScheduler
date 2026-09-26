import { prisma } from '../../config';
import { emailQueue } from './emailQueue';
import { redisConnection } from './redisConnection';

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
    let healthyInRedisCount = 0;

    for (const dbJob of pendingJobs) {
      let shouldReenqueue = false;
      let redisJob = null;
      let jobState: string | null = null;

      if (dbJob.bullJobId) {
        try {
          redisJob = await emailQueue.getJob(dbJob.bullJobId);
          if (redisJob) {
            jobState = await redisJob.getState();
          }
        } catch (err) {
          console.warn(
            `[Reconciliation] Warning: Failed to query Redis for bullJobId ${dbJob.bullJobId}:`,
            (err as Error).message
          );
        }
      }

      const now = Date.now();
      const scheduledTime = dbJob.scheduledFor.getTime();
      const isDue = scheduledTime <= now;
      const remainingDelayMs = Math.max(0, scheduledTime - now);

      console.log(
        `[Reconciliation] Checking job [${dbJob.id}] to <${dbJob.recipientEmail}>: DB status='${dbJob.status}', Redis state='${jobState || 'none'}', Due=${isDue}`
      );

      if (!redisJob || !jobState || jobState === 'unknown') {
        console.log(
          `[Reconciliation] Job [${dbJob.id}] not found in Redis. Will re-enqueue.`
        );
        shouldReenqueue = true;
      } else if (jobState === 'completed') {
        console.log(
          `[Reconciliation] Job [${dbJob.id}] is marked 'completed' in Redis but '${dbJob.status}' in DB. Syncing DB status to 'sent'.`
        );
        await prisma.emailJob
          .update({
            where: { id: dbJob.id },
            data: {
              status: 'sent',
              sentAt: new Date(redisJob.finishedOn || now),
              errorMessage: null,
            },
          })
          .catch((e) => console.error('[Reconciliation] Failed to sync completed job to DB:', e));
        continue;
      } else if (jobState === 'failed') {
        console.log(
          `[Reconciliation] ⚠️ Job [${dbJob.id}] is in 'failed' state in Redis (Reason: "${redisJob.failedReason || 'unknown'}"). Removing stale failed job and re-enqueueing fresh...`
        );
        await redisJob.remove().catch(() => {});
        shouldReenqueue = true;
      } else if (jobState === 'active') {
        console.log(
          `[Reconciliation] ⚠️ Stale ACTIVE job detected [${dbJob.id}] in Redis (abandoned by previous worker process). Recovering...`
        );
        // Release any stale Redis lock key from dead worker
        if (dbJob.bullJobId) {
          const lockKey = `${emailQueue.toKey(dbJob.bullJobId)}:lock`;
          await redisConnection.del(lockKey).catch(() => {});
        }

        // Remove stale active job from Redis so it can be re-enqueued clean
        try {
          await redisJob.remove();
        } catch (removeErr) {
          console.warn(
            `[Reconciliation] Could not remove active job directly, attempting moveToFailed:`,
            (removeErr as Error).message
          );
          await redisJob.moveToFailed(new Error('Stale active job recovered on startup'), '0').catch(() => {});
          await redisJob.remove().catch(() => {});
        }
        shouldReenqueue = true;
      } else if (jobState === 'delayed') {
        if (isDue) {
          console.log(
            `[Reconciliation] ⏩ Job [${dbJob.id}] is Due Now but still in 'delayed' state in Redis. Promoting to wait queue...`
          );
          try {
            await redisJob.promote();
            healthyInRedisCount++;
          } catch (promoteErr) {
            console.warn(
              `[Reconciliation] Failed to promote delayed job (${(promoteErr as Error).message}), will re-enqueue fresh.`
            );
            await redisJob.remove().catch(() => {});
            shouldReenqueue = true;
          }
        } else {
          console.log(
            `[Reconciliation] ⏳ Job [${dbJob.id}] is legitimately delayed (${remainingDelayMs}ms remaining).`
          );
          healthyInRedisCount++;
        }
      } else if (jobState === 'waiting' || jobState === 'prioritized') {
        console.log(`[Reconciliation] ⏳ Job [${dbJob.id}] is actively waiting in queue.`);
        healthyInRedisCount++;
      } else {
        shouldReenqueue = true;
      }

      if (shouldReenqueue) {
        console.log(
          `[Reconciliation] 🚀 Re-enqueueing job [ID: ${dbJob.id}] to <${dbJob.recipientEmail}> (delay: ${remainingDelayMs}ms)...`
        );

        // Clean up any remaining old job with this bullJobId
        if (dbJob.bullJobId) {
          const oldJob = await emailQueue.getJob(dbJob.bullJobId).catch(() => null);
          if (oldJob) {
            await oldJob.remove().catch(() => {});
          }
        }

        const freshBullJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

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
            jobId: freshBullJobId,
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
        console.log(
          `[Reconciliation] ✅ Successfully re-enqueued job [${dbJob.id}] as BullMQ job [${enqueuedJob.id}].`
        );
      }
    }

    console.log(
      `[Reconciliation] Scan completed. Total pending in DB: ${pendingJobs.length} | Healthy in Redis: ${healthyInRedisCount} | Re-enqueued: ${reconciledCount}`
    );

    return {
      checked: pendingJobs.length,
      reconciled: reconciledCount,
      alreadyActiveInRedis: healthyInRedisCount,
    };
  } catch (error) {
    console.error('[Reconciliation] Error during queue reconciliation:', error);
    return { checked: 0, reconciled: 0, alreadyActiveInRedis: 0 };
  }
}

export default reconcileQueue;
