import { test, expect } from '../../fixtures';
import { expectReady } from '../../support/routes';

/**
 * ТООНЫ СУУРЬ НЬ ТООНЫ ХАЖУУД.
 *
 * «Орлого 87 сая» гэж бичээд доор нь «дансанд 51 сая» гэсэн тоо зэрэгцэхэд
 * аль нь юу болохыг мэдэхгүй хүн ХОЁУЛАНД нь итгэхээ болино. Тайлангийн
 * түрээсийн орлого нь НЭХЭМЖИЛСЭН дүн (цуглуулсан мөнгө БИШ), цалин нь
 * ГАРТ ОЛГОСОН дүн — эдгээрийг сервер өөрөө нэрлэдэг (`basis_mn`).
 */
test.describe('тайлангийн суурь', () => {
  test('картууд ЮУНЫ тоо болохоо нэрлэнэ', async ({ managerPage }) => {
    await managerPage.goto('/reports');
    await expectReady(managerPage, 'Тайлан', '/reports');

    await expect(managerPage.getByText(/нэхэмжилсэн түрээс, хуучин үлдэгдэл ороогүй/),
                 'Нийт орлогын суурь нэрлэгдсэнгүй').toBeVisible();
    await expect(managerPage.getByText(/цалин нь гарт олгосон цалин/),
                 'Нийт зардлын цалингийн суурь нэрлэгдсэнгүй').toBeVisible();

    /* ХУУЧИН ҮЛДЭГДЭЛ — Отгоогийн хамгийн байнгын асуулт: «7-р сарын түрээс
       яагаад энд алга вэ?» Шилжүүлэлтээс өмнөх түрээс нь нэг дүн болж
       «хуучин үлдэгдэл» рүү ороод, АВЛАГАД л харагддаг. */
    await expect(
      managerPage.getByText('Шилжүүлэлтээс өмнөх түрээс нь хуучин үлдэгдэлд — энд ороогүй.'),
      'хуучин үлдэгдлийн тайлбар P&L дээр алга').toBeVisible();
  });

  test('мөнгөн урсгалын гарчиг ӨӨРИЙН цонхоо хэлнэ', async ({ managerPage }) => {
    await managerPage.goto('/reports');
    await expectReady(managerPage, 'Тайлан', '/reports');

    /* Хатуу «сүүлийн 6 сар» биш — ЯГ ямар өдрөөс ямар өдөр хүртэл */
    await expect(managerPage.getByRole('heading', { name: /^Мөнгөн урсгал — \d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/ }),
                 'мөнгөн урсгалын гарчиг цонхоо хэлсэнгүй').toBeVisible();

    /* Огноогоор шүүхэд гарчиг нь ДАГАНА — нэг хуудсан дээр хоёр хугацаа
       зэрэгцэхээ болино. */
    await managerPage.getByRole('button', { name: 'Огноогоор' }).click();
    await managerPage.getByLabel('Эхлэх огноо').fill('2026-07-01');
    await managerPage.getByLabel('Дуусах огноо').fill('2026-07-31');
    await expect(managerPage.getByRole('heading', { name: 'Мөнгөн урсгал — 2026-07-01 – 2026-07-31' }),
                 'муж өгсөн ч гарчиг хуучин цонхоо хэлсээр байна').toBeVisible();
  });

  test('ХАГАС бөглөсөн муж чимээгүй зогсохгүй — юу хүлээж байгаагаа хэлнэ',
    async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await expectReady(managerPage, 'Тайлан', '/reports');

      await managerPage.getByRole('button', { name: 'Огноогоор' }).click();
      await expect(managerPage.getByText(/Эхлэх ба дуусах огноогоо сонгоно уу/),
                   'хоосон муж дээр хуудас чимээгүй зогслоо').toBeVisible();

      await managerPage.getByLabel('Эхлэх огноо').fill('2026-07-01');
      await expect(managerPage.getByText(/Дуусах огноогоо сонгоно уу/),
                   'хагас бөглөсөн муж дээр хуудас чимээгүй зогслоо').toBeVisible();

      await managerPage.getByLabel('Дуусах огноо').fill('2026-07-31');
      await expect(managerPage.getByText(/огноогоо сонгоно уу/),
                   'муж бүрэн болсон ч сануулга үлдлээ').toHaveCount(0);
    });

  /**
   * Отгоо татсан файлаа «Downloads» дотроос НЭРЭЭР нь хайдаг: товч нь
   * «jiguur-tailan.xlsx» гэж амлаад сервер `tailan.xlsx` буулгавал тэр файл
   * алга болсонтой адил.
   */
  test('Excel товч ЖИНХЭНЭ файлын нэрээ хэлж, татсны дараа зурвас үлдээнэ',
    async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await expectReady(managerPage, 'Тайлан', '/reports');

      const btn = managerPage.getByRole('button', { name: /Excel татах \(tailan\.xlsx\)/ });
      await expect(btn, 'товч дээр файлын нэр алга').toBeVisible();

      const [download] = await Promise.all([
        managerPage.waitForEvent('download'),
        btn.click(),
      ]);
      expect(download.suggestedFilename(),
             'татагдсан файлын нэр товчны амлалттай зөрлөө').toBe('tailan.xlsx');

      await expect(managerPage.getByRole('status')
                     .filter({ hasText: 'Excel татагдлаа — tailan.xlsx' }).first(),
                   'татсны дараа үр дүнгийн зурвас үлдсэнгүй').toBeVisible();
    });
});
