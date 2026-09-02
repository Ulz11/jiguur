import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

export type Role = 'manager' | 'factory' | 'finance';

/** Ролийн жинхэнэ хэрэглэгчид (`app/seed.py`) — нэр нь дэлгэц дээр гарна. */
export const USERS: Record<Role, { username: string; password: string; name: string; home: string }> = {
  manager: { username: 'otgoo', password: '1234', name: 'Ч.Отгонцэцэг', home: 'Удирдлагын төв' },
  factory: { username: 'darga', password: '1234', name: 'Үйлдвэрийн дарга', home: 'Өнөөдрийн ажил' },
  finance: { username: 'sanhuu', password: '1234', name: 'Санхүүч', home: 'Удирдлагын төв' },
};

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * Нэвтэрсэн хуудас нь ҮНЭХЭЭР нэвтэрсэн эсэхийг батална.
 *
 * ЯАГААД: `jz_token` нь `localStorage`-д сууна. `storageState` буруу/хоцорсон
 * бол програм `<Navigate to="/login">`-оор чимээгүй буцаж, тест нэвтрэх
 * дэлгэц дээр зогсоно. Тэр үед «₮ олдсонгүй» гэсэн баталгаа ЯГ ХУДЛААР
 * ногоон болно (нэвтрэх дэлгэц дээр ₮ байхгүй нь мэдээж).
 *
 * Тиймээс хоёр талаас нь барина:
 *   1. shell-ийн навигаци (`aria-label="Үндсэн навигаци"`) — зөвхөн
 *      `user()` байвал рендерлэгддэг, ЭЕРЭГ дохио;
 *   2. `jz_user.role` нь ЯГ тэр рольд тохирч байна — өөр хүнээр орсныг барина.
 */
export async function assertAuthenticated(page: Page, role: Role, where: string): Promise<void> {
  await expect(
    page.getByRole('complementary', { name: 'Үндсэн навигаци' }),
    `«${where}» дээр нэвтрээгүй байна — тест нэвтрэх хуудсан дээр зогсож байж «ногоон» болох гэж байлаа`,
  ).toBeVisible();
  const seen = await page.evaluate(() => {
    try { return JSON.parse(window.localStorage.getItem('jz_user') || 'null'); } catch { return null; }
  });
  expect(seen?.role, `«${where}» дээр буруу ролиор нэвтэрсэн байна`).toBe(role);
}

/**
 * `page.goto`-г ХАМГААЛНА: навигаци бүрийн дараа нэвтрэлтийг шалгана.
 *
 * Ганц газраас барьсан тул тест эсвэл POM аль нь ч мартаж чадахгүй —
 * «нэвтэрсэн гэж бодоод нэвтрэх дэлгэц дээр гүйх» боломж ҮГҮЙ болно.
 */
function guardNavigation(page: Page, role: Role): void {
  const rawGoto = page.goto.bind(page);
  page.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
    const response = await rawGoto(url, options);
    await assertAuthenticated(page, role, url);
    return response;
  };
}

type AuthWorkerFixtures = {
  /** Рол тус бүрийн `storageState` — worker бүрд НЭГ л удаа UI-гаар нэвтэрнэ. */
  storageStateOf: (role: Role) => Promise<StorageState>;
};

type AuthFixtures = {
  managerPage: Page;   // Отгоо эгч
  factoryPage: Page;   // үйлдвэрийн дарга
  financePage: Page;   // санхүүч
};

async function openRolePage(
  browser: Browser,
  storageStateOf: (role: Role) => Promise<StorageState>,
  role: Role,
  use: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({ storageState: await storageStateOf(role) });
  const page = await context.newPage();
  guardNavigation(page, role);
  try {
    await use(page);
  } finally {
    await context.close();
  }
}

export const test = base.extend<AuthFixtures, AuthWorkerFixtures>({
  storageStateOf: [
    async ({ browser }, use) => {
      const cache = new Map<Role, StorageState>();
      await use(async (role: Role) => {
        const hit = cache.get(role);
        if (hit) return hit;
        /* UI-гаар нэвтэрнэ — API-гаар токен зохиовол нэвтрэх урсгал өөрөө
           эвдэрсэнийг ГЭРЧИЛГЭЭТЭЙГЭЭР алддаг. Нэг worker-т нэг удаа. */
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          const login = new LoginPage(page);
          await login.goto();
          await login.signIn(USERS[role].username, USERS[role].password);
          const state = await context.storageState();
          /* storageState нь токенгүй гарсан бол ЭНД зогсоно — тест бүр
             дараа нь нэвтрэх дэлгэц дээр «ногоон» болохоос өмнө. */
          const origin = state.origins.find((o) => o.localStorage.some((e) => e.name === 'jz_token'));
          expect(origin, `«${role}» рольд jz_token хадгалагдсангүй`).toBeTruthy();
          const stored = origin!.localStorage.find((e) => e.name === 'jz_user')!.value;
          expect(JSON.parse(stored).role, `«${role}» рольд өөр хэрэглэгч нэвтэрлээ`).toBe(role);
          cache.set(role, state);
          return state;
        } finally {
          await context.close();
        }
      });
    },
    { scope: 'worker' },
  ],

  managerPage: async ({ browser, storageStateOf }, use) => {
    await openRolePage(browser, storageStateOf, 'manager', use);
  },
  factoryPage: async ({ browser, storageStateOf }, use) => {
    await openRolePage(browser, storageStateOf, 'factory', use);
  },
  financePage: async ({ browser, storageStateOf }, use) => {
    await openRolePage(browser, storageStateOf, 'finance', use);
  },
});

export { expect };
