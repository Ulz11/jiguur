import { test, expect, USERS } from '../../fixtures';
import { request as apiRequest, type APIRequestContext } from '@playwright/test';

/**
 * Серверийн амин үзүүлэлт + РОЛИЙН ХААЛГА.
 *
 * Мөнгөний хана нь UI-гийн шийдвэр биш — СЕРВЕРИЙН баталгаа. Дэлгэц дээр
 * товч нуух нь даргын токеныг зогсоохгүй: тэр гараар хаяг оруулж, эсвэл
 * гар утасныхаа хөтчөөс `/api/loans` рүү ороход л хангалттай. Тиймээс энэ
 * suite нь хөтөчгүй, ЯГ HTTP түвшинд шалгана.
 */

/** Тухайн ролиор нэвтэрч, Authorization толгойтой контекст буцаана. */
async function asRole(baseURL: string, role: keyof typeof USERS): Promise<APIRequestContext> {
  const anon = await apiRequest.newContext({ baseURL });
  const res = await anon.post('/api/auth/login', {
    data: { username: USERS[role].username, password: USERS[role].password },
  });
  expect(res.ok(), `${role} нэвтэрч чадсангүй`).toBeTruthy();
  const { token } = await res.json();
  await anon.dispose();
  return apiRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

test('амин үзүүлэлт — сервер амьд, тооны хураангуй буцаана', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.app).toBe('Жигүүр Систем');
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(body.db).toBe('sqlite');
  /* Хоосон DB дээр `seed()` өөрөө ажилладаг: 5 харилцагч, 6 гэрээ. Тестүүд
     өөрсдийн харилцагч нэмдэг тул «дор хаяж» — тоо буурвал seed эвдэрсэн. */
  expect(body.clients, 'seed ажиллаагүй байна').toBeGreaterThanOrEqual(5);
  expect(body.contracts, 'seed ажиллаагүй байна').toBeGreaterThanOrEqual(6);
});

test('нэвтрээгүй хүнд API хаалттай', async ({ request }) => {
  for (const path of ['/api/clients', '/api/contracts', '/api/dashboard']) {
    const res = await request.get(path);
    expect(res.status(), `${path} нэвтрэлтгүй нээгдчихлээ`).toBe(401);
  }
});

/* Даргад ХААЛТТАЙ мөнгөний route-ууд. Хоёр талыг нь хамт барина: дарга 403,
   менежер 200 — эс бөгөөс «хаалт» нь эвдэрсэн хаягийн 404 байж мэднэ. */
const MONEY_ROUTES = [
  '/api/loans',
  '/api/salary/employees',
  '/api/salary/runs',
  '/api/reports',
  '/api/collections',
];

test('үйлдвэрийн дарга мөнгөний API руу орж чадахгүй (403)', async ({ baseURL }) => {
  const factory = await asRole(baseURL!, 'factory');
  try {
    for (const path of MONEY_ROUTES) {
      const res = await factory.get(path);
      expect(res.status(), `${path} — дарга руу нээгдчихлээ`).toBe(403);
      expect((await res.json()).detail).toBe('Энэ үйлдлийг хийх эрх байхгүй');
    }
  } finally {
    await factory.dispose();
  }
});

test('менежерт ЯГ тэр route-ууд нээлттэй — хаалт нь рольд, эвдэрсэн хаягт биш',
  async ({ baseURL }) => {
    const manager = await asRole(baseURL!, 'manager');
    try {
      for (const path of MONEY_ROUTES) {
        const res = await manager.get(path);
        expect(res.status(), `${path} — менежерт ч хаалттай байна`).toBe(200);
      }
    } finally {
      await manager.dispose();
    }
  });

test('санхүүчид мөнгөний route нээлттэй — тооцоо түүний ажил',
  async ({ baseURL }) => {
    const finance = await asRole(baseURL!, 'finance');
    try {
      for (const path of MONEY_ROUTES) {
        const res = await finance.get(path);
        expect(res.status(), `${path} — санхүүчид хаалттай байна`).toBe(200);
      }
    } finally {
      await finance.dispose();
    }
  });
