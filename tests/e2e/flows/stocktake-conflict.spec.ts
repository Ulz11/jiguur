import { test, expect } from '../../fixtures';
import { expectReady } from '../../support/routes';

/**
 * ТООЛЛОГО ЦАГААР ҮРГЭЛЖИЛНЭ — ТЭР ХООРОНД АГУУЛАХ ХӨДӨЛНӨ.
 *
 * Отгоо/дарга агуулах тоолохдоо утсаа гартаа барин 20–30 минут явна. Тэр
 * хооронд өөр хүн ачилт баталгаажуулж болно. Урьд нь тооллого нь зөвхөн
 * «тоолсон тоо»-гоо илгээдэг байсан тул сервер хоорондох БҮХ хөдөлгөөнийг
 * ЧИМЭЭГҮЙ арчина: 450ш ачилт «дутсан бараа» болж алга болно.
 *
 * Одоо мөр бүр ХУУДАС ХАРУУЛСАН тоог (`system`) авч явна; зөрвөл сервер
 * ЮУ Ч бичихгүй, 409 буцаана — хагас хийгдсэн тооллого гэж байхгүй.
 */
test('үлдэгдэл өөрчлөгдсөн бол тооллого ХАДГАЛАГДАХГҮЙ — зурвас нь мөрөн дээрээ',
  async ({ managerPage, data }) => {
    const material = await data.createMaterial({ onHand: 40 });

    await managerPage.goto('/warehouse/stocktake');
    await expectReady(managerPage, 'Тооллого', '/warehouse/stocktake');
    await managerPage.getByLabel('Материал хайх').fill(material.name);

    const input = managerPage.getByLabel(new RegExp(`${material.name}.*тоолсон тоо`, 'i')).first();
    await expect(input, 'тоолох мөр олдсонгүй').toBeVisible();
    await input.fill('33');

    /* Тоолж байх зуур ӨӨР хүн агуулахыг хөдөлгөв */
    const moved = await data.api.post('/api/stock/adjust', {
      data: { material_id: material.id, grade_id: material.gradeId, on_hand: 51,
              note: 'зэрэгцээ ачилт' },
    });
    expect(moved.ok(), await moved.text()).toBeTruthy();

    await managerPage.getByRole('button', { name: '✓ Тооллого дуусгах' }).click();

    /* Серверийн ЯГ өгүүлбэр — ЯГ ТЭР мөрөн дээр (215 мөрийн дундаас хайхгүй) */
    const alert = managerPage.getByRole('alert')
      .filter({ hasText: 'үлдэгдэл өөрчлөгдсөн байна' }).first();
    await expect(alert, '409-ийн зурвас дэлгэц дээр гарсангүй').toBeVisible();
    await expect(alert).toContainText(material.name);
    await expect(alert).toContainText('(40 → 51)');
    await expect(alert, 'тооллого хадгалагдсан эсэх нь хэлэгдсэнгүй')
      .toContainText('ХАДГАЛАГДААГҮЙ');

    /* Тоолсон тоо нь БАЙРАНДАА — 30 минутын ажил алга болохгүй */
    await expect(input).toHaveValue('33');

    /* «Дахин ачаалах» нь системийн тоог шинэчилнэ, тоолсон нь үлдэнэ */
    await alert.getByRole('button', { name: 'Дахин ачаалах' }).click();
    await expect(managerPage.getByText('системд 51').first(),
                 'дахин ачаалсны дараа ч хуучин тоо зогсож байна').toBeVisible();
  });

test('амжилттай тооллого ҮР ДҮНГЭЭ дэлгэц дээр үлдээнэ', async ({ managerPage, data }) => {
  const material = await data.createMaterial({ onHand: 40 });

  await managerPage.goto('/warehouse/stocktake');
  await expectReady(managerPage, 'Тооллого', '/warehouse/stocktake');
  await managerPage.getByLabel('Материал хайх').fill(material.name);
  await managerPage.getByLabel(new RegExp(`${material.name}.*тоолсон тоо`, 'i')).first()
    .fill('33');

  await managerPage.getByRole('button', { name: '✓ Тооллого дуусгах' }).click();

  /* Урьд нь /warehouse руу ҮСРЭЭД 3.2 секундын toast харуулдаг байв —
     30 минутын ажлын ҮР ДҮН тэр хормын дотор өнгөрдөг. */
  const strip = managerPage.getByRole('status')
    .filter({ hasText: 'Тооллого хадгалагдлаа' }).first();
  await expect(strip, 'тооллогын үр дүн дэлгэц дээр үлдсэнгүй').toBeVisible();
  await expect(strip).toContainText('1 мөр залруулагдав');
  await expect(strip).toContainText('−7ш');
  await expect(managerPage.getByRole('link', { name: /Үйлдлийн бүртгэлээс энэ тооллогыг харах/ }),
               'бүртгэлийн мөр рүү холбоос алга').toBeVisible();
});

/**
 * ДООД ТУУЗ ЗҮҮН ТАЛЫН ЦЭСИЙГ ХУЧИХГҮЙ.
 *
 * Урьд нь `fixed bottom-0 left-0 right-0` байсан: тууз дэлгэцийн БҮХ өргөнийг
 * эзэлж, navy цэсийг доод талаас нь таслан хучина — «Агуулах» мөр, «Гарах»
 * товч 52px-ийн цагаан туузан доор үлдэнэ.
 */
test('тооллогын доод тууз цэсийг хучихгүй', async ({ managerPage, data }) => {
  const material = await data.createMaterial({ onHand: 40 });

  await managerPage.goto('/warehouse/stocktake');
  await expectReady(managerPage, 'Тооллого', '/warehouse/stocktake');
  await managerPage.getByLabel('Материал хайх').fill(material.name);
  await managerPage.getByLabel(new RegExp(`${material.name}.*тоолсон тоо`, 'i')).first()
    .fill('33');

  const bar = managerPage.locator('.stocktake-bar');
  await expect(bar, 'доод тууз гарч ирсэнгүй').toBeVisible();
  const sidebar = managerPage.getByRole('complementary', { name: 'Үндсэн навигаци' });
  const barBox = (await bar.boundingBox())!;
  const sideBox = await sidebar.boundingBox();

  /* Планшет дээр цэс нь DRAWER болж дэлгэцээс ГАДНА зогсдог (`x < 0`) —
     тэнд «тууз цэсийг хучив уу» гэсэн асуулт утгагүй. Баталгаа нь цэс
     ЖИНХЭНЭ байрандаа зогсож байгаа дэлгэц дээр л явна. */
  if (!sideBox || sideBox.width === 0 || sideBox.x < 0) return;

  expect(Math.round(barBox.x),
    `доод тууз цэсний дээгүүр ${Math.round(sideBox.x + sideBox.width - barBox.x)}px гарлаа`)
    .toBeGreaterThanOrEqual(Math.round(sideBox.x + sideBox.width) - 1);

  /* Цэсний хамгийн доод товч ҮНЭХЭЭР дарагдана — туузны ард үхээгүй */
  const logout = managerPage.getByRole('button', { name: 'Гарах' });
  await expect(logout).toBeVisible();
  expect(await logout.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top !== null && (top === el || el.contains(top));
  }), '«Гарах» товч тооллогын туузны ард үлдлээ').toBe(true);
});
