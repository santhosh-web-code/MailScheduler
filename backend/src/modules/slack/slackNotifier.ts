import { prisma } from '../../config';
import { redisConnection } from '../queue/redisConnection';

export async function notifyRateLimitHit(
  userId: string,
  fromAddress: string,
  rescheduledCount: number = 1
): Promise<void> {
  try {
    if (!userId) return;

    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
    });

    if (!integration || !integration.isActive || !integration.webhookUrl) {

      return;
    }

    const now = new Date();
    const alertHourKey = `slack_alert:${userId}:${fromAddress}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}T${now.getUTCHours()}`;

    const alreadyAlerted = await redisConnection.set(alertHourKey, '1', 'EX', 3600, 'NX');
    if (!alreadyAlerted) {

      return;
    }

    const message = `⚠️ Hourly send limit reached for ${fromAddress}. ${rescheduledCount} email(s) rescheduled to the next window.`;

    const response = await fetch(integration.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*⚠️ ReachInbox Throttle Notice*\nHourly send limit reached for *${fromAddress}*.\n*${rescheduledCount}* queued email(s) have been safely rescheduled to the next hour window.`,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`[SlackNotifier] Webhook response not OK (${response.status}): ${errorText}`);
    } else {
      console.log(`[SlackNotifier] Successfully posted rate-limit notice to Slack for user ${userId}`);
    }
  } catch (error) {

    console.warn('[SlackNotifier] Notice skipped due to non-critical webhook error:', (error as Error).message);
  }
}
