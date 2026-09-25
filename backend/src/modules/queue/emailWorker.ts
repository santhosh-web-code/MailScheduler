import { Worker, Job, DelayedError } from 'bullmq';
import { redisConnection } from './redisConnection';
import { EMAIL_QUEUE_NAME, EmailJobData, emailQueue } from './emailQueue';
import { config, prisma, transporter, getTransporter, nodemailer } from '../../config';
import { consumeHourlyQuota } from '../rateLimit/hourlyLimiter';
import { notifyRateLimitHit } from '../slack/slackNotifier';
import { indexEmailJobAsync } from '../search';

const concurrency = Number(process.env.WORKER_CONCURRENCY) || config.worker.concurrency || 5;
const minDelayBetweenEmailsMs =
  Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS) ||
  config.rateLimit.minDelayBetweenEmailsMs ||
  2000;

export async function processEmailJob(
  job: Job<EmailJobData>,
  token?: string
): Promise<{ status: string; previewUrl?: string; processedAt: string }> {
  console.log(`\n========================================================`);
  console.log(`[EmailWorker] [STEP 1/4] 📥 Job received [ID: ${job.id}]`);
  console.log(`  Queue Name       : ${job.queueName}`);
  console.log(`  Database Job ID  : ${job.data.jobId || 'N/A'}`);
  console.log(`  Recipient        : ${job.data.recipientEmail}`);
  console.log(`  Subject          : "${job.data.subject}"`);
  console.log(`  Scheduled For    : ${job.data.scheduledFor}`);
  console.log(`  Attempt          : ${job.attemptsMade + 1} of ${job.opts?.attempts || 3}`);
  console.log(`  Executed At      : ${new Date().toISOString()}`);
  console.log(`========================================================\n`);

  try {
    let emailJobRecord = null;
    if (job.data.jobId) {
      emailJobRecord = await prisma.emailJob.findUnique({
        where: { id: job.data.jobId },
        include: {
          batch: {
            include: {
              sender: true,
            },
          },
        },
      });

      if (emailJobRecord?.status === 'sent') {
        console.log(`[EmailWorker] Job ${job.data.jobId} is already marked sent in DB. Skipping duplicate execution.`);
        return {
          status: 'already_sent',
          processedAt: emailJobRecord.sentAt?.toISOString() || new Date().toISOString(),
        };
      }
    }

    const sender = emailJobRecord?.batch?.sender;
    const fromName = sender?.fromName || 'ReachInbox Outreach';
    const fromAddress = sender?.fromAddress || 'outreach@reachinbox.io';
    const recipientEmail = emailJobRecord?.recipientEmail || job.data.recipientEmail;
    const subject = emailJobRecord?.subject || job.data.subject;
    const bodyHtml = emailJobRecord?.bodyHtml || job.data.bodyHtml;

    let hourlyLimit = emailJobRecord?.batch?.hourlyLimit || config.rateLimit.maxEmailsPerHour || 50;
    let senderId = emailJobRecord?.batch?.senderId || job.data.senderId || 'default-sender';
    let userId = emailJobRecord?.batch?.userId || null;

    console.log(`[EmailWorker] [STEP 2/4] ⏱️ Checking rate limit for sender: "${senderId}" (Limit: ${hourlyLimit}/hr)...`);
    const quota = await consumeHourlyQuota(senderId, hourlyLimit);

    if (!quota.allowed) {
      console.warn(
        `[EmailWorker] [STEP 2/4] ⚠️ RATE LIMIT EXCEEDED for sender "${senderId}" (Current count: ${quota.currentCount}/${quota.limit}). Rescheduling...`
      );

      const now = Date.now();
      const originalScheduled = new Date(job.data.scheduledFor).getTime();
      const relativeOffset = originalScheduled > 0 ? (originalScheduled % 3600000) % 300000 : 0;
      const targetDelayMs = quota.msUntilNextWindow + relativeOffset;
      const nextRunDate = new Date(now + targetDelayMs);

      console.log(
        `[EmailWorker] [STEP 2/4] Rescheduling job ${job.id} to next window at ${nextRunDate.toISOString()} (+${Math.round(targetDelayMs / 1000)}s delay)`
      );

      if (job.data.jobId) {
        await prisma.emailJob.update({
          where: { id: job.data.jobId },
          data: {
            status: 'rate_limited',
            scheduledFor: nextRunDate,
          },
        });

        indexEmailJobAsync({
          id: job.data.jobId,
          recipientEmail,
          subject,
          status: 'rate_limited',
          scheduledFor: nextRunDate,
          senderId,
          userId: userId || '',
        });
      }

      if (userId) {
        await notifyRateLimitHit(userId, fromAddress, 1);
      }

      if (token) {
        await job.moveToDelayed(now + targetDelayMs, token);
        throw new DelayedError();
      } else {
        await emailQueue.add('send-email', job.data, {
          jobId: `retry-${job.data.jobId}-${Date.now()}`,
          delay: targetDelayMs,
        });
        return {
          status: 'rate_limited_rescheduled',
          processedAt: new Date().toISOString(),
        };
      }
    }

    console.log(
      `[EmailWorker] [STEP 2/4] ✅ Rate limit check PASSED for sender "${senderId}" (${quota.currentCount}/${quota.limit})`
    );

    const effectiveFromName = process.env.SMTP_FROM_NAME || fromName;
    const effectiveFromAddress = process.env.SMTP_FROM_EMAIL || fromAddress;
    const fromField = `"${effectiveFromName}" <${effectiveFromAddress}>`;

    const providerName = process.env.SMTP_USER ? `SMTP (${process.env.SMTP_HOST || 'smtp.gmail.com'})` : 'Ethereal SMTP';
    console.log(`[EmailWorker] [STEP 3/4] 🚀 Attempting SMTP send via ${providerName}...`);
    console.log(`  From    : ${fromField}`);
    console.log(`  To      : ${recipientEmail}`);
    console.log(`  Subject : "${subject}"`);
    console.log(`  Host    : ${config.smtp.host}:${config.smtp.port} (secure: ${config.smtp.secure})`);

    const mailInfo = await transporter.sendMail({
      from: fromField,
      to: recipientEmail,
      subject,
      html: bodyHtml,
    });

    const previewUrl = nodemailer.getTestMessageUrl(mailInfo);
    const sentAtDate = new Date();

    console.log(`\n========================================================`);
    console.log(`[EmailWorker] [STEP 4/4] ✅ SMTP SEND RESULT: SUCCESS!`);
    console.log(`  Job ID      : ${job.id}`);
    console.log(`  Database ID : ${job.data.jobId || 'N/A'}`);
    console.log(`  Message ID  : ${mailInfo.messageId}`);
    console.log(`  Recipient   : ${recipientEmail}`);
    console.log(`  Delivered At: ${sentAtDate.toISOString()}`);
    if (previewUrl) {
      console.log(`  🔗 Preview URL: ${previewUrl}`);
    }
    console.log(`========================================================\n`);

    if (job.data.jobId) {
      await prisma.emailJob.update({
        where: { id: job.data.jobId },
        data: {
          status: 'sent',
          sentAt: sentAtDate,
          errorMessage: null, // clear any prior transient error message
        },
      });

      indexEmailJobAsync({
        id: job.data.jobId,
        recipientEmail,
        subject,
        bodyHtml,
        status: 'sent',
        scheduledFor: job.data.scheduledFor,
        sentAt: sentAtDate,
        senderId,
        userId: userId || '',
      });

      const batchId = emailJobRecord?.batchId || job.data.batchId;
      if (batchId) {
        const remainingPending = await prisma.emailJob.count({
          where: {
            batchId,
            status: { in: ['scheduled', 'queued', 'rate_limited'] },
          },
        });

        if (remainingPending === 0) {
          await prisma.emailBatch.update({
            where: { id: batchId },
            data: { status: 'completed' },
          });
          console.log(`[EmailWorker] Batch ${batchId} completed! All emails dispatched.`);
        }
      }
    }

    return {
      status: 'sent',
      previewUrl: previewUrl || undefined,
      processedAt: sentAtDate.toISOString(),
    };
  } catch (error) {
    if (error instanceof DelayedError) {
      throw error;
    }

    const totalAttempts = job.opts?.attempts || 3;
    const currentAttempt = job.attemptsMade + 1;
    const isExhausted = currentAttempt >= totalAttempts;
    const err = error as any;
    const errorMessage = err?.message || String(error);

    console.error(`\n========================================================`);
    console.error(`[EmailWorker] ❌ [STEP 3/4 FAILED] SMTP Send Error for job ${job.id} (Attempt ${currentAttempt}/${totalAttempts})`);
    console.error(`  Recipient    : ${job.data.recipientEmail}`);
    console.error(`  Error Name   : ${err?.name || 'Error'}`);
    console.error(`  Error Message: ${errorMessage}`);
    if (err?.code) console.error(`  Error Code   : ${err.code}`);
    if (err?.responseCode) console.error(`  Response Code: ${err.responseCode}`);
    if (err?.response) console.error(`  SMTP Response: ${err.response}`);
    if (err?.command) console.error(`  SMTP Command : ${err.command}`);
    console.error(`========================================================\n`);

    if (job.data.jobId) {
      if (isExhausted) {
        console.error(
          `[EmailWorker] ⛔ All ${totalAttempts} retry attempts exhausted for job ${job.id}. Marking permanently as 'failed'.`
        );

        await prisma.emailJob
          .update({
            where: { id: job.data.jobId },
            data: {
              status: 'failed',
              errorMessage,
            },
          })
          .catch((dbErr) => console.error('[EmailWorker] Failed to update job status to failed:', dbErr));

        indexEmailJobAsync({
          id: job.data.jobId,
          recipientEmail: job.data.recipientEmail,
          subject: job.data.subject,
          status: 'failed',
          scheduledFor: job.data.scheduledFor,
          senderId: job.data.senderId,
          userId: '',
        });
      } else {
        console.log(
          `[EmailWorker] 🔄 Transient failure on attempt ${currentAttempt}/${totalAttempts}. BullMQ exponential retry scheduled.`
        );

        await prisma.emailJob
          .update({
            where: { id: job.data.jobId },
            data: {
              errorMessage: `Attempt ${currentAttempt}/${totalAttempts} failed: ${errorMessage}`,
            },
          })
          .catch(() => {});
      }
    }

    throw error;
  }
}

export const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
  connection: redisConnection,
  concurrency,
  limiter: {
    max: 1,
    duration: minDelayBetweenEmailsMs,
  },
});

emailWorker.on('ready', () => {
  console.log(`Worker started, listening on queue: email-send, concurrency: ${concurrency}`);
  console.log(
    `[EmailWorker] Worker ready on queue "${EMAIL_QUEUE_NAME}" (Concurrency: ${concurrency}, Min Delay: ${minDelayBetweenEmailsMs}ms)`
  );
});

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} to <${job.data.recipientEmail}> successfully completed.`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} failed with error:`, err.message);
});

emailWorker.on('error', (err) => {
  console.error('[EmailWorker] Unexpected worker error:', err);
});

export default emailWorker;
