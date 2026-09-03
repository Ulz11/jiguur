import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { daysBetween } from '../../support/dates';
import { clickToOpen } from '../../support/interact';
import { readReceipt } from '../../support/receipt';

/**
 * H2 / R25 — АЛДАНГИ бол ХӨШҮҮРЭГ, автомат төлбөр БИШ.
 *
 * Отгоо эгч 20 жилийн Excel-дээ алданги ГАНЦ ч удаа тооцоогүй: хуудас бүр
 * дээр «гэрээний 4.2-т зааснаар алданга тооцно» гэж ЗАРЛАГДСАН боловч хэзээ ч
 * нэхэгдээгүй — тэр бол утсаар ярихад хэрэглэдэг хөшүүрэг.
 *
 * Систем нь урьд нь ТӨЛБӨР БҮРТГЭХ агшинд өөрөө номжиж байсан: өршөөсөн
 * харилцагчийнх нь өр төлбөр бүртгэмэгц ӨСДӨГ. Тэр нь энэ файлын НЭГДҮГЭЭР
 * тест — бүх suite-ийн хамгийн чухал регресс.
 *
 * Үлдсэн гурав нь хөшүүргийг БҮТНЭЭР болгоно: харагдана (нэхэгдээгүй),
 * татагдана (нэхэх), СУЛАРНА (нэхэлтийг хүчингүй болгох — H1-ийн тэгш хэм).
 */

const PERCENT = 0.5;

test('ТӨЛБӨР БҮРТГЭХЭД АЛДАНГИ ЮУ Ч НОМЖИХГҮЙ — хуучин системийн гол регресс',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ penaltyPercent: PERCENT });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* Эхлэлийн байдал: НЭХЭГДСЭН алданги гэж байхгүй, зөвхөн ТООЦООЛОЛ. */
    expect(await page.hasMetric('Нэхэгдсэн алданги'),
      'нэхэгдээгүй байхад «Нэхэгдсэн алданги» гарчихлаа').toBe(false);
    const estimate = await page.metricMoney('Алдангийн тооцоолол');
    expect(estimate, 'хугацаа хэтэрсэн нэхэмжлэл дээр тооцоолол гарсангүй').toBeGreaterThan(0);

    const lines = await page.invoiceLines();
    const oldest = lines[lines.length - 1];
    const amount = Math.floor(oldest.outstanding / 2 / 1000) * 1000;

    const payModal = await clickToOpen(page.payButton, page.dialog('Төлбөр бүртгэх'),
                                       'Төлбөр бүртгэх цонх');
    await payModal.getByLabel('Дүн ₮').fill(String(amount));
    /* Хадгалахаас ӨМНӨ цонх өөрөө хэлнэ: энэ төлбөр алдангийг ХӨНДӨХГҮЙ. */
    await expect(payModal, 'төлбөрийн цонх алдангийн байдлыг хэлэхгүй байна')
      .toContainText('нэхэгдээгүй');
    await expect(payModal).toContainText('Энэ төлбөр түүнийг хөндөхгүй');
    await payModal.getByRole('button', { name: 'Бүртгэх', exact: true }).click();
    await expect(payModal).toBeHidden();

    /* ---- ГОЛ БАТАЛГАА: төлбөр орсон ч НЭХЭЛТ ҮҮСЭЭГҮЙ ---- */
    const after = await data.detail(contract.id);
    expect(after.penalty_booked, 'төлбөр бүртгэхэд алданги ӨӨРӨӨ номжигдлоо (H2 регресс)')
      .toBe(0);
    expect(after.penalty_charges, 'төлбөрөөс болж алдангийн НЭХЭЛТ үүсчихлээ').toEqual([]);
    for (const inv of after.invoices) {
      expect(inv.penalty_due, `${inv.no}: нэхэгдсэн алданги өөрөө үүслээ`).toBe(0);
    }
    expect(await page.hasMetric('Нэхэгдсэн алданги'),
      'төлбөрийн дараа «Нэхэгдсэн алданги» гарч ирлээ').toBe(false);
    /* Хөшүүрэг нь хэвээр — зөвхөн суурь нь буурсан тул тооцоолол бага болно.
       (Цонх хаагдмагц хуудас дахин уншигддаг тул шинэ тоог ХҮЛЭЭНЭ.) */
    await expect.poll(() => page.metricMoney('Алдангийн тооцоолол'),
      { message: 'төлбөрийн дараа алдангийн тооцоолол буугаагүй' })
      .toBeLessThan(estimate);
  });

test('нэхэгдээгүй тоо нь «нэхэгдээгүй» шошготой, нэхэгдсэнээсээ ӨӨР харагдана',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ penaltyPercent: PERCENT });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* 10 хоногийн өмнөх өдрөөр нэхнэ — тэгвэл ХОЁУЛАА зэрэг зогсоно:
       нэхэгдсэн (мөнгө) ба нэхэгдээгүй (тооцоолол). Отгоо хэдийг өршөөж
       байгаагаа ЯГ ЭНЭ дэлгэцээс уншина. */
    const asOf = data.isoDaysAgo(10);
    const modal = await clickToOpen(page.chargePenaltyButton, page.dialog('Алданги нэхэх'),
                                    'Алданги нэхэх цонх');
    await modal.getByLabel('Ямар өдрөөр нэхэх вэ').fill(asOf);
    const receipt = await readReceipt(modal, 'алданги нэхэх баримт');
    await modal.getByRole('button', { name: 'Алданги нэхэх', exact: true }).click();
    await expect(modal).toBeHidden();
    await page.reload(contract.id);

    const booked = page.metricValueBox('Нэхэгдсэн алданги');
    const unbooked = page.metricValueBox('Алдангийн тооцоолол');
    await expect(booked, 'нэхсэн дараа «Нэхэгдсэн алданги» гарсангүй').toBeVisible();
    await expect(unbooked, 'нэхээгүй үлдсэн хоногийн тооцоолол алга болжээ').toBeVisible();

    /* 1. ҮГЭЭР ялгарна — өнгө дангаараа утга зөөхгүй (UI-ЗАРЧИМ §4). */
    await expect(page.metric('Алдангийн тооцоолол')).toContainText('нэхэгдээгүй');
    await expect(page.metric('Нэхэгдсэн алданги')).not.toContainText('нэхэгдээгүй');
    /* 2. «≈» нь БАРИМТ БИШ гэдгийн тэмдэг — зөвхөн тооцоололд. */
    expect((await unbooked.innerText()).trim().startsWith('≈'),
      'тооцооллын тоо ≈ угтваргүй — баримт мэт уншигдана').toBe(true);
    expect((await booked.innerText()).trim().startsWith('≈'),
      'нэхэгдсэн ӨР ≈ угтвартай — тооцоолол мэт уншигдана').toBe(false);
    /* 3. ӨНГӨ нь ч зөрнө: нэхэгдсэн нь улаан (өр), тооцоолол нь бүдэг. */
    const colorOf = (l: typeof booked) => l.evaluate((el) => getComputedStyle(el).color);
    expect(await colorOf(booked), 'нэхэгдсэн ба нэхэгдээгүй нэг өнгөөр зурагджээ')
      .not.toBe(await colorOf(unbooked));

    /* 4. БАРИМТ ХУДАЛ ХЭЛЭХГҮЙ: цонхны нийлбэр = номжигдсон дүн. */
    expect(await page.metricMoney('Нэхэгдсэн алданги'),
      'нэхэх цонхны амласан дүн ба номжигдсон дүн зөрж байна').toBe(receipt.totalMoney());
  });

test('«Алданги нэхэх» — баримтын мөр бүр нэхэмжлэлээ, хоногоо нэрлэж, дүн нь таарна',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ penaltyPercent: PERCENT });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* Ямар өдрөөр нэхэхээ ӨӨРӨӨ сонгоно (10 хоногийн өмнөх). Тэр өдрөөр ЯМАР
       нэхэмжлэл нэхэгдэхийг тест СЕРВЕРИЙН дата дээр өөрөө бодно — цонхны
       мөрүүд түүнтэй таарах ёстой. */
    const asOf = data.isoDaysAgo(10);
    const invoices = (await data.detail(contract.id)).invoices;
    const chargeable = invoices
      .filter((i: any) => i.outstanding > 0 && i.due_date < asOf)
      .sort((a: any, b: any) => (a.due_date < b.due_date ? -1 : 1));
    expect(chargeable.length, 'нэхэх боломжтой хугацаа хэтэрсэн нэхэмжлэл алга').toBe(1);
    const target = chargeable[0];
    const days = daysBetween(target.penalty_since, asOf);
    expect(days, 'нэхэх хоног гарсангүй').toBeGreaterThan(0);

    const modal = await clickToOpen(page.chargePenaltyButton, page.dialog('Алданги нэхэх'),
                                    'Алданги нэхэх цонх');
    await modal.getByLabel('Ямар өдрөөр нэхэх вэ').fill(asOf);
    const receipt = await readReceipt(modal, 'алданги нэхэх баримт');

    /* ЗӨВХӨН хугацаа нь хэтэрсэн нэхэмжлэл дээр, ЯГ тэр хоногоор. */
    const rows = receipt.lines.filter((l) => !l.total);
    expect(rows.length, `нэхэгдэх мөрүүд: ${receipt.labels().join(' | ')}`).toBe(1);
    expect(rows[0].label, 'мөр нь хэдэн хоногийн алданги болохоо хэлэхгүй байна')
      .toContain(`${days} хоног`);
    expect(rows[0].sub, 'мөр нь аль нэхэмжлэлийнх болохоо хэлэхгүй байна')
      .toBe(`№${target.no}`);
    /* 0.5%/хоног × N хоног × үлдэгдэл — Отгоо энэ үржвэрийг өөрөө шалгана. */
    const expected = Math.round(target.outstanding * PERCENT / 100 * days);
    expect(receipt.money(rows[0].label), 'мөрийн алдангийн үржвэр зөрж байна').toBe(expected);
    expect(receipt.totalMoney()).toBe(expected);

    await modal.getByRole('button', { name: 'Алданги нэхэх', exact: true }).click();
    await expect(modal).toBeHidden();
    await page.reload(contract.id);

    /* Амласан дүн ба гарсан дүн — гурван дэлгэц дээр НЭГ тоо. */
    expect(await page.metricMoney('Нэхэгдсэн алданги')).toBe(expected);
    const charge = page.penaltyChargeRow(asOf);
    await expect(charge, 'нэхэлт нь ЯВДАЛ болж мөрөндөө үлдэх ёстой').toBeVisible();
    await expect(charge).toContainText(expected.toLocaleString('en-US'));
    const after = await data.detail(contract.id);
    expect(after.penalty_booked, 'серверийн номжсон дүн баримттай зөрж байна').toBe(expected);
    const inv = after.invoices.find((i: any) => i.no === target.no);
    expect(inv.penalty_due, 'нэхэмжлэл дээрх нэхэгдсэн алданги зөрж байна').toBe(expected);
  });

test('нэхсэн алдангийг ХҮЧИНГҮЙ болгоход номжигдсон дүн хуучин утга руугаа буцна',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ penaltyPercent: PERCENT });
    const asOf = data.isoDaysAgo(10);
    const charged = await data.bookPenalty(contract.id, asOf);
    expect(charged.total, 'алданги нэхэгдсэнгүй').toBeGreaterThan(0);

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    expect(await page.metricMoney('Нэхэгдсэн алданги')).toBe(Math.round(charged.total));
    const invoicesBefore = await page.invoiceLines();

    const modal = await clickToOpen(
      page.penaltyChargeRow(asOf).getByRole('button', { name: /^Хүчингүй болгох/ }),
      page.dialog('Алдангийн нэхэлт хүчингүй болгох'), 'алдангийн нэхэлт цуцлах цонх');
    const confirm = modal.getByRole('button', { name: 'Хүчингүй болгох', exact: true });
    await expect(confirm, 'шалтгаангүйгээр нэхэлт цуцлагдаж байна').toBeDisabled();

    const promise = await readReceipt(modal, 'нэхэлт цуцлах баримт');
    expect(promise.money(`${asOf} өдрийн нэхэлт`), 'тооцооноос гарах дүн зөрж байна')
      .toBe(-Math.round(charged.total));
    expect(promise.totalMoney(), 'үлдэх нэхэлтийн нийлбэр 0 байх ёстой').toBe(0);

    const reason = 'утсаар ярьж өршөөв';
    await modal.getByLabel(/Цуцлах шалтгаан/).fill(reason);
    await confirm.click();

    /* Цуцлалт нь ХАСАЛТ БИШ, ДАХИН ДЕРИВАЦИ — сервер нэхэмжлэлүүдээ дахин
       тоглуулна. Тиймээс хоёр дахь цонх зөрүүг ХАРУУЛЖ байж л бичнэ. */
    const rebuild = page.dialog('Тооцоо дахин бодогдоно');
    await expect(rebuild, 'дахин бодолтын зөрүү харуулалгүй шууд бичив').toBeVisible();
    const diff = await readReceipt(rebuild, 'дахин бодолтын зөрүү');
    expect(diff.lines.filter((l) => !l.total).length,
      'зөрүүний мөр гарсангүй').toBeGreaterThan(0);
    const promisedTotal = diff.totalMoney();      // «хуучин → ШИНЭ» — сүүлийн тоо
    await rebuild.getByRole('button', { name: 'Баталгаажуулж дахин бодох' }).click();
    await expect(rebuild).toBeHidden();
    await page.reload(contract.id);

    /* ---- Хөшүүрэг СУЛАРЛАА ---- */
    expect(await page.hasMetric('Нэхэгдсэн алданги'),
      'цуцалсан хойно ч нэхэгдсэн алданги үлджээ').toBe(false);
    const after = await data.detail(contract.id);
    expect(after.penalty_booked, 'номжигдсон алданги 0 руугаа буцаагүй').toBe(0);
    /* Мөр нь ҮЛДЭНЭ — хэдийг өршөөснөө тэр эндээс уншина (H1). */
    const row = page.penaltyChargeRow(asOf);
    await expect(row.getByText('ХҮЧИНГҮЙ')).toBeVisible();
    await expect(row.locator('xpath=..')).toContainText(`Шалтгаан: ${reason}`);
    /* Дахин бодолт нэхэмжлэлийн ДҮНГ хөдөлгөх ёсгүй — алданги нь дүнгийн
       ГАДНА байдаг (H2). Цонхны амласан «шинэ нийт» нь үнэн байв уу? */
    const invoicesAfter = await page.invoiceLines();
    const sum = (rows: { total: number }[]) => rows.reduce((s, r) => s + r.total, 0);
    expect(sum(invoicesAfter), 'дахин бодолт амласнаасаа өөр дүн үлдээв').toBe(promisedTotal);
    expect(sum(invoicesAfter), 'алдангийн цуцлалт нэхэмжлэлийн дүнг хөдөлгөв')
      .toBe(sum(invoicesBefore));
  });
