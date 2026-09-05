import { test, expect } from '../fixtures';
import { clickToOpen } from '../support/interact';
import { expectReady } from '../support/routes';
import { readReceipt } from '../support/receipt';

/**
 * КАТАЛОГИЙН ЦОНХ — ГОЛ ТОВЧ НҮДНИЙ ӨМНӨ, ҮНЭ НЬ БАРИМТТАЙ.
 *
 * Хоёр зүйл эвдэрсэн байв:
 *   1. «Хадгалах» нь цонхны АГУУЛГЫН доор, гүйлтийн ДОТОР сууж байсан:
 *      зэрэглэл нэмэгдэх тусам үнийн хүснэгт ургаж, 768px дэлгэц дээр товч
 *      нь нүднээс 68px доор үлдэнэ. Отгоо ЦОНХ ДОТОР гүйлгэх гэсэн
 *      хөдөлгөөнгүй (`her/dialogs-fit.spec.ts`-ийн тайлбар) — ажил дуусахгүй.
 *   2. Тариф нь МӨНГӨ хөдөлгөдөг (шинэ гэрээний өдрийн дүн) атлаа
 *      баримтгүй: 110-ийг 1100 болгож бичсэн ч цонх «Хадгалагдлаа» гэдэг
 *      ганц үг хэлнэ. Систем дээрх бусад мөнгөн үйлдэл бүр ХАДГАЛАХЫН ӨМНӨ
 *      ХОЁР тоог зэрэгцүүлдэг (UI-ЗАРЧИМ §3).
 */
test.use({ viewport: { width: 1366, height: 768 } });

const VIEWPORT_H = 768;

test('материалын цонхны «Хадгалах» гүйлтийн ГАДНА зогсож, тарифын өөрчлөлт баримт болно',
  async ({ managerPage, data }) => {
    const m = await data.createMaterial({ baseRate: 110 });

    await managerPage.goto('/settings');
    await expectReady(managerPage, 'Тохиргоо', 'Тохиргоо');

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: `${m.name} материалыг засах` }),
      managerPage.getByRole('dialog').filter({ hasText: 'Материал засах' }),
      'Материал засах цонх');

    const save = modal.getByRole('button', { name: 'Хадгалах' });
    await expect(save, '«Хадгалах» товч алга').toBeVisible();

    /* 1. ТОВЧ НЬ ГҮЙЛТИЙН ХАЙРЦГААС ГАДНА. Энэ бол БҮТЦИЙН баталгаа:
          зэрэглэл хэдэн ч болсон (жинхэнэ дэвтэрт зургаа) товч нь агуулгатай
          хамт доошоо гүйж алга болох боломж ҮГҮЙ. */
    const insideScroller = await save.evaluate((el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (n.getAttribute('role') === 'dialog') return false;
        if (/auto|scroll/.test(getComputedStyle(n).overflowY)) return true;
      }
      return false;
    });
    expect(insideScroller,
      '«Хадгалах» нь цонхны гүйдэг хайрцаг ДОТОР сууж байна — агуулга ургамагц '
      + 'нүднээс алга болно').toBe(false);

    /* 2. Тэр товч ЯГ ОДОО ч дэлгэцэн дотор — гүйлгэлгүйгээр. */
    const box = (await save.boundingBox())!;
    expect(box.y, '«Хадгалах» дээшээ гарлаа').toBeGreaterThanOrEqual(0);
    expect(Math.round(box.y + box.height),
      `«Хадгалах» дэлгэцийн доод ирмэгээс ${Math.round(box.y + box.height - VIEWPORT_H)}px доор үлдлээ`)
      .toBeLessThanOrEqual(VIEWPORT_H);

    /* 3. ТАРИФ хөдлөхөд ХОЁР тоо зэрэгцэнэ. */
    await modal.getByLabel('Суурь тариф ₮/ш/хоног').fill('150');
    const receipt = await readReceipt(modal, 'материалын өөрчлөлт');
    expect(receipt.value('Тариф'),
      'тарифын өөрчлөлт ХОЁР тоогоор бичигдсэнгүй — ганц тоо өөрчлөлтийг хэлдэггүй')
      .toBe('110₮ → 150₮');

    /* 4. Баримт гарсны ДАРАА ч гол товч нүдний өмнө хэвээр. */
    const after = (await save.boundingBox())!;
    expect(Math.round(after.y + after.height),
      'баримт гарсны дараа «Хадгалах» нүднээс гарлаа').toBeLessThanOrEqual(VIEWPORT_H);

    /* 5. Хадгалахад тариф ҮНЭХЭЭР сууна — баримт худал хэлээгүй. */
    await save.click();
    await expect(modal, 'хадгалсны дараа цонх хаагдсангүй').toBeHidden();
    const row = managerPage.getByRole('row').filter({ hasText: m.name });
    await expect(row, 'каталогийн мөр дээр шинэ тариф суусангүй').toContainText('150₮');
  });
