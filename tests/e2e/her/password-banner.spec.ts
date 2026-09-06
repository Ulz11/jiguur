import { test, expect } from '../../fixtures';
import { expectReady } from '../../support/routes';

/**
 * «АНХНЫ НУУЦ ҮГ ХЭВЭЭР» — ЦОНХ ХААХ нь НУУЦ ҮГ СОЛИХ БИШ.
 *
 * Гурван хүн бүгд «1234» нууц үгтэй байвал /audit-ийн «Хэн» багана утгагүй:
 * тэмдэглэл бүр дээр нэр бичигдэнэ ч тэр нэрийн ард хэн ч сууж болно. Тиймээс
 * сануулга нь ӨӨРӨӨ АРИЛДАГГҮЙ зурвас — toast биш.
 *
 * Гэвч бүрхүүл нь цонх ХААГДМАГЦ `clearMustChange()`-ыг дуудаж, түүнийг
 * `localStorage`-д ХАДГАЛДАГ байв. Цонх нь гурван замаар хаагддаг (Escape,
 * «Болих», гадна товшилт) — гурвуулаа нууц үгийг хөндөхгүй. Отгоо цонхыг
 * санамсаргүй нээгээд Escape дархад сануулга бүтэн сессийн турш чимээгүй
 * унтарна: «би нууц үгээ сольсон» гэсэн ХУДАЛ баримт үлдэнэ.
 */
test('Escape нь сануулгыг унтраахгүй — солиогүй бол зурвас байрандаа',
  async ({ managerPage }) => {
    await managerPage.goto('/');
    await expectReady(managerPage, 'Удирдлагын төв', 'Удирдлагын төв');

    const banner = managerPage.getByText('Нууц үгээ солино уу — анхны нууц үг хэвээр байна');
    await expect(banner, 'seed нууц үгтэй хүн дээр сануулга огт гарсангүй').toBeVisible();

    /* Зурвасын ӨӨРИЙНХ нь товчоор нээнэ — хажуугийн цэсний 🔑 нь планшет дээр
       хавтасны дотор байдаг тул энд зурвасын гар л зөв зам. */
    const strip = managerPage.locator('.jz-strip-danger');
    await strip.getByRole('button', { name: 'Нууц үг солих' }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Нууц үг солих' }),
                 'нууц үг солих цонх нээгдсэнгүй').toBeVisible();

    /* ЮУ Ч бичихгүй — зүгээр л буцна (маягт бохирдоогүй тул «хаах уу?»
       гэсэн хамгаалалт гарахгүй). */
    await managerPage.keyboard.press('Escape');
    await expect(dialog, 'Escape цонхыг хаасангүй').toHaveCount(0);

    await expect(banner,
      'Escape дарахад сануулга унтарлаа — нууц үг «1234» хэвээр атал дэлгэц ' +
      'түүнийг ХЭЛЭХЭЭ болив').toBeVisible();

    /* Хамгийн муу тал нь ХАДГАЛАГДДАГ байсан: хуудсыг дахин ачаалахад ч
       сануулга эргэж ирдэггүй. */
    await managerPage.reload();
    await expectReady(managerPage, 'Удирдлагын төв', 'F5-ийн дараа');
    await expect(banner,
      'сануулга дахин ачаалалтын дараа ч алга — «солив» гэсэн худал баримт ' +
      'хадгалагджээ').toBeVisible();
  });
