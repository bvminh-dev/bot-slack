// T10 — ISlackPort (ACL). Đăng ack/kết quả/tiến độ + react qua Slack Web API.
import { ISlackPort } from '../../ports/interfaces';
import { loadConfig } from '../../config/env';
import { logger } from '../../observability/logger';

const SLACK_MAX_TEXT = 2800; // ngưỡng an toàn dưới giới hạn block Slack (~3000)

async function slackCall(method: string, payload: Record<string, unknown>): Promise<void> {
  const cfg = loadConfig();
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.slackBotToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) logger.warn('slack_api_error', { method, error: data.error });
  } catch {
    logger.warn('slack_api_call_failed', { method });
  }
}

export const slackPort: ISlackPort = {
  async ackInThread({ channel, threadTs, text }) {
    await slackCall('chat.postMessage', { channel, thread_ts: threadTs, text });
  },

  async postResult({ channel, threadTs, summaryText, attachmentText }) {
    await slackCall('chat.postMessage', { channel, thread_ts: threadTs, text: summaryText });
    if (attachmentText && attachmentText.length > 0) {
      // Output dài → đính kèm dạng snippet (files.upload) để tránh trần ký tự/block.
      if (attachmentText.length > SLACK_MAX_TEXT) {
        await slackCall('files.upload', {
          channels: channel,
          thread_ts: threadTs,
          content: attachmentText,
          filename: 'review-detail.md',
          title: 'Chi tiết review',
        });
      } else {
        await slackCall('chat.postMessage', { channel, thread_ts: threadTs, text: attachmentText });
      }
    }
  },

  async react({ channel, timestamp, emoji }) {
    await slackCall('reactions.add', { channel, timestamp, name: emoji });
  },
};
