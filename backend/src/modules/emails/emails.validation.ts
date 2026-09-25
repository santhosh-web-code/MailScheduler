import { z } from 'zod';

export const scheduleEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  bodyHtml: z.string().min(1, 'Email body (HTML) is required'),
  recipients: z
    .array(z.string().email('Invalid email address format'))
    .min(1, 'At least one recipient is required'),
  senderId: z.string().optional(),
  startTime: z
    .string()
    .or(z.date())
    .refine((val) => {
      const date = new Date(val);
      if (isNaN(date.getTime())) return false;

      return date.getTime() >= Date.now() - 60000;
    }, 'Start time cannot be in the past'),
  delayBetweenEmailsMs: z.coerce
    .number()
    .min(0, 'Delay between emails must be >= 0 ms')
    .default(2000),
  hourlyLimit: z.coerce
    .number()
    .min(1, 'Hourly limit must be at least 1')
    .default(50),
  idempotencyKey: z.string().optional(),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;
