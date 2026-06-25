// T17 — Secret redaction (sec Data Leakage/Secret Mgmt).
// Mọi log/thông báo lỗi phải đi qua đây để không lộ token/PAT/key.

const SECRET_KEY_HINTS = /(pat|token|secret|key|password|authorization|bearer|claude.?api)/i;

// Pattern thô cho các chuỗi giống token (Azure PAT base32-ish, Anthropic key sk-ant-...).
const TOKEN_LIKE = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /xox[baprs]-[A-Za-z0-9-]{8,}/g, // Slack tokens
  /\b[A-Za-z0-9]{52}\b/g, // Azure PAT thường 52 ký tự
];

export function redactString(input: string): string {
  let out = input;
  for (const re of TOKEN_LIKE) out = out.replace(re, '«redacted»');
  return out;
}

/** Redact đệ quy object trước khi log; che field có tên nghi là secret. */
export function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_HINTS.test(k)) {
      out[k] = '«redacted»';
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}
