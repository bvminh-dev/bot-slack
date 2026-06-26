// T10 — ISlackPort (ACL). Đăng ack/kết quả/tiến độ + react qua Slack Web API.
import { ISlackPort } from '../../ports/interfaces';
import { loadConfig } from '../../config/env';
import { logger } from '../../observability/logger';

const SLACK_MAX_TEXT = 2800; // ngưỡng an toàn dưới giới hạn block Slack (~3000)

/** Chia text theo ranh giới DÒNG thành các mảnh <= max ký tự (giữ nguyên markdown). */
export function chunkByLines(text: string, max: number): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    // Dòng đơn lẻ dài hơn max → cắt cứng để không vượt trần ký tự.
    if (line.length > max) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
      continue;
    }
    if (cur.length + line.length + 1 > max) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

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
      // files.upload đã bị Slack KHAI TỬ (method_deprecated). Chia nhỏ theo dòng rồi post
      // nhiều message trong thread → luôn gửi được, không cần scope files:write, giữ đúng thứ tự.
      for (const chunk of chunkByLines(attachmentText, SLACK_MAX_TEXT)) {
        await slackCall('chat.postMessage', { channel, thread_ts: threadTs, text: chunk });
      }
    }
  },

  async react({ channel, timestamp, emoji }) {
    await slackCall('reactions.add', { channel, timestamp, name: emoji });
  },
};
