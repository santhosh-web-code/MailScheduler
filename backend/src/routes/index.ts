import { Router, Request, Response } from 'express';
import emailsRouter from '../modules/emails/emails.routes';
import { prisma } from '../config';
import { getSlackStatus, disconnectSlack } from '../modules/slack/slack.routes';
import { requireAuth } from '../middleware';

const router = Router();

router.use('/emails', emailsRouter);

router.get('/senders', async (_req: Request, res: Response) => {
  try {
    const fromEmail = process.env.SMTP_FROM_EMAIL || 'santhoshnanisanka@gmail.com';
    const fromName = process.env.SMTP_FROM_NAME || 'Santhosh';

    // Query senders from database matching real configured identity
    let senders = await prisma.emailSender.findMany({
      where: { fromAddress: fromEmail },
      orderBy: { createdAt: 'desc' },
    });

    // If none exists, create the real configured sender
    if (senders.length === 0) {
      let user = (await prisma.user.findFirst({
        where: { email: fromEmail },
      })) || (await prisma.user.findFirst());

      if (!user) {
        user = await prisma.user.create({
          data: {
            googleId: `dev-user-${Date.now()}`,
            email: fromEmail,
            name: fromName,
          },
        });
      }

      const newSender = await prisma.emailSender.create({
        data: {
          userId: user.id,
          fromAddress: fromEmail,
          fromName: fromName,
        },
      });
      senders = [newSender];
    }

    return res.json({ data: senders, senders });
  } catch (error) {
    console.error('[Senders] Error fetching senders:', error);
    return res.status(500).json({ error: 'Failed to fetch senders' });
  }
});

router.get('/slack/status', requireAuth, getSlackStatus);
router.post('/slack/disconnect', requireAuth, disconnectSlack);

router.get('/ping', (_req: Request, res: Response) => {
  res.json({ message: 'pong' });
});

export default router;
