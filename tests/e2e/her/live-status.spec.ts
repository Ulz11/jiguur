import { test, expect } from '../../fixtures';
import { expectReady } from '../../support/routes';

/**
 * ТОПБАРЫН ЦЭГ — «ЭНЭ ТОО ХЭР ШИНЭ ВЭ?»
 *
 * Урьд нь баруун дээд буланд НОГООН ЦЭГ 24 цаг зогсдог байв: түүний тайлбар
 * («Систем хэвийн ажиллаж байна») HTML-д ХАТУУ бичигдсэн. Сүлжээ тасарсан ч,
 * сервер унасан ч, дэлгэц дээрх тоо гурван цагийн өмнөх байсан ч ЯГ ТЭР
 * ногоон цэг ижилхэн гэрэлтэнэ — Отгоо хуучирсан тоог хараад хэнд залгахаа
 * шийдэж болно.
 */
test.describe('амьд заагч', () => {
  test('амжилттай ачаалсан хуудас СҮҮЛИЙН ЦАГАА хэлнэ', async ({ managerPage }) => {
    await managerPage.goto('/');
    await expectReady(managerPage, 'Удирдлагын төв', '/');

    const dot = managerPage.locator('.top-live');
    await expect(dot, 'топбарын заагч алга').toBeVisible();
    await expect(dot, 'заагч цагаа хэлсэнгүй — хуучин ногоон цэг хэвээр байна')
      .toContainText(/Шинэчилсэн: \d{2}:\d{2}/);

    /* Заагч нь ДАРАГДДАГ товч — 36px-ийн шатанд (гар чичирдэг хүн ондог). */
    const box = (await dot.boundingBox())!;
    expect(Math.round(box.height), 'заагч 36px-ийн шатанд хүрэхгүй байна')
      .toBeGreaterThanOrEqual(36);
    await expect(dot).toBeEnabled();
  });

  test('сервер хариулахаа больбол ШАР болж, гурав дараалахад УЛААН',
    async ({ managerPage }) => {
      await managerPage.goto('/');
      await expectReady(managerPage, 'Удирдлагын төв', '/');
      const dot = managerPage.locator('.top-live');
      await expect(dot).toContainText('Шинэчилсэн:');

      /* Уншилтын хүсэлтийг унагана — 500 нь «сервер өөрөө унасан». */
      await managerPage.route('**/api/**', (r) =>
        (r.request().method() === 'GET'
          ? r.fulfill({ status: 500, contentType: 'application/json',
                        body: JSON.stringify({ detail: 'Сервер завсарлаа' }) })
          : r.continue()));

      /* Заагч дээр дарах нь ДАХИН ОРОЛДОХ гэсэн үг. Гурван оролдлого →
         «Холболт тасарсан». */
      await dot.click();
      await expect(dot, 'нэг уналтын дараа заагч анхааруулсангүй')
        .toContainText(/Шинэчлэгдээгүй/);
      await dot.click();
      await dot.click();
      await expect(dot, 'гурван уналтын дараа ч «холболт тасарсан» гэж хэлсэнгүй')
        .toContainText('Холболт тасарсан');

      /* Сүлжээ эргэж ирвэл заагч өөрөө сэргэнэ — гараар дахин ачаалахгүй. */
      await managerPage.unroute('**/api/**');
      await dot.click();
      await expect(dot, 'сүлжээ сэргэсэн ч заагч улаанаараа хөлдлөө')
        .toContainText(/Шинэчилсэн: \d{2}:\d{2}/);
    });

  test('хуудас солиход заагч ШИНЭ хуудасны тухай ярина', async ({ managerPage }) => {
    await managerPage.goto('/');
    await expectReady(managerPage, 'Удирдлагын төв', '/');
    /* Планшет дээр цэс нь drawer-т нуугддаг тул хаягаар шилжинэ — энэ тестийн
       асуулт нь «цэс нээгдэх үү» биш, «заагч шинэ хуудсаа хэлэх үү». */
    await managerPage.goto('/contracts');
    await expectReady(managerPage, 'Гэрээнүүд', '/contracts');
    await expect(managerPage.locator('.top-live'))
      .toContainText(/Шинэчилсэн: \d{2}:\d{2}/);
  });
});
