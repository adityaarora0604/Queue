import { dbGetSlackConfig, dbSaveSlackConfig } from './db.ts';

export interface SlackNotificationPayload {
  sender: string;
  hourWindow: number;
  count: number;
  limit: number;
  rescheduledTo: number;
}

export async function sendSlackRateLimitAlert(data: SlackNotificationPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await dbGetSlackConfig();

    if (!config.enabled) {
      console.log('[Slack] Notifications disabled in configuration, skipping.');
      return { success: false, error: 'notifications_disabled' };
    }

    if (!config.webhook_url && !config.access_token) {
      console.log('[Slack] No Slack webhook or token configured. Rate limit event logged without Slack dispatch.');
      return { success: false, error: 'no_webhook_or_token' };
    }

    const rescheduledDate = new Date(data.rescheduledTo).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const messagePayload = {
      text: `⚠️ *ReachInbox Rate Limit Alert*: Sender \`${data.sender}\` reached hourly quota (${data.count}/${data.limit}).`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Rate Limit Exceeded - ReachInbox Scheduler',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Sender *<mailto:${data.sender}|${data.sender}>* has saturated their hourly sending allocation of *${data.limit} emails/hr*.\nAll excess queued jobs have been safely postponed into the next hour window without dropping any messages.`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sender:*\n\`${data.sender}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Hourly Quota:*\n${data.count} / ${data.limit} sent`,
            },
            {
              type: 'mrkdwn',
              text: `*Hour Window:*\nWindow #${data.hourWindow}`,
            },
            {
              type: 'mrkdwn',
              text: `*Next Execution:*\n\`${rescheduledDate}\``,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open Scheduler Dashboard',
                emoji: true,
              },
              url: appUrl,
              style: 'primary',
            },
          ],
        },
      ],
    };

    let response: Response;

    if (config.webhook_url) {
      console.log(`[Slack] Dispatching live HTTP POST to configured webhook: ${config.webhook_url.substring(0, 30)}...`);
      response = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messagePayload),
      });
    } else {
      // Use Web API chat.postMessage
      response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${config.access_token}`,
        },
        body: JSON.stringify({
          channel: config.channel_name || '#general',
          ...messagePayload,
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Slack] Delivery failed with HTTP ${response.status}:`, errText);
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }

    await dbSaveSlackConfig({ last_alert_at: Date.now() });
    console.log(`[Slack] Rate limit alert successfully delivered to Slack!`);
    return { success: true };
  } catch (err: any) {
    console.error('[Slack] Unexpected error during notification dispatch:', err);
    return { success: false, error: err.message };
  }
}

export async function sendSlackTestPing(targetWebhook?: string): Promise<{ success: boolean; message: string }> {
  try {
    const config = await dbGetSlackConfig();
    const webhookUrl = targetWebhook || config.webhook_url;

    if (!webhookUrl && !config.access_token) {
      return { success: false, message: 'Please provide a valid Slack Incoming Webhook URL or connect OAuth token first.' };
    }

    const payload = {
      text: '✅ *ReachInbox Scheduler*: Slack notification pipeline verified and operational!',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🚀 *ReachInbox Email Scheduler — Slack Webhook Test*\nYour Slack alert channel is connected. Real-time rate limit notifications will be posted here automatically.',
          },
        },
      ],
    };

    if (webhookUrl) {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, message: `Slack responded with error (${res.status}): ${text}` };
      }
    } else {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.access_token}`,
        },
        body: JSON.stringify({
          channel: config.channel_name || '#general',
          ...payload,
        }),
      });
      const data = await res.json() as any;
      if (!data.ok) {
        return { success: false, message: `Slack API error: ${data.error}` };
      }
    }

    return { success: true, message: 'Test message sent to Slack successfully! Check your channel.' };
  } catch (err: any) {
    return { success: false, message: `Failed to dispatch test notification: ${err.message}` };
  }
}
