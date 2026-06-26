// Unit test (node:test) cho logic thuần — không cần Mongo/Slack/Azure/Claude.
// Map về Case ID trong test.md: TC-02/03/04/08 (parser), TC-12/13 (catalog), Decision Table (fileSkillMap),
// Security (signature/redact), TC-19 (rate-limit), idempotency.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ENV tối thiểu để loadConfig() không fail (các secret là giá trị test, không thật).
process.env.MONGO_URI ||= 'mongodb://localhost:27017';
process.env.SECRET_MASTER_KEY ||= Buffer.alloc(32, 7).toString('base64'); // 32 byte
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.SLACK_SIGNING_SECRET ||= 'test-slack-signing-secret';
process.env.SLACK_BOT_TOKEN ||= 'xoxb-test';
process.env.RATE_LIMIT_MAX ||= '5';
process.env.RATE_LIMIT_WINDOW_MS ||= '600000';

import { parseCommand } from '../application/commandParser';
import { mapFileToSkills, SKILLS } from '../application/fileSkillMap';
import { parseAzurePrUrl } from '../adapters/azure/azureClient';
import { encryptSecret, decryptSecret } from '../adapters/crypto/secretCrypto';
import { verifySlackSignature } from '../adapters/slack/slackSignature';
import { RateLimiter } from '../application/rateLimiter';
import { normalizeModelConfig } from '../config/catalog';
import { makeIdempotencyKey, severityCounts } from '../domain/reviewJob';
import { redact } from '../observability/redact';
import { chunkByLines } from '../adapters/slack/slackPort';
import { createHmac } from 'node:crypto';

const VALID_PR = 'https://dev.azure.com/org/proj/_git/repo/pullrequest/123';

// --- TC-01/parser happy path ---
test('TC-01 parse lệnh hợp lệ', () => {
  const r = parseCommand(`<@U999> LMS review ${VALID_PR}`);
  assert.equal(r.project, 'LMS');
  assert.equal(r.action, 'review');
  assert.equal(r.prId, '123');
});

// --- TC-02 thiếu pr-url ---
test('TC-02 thiếu link PR → ném lỗi', () => {
  assert.throws(() => parseCommand('@tieu-nhi LMS review'));
});

// --- chunkByLines: thay files.upload đã deprecated ---
test('chunkByLines giữ ranh giới dòng, không mảnh nào vượt max, ghép lại nguyên văn', () => {
  const text = Array.from({ length: 50 }, (_, i) => `- dòng số ${i} với chút nội dung`).join('\n');
  const chunks = chunkByLines(text, 80);
  assert.ok(chunks.length > 1, 'phải chia nhiều mảnh');
  for (const c of chunks) assert.ok(c.length <= 80, `mảnh vượt max: ${c.length}`);
  assert.equal(chunks.join('\n'), text, 'ghép lại phải bằng bản gốc');
});

test('chunkByLines cắt cứng dòng đơn dài hơn max', () => {
  const long = 'x'.repeat(250);
  const chunks = chunkByLines(long, 100);
  assert.equal(chunks.length, 3);
  for (const c of chunks) assert.ok(c.length <= 100);
  assert.equal(chunks.join(''), long);
});

// --- TC-04 link bị Slack bọc <...> + query ---
test('TC-04 normalize link bọc <...|label> + query', () => {
  const r = parseCommand(`LMS review <${VALID_PR}?_a=files|PR>`);
  assert.equal(r.prId, '123');
});

// --- TC-08 sai host ---
test('TC-08 host không phải Azure → ném lỗi', () => {
  assert.throws(() => parseCommand('LMS review https://github.com/o/r/pull/1'));
});

// --- parseAzurePrUrl ---
test('parseAzurePrUrl bóc đúng thành phần', () => {
  const p = parseAzurePrUrl(VALID_PR);
  assert.equal(p.prId, '123');
  assert.equal(p.repo, 'repo');
  assert.equal(p.repoUrl, 'https://dev.azure.com/org/proj/_git/repo');
});

// --- Decision Table file→skill ---
test('Decision Table R1 code → review-code', () => {
  assert.deepEqual(mapFileToSkills('src/a.ts').skills, [SKILLS.reviewCode]);
});
test('Decision Table R2 code nhạy cảm → review-code + bao-mat', () => {
  const s = mapFileToSkills('src/auth/login.ts').skills;
  assert.ok(s.includes(SKILLS.reviewCode) && s.includes(SKILLS.security));
});
test('Decision Table R3 test file → kiem-thu', () => {
  assert.ok(mapFileToSkills('src/x.test.ts').skills.includes(SKILLS.test));
});
test('Decision Table R6 binary/lock → skip', () => {
  assert.equal(mapFileToSkills('package-lock.json').skip, true);
  assert.equal(mapFileToSkills('img/logo.png').skip, true);
});
test('Decision Table R7 file lạ → mặc định review-code', () => {
  const d = mapFileToSkills('notes.unknownext');
  assert.deepEqual(d.skills, [SKILLS.reviewCode]);
  assert.ok(d.note);
});

// --- TC-12/13 catalog ---
test('TC-12 model/effort rỗng → default sonnet/medium', () => {
  assert.deepEqual(normalizeModelConfig('', ''), { model: 'claude-sonnet-4-6', effort: 'medium' });
});
test('TC-13 model không hợp lệ → ném lỗi', () => {
  assert.throws(() => normalizeModelConfig('gpt-4', 'medium'));
});

// --- T3 crypto round-trip + IV khác nhau ---
test('crypto AES-256-GCM mã hoá/giải mã round-trip', () => {
  const enc = encryptSecret('sk-ant-supersecret');
  assert.equal(decryptSecret(enc), 'sk-ant-supersecret');
});
test('crypto IV ngẫu nhiên khác nhau mỗi lần', () => {
  const a = encryptSecret('same');
  const b = encryptSecret('same');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

// --- Security: Slack signature ---
function sign(body: string, ts: string): string {
  return 'v0=' + createHmac('sha256', 'test-slack-signing-secret').update(`v0:${ts}:${body}`).digest('hex');
}
test('Slack signature hợp lệ → true', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"event_callback"}';
  assert.equal(verifySlackSignature({ rawBody: body, timestamp: ts, signature: sign(body, ts) }), true);
});
test('Slack signature sai → false', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  assert.equal(verifySlackSignature({ rawBody: '{}', timestamp: ts, signature: 'v0=deadbeef' }), false);
});
test('Slack signature replay (timestamp cũ >5p) → false', () => {
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  const body = '{}';
  assert.equal(verifySlackSignature({ rawBody: body, timestamp: old, signature: sign(body, old) }), false);
});

// --- TC-19 rate limit ---
test('TC-19 rate-limit: 5 cho phép, thứ 6 bị chặn', () => {
  const rl = new RateLimiter();
  for (let i = 0; i < 5; i++) assert.equal(rl.allow('U1'), true);
  assert.equal(rl.allow('U1'), false);
});

// --- idempotency key ---
test('idempotency key = project:pr:commit', () => {
  assert.equal(makeIdempotencyKey('p1', '123', 'abc'), 'p1:123:abc');
});

// --- severity counts ---
test('severityCounts đếm đúng', () => {
  const c = severityCounts([
    { skill: 's', severity: 'CRITICAL', title: 'a' },
    { skill: 's', severity: 'CRITICAL', title: 'b' },
    { skill: 's', severity: 'LOW', title: 'c' },
  ]);
  assert.equal(c.CRITICAL, 2);
  assert.equal(c.LOW, 1);
});

// --- Security: redact secret ---
test('redact che field secret + chuỗi giống token', () => {
  const out = redact({ pat: 'abc', note: 'key sk-ant-1234567890abcdef' }) as Record<string, string>;
  assert.equal(out.pat, '«redacted»');
  assert.ok(out.note.includes('«redacted»'));
});
