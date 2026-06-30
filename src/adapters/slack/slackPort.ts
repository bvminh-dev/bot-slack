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

async function slackCall(method: string, payload: Record<string, unknown>): Promise<boolean> {
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
    return data.ok === true;
  } catch {
    logger.warn('slack_api_call_failed', { method });
    return false;
  }
}

/** Gọi Slack API dạng form-urlencoded; trả data thô (cho luồng upload external). */
async function slackForm(method: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const cfg = loadConfig();
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.slackBotToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.ok !== true) logger.warn('slack_api_error', { method, error: String(data.error) });
    return data;
  } catch {
    logger.warn('slack_api_call_failed', { method });
    return null;
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

  async postText({ channel, threadTs, text }) {
    return slackCall('chat.postMessage', { channel, thread_ts: threadTs, text });
  },

  // i-002 (ADR-012) — upload .md qua luồng external 2 bước. Chỉ true khi bước cuối OK.
  async uploadMarkdown({ channel, threadTs, filename, content, initialComment }) {
    const cfg = loadConfig();
    const bytes = Buffer.from(content, 'utf8');
    // B1: xin upload URL.
    const urlRes = await slackForm('files.getUploadURLExternal', {
      filename,
      length: String(bytes.byteLength),
    });
    const uploadUrl = urlRes && typeof urlRes.upload_url === 'string' ? urlRes.upload_url : null;
    const fileId = urlRes && typeof urlRes.file_id === 'string' ? urlRes.file_id : null;
    if (!uploadUrl || !fileId) return false;
    // B2: PUT bytes lên upload URL.
    try {
      const put = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/markdown' },
        body: bytes,
      });
      if (!put.ok) return false;
    } catch {
      logger.warn('slack_upload_put_failed', { filename });
      return false;
    }
    // B3: hoàn tất + share vào thread (kèm tóm tắt). CHỈ true khi bước này OK.
    const done = await slackForm('files.completeUploadExternal', {
      files: JSON.stringify([{ id: fileId, title: filename }]),
      channel_id: channel,
      thread_ts: threadTs,
      ...(initialComment ? { initial_comment: initialComment } : {}),
    });
    return !!done && done.ok === true;
  },
};
