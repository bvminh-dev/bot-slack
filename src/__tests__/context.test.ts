// Unit test cho ContextBuilder.buildSkillMap (TC-18 giới hạn file + bỏ binary + map skill)
// và IntegrationError.retryable (BUG-02). Không cần Mongo/hệ ngoài.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGO_URI ||= 'mongodb://localhost:27017';
process.env.SECRET_MASTER_KEY ||= Buffer.alloc(32, 7).toString('base64');
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.SLACK_SIGNING_SECRET ||= 'test-slack-signing-secret';
process.env.SLACK_BOT_TOKEN ||= 'xoxb-test';
process.env.MAX_FILES_PER_PR ||= '50';

import { ContextBuilder } from '../application/contextBuilder';
import { IAzureClient, PrInfo, ChangedFile } from '../ports/interfaces';
import { IntegrationError } from '../domain/errors';
import { SKILLS } from '../application/fileSkillMap';

const dummyAzure = {} as IAzureClient; // buildSkillMap không dùng azure
const builder = new ContextBuilder(dummyAzure);

function pr(files: ChangedFile[]): PrInfo {
  return {
    prId: '1',
    title: 't',
    description: '',
    sourceBranch: 'feat',
    targetBranch: 'main',
    lastCommitHash: 'abc',
    repoUrl: 'https://dev.azure.com/o/p/_git/r',
    azureProject: 'p',
    changedFiles: files,
    isEmpty: files.length === 0,
  };
}

function file(path: string, isBinary = false): ChangedFile {
  return { path, changeType: 'edit', diffLines: 10, isBinary };
}

// TC-18: 60 file → cắt còn 50 + báo truncated.files=10
test('TC-18 cắt còn MAX_FILES_PER_PR và báo số bị cắt', () => {
  const files = Array.from({ length: 60 }, (_, i) => file(`src/f${i}.ts`));
  const out = builder.buildSkillMap(pr(files));
  assert.equal(out.truncated.files, 10);
  assert.ok(out.notes.some((n) => /Cắt còn 50/.test(n)));
  // tất cả file giới hạn là code → map review-code
  assert.equal(out.skillToFiles.get(SKILLS.reviewCode)?.length, 50);
});

// Bỏ qua binary/lock
test('buildSkillMap bỏ qua binary, ghi chú', () => {
  const out = builder.buildSkillMap(pr([file('a.ts'), file('logo.png', true), file('package-lock.json', true)]));
  assert.ok(out.notes.some((n) => /Bỏ qua 2 file binary/.test(n)));
  assert.equal(out.skillToFiles.get(SKILLS.reviewCode)?.length, 1);
});

// File nhạy cảm → review-code + bao-mat
test('buildSkillMap file nhạy cảm kích thêm bao-mat-he-thong', () => {
  const out = builder.buildSkillMap(pr([file('src/auth/token.ts')]));
  assert.ok(out.skillToFiles.has(SKILLS.security));
  assert.ok(out.skillToFiles.has(SKILLS.reviewCode));
});

// PR rỗng file reviewable → note "không có file phù hợp"
test('buildSkillMap không có file reviewable → note', () => {
  const out = builder.buildSkillMap(pr([file('img.png', true)]));
  assert.equal(out.skillToFiles.size, 0);
  assert.ok(out.notes.some((n) => /Không có file phù hợp/.test(n)));
});

// BUG-02: IntegrationError mang cờ retryable
test('BUG-02 IntegrationError mặc định retryable=true; permanent=false', () => {
  assert.equal(new IntegrationError('timeout').retryable, true);
  assert.equal(new IntegrationError('bad', false).retryable, false);
});
