import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { readReceipt } from '../../support/receipt';

/**
 * H4 / R12 — ЧӨЛӨӨТ АКТ: тэмдгийг ТОВЧ эзэмшинэ.
 *
 * Отгоо эгчийн «акт» бол эвдрэлийн хөлс биш, хоёр талын гарын үсэгтэй
 * ХЭЛЭЛЦЭЭР: тээвэр, цэвэрлэгээ, кран дуудлага нэг циклд эвхэгдэнэ, БАС
 * хөнгөлөлт байдаг («нийт актнаас 15% хасч тооцлоо»).
 *
 * Тэр Excel дээрээ ХАСАХ ТЭМДЭГ БИЧДЭГГҮЙ — «хасч тооцлоо» гэж ҮГЭЭР бичдэг.
 * Тиймээс маягт дээр Нэмэгдэл/Хөнгөлөлт гэсэн хоёр товч + ЭЕРЭГ дүн байх
 * ёстой; тэмдгийг сонголт тавина. Хэрэв хасах тэмдгийг ГАРААР бичүүлбэл нэг
 * мартсан тэмдэг хөнгөлөлтийг нэмэгдэл болгож, гарын үсэгтэй цаас зөрчигдөнө.
 */

const CHARGE = 450_000;
const DISCOUNT = 67_500;          // = 450,000 × 15% — түүний өөрийнх нь дүрэм

/** Актын цонхыг нээж, нэг бичилт хийнэ. Буцна: модал амласан ЦИКЛИЙН нэр. */
async function writeAkt(page: ContractDetailPage, opts: {
  kind: 'Нэмэгдэл (+)' | 'Хөнгөлөлт (−)'; amount: string; note: string;
}): Promise<{ cycle: string; signed: string }> {
  await page.newAktButton.click();
  const modal = page.dialog('Акт бичих');
  await modal.getByLabel('Дүн ₮').fill(opts.amount);
  await modal.getByRole('button', { name: opts.kind }).click();
  await modal.getByLabel(/Тэмдэглэл/).fill(opts.note);

  /* Цонх ХОЁР зүйлийг хадгалахаас ӨМНӨ хэлнэ: ямар тэмдэгтэй дүн орох,
     ба АЛЬ ЦИКЛД буух. Хоёулаа дараа нь тулгагдана. */
  const signed = (await modal.getByText(/^Циклд орох дүн:/).innerText())
    .replace('Циклд орох дүн:', '').trim();
  const landing = await modal.getByText(/циклд орно$/).innerText();
  const cycle = landing.replace('Энэ бичилт', '').replace('циклд орно', '').trim();

  await modal.getByRole('button', { name: 'Акт бичих', exact: true }).click();
  await expect(modal).toBeHidden();
  return { cycle, signed };
}

test('Хөнгөлөлт нь СӨРӨГ мөр болж, Σ-г бууруулна — тэмдгийг товч эзэмшинэ',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup();
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* ---- 1. Нэмэгдэл — тэр хасах тэмдэг бичсэн ч НЭМЭГДЭЛ хэвээр ---- */
    await page.newAktButton.click();
    const form = page.dialog('Акт бичих');
    await form.getByLabel('Дүн ₮').fill(`-${CHARGE}`);
    await expect(form.getByText(/^Циклд орох дүн:/),
      '«Нэмэгдэл» сонгосон атал гараар бичсэн хасах тэмдэг давав')
      .toContainText(`+${CHARGE.toLocaleString('en-US')}₮`);
    /* Тэмдэглэлгүйгээр хадгалах хаалга ХААЛТТАЙ (R12: «юуны төлөө» гэдэг нь
       гарын үсэгтэй мөрөндөө байх ёстой). */
    const submit = form.getByRole('button', { name: 'Акт бичих', exact: true });
    await expect(submit, 'тэмдэглэлгүй акт хадгалагдах гэж байна').toBeDisabled();
    await expect(submit).toHaveAttribute('title', 'Дүн ба тэмдэглэл заавал бөглөгдөнө');
    await form.getByLabel(/Тэмдэглэл/).fill('кран дуудлага');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(form).toBeHidden();

    const charged = page.aktRow('кран дуудлага');
    await expect(charged.getByRole('cell').nth(1))
      .toContainText(`+${CHARGE.toLocaleString('en-US')}₮`);
    expect(await page.aktSum(), 'нэмэгдлийн дараах Σ зөрж байна').toBe(CHARGE);

    /* ---- 2. Хөнгөлөлт — САНААТАЙ эерэг дүн, тэмдгийг ТОВЧ тавина ---- */
    const beforeSum = await page.aktSum();
    const { signed } = await writeAkt(page, {
      kind: 'Хөнгөлөлт (−)', amount: String(DISCOUNT),
      note: 'нийт актнаас 15% хасав',
    });
    expect(signed, 'хөнгөлөлт эерэг дүнгээр хадгалагдах гэж байна')
      .toBe(`−${DISCOUNT.toLocaleString('en-US')}₮`);

    const discount = page.aktRow('нийт актнаас 15% хасав');
    const amountCell = discount.getByRole('cell').nth(1);
    await expect(amountCell, 'хөнгөлөлт сөрөг тэмдэггүй зурагдлаа')
      .toContainText(`−${DISCOUNT.toLocaleString('en-US')}₮`);
    /* Өнгө дангаараа утга зөөхгүй — дэргэд нь ҮГ зогсоно. */
    await expect(amountCell, '«хөнгөлөлт» гэсэн үг мөрөн дээр алга')
      .toContainText('хөнгөлөлт');

    expect(await page.aktSum(), 'хөнгөлөлт Σ-г бууруулсангүй').toBe(beforeSum - DISCOUNT);

    /* ---- 3. Σ нь ҮНЭХЭЭР нэхэмжлэгдэх дүн болов уу ---- */
    const preview = await data.closePreview(contract.id);
    expect(preview.final_invoices.length, 'эцсийн циклийн тооцоо гарсангүй').toBeGreaterThan(0);
    expect(preview.final_invoices[0].charge_amount,
      'актын Σ нэхэмжлэлийн засвар/актын дүнд тусаагүй').toBe(CHARGE - DISCOUNT);
  });

test('акт нь модалын АМЛАСАН циклд буудаг', async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup();
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    const { cycle } = await writeAkt(page, {
      kind: 'Нэмэгдэл (+)', amount: '120000', note: 'тээвэр',
    });
    expect(cycle, 'модал буух циклээ нэрлэсэнгүй').toMatch(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/);

    /* Жагсаалтын «Цикл» багана нь СЕРВЕРИЙН цонх — модалын амласантай ижил
       байх ёстой (модал нь `lib/akt.aktCycle`, сервер нь `billing.cycle_of`). */
    await expect(page.aktRow('тээвэр').getByRole('cell').nth(3),
      'акт модалын хэлсэн циклээс ӨӨР циклд буулаа').toHaveText(cycle);
  });

test('Σ нь ХҮЧИНТЭЙ бичилтүүдийн нийлбэр — хүчингүй нь орохгүй',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup();
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    await writeAkt(page, { kind: 'Нэмэгдэл (+)', amount: String(CHARGE), note: 'цэвэрлэгээ' });
    await writeAkt(page, { kind: 'Хөнгөлөлт (−)', amount: String(DISCOUNT), note: 'тохирсон хөнгөлөлт' });
    /* Цонх хаагдсаны дараа хуудас СЕРВЕРЭЭС дахин уншина — Σ-г тэр
       шинэчлэлтийг ХҮЛЭЭЖ уншина (тогтмол хугацаа биш, жинхэнэ нөхцөл). */
    await expect.poll(() => page.aktSum(), { message: 'хоёр бичилтийн Σ буруу' })
      .toBe(CHARGE - DISCOUNT);
    await expect(page.aktCard().locator('tfoot'), 'хүчингүй мөргүй үед тайлбар нь өөр байх ёстой')
      .toContainText('нэмэгдэл ба хөнгөлөлтийн нийлбэр');

    /* ---- Хүчингүй болгох: мөр нь ҮЛДЭЖ, Σ-ээс ГАРНА ---- */
    const row = page.aktRow('тохирсон хөнгөлөлт');
    await row.getByRole('button', { name: /^Хүчингүй болгох/ }).click();
    const modal = page.dialog('Актын бичилт хүчингүй болгох');
    const confirm = modal.getByRole('button', { name: 'Хүчингүй болгох', exact: true });
    await expect(confirm, 'шалтгаангүйгээр акт цуцлагдаж байна').toBeDisabled();

    const promise = await readReceipt(modal, 'акт цуцлах баримт');
    /* Хөнгөлөлт гарахад цикл ӨСНӨ — баримт тэр чиглэлийг ЗӨВ хэлэх ёстой. */
    expect(promise.totalMoney(), 'хөнгөлөлт хасахад циклийн дүн буурах гэж байна')
      .toBe(DISCOUNT);

    const reason = 'давхар бичсэн';
    await modal.getByLabel(/Цуцлах шалтгаан/).fill(reason);
    await confirm.click();
    await expect(modal).toBeHidden();

    await expect(row, 'цуцалсан актын мөр устчихлаа — устгал биш байх ёстой').toBeVisible();
    await expect(row.getByText('ХҮЧИНГҮЙ')).toBeVisible();
    await expect(row, 'цуцлалтын шалтгаан мөрөн дээрээ алга').toContainText(`Шалтгаан: ${reason}`);
    expect(await page.aktSum(), 'хүчингүй бичилт Σ-д тоологдсоор байна').toBe(CHARGE);
    await expect(page.aktCard().locator('tfoot'))
      .toContainText('хүчинтэй бичилтүүдийн нийлбэр (хүчингүй нь орсонгүй)');

    /* Нэхэмжлэгдэх дүн ч мөн адил — Σ ба тооцоо ХОЁР ӨӨР тоо байж болохгүй. */
    const preview = await data.closePreview(contract.id);
    expect(preview.final_invoices[0].charge_amount,
      'хүчингүй акт нэхэмжлэлд үлдсэн байна').toBe(CHARGE);
  });
