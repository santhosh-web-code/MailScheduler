import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import '../../types';
import { prisma } from '../../config';
import { emailQueue } from '../queue/emailQueue';
import { redisConnection } from '../queue/redisConnection';
import { scheduleEmailSchema } from './emails.validation';
import {
  indexEmailJobsBulkAsync,
  searchEmails,
  deleteEmailJobAsync,
  deleteEmailJobsBulkAsync,
} from '../search';
import { ZodError } from 'zod';

interface AuthenticatedUser {
  id?: string;
  email?: string;
  name?: string;
}

async function resolveUserId(req: Request): Promise<string> {
  const authUser = req.user as AuthenticatedUser | undefined;
  if (authUser?.id) return authUser.id;

  const firstUser = await prisma.user.findFirst();
  if (firstUser) return firstUser.id;

  const dummyUser = await prisma.user.create({
    data: {
      googleId: `dev-user-${Date.now()}`,
      email: 'dev@reachinbox.io',
      name: 'ReachInbox Developer',
    },
  });
  return dummyUser.id;
}

async function resolveSender(userId: string, requestedSenderId?: string) {
  if (requestedSenderId) {
    const existing = await prisma.emailSender.findFirst({
      where: { id: requestedSenderId },
    });
    if (existing) return existing;
  }

  const fromAddress = process.env.SMTP_FROM_EMAIL || 'santhoshnanisanka@gmail.com';
  const fromName = process.env.SMTP_FROM_NAME || 'Santhosh';

  const realSender = await prisma.emailSender.findFirst({
    where: { fromAddress },
  });
  if (realSender) return realSender;

  const userSender = await prisma.emailSender.findFirst({
    where: { userId },
  });
  if (userSender) return userSender;

  return prisma.emailSender.create({
    data: {
      userId,
      fromAddress,
      fromName,
    },
  });
}

export async function scheduleEmailBatch(req: Request, res: Response) {
  let redisIdempotencyKey: string | null = null;
  try {
    const input = scheduleEmailSchema.parse(req.body);
    const userId = await resolveUserId(req);
    const sender = await resolveSender(userId, input.senderId);

    const headerKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const headerString = Array.isArray(headerKey) ? headerKey[0] : headerKey;
    const rawIdempotencyKey = headerString || input.idempotencyKey;

    if (rawIdempotencyKey && typeof rawIdempotencyKey === 'string' && rawIdempotencyKey.trim().length > 0) {
      const trimmedKey = rawIdempotencyKey.trim();
      redisIdempotencyKey = `idempotency:schedule:${userId}:${trimmedKey}`;

      const existingRecord = await redisConnection.get(redisIdempotencyKey);
      if (existingRecord) {
        try {
          const parsed = JSON.parse(existingRecord);
          if (parsed.status === 'completed') {
            res.setHeader('X-Idempotent-Replay', 'true');
            return res.status(200).json({
              ...parsed.response,
              idempotentReplay: true,
            });
          }
          if (parsed.status === 'processing') {
            return res.status(409).json({
              error: 'Conflict',
              message: 'A scheduling request with this idempotency key is currently processing.',
            });
          }
        } catch (_parseErr) {
          redisIdempotencyKey = null;
        }
      }

      if (redisIdempotencyKey) {
        const acquired = await redisConnection.set(
          redisIdempotencyKey,
          JSON.stringify({ status: 'processing', startedAt: Date.now() }),
          'EX',
          86400,
          'NX'
        );

        if (!acquired) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'Concurrent duplicate scheduling request detected.',
          });
        }
      }
    }

    const startDateTime = new Date(input.startTime);

    const batch = await prisma.emailBatch.create({
      data: {
        userId,
        senderId: sender.id,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        startTime: startDateTime,
        delayBetweenEmailsMs: input.delayBetweenEmailsMs,
        hourlyLimit: input.hourlyLimit,
        status: 'pending',
      },
    });

    const now = Date.now();
    const jobRecords = input.recipients.map((recipientEmail, i) => {
      const jobId = randomUUID();
      const scheduledTime = new Date(startDateTime.getTime() + i * input.delayBetweenEmailsMs);

      return {
        id: jobId,
        batchId: batch.id,
        recipientEmail,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        status: 'queued' as const,
        scheduledFor: scheduledTime,
        bullJobId: jobId,
      };
    });

    await prisma.emailJob.createMany({
      data: jobRecords,
    });

    const bulkBullJobs = jobRecords.map((job) => {
      const delayMs = Math.max(0, job.scheduledFor.getTime() - now);

      return {
        name: 'send-email',
        data: {
          jobId: job.id,
          batchId: batch.id,
          recipientEmail: job.recipientEmail,
          subject: job.subject,
          bodyHtml: job.bodyHtml,
          senderId: sender.id,
          scheduledFor: job.scheduledFor.toISOString(),
          delayBetweenEmailsMs: input.delayBetweenEmailsMs,
        },
        opts: {
          jobId: job.id,
          delay: delayMs,
        },
      };
    });

    await emailQueue.addBulk(bulkBullJobs);

    const updatedBatch = await prisma.emailBatch.update({
      where: { id: batch.id },
      data: { status: 'in_progress' },
      include: {
        sender: true,
      },
    });

    const searchDocs = jobRecords.map((j) => ({
      id: j.id,
      recipientEmail: j.recipientEmail,
      subject: j.subject,
      bodyHtml: j.bodyHtml,
      status: 'queued',
      scheduledFor: j.scheduledFor,
      senderId: sender.id,
      userId,
    }));
    indexEmailJobsBulkAsync(searchDocs);

    const responsePayload = {
      message: 'Email batch successfully scheduled and queued',
      batch: updatedBatch,
      jobCount: jobRecords.length,
      jobs: jobRecords.slice(0, 50),
      idempotencyKey: rawIdempotencyKey || null,
    };

    if (redisIdempotencyKey) {
      await redisConnection.set(
        redisIdempotencyKey,
        JSON.stringify({ status: 'completed', response: responsePayload }),
        'EX',
        86400
      );
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    if (redisIdempotencyKey) {
      await redisConnection.del(redisIdempotencyKey).catch(() => {});
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    console.error('[EmailsController] Error in scheduleEmailBatch:', error);
    return res.status(500).json({
      error: 'Failed to schedule email batch',
      message: error instanceof Error ? error.message : 'Unknown scheduling error',
    });
  }
}

export async function getScheduledEmails(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const whereClause: Record<string, unknown> = {
      status: { in: ['scheduled', 'queued', 'rate_limited'] },
    };

    const authUser = req.user as AuthenticatedUser | undefined;
    if (authUser?.id) {
      whereClause.batch = { userId: authUser.id };
    }

    const [total, jobs] = await Promise.all([
      prisma.emailJob.count({ where: whereClause }),
      prisma.emailJob.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { scheduledFor: 'desc' },
        include: {
          batch: {
            select: {
              id: true,
              subject: true,
              startTime: true,
              delayBetweenEmailsMs: true,
              hourlyLimit: true,
              sender: {
                select: {
                  fromAddress: true,
                  fromName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return res.json({
      data: jobs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[EmailsController] Error in getScheduledEmails:', error);
    return res.status(500).json({ error: 'Failed to retrieve scheduled emails' });
  }
}

export async function getSentEmails(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const whereClause: Record<string, unknown> = {
      status: { in: ['sent', 'failed'] },
    };

    const authUser = req.user as AuthenticatedUser | undefined;
    if (authUser?.id) {
      whereClause.batch = { userId: authUser.id };
    }

    const [total, jobs] = await Promise.all([
      prisma.emailJob.count({ where: whereClause }),
      prisma.emailJob.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          batch: {
            select: {
              id: true,
              subject: true,
              sender: {
                select: {
                  fromAddress: true,
                  fromName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return res.json({
      data: jobs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[EmailsController] Error in getSentEmails:', error);
    return res.status(500).json({ error: 'Failed to retrieve sent emails' });
  }
}

export async function handleSearchEmails(req: Request, res: Response) {
  try {
    const userId = await resolveUserId(req);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const results = await searchEmails({
      userId,
      query: q,
      status,
      page,
      limit,
    });

    return res.json(results);
  } catch (error) {
    console.error('[EmailsController] Error in handleSearchEmails:', error);
    return res.status(500).json({ error: 'Search query failed' });
  }
}

export async function deleteEmailJob(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Bad Request', message: 'Job ID is required' });
    }

    const userId = await resolveUserId(req);

    const emailJob = await prisma.emailJob.findUnique({
      where: { id },
      include: {
        batch: {
          select: { userId: true },
        },
      },
    });

    if (!emailJob) {
      return res.status(404).json({ error: 'Not Found', message: 'Email job not found' });
    }

    if (emailJob.batch?.userId && emailJob.batch.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this email job',
      });
    }

    // If job is still queued or scheduled (not yet sent or failed), remove from BullMQ queue
    if (['queued', 'scheduled', 'rate_limited'].includes(emailJob.status) && emailJob.bullJobId) {
      try {
        const bullJob = await emailQueue.getJob(emailJob.bullJobId);
        if (bullJob) {
          await bullJob.remove();
          console.log(`[DeleteEmail] Removed BullMQ job ${emailJob.bullJobId} for job ${emailJob.id}`);
        }
      } catch (queueErr) {
        console.warn(
          `[DeleteEmail] Notice: Could not remove BullMQ job ${emailJob.bullJobId}:`,
          (queueErr as Error).message
        );
      }
    }

    await prisma.emailJob.delete({
      where: { id },
    });

    deleteEmailJobAsync(id);

    return res.json({
      success: true,
      message: 'Email deleted successfully',
      id,
    });
  } catch (error) {
    console.error('[EmailsController] Error in deleteEmailJob:', error);
    return res.status(500).json({
      error: 'Failed to delete email',
      message: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}

export async function deleteEmailJobsBulk(req: Request, res: Response) {
  try {
    const ids = req.body?.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'ids array must contain at least one ID',
      });
    }

    const userId = await resolveUserId(req);

    const jobs = await prisma.emailJob.findMany({
      where: { id: { in: ids } },
      include: {
        batch: {
          select: { userId: true },
        },
      },
    });

    const foundIds = new Set(jobs.map((j) => j.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));

    const unauthorizedJobs = jobs.filter((j) => j.batch?.userId && j.batch.userId !== userId);
    const unauthorizedIds = unauthorizedJobs.map((j) => j.id);

    if (missingIds.length > 0 || unauthorizedIds.length > 0) {
      return res.status(unauthorizedIds.length > 0 ? 403 : 404).json({
        error: unauthorizedIds.length > 0 ? 'Forbidden' : 'Not Found',
        message:
          unauthorizedIds.length > 0
            ? 'You do not have permission to delete one or more selected emails'
            : 'One or more email jobs were not found',
        missingIds,
        unauthorizedIds,
      });
    }

    // Clean up BullMQ queue for any pending jobs
    for (const job of jobs) {
      if (['queued', 'scheduled', 'rate_limited'].includes(job.status) && job.bullJobId) {
        try {
          const bullJob = await emailQueue.getJob(job.bullJobId);
          if (bullJob) {
            await bullJob.remove();
            console.log(`[BulkDelete] Removed BullMQ job ${job.bullJobId} for job ${job.id}`);
          }
        } catch (queueErr) {
          console.warn(
            `[BulkDelete] Notice: Could not remove BullMQ job ${job.bullJobId}:`,
            (queueErr as Error).message
          );
        }
      }
    }

    // Transactional all-or-nothing DB deletion
    await prisma.$transaction(async (tx) => {
      await tx.emailJob.deleteMany({
        where: { id: { in: ids } },
      });
    });

    deleteEmailJobsBulkAsync(ids);

    return res.json({
      success: true,
      message: `${ids.length} email${ids.length === 1 ? '' : 's'} deleted successfully`,
      count: ids.length,
      deletedIds: ids,
    });
  } catch (error) {
    console.error('[EmailsController] Error in deleteEmailJobsBulk:', error);
    return res.status(500).json({
      error: 'Failed to bulk delete emails',
      message: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}

