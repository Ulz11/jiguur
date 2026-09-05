import { test, expect } from '../../fixtures';
import { WarehousePage } from '../../pages/WarehousePage';
import { expectReady } from '../../support/routes';

/**
 * «144Ш ХААЧИВ?» — АГУУЛАХЫН ХАМГИЙН ҮНЭТЭЙ АСУУЛТ.
 *
 * Урьд нь «Тооллогын залруулга» цонх нь тоог дарж бичээд явдаг байв: хэн,
 * хэзээ, ЯАГААД гэдэг нь хаана ч үлддэггүй. Сар хагасын дараа тэр асуулт
 * гарахад бүртгэл нь хариулж чаддаггүй — тоо нь хөдөлсөн, шалтгаан нь алга.
 *
 * Одоо: шалтгаан ЗААВАЛ, баримт нь «34 → 7 · −27ш» гэж ХОЁР тоог хамт хэлж,
 * бичилт нь материалын түүхэн дээр мөр болж үлдэнэ (буцаах товчтойгоо).
 */
test('залруулга шалтгаангүй хадгалагдахгүй — баримт нь ХОЁР тоог хэлнэ',
  async ({ managerPage, data }) => {
    const material = await data.createMaterial({ onHand: 34 });

    const page = new WarehousePage(managerPage);
    await page.goto();
    await page.search.fill(material.name);

    /* Зэрэглэлийн үлдэгдэл нь дарагддаг — залруулгын цонх нээгдэнэ */
    await managerPage.getByRole('button', { name: new RegExp(`${material.name}.*тооллогын залруулга`, 'i') })
      .first().click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Тооллогын залруулга' })).toBeVisible();

    await dialog.getByLabel('Бодит тоолсон үлдэгдэл (ш)').fill('7');

    /* ШАЛТГААНГҮЙ бол хадгалж болохгүй — мөр нь хоосон үлдэх ёсгүй */
    const save = dialog.getByRole('button', { name: 'Хадгалах' });
    await expect(save, 'шалтгаангүй байхад хадгалах товч нээлттэй байна').toBeDisabled();

    await dialog.getByLabel('Шалтгаан (заавал)').fill('эвдэрсэн хэв актлав');
    await expect(save).toBeEnabled();
    await save.click();

    /* БАРИМТ: ганц тоо («одоо 7ш») нь өөрчлөлтийг хэлдэггүй */
    await expect(dialog.getByText('34 → 7 · −27ш'),
                 'баримт нь хоёр тоог хамт хэлсэнгүй').toBeVisible();
    await expect(dialog.getByText('Агуулахаас хасагдана')).toBeVisible();
    await expect(dialog.getByText('эвдэрсэн хэв актлав').first()).toBeVisible();

    await dialog.getByRole('button', { name: 'Баталгаажуулах' }).click();

    /* ҮР ДҮНГИЙН ЗУРВАС — toast нь 3.2 секундэд арилдаг, зурвас нь үлдэнэ */
    const strip = managerPage.getByRole('status')
      .filter({ hasText: 'Үлдэгдэл залруулагдлаа' }).first();
    await expect(strip, 'залруулгын дараа зурвас үлдсэнгүй').toBeVisible();
    await expect(strip).toContainText('34 → 7 · −27ш');
    await expect(strip).toContainText('эвдэрсэн хэв актлав');
  });

test('залруулга материалын ТҮҮХЭН дээр мөр болж үлдэж, буцаагдаж чадна',
  async ({ managerPage, data }) => {
    const material = await data.createMaterial({ onHand: 34 });
    const adj = await data.api.post('/api/stock/adjust', {
      data: { material_id: material.id, grade_id: material.gradeId,
              on_hand: 7, note: 'эвдэрсэн хэв актлав' },
    });
    expect(adj.ok(), await adj.text()).toBeTruthy();

    await managerPage.goto(`/warehouse/materials/${material.id}`);
    await expectReady(managerPage, new RegExp(material.name), 'материалын дэлгэрэнгүй');

    /* Мөр нь БҮТНЭЭР уншигдана: юу, хэдэн ширхэг, хэн, хэзээ, ЯАГААД */
    /* `source="adjust"` нь «Залруулга», `source="stocktake"` нь «Тооллого» —
       сервер (`serializers.adjustment_row`) хоёрыг ялгаж нэрлэдэг. */
    const line = managerPage.getByText(/Залруулга −27ш \(.*\) — эвдэрсэн хэв актлав/);
    await expect(line, 'залруулгын мөр хөдөлгөөний түүхэнд алга').toBeVisible();
    await expect(managerPage.getByText('34 → 7ш').first(),
                 'мөр нь ХЭДЭЭС ХЭД болсноо хэлсэнгүй').toBeVisible();

    /* Андуурсныг БУЦААХ зам — шалтгаангүйгээр хаагдахгүй */
    await managerPage.getByRole('button', { name: /хүчингүй болгох/ }).first().click();
    const dialog = managerPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Залруулгыг хүчингүй болгох' }))
      .toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Хүчингүй болгох' });
    await expect(confirm, 'шалтгаангүй байхад хүчингүй болгож болж байна').toBeDisabled();
    await dialog.getByLabel('Шалтгаан (заавал)').fill('буруу зэрэглэл дээр тоолсон');
    await confirm.click();

    /* Мөр нь ЖАГСААЛТААС ГАРАХГҮЙ — зөвхөн тооноос гарна (H1) */
    await expect(managerPage.getByText(/ХҮЧИНГҮЙ · буруу зэрэглэл дээр тоолсон/),
                 'хүчингүй болсон мөр тэмдэггүй үлдлээ').toBeVisible();
    await expect(managerPage.getByRole('status').filter({ hasText: 'Залруулга хүчингүй болов' }).first(),
                 'хүчингүй болголтын дараа зурвас алга').toBeVisible();
  });

/**
 * САНХҮҮЧИД АГУУЛАХЫН ТОО ЗҮГЭЭР Л ТОО.
 * Сервер `require_roles("manager", "factory")` — түүнд «Хүчингүй» товч
 * зурвал дараад 403 авна: холбоосгүй байх нь ХУДАЛ товчноос дээр.
 */
test('санхүүчид залруулга буцаах товч харагдахгүй', async ({ financePage, data }) => {
  const material = await data.createMaterial({ onHand: 20 });
  const adj = await data.api.post('/api/stock/adjust', {
    data: { material_id: material.id, grade_id: material.gradeId, on_hand: 15,
            note: 'тооллогын зөрүү' },
  });
  expect(adj.ok(), await adj.text()).toBeTruthy();

  await financePage.goto(`/warehouse/materials/${material.id}`);
  await expectReady(financePage, new RegExp(material.name), 'материалын дэлгэрэнгүй · санхүүч');
  await expect(financePage.getByText(/Залруулга −5ш/), 'мөр нь санхүүчид ч харагдана')
    .toBeVisible();
  await expect(financePage.getByRole('button', { name: /хүчингүй болгох/ }),
               'санхүүчид ХУДАЛ товч зурагдлаа').toHaveCount(0);
});
