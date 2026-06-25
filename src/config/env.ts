// T1 — ENV loader. Tải cấu hình từ biến môi trường, fail-fast khi thiếu secret bắt buộc.
// Bảo mật (security.md #18): master key/JWT secret/Slack secret chỉ đọc từ ENV, không hardcode, không log.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export interface AppConfig {
  port: number;
  adminUiOrigin: string;
  mongoUri: string;
  mongoDb: string;
  secretMasterKey: string; // base64, 32 byte
  secretKeyVersion: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  slackSigningSecret: string;
  slackBotToken: string;
  azureIdentityOrg: string;
  azureAllowedHosts: string[];
  claudeCliBin: string;
  skillsDir: string;
  skillRunTimeoutMs: number;
  maxFilesPerPr: number;
  maxDiffLines: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  workerConcurrency: number;
  queuePollIntervalMs: number;
  jobLeaseMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    port: num('PORT', 3000),
    adminUiOrigin: optional('ADMIN_UI_ORIGIN', 'http://localhost:5173'),
    mongoUri: required('MONGO_URI'),
    mongoDb: optional('MONGO_DB', 'tieu_nhi'),
    secretMasterKey: required('SECRET_MASTER_KEY'),
    secretKeyVersion: num('SECRET_KEY_VERSION', 1),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: optional('JWT_EXPIRES_IN', '2h'),
    slackSigningSecret: required('SLACK_SIGNING_SECRET'),
    slackBotToken: required('SLACK_BOT_TOKEN'),
    // Org Azure dùng để xác thực PAT qua connectionData (lấy authenticatedUser làm owner).
    azureIdentityOrg: optional('AZURE_DEFAULT_ORG', '').trim().replace(/\/+$/, ''),
    azureAllowedHosts: optional('AZURE_ALLOWED_HOSTS', 'dev.azure.com,visualstudio.com')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    claudeCliBin: optional('CLAUDE_CLI_BIN', 'claude'),
    skillsDir: optional('SKILLS_DIR', '.claude/skills'),
    skillRunTimeoutMs: num('SKILL_RUN_TIMEOUT_MS', 600_000),
    maxFilesPerPr: num('MAX_FILES_PER_PR', 50),
    maxDiffLines: num('MAX_DIFF_LINES', 5000),
    rateLimitMax: num('RATE_LIMIT_MAX', 5),
    rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 600_000),
    workerConcurrency: num('WORKER_CONCURRENCY', 5),
    queuePollIntervalMs: num('QUEUE_POLL_INTERVAL_MS', 1500),
    jobLeaseMs: num('JOB_LEASE_MS', 900_000),
    maxAttempts: num('MAX_ATTEMPTS', 3),
    retryBackoffMs: num('RETRY_BACKOFF_MS', 30_000),
  };
  return cached;
}
