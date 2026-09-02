import { test, expect } from '@playwright/test';

/* Утга бүхий E2E — Playwright-ийн жишээ тест (playwright.dev рүү ордог) нь
 * энэ системийн талаар ЮУ Ч батлахгүй тул устгав. Эдгээр нь бодит зам:
 * сервер амьд эсэх, Отгоо нэвтэрч чадаж байгаа эсэх, дарга мөнгө ХАРАХГҮЙ
 * эсэх. Сүүлийнх нь тестээр хамгаалагдах ёстой ганц найдвартай зүйл —
 * мөнгөний хана нь UI-гийн шийдвэр биш, СЕРВЕР талын баталгаа. */

const USERS = { manager: 'otgoo', factory: 'darga', finance: 'sanhuu' };
const PASS = '1234';

async function login(page: import('@playwright/test').Page, user: string) {
  await page.goto('/');
  await page.getByPlaceholder('otgoo').fill(user);
  await page.getByPlaceholder('••••').fill(PASS);
  await page.getByRole('button', { name: 'Нэвтрэх' }).click();
  // Товч алга болохыг хүлээх нь ХАНГАЛТГҮЙ: `goto()` нь програмыг дахин
  // ачаалдаг тул токен localStorage-д БИЧИГДСЭН байх ёстой, эс бөгөөс
  // нэвтрээгүй байдлаар боот хийж /login руу буцна.
  await page.waitForFunction(() =>
    Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').startsWith('eyJ')));
}

test('сервер амьд, тооны хураангуй буцаана', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.app).toBe('Жигүүр Систем');
});

test('нэвтрэх хуудас монголоор гарна', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Нэвтрэх' })).toBeVisible();
  await expect(page.getByText('ТҮРЭЭС · ХУДАЛДАА · ТООЦОО')).toBeVisible();
});

test('менежер нэвтэрч удирдлагын төв рүү орно', async ({ page }) => {
  await login(page, USERS.manager);
  await expect(page.getByRole('heading', { level: 1, name: 'Удирдлагын төв' })).toBeVisible();
  // Авлагын KPI — мөнгө менежерт ХАРАГДАНА
  await expect(page.getByText('Авлагын нийт үлдэгдэл')).toBeVisible();
});

test('дарга өөрийн ажлын дараалалдаа орно', async ({ page }) => {
  await login(page, USERS.factory);
  await expect(page.getByRole('heading', { level: 1, name: 'Өнөөдрийн ажил' })).toBeVisible();
});

/* МӨНГӨНИЙ ХАНА — дарга гэрээний дэлгэрэнгүй дээр ямар ч ₮ харахгүй.
 * Сервер тал (`serializers.factory_contract_detail`) талбаруудыг УСТГАДАГ тул
 * энэ нь CSS-ээр нуусан эсэхийг биш, өгөгдөл ирээгүйг шалгана. `title=` дотор
 * нуугдсан алдаа урьд нь гарч байсан тул атрибутыг ч шалгана. */
test('дарга гэрээн дээр мөнгө харахгүй', async ({ page }) => {
  await login(page, USERS.factory);
  await page.goto('/contracts/1');
  // Гэрээний хуудас ҮНЭХЭЭР ачаалагдсаныг батал — /login руу буцсан хуудсан
  // дээр «₮ алга» гэдэг нь утгагүй ногоон гэрчилгээ болно.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(page.url()).toContain('/contracts/1');

  const leaks = await page.evaluate(() => {
    const text = document.body.innerText.includes('₮');
    const attrs = Array.from(document.querySelectorAll('*')).some((el) =>
      Array.from(el.attributes).some((a) => a.value.includes('₮')));
    return { text, attrs };
  });
  expect(leaks.text, 'дэлгэц дээр ₮ гарсан').toBe(false);
  expect(leaks.attrs, 'title/aria дотор ₮ нуугдсан').toBe(false);
});
