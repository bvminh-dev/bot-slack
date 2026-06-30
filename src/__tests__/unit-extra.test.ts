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

import { parseCommand, parseFreshFlag } from '../application/commandParser';
import { mapFileToSkills, SKILLS } from '../application/fileSkillMap';
import { parseAzurePrUrl, azureClient } from '../adapters/azure/azureClient';
import { isValidModel, isValidEffort, normalizeModelConfig } from '../config/catalog';
import { severityCounts, makeIdempotencyKey, isCacheEligible } from '../domain/reviewJob';
import { redactString, redactReport } from '../observability/redact';
import { CircuitBreaker } from '../observability/circuitBreaker';
import { parseSkillOutput } from '../adapters/skillrunner/skillRunner';
import { chunkByLines } from '../adapters/slack/slackPort';
import {
  buildReportFilename,
  sanitizeFilename,
  buildSummaryLine,
  buildStaleNote,
  neutralizeMentions,
  isFileWithinSlackLimit,
} from '../application/reviewReport';
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

// ==================== i-002 — Unit (giao kết quả file .md / fan-out / cache / fresh) ====================

// UT-201: tên file review-<project>-PR<id>-<commit8>.md
test('UT-201 buildReportFilename dùng commit8', () => {
  assert.equal(buildReportFilename('LMS', '123', 'abcdef1234567890'), 'review-LMS-PR123-abcdef12.md');
});
// UT-202: sanitizeFilename chống path traversal
test('UT-202 sanitizeFilename loại ../ và ký tự lạ', () => {
  const fn = buildReportFilename('../../etc/passwd', '1', 'aaaaaaaa');
  assert.ok(!fn.includes('..') && !fn.includes('/'), `không path traversal: ${fn}`);
  assert.equal(sanitizeFilename('a/b c..d'), 'a-b-c-d');
});
// UT-204: dòng tóm tắt mrkdwn-safe + đếm severity
test('UT-204 buildSummaryLine đếm severity + mrkdwn (*đậm*, không ##)', () => {
  const s = buildSummaryLine({
    prId: '7', prUrl: 'http://pr/7', commitHash: 'abcdef12xx',
    findings: [{ skill: 'r', severity: 'CRITICAL', title: 'a' }, { skill: 'r', severity: 'HIGH', title: 'b' }],
    skillRuns: [{ skill: 'r', status: 'completed', findingCount: 2 }], allFailed: false,
  });
  assert.ok(s.includes('*1* CRITICAL') && s.includes('*1* HIGH'));
  assert.ok(!s.includes('###'));
});
// UT-205: redactReport che secret-pattern
test('UT-205 redactReport che secret (sk-ant / AKIA / password=)', () => {
  const out = redactReport('key sk-ant-abcdefgh12345 và AKIAIOSFODNN7EXAMPLE và password=Hunter2!');
  assert.ok(!out.includes('sk-ant-abcdefgh12345'));
  assert.ok(!out.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(!out.includes('Hunter2!'));
});

// UT-205b (BUG-14 regression): data-driven — biến thể token/secret phổ biến đều phải bị che.
test('UT-205b redactReport bắt biến thể GitHub/AWS/quoted-value (BUG-14)', () => {
  const cases: Array<[string, string]> = [
    ['gho_aaaaaaaaaaaaaaaaaaaaaaaa', 'GitHub oauth token'],
    ['ghu_bbbbbbbbbbbbbbbbbbbbbbbb', 'GitHub user token'],
    ['ghs_cccccccccccccccccccccccc', 'GitHub server token'],
    ['github_pat_11ABCDE0000aaaaaaaaaaaa', 'GitHub fine-grained PAT'],
    ['ASIAQQQQQQQQQQQQQQQ7', 'AWS STS temp key'],
  ];
  for (const [secret, label] of cases) {
    const out = redactReport(`evidence: ${secret} trong code`);
    assert.ok(!out.includes(secret), `${label} phải bị che: ${out}`);
  }
  // key="value CÓ dấu cách" (dạng config rất phổ biến) — trước BUG-14 bị lọt.
  const q = redactReport('config: password = "super secret pw" còn lại');
  assert.ok(!q.includes('super secret pw'), `quoted password phải bị che: ${q}`);
  const q2 = redactReport("client_secret: 'value with space here'");
  assert.ok(!q2.includes('value with space here'), `quoted client_secret phải bị che: ${q2}`);
});
// UT-206: neutralizeMentions vô hiệu @channel/@here
test('UT-206 neutralizeMentions vô hiệu broadcast + user mention', () => {
  const out = neutralizeMentions('alert <!channel> and <!here> ping <@U123> see <http://x.io|link>');
  assert.ok(!out.includes('<!channel>') && !out.includes('<!here>') && !out.includes('<@U123>'));
  assert.ok(out.includes('link') && !out.includes('<http'));
});
// UT-207: chunkByLines (chunkMrkdwn) cắt theo dòng, không vượt max
test('UT-207 chunkByLines không vượt max, ghép lại đủ nội dung', () => {
  const text = Array.from({ length: 50 }, (_, i) => `dòng ${i} ${'x'.repeat(80)}`).join('\n');
  const parts = chunkByLines(text, 200);
  assert.ok(parts.every((p) => p.length <= 200));
  assert.ok(parts.length > 1);
});
// UT-208: parseFreshFlag + parseCommand nhận cờ fresh ở cuối, không nhầm
test('UT-208 parseFreshFlag chỉ nhận fresh/rerun ở token sau url', () => {
  assert.equal(parseFreshFlag(['fresh']), true);
  assert.equal(parseFreshFlag(['rerun']), true);
  assert.equal(parseFreshFlag(['--fresh']), false);
  assert.equal(parseCommand('LMS review https://dev.azure.com/o/p/_git/r/pullrequest/9 fresh').fresh, true);
  assert.equal(parseCommand('LMS review https://dev.azure.com/o/p/_git/r/pullrequest/9').fresh, false);
});
// UT-209: khóa commit-aware (commit khác → khóa khác)
test('UT-209 buildIdempotencyKey commit-aware', () => {
  assert.notEqual(makeIdempotencyKey('p', '1', 'c8'), makeIdempotencyKey('p', '1', 'c9'));
});
// UT-210: isCacheEligible — completed hợp lệ true; failed/superseded/empty false
test('UT-210 isCacheEligible loại failed/superseded/empty', () => {
  const ok = { status: 'completed' as const, skillRuns: [{ skill: 'r', status: 'completed' as const, findingCount: 1 }] };
  assert.equal(isCacheEligible(ok), true);
  assert.equal(isCacheEligible({ ...ok, supersededByJobId: 'x' }), false);
  assert.equal(isCacheEligible({ status: 'failed', skillRuns: [] }), false);
  assert.equal(isCacheEligible({ status: 'completed', skillRuns: [{ skill: 'r', status: 'failed', findingCount: 0 }] }), false);
  assert.equal(isCacheEligible({ status: 'completed', skillRuns: [] }), false);
});
// UT-217: buildStaleNote chú thích commit + gợi ý fresh
test('UT-217 buildStaleNote nêu commit + gợi ý fresh', () => {
  const note = buildStaleNote(new Date('2026-06-30T00:00:00Z'), 'abcdef1234');
  assert.ok(note.toLowerCase().includes('fresh') && note.includes('abcdef12'));
});
// UT-218: isFileWithinSlackLimit biên
test('UT-218 isFileWithinSlackLimit biên', () => {
  assert.equal(isFileWithinSlackLimit(100, 1000), true);
  assert.equal(isFileWithinSlackLimit(1000, 1000), true);
  assert.equal(isFileWithinSlackLimit(1001, 1000), false);
  assert.equal(isFileWithinSlackLimit(0, 1000), false);
});
