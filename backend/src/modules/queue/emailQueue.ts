import { Queue, JobsOptions } from 'bullmq';
import { redisConnection } from './redisConnection';

export const EMAIL_QUEUE_NAME = 'email-send';

export interface EmailJobData {
  jobId?: string; 
  batchId?: string; 
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  senderId?: string;
  scheduledFor: string; 
  delayBetweenEmailsMs?: number;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Retain completed jobs for 24 hours in Bull Board
      count: 2000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Retain failed jobs for 7 days
    },
  },
});

export async function addEmailJobToQueue(
  data: EmailJobData,
  delayMs: number = 0,
  options?: JobsOptions
) {
  const customJobId = data.jobId ? `job-${data.jobId}` : undefined;

  return emailQueue.add('send-email', data, {
    jobId: customJobId,
    delay: Math.max(0, delayMs),
    ...options,
  });
}

export default emailQueue;
