// T10/T15 — Verify Slack signing secret + timestamp (sec Spoofing, chống replay).
import { createHmac, timingSafeEqual } from 'crypto';
import { loadConfig } from '../../config/env';

const FIVE_MIN = 5 * 60;

/**
 * @param rawBody body THÔ (chuỗi nguyên văn trước khi parse JSON) — bắt buộc để HMAC đúng.
 */
export function verifySlackSignature(opts: {
  rawBody: string;
  timestamp: string | undefined;
  signature: string | undefined;
}): boolean {
  const cfg = loadConfig();
  const { rawBody, timestamp, signature } = opts;
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Chống replay: lệch quá ±5 phút → từ chối.
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > FIVE_MIN) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + createHmac('sha256', cfg.slackSigningSecret).update(base).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
