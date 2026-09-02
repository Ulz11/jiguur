import { test, expect, USERS, type Role } from '../../fixtures';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { openNavigation } from '../../support/shell';

/**
 * Нэвтрэлт — рол бүр ӨӨРИЙН нүүр рүү.
 *
 * Отгоо, санхүүч «Удирдлагын төв» рүү; үйлдвэрийн дарга «Өнөөдрийн ажил»
 * руу. Дарга дээр авлага, орлогын график, насжилт байхгүй — түүний нүүр нь
 * ажлын дараалал (Dashboard.tsx `if (isFactory) return`).
 */

test('нэвтрэх хуудас монголоор, товч нь дуудагдах нэртэй', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await expect(login.tagline).toBeVisible();
  await expect(login.usernameInput).toBeVisible();
  await expect(login.passwordInput).toBeVisible();
  /* Товч нь нэр, нууц үг хоёулаа бөглөгдөх хүртэл идэвхгүй — санамсаргүй
     хоосон илгээлт байхгүй. */
  await expect(login.submitButton).toBeDisabled();
});

for (const role of ['manager', 'factory', 'finance'] as Role[]) {
  test(`${USERS[role].username} нэвтэрч «${USERS[role].home}» рүү орно`, async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(USERS[role].username, USERS[role].password);

    await expect(page).toHaveURL(/\/$|\/#/);
    const dashboard = new DashboardPage(page);
    await expect(dashboard.title).toHaveText(USERS[role].home);
    /* Хажуугийн самбар дээр ХЭН болох нь бичигдэнэ — өөр хүний токеноор
       орсон эсэхийг нүдээр батлах ганц газар. `.first()`: даргын болон
       санхүүчийн НЭР нь тэдний ролийн ШОШГОТОЙ яг ижил үг («Үйлдвэрийн
       дарга», «Санхүүч») тул хоёр мөрөнд хоёулаа бичигдэнэ. */
    const nav = page.getByRole('complementary', { name: 'Үндсэн навигаци' });
    await expect(nav.getByText(USERS[role].name, { exact: true }).first()).toBeVisible();
  });
}

test('үйлдвэрийн даргын цэсэнд мөнгөний хуудсууд ОГТ байхгүй', async ({ factoryPage }) => {
  await factoryPage.goto('/');
  const nav = await openNavigation(factoryPage);
  for (const hidden of ['Авлага цуглуулах', 'Зээл / Өглөг', 'Цалин', 'Тайлан', 'Аналитик']) {
    await expect(nav.getByRole('link', { name: hidden }),
      `«${hidden}» даргын цэсэнд гарчихлаа`).toHaveCount(0);
  }
  /* Түүний ӨӨРИЙН ажлын хуудсууд байрандаа — цэс хоосорсон биш, шүүгдсэн. */
  await expect(nav.getByRole('link', { name: 'Агуулах' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Гэрээнүүд' })).toBeVisible();
});

test('буруу нууц үг — монголоор татгалзана, хуудас нэвтрэхэд үлдэнэ', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.signInExpectingFailure('otgoo', 'buruu');

  await expect(login.errorMessage).toHaveText('Нэвтрэх нэр эсвэл нууц үг буруу байна');
  await expect(page).toHaveURL(/\/login$/);
  /* Хамгийн чухал нь: токен бичигдээгүй. Мессеж гарсан ч токен үлдсэн бол
     дараагийн хуудас нээгдэх байсан. */
  expect(await page.evaluate(() => window.localStorage.getItem('jz_token'))).toBeNull();
});

test('нэвтрээгүй хүн гүн холбоосоор орох гэвэл нэвтрэх хуудас руу буцна',
  async ({ page }) => {
    await page.goto('/contracts/1');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Нэвтрэх' })).toBeVisible();
    /* Гэрээний хуудас ЮУ Ч гаргаагүй байх ёстой — «буцаагдсан» гэдэг нь
       агуулгыг нь харуулчихаад дараа нь буцаах гэсэн үг биш. */
    await expect(page.getByRole('link', { name: '← Гэрээнүүд рүү буцах' })).toHaveCount(0);
  });

test('гарах товч дарвал токен арилж, нэвтрэх хуудас руу гарна', async ({ managerPage }) => {
  await managerPage.goto('/');
  /* Планшет дээр цэс нь хаалттай хавтас — «Гарах» товч дэлгэцнээс гадна
     зогсдог тул эхлээд ☰-г дарна (десктоп дээр алхам алгасагдана). */
  const nav = await openNavigation(managerPage);
  await nav.getByRole('button', { name: 'Гарах' }).click();
  await expect(managerPage).toHaveURL(/\/login$/);
  expect(await managerPage.evaluate(() => window.localStorage.getItem('jz_token'))).toBeNull();
});
