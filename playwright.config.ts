import { defineConfig, devices } from '@playwright/test';

/**
 * Жигүүр Зам — E2E. Backend нь суулгасан frontend/dist-ийг өөрөө үйлчилдэг тул
 * НЭГ л сервер хангалттай: uvicorn 8000 дээр. Хоосон DB дээр `seed()` өөрөө
 * ажилладаг тул CI дээр тусдаа өгөгдөл бэлдэх шаардлагагүй.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Отгоогийн жинхэнэ дэлгэц — 1366×768 дээр эвдэрдэг эсэхийг тестээр барина.
    { name: 'otgoo-1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    // Даргын планшет.
    { name: 'darga-tablet', use: { ...devices['iPad (gen 7)'] } },
  ],

  /* Тест эхлэхийн өмнө backend-ээ өөрөө асаана. Локал дээр аль хэдийн асаалттай
   * бол дахин асаахгүй (reuseExistingServer) — хөгжүүлэгчийн серверийг тасалдаггүй. */
  webServer: {
    command:
      'system/backend/.venv/bin/python -m uvicorn app.main:app ' +
      '--host 127.0.0.1 --port 8000 --app-dir system/backend',
    url: 'http://127.0.0.1:8000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Тестийн үед өдрийн cron ажиллуулахгүй — тоо тогтвортой байх ёстой.
    env: { JIGUUR_NO_CRON: '1' },
  },
});
