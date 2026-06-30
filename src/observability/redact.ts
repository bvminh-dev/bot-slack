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

// i-002 (T3, sec Data Protection) — redact dùng cho NỘI DUNG báo cáo trước khi rời hệ thống
// (file .md lên Slack KHÔNG xoá được). Bổ sung các pattern gán secret/cloud key ngoài TOKEN_LIKE.
// BUG-14 (i-002): mở rộng để bắt biến thể token/secret phổ biến (đo bằng UT data-driven).
const REPORT_SECRET_PATTERNS = [
  /gh[opusr]_[A-Za-z0-9]{20,}/g, // GitHub classic/oauth/user/server/refresh (che cả prefix)
  /github_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained PAT
  /A[KS]IA[0-9A-Z]{16}/g, // AWS access key id: AKIA (long-term) + ASIA (STS tạm thời)
  // key=value / key: value — value có thể là chuỗi trong ngoặc kép (CÓ dấu cách) hoặc không-ngoặc.
  /(?<=(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret|aws_session_token|aws_secret_access_key)\s*[=:]\s*)("[^"\n]{2,}"|'[^'\n]{2,}'|[^\s"'\n]{3,})/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Che secret-pattern trong nội dung báo cáo (best-effort) trước khi upload/đăng. */
export function redactReport(input: string): string {
  let out = redactString(input);
  for (const re of REPORT_SECRET_PATTERNS) out = out.replace(re, '«redacted»');
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
