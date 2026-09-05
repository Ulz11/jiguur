import { test, expect, type DataFactory } from '../../fixtures';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
import { clickToOpen } from '../../support/interact';

/**
 * ХАРИЛЦАГЧИЙН ХУУДАС — ХИЙГДСЭН ЗҮЙЛ ХАРАГДАЖ ҮЛДЭНЭ.
 *
 * Гурван зүйл ЭНЭ хуудсан дээр байхгүй байв, гэрээний хуудсан дээр БАЙСАН:
 *
 *   1. ХУАНЛИ нь ЭВЕНТТЭЙ СҮҮЛЧИЙН САР дээр нээгддэг байсан. Бутангуудын
 *      сүүлчийн бичилт 6-р сард тул 9-р сарын 5-нд ч 6-р сар зогсоно —
 *      тэр агшинд бүртгэсэн төлбөр нүднээс ГУРВАН САРЫН цаана унана.
 *
 *   2. ЗУРВАС. `PayModal` нь `payOutcome(...)`-оо дамжуулдаг байсныг хуудас
 *      чимээгүй хаяж (`onDone={() => { setPay(false); load(); }}`), Отгоо
 *      «Бүртгэх» дараад цаасаа эргүүлж, буцаж ирэхэд дэлгэц дээр ЮУ Ч
 *      олдохгүй. 3.2 секундын мэдэгдэл нь түүний хувьд БАЙХГҮЙ.
 *
 *   3. «+ Бичилт» цонхны ГОЛ ТОВЧ 768px-ийн доор үлддэг байв — тэр талбараа
 *      бөглөөд «дараа нь юу хийх вэ» гэдгээ олохгүй.
 */

/** Мэдэгдэл 3,200 мс-д арилдаг — зурвас нь түүнээс ХОЙШ ч зогсох ёстой. */
const AFTER_TOAST_MS = 5_000;
const PAY = 1_500_000;

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Гэрээ, ачилт, нэхэмжлэлтэй харилцагч — БҮХ түүх нь 60 хоногийн ӨМНӨ. */
async function clientWithOldHistory(data: DataFactory) {
  const { client } = await data.rentSetup({ qty: 20, dailyRate: 330, startDaysAgo: 60 });
  return client;
}

/** Профайл дээрээс төлбөр бүртгэнэ (UI-гаар — тэр яг ингэж хийдэг). */
async function registerPayment(page: any, amount: number) {
  const modal = await clickToOpen(
    page.getByRole('button', { name: 'Төлбөр бүртгэх' }),
    page.getByRole('dialog').filter({ hasText: 'Төлбөр бүртгэх' }),
    'Төлбөр бүртгэх цонх');
  await modal.getByLabel('Дүн ₮').fill(String(amount));
  await modal.getByRole('button', { name: 'Бүртгэх', exact: true }).click();
  await expect(modal).toBeHidden();
}

test('өнөөдөр бүртгэсэн төлбөр ӨНӨӨДРИЙН сарын хуанли дээр гарна — товшилтгүйгээр',
  async ({ managerPage, data }) => {
    const client = await clientWithOldHistory(data);
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    const now = new Date();
    const month = `${now.getFullYear()} оны ${now.getMonth() + 1}-р сар`;
    /* Хуанли АНХНААСАА өнөөдрийн сар дээр — «сүүлчийн эвенттэй сар» биш.
       (Энэ харилцагчийн бүх түүх 60 хоногийн өмнөх сард байна.) */
    await expect(managerPage.getByText(month, { exact: true }),
      'хуанли өнөөдрийн сар дээр нээгдсэнгүй').toBeVisible();

    await registerPayment(managerPage, PAY);

    /* Цэг нь ӨНӨӨДРИЙН нүдэн дээр гарна — ‹ › товч дарах шаардлагагүй.
       Нүдний дуудагдах нэр нь юу болсныг бүтнээр хэлдэг (`dayCellLabel`). */
    const day = now.getDate();
    const cell = managerPage.getByRole('button',
      { name: new RegExp(`^${now.getMonth() + 1}-р сарын ${day} · .*Төлбөр 1`) });
    await expect(cell, 'өнөөдрийн нүдэн дээр төлбөрийн цэг гарсангүй').toBeVisible();

    /* Өдрийн жагсаалт нь ТЭР төлбөрийг нэрлэнэ (мутацийн дараа сонголт
       өөрөө өнөөдөр дээр буусан). */
    await expect(managerPage.getByText(/Төлбөр — 1,500,000₮/),
      'өдрийн жагсаалтад төлбөр гарсангүй').toBeVisible();
  });

test('төлбөрийн дараах зурвас 5 секундын дараа ч тоонуудтайгаа зогсоно',
  async ({ managerPage, data }) => {
    const client = await clientWithOldHistory(data);
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);
    await registerPayment(managerPage, PAY);

    const strip = managerPage.getByRole('status')
      .filter({ hasText: /Төлбөр бүртгэгдлээ — 1,500,000₮/ });
    await expect(strip, 'төлбөрийн дараа зурвас гарсангүй').toBeVisible();
    await expect(strip, 'зурвас хуваарилалтаа хэлсэнгүй')
      .toContainText(/нэхэмжлэлд хуваарилагдав/);

    /* ---- ГОЛ БАТАЛГАА: мэдэгдэл арилсан ч зурвас ҮЛДЭНЭ ---- */
    await managerPage.waitForTimeout(AFTER_TOAST_MS);
    await expect(strip, `${AFTER_TOAST_MS} мс-ийн дараа зурвас алга болжээ`)
      .toBeVisible();

    await strip.getByRole('button', { name: 'Хаах' }).click();
    await expect(strip, '«Хаах» дарсан ч зурвас үлдлээ').toBeHidden();
  });

/* ⚠ Дэлгэцийн хэмжээ нь ЭНЭ баталгааны хэмжүүр тул проектоос үл хамааран
   1366×768 болгож тогтооно (`her/dialogs-fit.spec.ts`-тэй ижил журам). */
test.describe('«+ Бичилт» цонх', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('баримт ба «Үргэлжлүүлэх» нь 768px-д гүйлгэлгүйгээр гарт бэлэн',
    async ({ managerPage, data }) => {
      const client = await clientWithOldHistory(data);
      const profile = new ClientProfilePage(managerPage);
      await profile.goto(client.id);
      await managerPage.getByRole('button', { name: /^Бусад бичилт/ }).click();

      const modal = await clickToOpen(
        managerPage.getByRole('button', { name: '+ Бичилт' }),
        managerPage.getByRole('dialog').filter({ hasText: 'Бусад бичилт' }),
        '«+ Бичилт» цонх');

      /* ЧИГЛЭЛ нь ТЭМДГЭЭРЭЭ эхэлж, ХЭН хийхийг нь араас нь хэлнэ —
         «Дебит»/«Кредит» гэсэн нягтлангийн хос үг унав. */
      await expect(modal.getByRole('button', { name: '+ Авлага нэмэгдэнэ (тэр төлнө)' }))
        .toBeVisible();
      await expect(modal.getByRole('button', { name: '− Авлага буурна (бид хасна)' }))
        .toBeVisible();

      await modal.getByLabel('Дүн ₮').fill('2800000');
      await modal.getByLabel(/Юуны төлөө/).fill('Ажилчдын цалинд');

      /* Баримт нь мөнгө ХААШАА хөдлөхийг цонхны ЁРООЛД, гүйлтийн ГАДНА
         барина: «Одоогийн авлага X → Авлага болно Y». */
      /* `exact` — цонхны эхний өгүүлбэр ч «одоогийн авлага» гэж бичдэг
         (getByText нь анхдагчаараа ХЭСЭГЧИЛСЭН, ТОМ-ЖИЖГИЙГ ялгадаггүй). */
      await expect(modal.getByText('Авлага болно', { exact: true }),
        'баримтын нийлбэр мөр алга').toBeVisible();
      await expect(modal.getByText('Одоогийн авлага', { exact: true })).toBeVisible();

      const next = modal.getByRole('button', { name: 'Үргэлжлүүлэх' });
      const box = (await next.boundingBox())!;
      expect(box.y, '«Үргэлжлүүлэх» дээшээ гарлаа').toBeGreaterThanOrEqual(0);
      expect(Math.round(box.y + box.height),
        '«Үргэлжлүүлэх» товч 768px-ийн доор үлдлээ — Отгоо талбараа бөглөөд '
        + 'дараа нь юу хийхээ олохгүй').toBeLessThanOrEqual(768);
    });

  test('бичилт хийгдэхэд зурвас нь авлагыг ХЭДЭЭС ХЭД болгосноо хэлнэ',
    async ({ managerPage, data }) => {
      const client = await clientWithOldHistory(data);
      const profile = new ClientProfilePage(managerPage);
      await profile.goto(client.id);
      await managerPage.getByRole('button', { name: /^Бусад бичилт/ }).click();

      const modal = await clickToOpen(
        managerPage.getByRole('button', { name: '+ Бичилт' }),
        managerPage.getByRole('dialog').filter({ hasText: 'Бусад бичилт' }),
        '«+ Бичилт» цонх');
      await modal.getByLabel('Дүн ₮').fill('2800000');
      await modal.getByLabel(/Юуны төлөө/).fill('Ажилчдын цалинд');
      await modal.getByRole('button', { name: 'Үргэлжлүүлэх' }).click();

      const ask = managerPage.getByRole('dialog').filter({ hasText: 'Бичилт хийх' });
      await expect(ask).toBeVisible();
      await ask.getByRole('button', { name: 'Бичих' }).click();
      await expect(ask).toBeHidden();

      const strip = managerPage.getByRole('status')
        .filter({ hasText: /Бичилт хийгдлээ — Олгосон зээл · Ажилчдын цалинд/ });
      await expect(strip, 'бичилтийн дараа зурвас гарсангүй').toBeVisible();
      await expect(strip).toContainText(/\+2,800,000₮/);
      await expect(strip, 'зурвас авлагын ХОЁР тоог хэлсэнгүй')
        .toContainText(/авлага [\d,]+₮ → [\d,]+₮/);

      /* Мөрөн дээр ЭХ СУРВАЛЖ («2026 тооцоо!R24») ХЭЗЭЭ Ч гарахгүй. */
      await expect(managerPage.getByText('Ажилчдын цалинд').first()).toBeVisible();
      expect(await managerPage.locator('tbody').innerText(),
        'мөрөн дээр Excel-ийн нүдний хаяг гарлаа').not.toContain('!');
    });
});

test('төлбөр цуцлах цонх — бичсэн шалтгааныг Escape ЧИМЭЭГҮЙ устгахгүй',
  async ({ managerPage, data }) => {
    const client = await clientWithOldHistory(data);
    await data.registerPayment({ clientId: client.id, amount: PAY });
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);
    await profile.paymentsTab.click();

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: /^Хүчингүй/ }).first(),
      managerPage.getByRole('dialog').filter({ hasText: 'Төлбөр хүчингүй болгох' }),
      'Төлбөр хүчингүй болгох цонх');
    const reason = 'дүнг буруу бичсэн — 2026-08-30-ны падангаас';
    await modal.getByLabel(/Цуцлах шалтгаан/).fill(reason);

    await managerPage.keyboard.press('Escape');
    /* Цонх нь ХААГДАХГҮЙ: эхлээд асууна. */
    await expect(modal, 'Escape бичсэн шалтгааныг чимээгүй устгав').toBeVisible();
    await expect(modal.getByText('Хаавал оруулсан мэдээлэл устна. Хаах уу?'))
      .toBeVisible();
    await modal.getByRole('button', { name: 'Үргэлжлүүлэх' }).click();
    await expect(modal.getByLabel(/Цуцлах шалтгаан/), 'шалтгаан алга болжээ')
      .toHaveValue(reason);
  });
