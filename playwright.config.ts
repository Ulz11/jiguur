import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

/**
 * Жигүүр Зам — E2E тохиргоо.
 *
 * ТУСГААРЛАЛТ (хамгийн чухал зүйл). Отгоогийн `jiguur.db` (демо дэвтэр) ба
 * `jiguur-real.db` (БОДИТ харилцагчийн дата) хоёрт тест ХЭЗЭЭ Ч хүрэхгүй.
 * Тиймээс:
 *   1. `DATABASE_URL` нь /tmp доторх ТҮР файлыг заана. Хоосон DB дээр
 *      `app/main.py`-ийн `seed()` өөрөө ажилладаг тул демо дата өөрөө төрнө.
 *   2. `JIGUUR_BACKUP_DIR` мөн /tmp — `backup_db()` нь импортын үед ажилладаг
 *      тул эс бөгөөс `system/backend/backups/` руу хог хаяна.
 *   3. `JIGUUR_NO_CRON=1` — өдөр тутмын нэхэмжлэлийн cron унтарна, тоо тогтвортой.
 *   4. `JIGUUR_SECRET` — эс бөгөөс `backend/.secret` файлыг үүсгэж/уншина.
 *   5. Порт 8000 БИШ. Хөгжүүлэгчийн сервер 8000 дээр `jiguur.db`-тэй сууж
 *      байдаг: ганц GET (`/api/clients` → `ensure_invoices`) ч тэр файлыг
 *      БИЧДЭГ. Тест өөрийн порт дээр, өөрийн DB-тэй амьдарна.
 */
const PORT = 8931;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const E2E_DIR = path.join(os.tmpdir(), 'jiguur-e2e');
const E2E_DB = path.join(E2E_DIR, 'e2e.db');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  /* CI дээр `test.only` үлдсэн бол бүх suite чимээгүй хумигдана — тэрийг унагана. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  /* Гурван репорт: хүн уншихад html, CI уншихад junit, машин уншихад json. */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
    ['json', { outputFile: 'playwright-results.json' }],
  ],

  /* Тест унасан ШАЛТГААНЫГ нүдээр харах материал. Ногоон гүйлт дээр юу ч
     үлдээхгүй — Отгоогийн диск тестийн видеогоор дүүрэх ёсгүй. */
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    locale: 'mn-MN',
    timezoneId: 'Asia/Ulaanbaatar',
  },
  expect: { timeout: 10_000 },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* Отгоогийн ЖИНХЭНЭ дэлгэц. 1366×768 дээр л таслагддаг зүйлс (13 мөрт цэс,
       KPI-н мөр) энэ проектоор баригдана — «миний дээр болж байна» гэдэг
       хангалтгүй. */
    { name: 'otgoo-1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    /* Даргын планшет — touch, iPad (WebKit). */
    { name: 'darga-tablet', use: { ...devices['iPad (gen 7)'] } },
    /* Safari/WebKit — Mac дээр ажиллана (`~/Library/Caches/ms-playwright/webkit-*`). */
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    /* Эхлээд ТҮР DB-г устгана (цэвэр seed бүр гүйлтэд), дараа нь uvicorn.
       `fresh-db.mjs` нь `jiguur.db`/`jiguur-real.db`-г устгахаас ТАТГАЛЗДАГ. */
    command:
      'node tests/support/fresh-db.mjs && ' +
      'system/backend/.venv/bin/python -m uvicorn app.main:app ' +
      `--host 127.0.0.1 --port ${PORT} --app-dir system/backend`,
    url: `${BASE_URL}/api/health`,
    /* ЗӨВХӨН өөрийн сервер. `reuseExistingServer: true` бол хөгжүүлэгчийн
       8000 дээрх (эсвэл өмнөх гүйлтийн) сервер рүү наалдаж, тэр нь Отгоогийн
       ЖИНХЭНЭ `jiguur.db`-тэй сууж байвал тусгаарлалт ЮУ Ч БИШ болно. */
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: `sqlite:///${E2E_DB}`,
      JZ_E2E_DB: E2E_DB,
      JIGUUR_NO_CRON: '1',
      JIGUUR_BACKUP_DIR: path.join(E2E_DIR, 'backups'),
      JIGUUR_SECRET: 'jiguur-e2e-secret',
    },
  },
});
