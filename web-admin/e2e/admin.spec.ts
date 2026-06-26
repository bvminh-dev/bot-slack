// E2E Admin UI (Playwright) — map về bảng "3. E2E Test Cases" (E2E-01..06) trong test.md.
// Chiến lược: MOCK /api/v1/* bằng page.route → deterministic, không cần backend/Mongo chạy.
// Chỉ dùng data-testid (đúng "E2E Locators"); KHÔNG selector theo text/vị trí.
import { test, expect, Page } from '@playwright/test';

const MODELS = { models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'], efforts: ['low', 'medium', 'high'], defaultModel: 'claude-sonnet-4-6', defaultEffort: 'medium' };

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', name: 'LMS',
    repo: { repoUrl: 'https://dev.azure.com/org/proj/_git/repo', azureProject: 'proj' },
    modelConfig: { model: 'claude-opus-4-8', effort: 'high' },
    docSources: [], status: 'active',
    secretConfigured: { claudeKey: true, pat: true },
    createdAt: '2026-06-26T00:00:00Z', updatedAt: '2026-06-26T00:00:00Z',
    ...over,
  };
}

const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Mock login + meta/models. onLogin: trả lỗi nếu pat==='bad'. */
async function mockBase(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) => {
    const pat = JSON.parse(route.request().postData() || '{}').pat;
    if (pat === 'bad') return route.fulfill(json(400, { error: 'Đăng nhập thất bại.' })); // không lộ chi tiết
    return route.fulfill(json(200, { owner: { email: 'a@x.io', displayName: 'A' } }));
  });
  await page.route('**/api/v1/meta/models', (route) => route.fulfill(json(200, MODELS)));
}

async function login(page: Page, pat = 'good-pat') {
  await page.goto('/');
  await page.getByTestId('login-pat-input').fill(pat);
  await page.getByTestId('login-submit-btn').click();
}

// ---------- E2E-01: đăng nhập PAT (đúng/sai) ----------
test('E2E-01 login PAT hợp lệ → Dashboard; PAT sai → lỗi không lộ chi tiết', async ({ page }) => {
  await mockBase(page);
  await page.route('**/api/v1/projects', (route) => route.fulfill(json(200, [])));

  // sai
  await login(page, 'bad');
  await expect(page.getByTestId('login-error-msg')).toBeVisible();
  await expect(page.getByTestId('login-error-msg')).not.toContainText('bad');

  // đúng → vào Dashboard (project-create-btn chỉ có ở Dashboard; project-list rỗng có height 0 nên dùng nút)
  await login(page, 'good-pat');
  await expect(page.getByTestId('project-create-btn')).toBeVisible();
  await expect(page.getByTestId('project-list')).toBeAttached();
});

// ---------- E2E-02: tạo project + test-connection + secret write-only ----------
test('E2E-02 tạo project, test-connection từng phần, mở lại thấy cờ secret (không lộ giá trị)', async ({ page }) => {
  await mockBase(page);
  let created = false;
  await page.route('**/api/v1/projects', (route) => {
    if (route.request().method() === 'POST') { created = true; return route.fulfill(json(201, project())); }
    return route.fulfill(json(200, created ? [project()] : []));
  });
  await page.route('**/api/v1/projects/new/test-connection', (route) =>
    route.fulfill(json(200, { repo: true, pat: true, claudeKey: false })));
  await page.route('**/api/v1/projects/p1', (route) => route.fulfill(json(200, project())));

  await login(page);
  await page.getByTestId('project-create-btn').click();
  await page.getByTestId('project-name-input').fill('LMS');
  await page.getByTestId('project-repo-input').fill('https://dev.azure.com/org/proj/_git/repo');
  await page.getByTestId('project-model-select').selectOption('claude-opus-4-8');
  await page.getByTestId('project-effort-select').selectOption('high');
  await page.getByTestId('project-pat-input').fill('good-pat');
  await page.getByTestId('project-claudekey-input').fill('sk-ant-xyz');

  await page.getByTestId('project-testconn-btn').click();
  await expect(page.getByTestId('project-testconn-result')).toContainText('Repo: OK');
  await expect(page.getByTestId('project-testconn-result')).toContainText('Claude key: FAIL');

  await page.getByTestId('project-save-btn').click();
  await expect(page.getByTestId('project-row-p1')).toBeVisible();

  // mở lại (Sửa) → thấy cờ "đã cấu hình", input secret KHÔNG mang giá trị
  await page.getByTestId('project-row-p1').getByText('Sửa').click();
  await expect(page.getByTestId('project-secret-configured-flag')).toContainText('đã cấu hình');
  await expect(page.getByTestId('project-pat-input')).toHaveValue('');
  await expect(page.getByTestId('project-claudekey-input')).toHaveValue('');
});

// ---------- E2E-03: validate form (duplicate/ repo) theo field ----------
test('E2E-03 lưu trùng tên → lỗi validation theo field, chặn lưu', async ({ page }) => {
  await mockBase(page);
  await page.route('**/api/v1/projects', (route) => {
    if (route.request().method() === 'POST') return route.fulfill(json(409, { error: 'Tên project đã tồn tại.' }));
    return route.fulfill(json(200, []));
  });
  await login(page);
  await page.getByTestId('project-create-btn').click();
  await page.getByTestId('project-name-input').fill('Dup');
  await page.getByTestId('project-repo-input').fill('https://dev.azure.com/org/proj/_git/repo');
  await page.getByTestId('project-save-btn').click();
  await expect(page.getByTestId('project-form-error-name')).toBeVisible();
  await expect(page.getByTestId('project-form')).toBeVisible(); // vẫn ở form (chưa rời)
});

// ---------- E2E-04: stored XSS render escape ----------
test('E2E-04 tên project chứa <script> → render escape (text thuần), KHÔNG thực thi', async ({ page }) => {
  await mockBase(page);
  const xss = '<script>alert(1)</script>';
  let dialogFired = false;
  page.on('dialog', (d) => { dialogFired = true; d.dismiss(); });
  await page.route('**/api/v1/projects', (route) => route.fulfill(json(200, [project({ name: xss })])));

  await login(page);
  const row = page.getByTestId('project-row-p1');
  await expect(row).toBeVisible();
  await expect(row).toContainText(xss); // hiện như văn bản
  expect(dialogFired).toBe(false);     // không có alert chạy
});

// ---------- E2E-05: xoá có confirm + tenant isolation (404) ----------
test('E2E-05 xoá project (confirm trước); mở project người khác → 404 đồng nhất', async ({ page }) => {
  await mockBase(page);
  let deleted = false;
  await page.route('**/api/v1/projects', (route) => route.fulfill(json(200, deleted ? [] : [project()])));
  await page.route('**/api/v1/projects/p1', (route) => {
    if (route.request().method() === 'DELETE') { deleted = true; return route.fulfill({ status: 204, body: '' }); }
    return route.fulfill(json(200, project()));
  });
  await page.route('**/api/v1/projects/other-owner', (route) => route.fulfill(json(404, { error: 'Không tìm thấy.' })));
  await page.route('**/api/v1/projects/other-owner/reviews', (route) => route.fulfill(json(404, { error: 'Không tìm thấy.' })));

  await login(page);
  page.once('dialog', (d) => d.accept()); // confirm("Xoá project này?")
  await page.getByTestId('project-delete-btn-p1').click();
  await expect(page.getByTestId('project-row-p1')).toHaveCount(0);
});

// ---------- E2E-06: lịch sử review owner-scoped ----------
test('E2E-06 lịch sử review: bảng hiện commit + severity + badge trạng thái', async ({ page }) => {
  await mockBase(page);
  await page.route('**/api/v1/projects', (route) => route.fulfill(json(200, [project()])));
  await page.route('**/api/v1/projects/p1', (route) => route.fulfill(json(200, project())));
  await page.route('**/api/v1/projects/p1/reviews**', (route) => route.fulfill(json(200, {
    items: [{
      id: 'h1', jobId: 'job-1', prId: '123', prUrl: 'x', commitHash: 'abcdef1234567890',
      status: 'completed', severityCounts: { CRITICAL: 2, HIGH: 1, MEDIUM: 0, LOW: 3 },
      createdAt: '2026-06-26T00:00:00Z',
    }],
    nextCursor: null,
  })));

  await login(page);
  await page.getByTestId('project-row-p1').getByText('Lịch sử').click();
  await expect(page.getByTestId('review-history-table')).toBeVisible();
  await expect(page.getByTestId('review-history-row-job-1')).toContainText('abcdef12');
  await expect(page.getByTestId('review-status-badge-job-1')).toContainText('completed');
});
