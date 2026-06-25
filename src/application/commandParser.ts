// T11 — Parse lệnh Slack + normalize link + validate PR URL.
// `@tieu-nhi <project> review <pr-url>` — test TC-02..08, normalize link bọc <...>.

import { ValidationError } from '../domain/errors';
import { parseAzurePrUrl } from '../adapters/azure/azureClient';

export interface ParsedCommand {
  project: string;
  action: 'review';
  prUrl: string;
  prId: string;
}

const USAGE = 'Cú pháp: `@tieu-nhi <project> review <link-PR-Azure>`';

/** Bỏ mention bot ở đầu (vd `<@U123>`), trim, gộp khoảng trắng. */
function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Gỡ bọc Slack `<url>` / `<url|label>` và trim. */
function normalizeLink(token: string): string {
  let t = token.trim();
  const m = t.match(/^<([^|>]+)(\|[^>]*)?>$/);
  if (m) t = m[1];
  return t.trim();
}

export function parseCommand(rawText: string): ParsedCommand {
  const text = stripMention(rawText);
  // tách: <project> review <url...>
  const m = text.match(/^(\S+)\s+(review)\s+(.+)$/i);
  if (!m) {
    throw new ValidationError(`Lệnh không hợp lệ. ${USAGE}`);
  }
  const project = m[1].trim();
  const prUrlRaw = m[3].trim().split(/\s+/)[0]; // lấy token url đầu tiên
  const prUrl = normalizeLink(prUrlRaw);
  if (!project || !prUrl) throw new ValidationError(`Thiếu project hoặc link PR. ${USAGE}`);

  // Validate định dạng PR Azure (ném ValidationError nếu sai host/định dạng).
  const parsed = parseAzurePrUrl(prUrl);
  return { project, action: 'review', prUrl, prId: parsed.prId };
}
