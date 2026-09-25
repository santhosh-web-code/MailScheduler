import { Router, Request, Response } from 'express';
import { prisma, config } from '../../config';
import { verifyToken } from '../auth/jwt';
import { requireAuth } from '../../middleware';

export const slackRouter = Router();

const SLACK_OAUTH_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';

slackRouter.get('/slack', (req: Request, res: Response) => {
  try {

    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : null);

    let state = '';
    if (token) {
      const payload = verifyToken(token);
      if (payload?.userId) {
        state = Buffer.from(JSON.stringify({ userId: payload.userId, timestamp: Date.now() })).toString('base64');
      }
    }

    if (!config.slack.clientId) {
      console.warn('[SlackAuth] SLACK_CLIENT_ID not configured in backend/.env');
      return res.redirect(`${config.frontendUrl}/dashboard?slack=not_configured`);
    }

    const params = new URLSearchParams({
      client_id: config.slack.clientId,
      scope: 'incoming-webhook,chat:write',
      redirect_uri: config.slack.redirectUri || 'http://localhost:5000/auth/slack/callback',
      state,
    });

    return res.redirect(`${SLACK_OAUTH_AUTHORIZE_URL}?${params.toString()}`);
  } catch (err) {
    console.error('[SlackAuth] Error initiating Slack OAuth:', err);
    return res.redirect(`${config.frontendUrl}/dashboard?slack=error`);
  }
});

slackRouter.get('/slack/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    console.warn('[SlackAuth] Slack authorization declined or error returned:', error);
    return res.redirect(`${config.frontendUrl}/dashboard?slack=cancelled`);
  }

  try {

    let userId: string | null = null;
    if (state && typeof state === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        userId = decoded.userId;
      } catch (e) {}
    }

    if (!userId && req.cookies?.token) {
      const payload = verifyToken(req.cookies.token);
      userId = payload?.userId || null;
    }

    if (!userId) {
      const firstUser = await prisma.user.findFirst();
      userId = firstUser?.id || null;
    }

    if (!userId) {
      return res.redirect(`${config.frontendUrl}/dashboard?slack=no_user`);
    }

    const response = await fetch(SLACK_OAUTH_ACCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.slack.clientId,
        client_secret: config.slack.clientSecret,
        code: String(code),
        redirect_uri: config.slack.redirectUri || 'http://localhost:5000/auth/slack/callback',
      }),
    });

    const data = (await response.json()) as any;

    if (!data.ok) {
      console.error('[SlackAuth] oauth.v2.access returned error:', data.error);
      return res.redirect(`${config.frontendUrl}/dashboard?slack=oauth_failed&error=${data.error}`);
    }

    const teamId = data.team?.id || 'UNKNOWN_TEAM';
    const accessToken = data.access_token || '';
    const webhookUrl = data.incoming_webhook?.url || null;
    const channelId = data.incoming_webhook?.channel_id || null;

    await prisma.slackIntegration.upsert({
      where: { userId },
      update: {
        teamId,
        accessToken,
        webhookUrl,
        channelId,
        isActive: true,
        connectedAt: new Date(),
      },
      create: {
        userId,
        teamId,
        accessToken,
        webhookUrl,
        channelId,
        isActive: true,
      },
    });

    console.log(`[SlackAuth] Successfully connected Slack for user ${userId} (Team: ${teamId}, Channel: ${channelId})`);
    return res.redirect(`${config.frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    console.error('[SlackAuth] Unexpected error in Slack callback:', err);
    return res.redirect(`${config.frontendUrl}/dashboard?slack=error`);
  }
});

export async function getSlackStatus(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ connected: false });
    }

    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
      select: {
        id: true,
        teamId: true,
        channelId: true,
        isActive: true,
        connectedAt: true,
      },
    });

    return res.json({
      connected: Boolean(integration?.isActive),
      teamId: integration?.teamId,
      channelId: integration?.channelId,
      connectedAt: integration?.connectedAt,
    });
  } catch (error) {
    console.error('[SlackStatus] Error retrieving status:', error);
    return res.status(500).json({ connected: false, error: 'Internal server error' });
  }
}

export async function disconnectSlack(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.slackIntegration.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    return res.json({ success: true, message: 'Slack integration disconnected' });
  } catch (error) {
    console.error('[SlackDisconnect] Error disconnecting:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default slackRouter;
