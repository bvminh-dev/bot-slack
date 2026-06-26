import { defineConfig, devices } from '@playwright/test';

// E2E Admin UI — chạy trên Vite dev server, MOCK toàn bộ /api/v1/* (page.route) nên KHÔNG cần backend/Mongo.
// Khớp bảng "E2E Locators" (data-testid) trong test.md. Không có code automation nào ghi xuống code app.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Quay video mọi test (lưu vào test-results/<test>/video.webm). Đổi 'on' → 'retain-on-failure'
    // nếu chỉ muốn giữ video của test FAIL.
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
