import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen, clickToExpand } from '../../support/interact';

/**
 * ХУУДСЫН ЗАХАД БИЧСЭН ЗҮЙЛС — Отгоо эгчийн дэвтрийн гурав дахь давхарга.
 *
 * Түүний Excel дээр тоонууд нь нүднүүдэд сууна; ШИЙДВЭР нь харин тэдгээрийн
 * ЗАХАД, өнгөнд, гарын үсгийн блокт амьдардаг:
 *
 *  1. ЗАХЫН ТЭМДЭГЛЭЛ + ШАР ТУГ (№111, 112). `'7.06нд тооцов'`, `'нөат
 *     шивсэн'`, `'ирээгүй'`, `'хаав'` — эдгээр нь ДАРААГИЙН үйлдлийн заавар.
 *     Шар дүүргэлт (`FFFFFF00`) = «энэ рүү эргэж хар».
 *  2. ХОЛБОО БАРИХ ХҮМҮҮС (№72, 73). Бутангууд: Төслийн менежер Н.Батцоож
 *     96590908 · Нярав Н.Соль 99966285 · Захирал С.Лхагвасүрэн 99113579 —
 *     ГУРАВ. Тэр НЯРАВ руу залгадаг, захирал руу биш.
 *  3. ТАЛБАЙ (№88, 97). Блүүмийн 4,294ш = 2,044 технологи + 326 архангай +
 *     1,924 дарь эх — НЭГ гэрээ, ГУРВАН талбай. Буцаалт талбайгаараа тоологдоно.
 *
 * ХЭМЖҮҮР: бичсэн зүйл нь ӨӨР ДЭЛГЭЦЭН ДЭЭР гарч ирэх ёстой. Тэмдэглэл нь
 * гэрээн дээр үлдээд дашбоард дээр гарахгүй бол шар нүд алга болсонтой ижил.
 */

// ---------- 1. Захын тэмдэглэл: гэрээн дээр бичээд ДАШБОАРД дээр ----------

test('⚑ тэмдэглэсэн мөр ДАШБОАРДЫН «Анхаарах» самбар дээр гарч, ГЭРЭЭ рүүгээ буулгана',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 40, qty: 30 });
    /* Дашбоардын «Анхаарах» самбар нь СИСТЕМ ДАЯАРХ: зэрэгцээ гүйж буй
       дөрвөн проект тус бүр өөрийн тэмдэглэлээ тавьдаг тул текст нь
       ДАВТАГДАШГҮЙ байх ёстой (эс бөгөөс мөр нь нөгөөгийнхтэй солигдоно). */
    const mark = `7.06нд тооцов · ${contract.no}`;
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* Гэрээний «Тэмдэглэл» зурвас — гэрийн задаргааны хэлбэрээр. */
    const strip = managerPage.getByRole('button', { name: /^Тэмдэглэл/ }).first();
    await clickToExpand(strip, 'Гэрээний «Тэмдэглэл» зурвас');

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Тэмдэглэл' }).first(),
      page.dialog('Тэмдэглэл нэмэх'), 'Тэмдэглэл нэмэх цонх');
    await modal.getByLabel(/^Тэмдэглэл/).fill(mark);
    /* ШАР НҮД — «энэ рүү эргэж хар». Тэмдэглэсэн мөр дашбоард дээр гарна. */
    await modal.getByRole('button', { name: 'Анхаарах ⚑' }).click();
    await modal.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(modal, 'тэмдэглэлийн цонх хаагдсангүй').toBeHidden();

    /* Мөр нь гэрээн дээрээ, ТУГТАЙГАА. `exact` — мөрийн товчнууд нэрэндээ
       тэмдэглэлийн текстийг авч явдаг (уншигчид ЮУГ тэмдэглэж байгааг хэлнэ). */
    await expect(managerPage.getByText(mark, { exact: true })).toBeVisible();

    /* …БАС дашбоард дээр. Энэ бол тестийн гол хэмжүүр: түүний шар нүд
       хуудсан дээрээ үлдэхгүй, НЭГ дэлгэц дээр цуглана. */
    await managerPage.goto('/');
    await expect(managerPage.getByRole('heading', { name: 'Анхаарах' })).toBeVisible();
    const row = managerPage.getByText(mark, { exact: true });
    await expect(row, 'дашбоардын «Анхаарах» самбар дээр тэмдэглэл алга').toBeVisible();

    /* Холбоос нь ЯГ тэр гэрээ рүүгээ (`flaggedHref`). */
    await row.click();
    await managerPage.waitForURL(new RegExp(`/contracts/${contract.id}$`));
    await expect(page.title).toBeVisible();
  });

test('ХҮЧИНГҮЙ болсон тэмдэглэл мөрөндөө үлдэж, «Анхаарах»-аас гарна',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 40, qty: 30 });
    /* Самбар нь систем даяарх тул текст нь энэ тестийнх гэдгээ хэлнэ. */
    const mark = `ирээгүй · ${contract.no}`;
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    await clickToExpand(managerPage.getByRole('button', { name: /^Тэмдэглэл/ }).first(),
      'Гэрээний «Тэмдэглэл» зурвас');
    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Тэмдэглэл' }).first(),
      page.dialog('Тэмдэглэл нэмэх'), 'Тэмдэглэл нэмэх цонх');
    await modal.getByLabel(/^Тэмдэглэл/).fill(mark);
    await modal.getByRole('button', { name: 'Анхаарах ⚑' }).click();
    await modal.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(modal).toBeHidden();

    /* Цуцлах товчийг ЭНЭ МӨРНӨӨС нь дарна — хуудсан дээр өөр «Хүчингүй»
       товчнууд (хөдөлгөөн, барьцаа) байж болно. */
    const row = managerPage.getByText(mark, { exact: true }).locator('xpath=ancestor::li[1]');
    const voidModal = await clickToOpen(
      row.getByRole('button', { name: /^Хүчингүй/ }),
      page.dialog('Тэмдэглэл хүчингүй болгох'), 'Тэмдэглэл цуцлах цонх');
    await voidModal.getByLabel(/Цуцлах шалтгаан/).fill('өөр гэрээнийх байсан');
    await voidModal.getByRole('button', { name: 'Хүчингүй болгох' }).click();
    await expect(voidModal).toBeHidden();

    /* Мөр УСТАХГҮЙ — «ХҮЧИНГҮЙ» тэмдэг ба ШАЛТГААНТАЙГАА үлдэнэ (H1). */
    await expect(row).toContainText('ХҮЧИНГҮЙ');
    await expect(row).toContainText('өөр гэрээнийх байсан');

    /* …гэвч дашбоардын самбар дээр АЛГА: унтарсан туг «анхаар» гэж хэлэхгүй. */
    await managerPage.goto('/');
    await expect(managerPage.getByRole('heading', { name: 'Анхаарах' })).toBeVisible();
    await expect(managerPage.getByText(mark, { exact: true })).toBeHidden();
  });
