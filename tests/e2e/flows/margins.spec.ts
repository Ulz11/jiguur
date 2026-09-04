import { test, expect } from '../../fixtures';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
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

// ---------- 2. Холбоо барих: тэр ЗАХИРАЛ руу залгадаггүй ----------

test('гурван гарын үсэгтэн ХАРИЛЦАГЧИЙН хуудсан дээр, НЯРАВ нь залгах жагсаалтад',
  async ({ managerPage, data }) => {
    /* `startDaysAgo: 60` — эхний цикл хэтэрсэн тул харилцагч «Авлага
       цуглуулах» жагсаалтад заавал орно (тэнд л ☎ холбоос амьдардаг).
       ⚠ Хэмжээ нь `her/one-number.spec.ts`-ийнхтэй ЯГ ижил (60 хоног × 20ш):
       нийт нь 1 саяас доогуур үлдэх тул тэр хуудсан дээрх толгой ба
       «үүнээс нэхэмжлэгдээгүй» дэд мөр НЭГ хэмжүүрээр бичигдэнэ. */
    const { client } = await data.rentSetup({ startDaysAgo: 60, qty: 20 });
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    /* Бутангуудын гарын үсгийн блок — ГУРАВ. Утас нь ДАВТАГДАШГҮЙ: зэрэгцээ
       гүйж буй проектууд нэг backend дээр бичдэг. */
    const tail = String(client.id).padStart(4, '0');
    const people: [string, string, string][] = [
      ['Н.Батцоож', 'Төслийн менежер', `9659${tail}`],
      ['Н.Соль', 'Нярав', `9996${tail}`],
      ['С.Лхагвасүрэн', 'Захирал', `9911${tail}`],
    ];
    for (const [name, role, phone] of people) {
      const modal = await clickToOpen(
        managerPage.getByRole('button', { name: '+ Хүн нэмэх' }),
        profile.page.getByRole('dialog', { name: 'Холбоо барих хүн нэмэх' }),
        'Хүн нэмэх цонх');
      await modal.getByLabel(/^Нэр/).fill(name);
      await modal.getByLabel('Албан тушаал').fill(role);
      await modal.getByLabel('Утас', { exact: true }).fill(phone);
      await modal.getByRole('button', { name: 'Хадгалах' }).click();
      await expect(modal, `«${name}» цонх хаагдсангүй`).toBeHidden();
    }

    /* Гурав нь ГУРАВ хэвээр, дугаар бүр ДАРАГДАНА (`tel:`). */
    const card = managerPage.getByRole('heading', { name: 'Холбоо барих' })
      .locator('xpath=ancestor::div[contains(@class,"card")][1]');
    for (const [, , phone] of people) {
      await expect(card.getByRole('link', { name: `☎ ${phone}` }))
        .toHaveAttribute('href', `tel:${phone}`);
    }

    /* ЗАЛГАХ ЖАГСААЛТ нь НЯРАВЫГ мэднэ — захирлын дугаар БИШ. */
    await managerPage.goto('/collections');
    await expect(managerPage.getByRole('heading', { level: 1, name: 'Авлага цуглуулах' }))
      .toBeVisible();
    const row = managerPage.getByRole('row').filter({
      has: managerPage.getByRole('link', { name: client.name, exact: true }),
    });
    await expect(row, `«${client.name}» авлага цуглуулах жагсаалтад алга`).toBeVisible();
    await expect(row).toContainText('Н.Соль');
    await expect(row.getByRole('link', { name: `☎ ${people[1][2]}` }))
      .toHaveAttribute('href', `tel:${people[1][2]}`);
    await expect(row.getByRole('link', { name: `☎ ${people[2][2]}` })).toHaveCount(0);
  });
