// Unit test BỔ SUNG (node:test) — phủ thêm các UT trong test.md (phân tầng) chưa có ở pure.test.ts.
// Logic thuần, không I/O. Map về UT-xx của bảng "1. Unit Test Cases".
// LƯU Ý trung thực: một số SUT trong thiết kế KHÔNG tồn tại dưới dạng hàm pure riêng
//   (classifyClaudeCredential, classifyError, computeBackoff, isLeaseExpired, sanitizeMongoInput,
//    withinDiffLimit, normalizeProjectName, toMrkdwn) — xem report.md mục "Gap".
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ENV tối thiểu để loadConfig() không fail nếu chuỗi import chạm tới nó.
process.env.MONGO_URI ||= 'mongodb://localhost:27017';
process.env.SECRET_MASTER_KEY ||= Buffer.alloc(32, 7).toString('base64');
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.SLACK_SIGNING_SECRET ||= 'test-slack-signing-secret';
process.env.SLACK_BOT_TOKEN ||= 'xoxb-test';

import { parseCommand } from '../application/commandParser';
import { mapFileToSkills, SKILLS } from '../application/fileSkillMap';
import { parseAzurePrUrl, azureClient } from '../adapters/azure/azureClient';
import { isValidModel, isValidEffort, normalizeModelConfig } from '../config/catalog';
import { severityCounts } from '../domain/reviewJob';
import { redactString } from '../observability/redact';
import { CircuitBreaker } from '../observability/circuitBreaker';
import { parseSkillOutput } from '../adapters/skillrunner/skillRunner';
import { ValidationError } from '../domain/errors';

const VALID_PR = 'https://dev.azure.com/org/proj/_git/repo/pullrequest/123';

// ---------- UT-03: parseCommand sai thứ tự / thiếu project ----------
test('UT-03 sai thứ tự "review <project>" → ném ValidationError', () => {
  assert.throws(() => parseCommand(`<@U1> review LMS ${VALID_PR}`), ValidationError);
});

// ---------- UT-05/UT-06: parseAzurePrUrl host/path ----------
test('UT-05 parseAzurePrUrl host dev.azure.com hợp lệ', () => {
  const p = parseAzurePrUrl(VALID_PR);
  assert.equal(p.prId, '123');
  assert.equal(p.host, 'dev.azure.com');
});
test('UT-06 parseAzurePrUrl thiếu pullrequest/ → ném', () => {
  assert.throws(() => parseAzurePrUrl('https://dev.azure.com/org/proj/_git/repo'), ValidationError);
});
test('UT-06 parseAzurePrUrl host ngoài Azure → ném', () => {
  assert.throws(() => parseAzurePrUrl('https://github.com/o/r/pull/1'), ValidationError);
});

// ---------- UT-07: PR id biên & phi số (qua parseCommand) ----------
test('UT-07 prId phi số → ném', () => {
  assert.throws(() => parseCommand('LMS review https://dev.azure.com/o/p/_git/r/pullrequest/abc'));
});
test('UT-07 prId hợp lệ = 1', () => {
  assert.equal(parseCommand('LMS review https://dev.azure.com/o/p/_git/r/pullrequest/1').prId, '1');
});

// ---------- UT-11/UT-12: mapFileToSkills R4 (doc nghiệp vụ) + R5 (doc kiến trúc) ----------
test('UT-11 R4 frd.md / .feature → phan-tich-nghiep-vu', () => {
  assert.ok(mapFileToSkills('feature/frd.md').skills.includes(SKILLS.business));
  assert.ok(mapFileToSkills('login.feature').skills.includes(SKILLS.business));
});
test('UT-12 R5 tech.md / sad.md / adr → thiet-ke-he-thong', () => {
  assert.ok(mapFileToSkills('docs/tech.md').skills.includes(SKILLS.architecture));
  assert.ok(mapFileToSkills('adr-001.md').skills.includes(SKILLS.architecture));
});

// ---------- UT-26: validateModelEffort theo catalog ----------
test('UT-26 isValidModel/isValidEffort phân biệt đúng', () => {
  assert.equal(isValidModel('claude-opus-4-8'), true);
  assert.equal(isValidModel('gpt-4'), false);
  assert.equal(isValidEffort('high'), true);
  assert.equal(isValidEffort('turbo'), false);
});
test('UT-26 normalizeModelConfig effort ngoài catalog → ném', () => {
  assert.throws(() => normalizeModelConfig('claude-opus-4-8', 'turbo'));
});

// ---------- UT-25: aggregate findings + parse output skill ----------
test('UT-25 parseSkillOutput đọc JSON block → đếm severity đúng', () => {
  const raw = 'lời dẫn...\n{"findings":[{"severity":"CRITICAL","title":"a"},{"severity":"LOW","title":"b"}],"costTokens":42}';
  const out = parseSkillOutput('review-code', raw);
  assert.equal(out.findings.length, 2);
  assert.equal(out.costTokens, 42);
  const c = severityCounts(out.findings);
  assert.equal(c.CRITICAL, 1);
  assert.equal(c.LOW, 1);
});
test('UT-25 parseSkillOutput bỏ qua object JSON phụ, bắt đúng block có "findings"', () => {
  // prose chứa 1 object {...} không liên quan + JSON thật có field "fix" chứa code mẫu `{...}`.
  const raw =
    'Ví dụ cấu hình {"foo":1}.\n' +
    '```json\n{"findings":[{"severity":"HIGH","title":"x","fix":"dùng `{ a: 1 }`"}],"costTokens":7}\n```\n' +
    'kết thúc.';
  const out = parseSkillOutput('review-code', raw);
  assert.equal(out.findings.length, 1);
  assert.equal(out.findings[0].severity, 'HIGH');
  assert.equal(out.costTokens, 7);
});
test('UT-25 parseSkillOutput fallback nhãn [SEVERITY] khi không có JSON', () => {
  const raw = '[CRITICAL] lỗi nghiêm trọng\nvài dòng\n[HIGH] cảnh báo';
  const out = parseSkillOutput('review-code', raw);
  assert.equal(out.findings.length, 2);
  assert.equal(out.findings[0].severity, 'CRITICAL');
});

// ---------- UT-30: validateRepoUrl chặn SSRF / host nội bộ ----------
test('UT-30 validateRepoUrl chặn localhost / link-local (SSRF)', () => {
  assert.throws(() => azureClient.validateRepoUrl('http://localhost/x'), ValidationError);
  assert.throws(() => azureClient.validateRepoUrl('http://169.254.169.254/meta'), ValidationError);
});

// ---------- UT (bổ trợ): redactString che token ----------
test('redactString che chuỗi giống Claude/Slack token', () => {
  assert.ok(redactString('key sk-ant-1234567890abcdef').includes('«redacted»'));
  assert.ok(!redactString('xoxb-123456789012-abcdefABCDEF').includes('xoxb-123456789012'));
});

// ---------- UT (bổ trợ): CircuitBreaker mở sau ngưỡng, half-open sau cooldown ----------
test('CircuitBreaker mở sau threshold; recordSuccess reset', () => {
  const cb = new CircuitBreaker(3, 60_000);
  assert.equal(cb.isOpen('p1'), false);
  cb.recordFailure('p1');
  cb.recordFailure('p1');
  assert.equal(cb.isOpen('p1'), false); // chưa đủ ngưỡng
  cb.recordFailure('p1'); // đủ 3 → mở
  assert.equal(cb.isOpen('p1'), true);
  cb.recordSuccess('p1');
  assert.equal(cb.isOpen('p1'), false);
});
test('CircuitBreaker cô lập theo key (project khác không bị ảnh hưởng)', () => {
  const cb = new CircuitBreaker(1, 60_000);
  cb.recordFailure('proj-A');
  assert.equal(cb.isOpen('proj-A'), true);
  assert.equal(cb.isOpen('proj-B'), false);
});
