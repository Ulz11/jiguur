import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen } from '../../support/interact';
import { readReceipt } from '../../support/receipt';

/**
 * H7 — ХААЛТЫН ЁСЛОЛ: тоолуур ҮНЭХЭЭР зогсоно.
 *
 * «Хэлцэл хаахад тоолуур зогсдоггүй» байв: end_date ч, closed ч accrual-ыг
 * зогсоодоггүй, эцсийн тасархай цикл ХЭЗЭЭ Ч нэхэмжлэл болдоггүй, ёслолыг
 * чиглүүлэх юу ч байхгүй — ганц улаан товч.
 *
 * Отгоо эгчийн жинхэнэ дараалал: гадаа үлдсэнээ шийд → эцсийн хагас циклээ
 * нэх → барьцаагаа цэвэрлэ → «хаав» гэж бич. Гадаа үлдсэнийг шийдэх нь
 * ГУРВАН гарцтай, гурав нь ГУРВАН ӨӨР ҮНЭ:
 *   · буцаалт        — бараа ирсэн, нэхэх юмгүй;
 *   · дутагдуулсан   — ирээгүй, НБҮнээр нэхэгдэнэ (R13);
 *   · худалдаа болгох — харилцагч өөртөө авч үлдсэн, ХУДАЛДАХ үнээр (R32).
 *
 * Тест бүр ҮРЖВЭРийг барина: wizard «40 × 58,000 = 2,320,000» гэж амлавал
 * гарсан төлбөр нь ЯГ тэр байх ёстой.
 */

const QTY = 20;
const RATE = 330;
const NB = 58_000;          // дансны/нөхөн үнэ — «дутагдуулсан» гарц
const SALE = 69_500;        // худалдах үнэ — «худалдаа болгох» гарц

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')}₮`;

async function setup(data: any) {
  return data.rentSetup({
    ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE,
    nbPrice: NB, salePrice: SALE });
}

/** Хаалтын wizard-ыг нээж, эхний алхам дээр зогсоно. */
async function openWizard(page: ContractDetailPage) {
  return clickToOpen(page.closeButton, page.dialog('Гэрээ хаах'), 'Гэрээ хаах wizard');
}

/**
 * ЭЦСИЙН ТООЦООны алхам дээрх АМЛАЛТ.
 *
 * Гадаа үлдсэнийг шийдмэгц тэр алхам ӨӨРӨӨ алга болно (`closeSteps` нь
 * алхмуудаа ДАТАНААС гаргадаг) — тиймээс эцсийн тооцоо нь 1 дэх алхам болно.
 */
async function finalPromise(wizard: ReturnType<ContractDetailPage['dialog']>) {
  await expect(wizard.getByText('1. Эцсийн тооцоо'),
    'гадаа цэвэрлэгдсэн хойно ч «Гадаа үлдэгдэл» алхам үлджээ').toBeVisible();
  const receipt = await readReceipt(wizard, 'эцсийн тооцоо');
  return receipt.money('Эцсийн нэхэмжлэл');
}

/** Хаалтыг гүйцээж, ТӨРСӨН цаас нь амласан дүнтэйгээ тэнцэж буйг батална. */
async function finishClose(page: ContractDetailPage,
                           wizard: ReturnType<ContractDetailPage['dialog']>,
                           promised: number) {
  /* «Цааш →» ба «Гэрээ хаах» нь JSX-ийн ИЖИЛ байрлалд солигддог тул алхам
     ҮНЭХЭЭР солигдсоныг хүлээнэ — эс бөгөөс хаалтын товч гэж бодоод хуучин
     «Цааш →» зангилаа руу дахин буудна. */
  const commit = wizard.getByRole('button', { name: 'Гэрээ хаах', exact: true });
  await clickToOpen(wizard.getByRole('button', { name: 'Цааш →' }), commit,
                    'хаалтын сүүлчийн алхам');
  await commit.click();
  const done = page.dialog('Гэрээ хаагдлаа');
  await expect(done, 'хаалт гүйцэтгэгдсэнгүй').toBeVisible();
  await expect(done, 'төрсөн нэхэмжлэлийн дүн урьдчилсан тооцоотой зөрж байна')
    .toContainText(money(promised));
  return done;
}

test('«Цааш» гадаа бараатай байхад ХААЛТТАЙ — шалтгаан нь АЛХАМ дээрээ ил байна',
  async ({ managerPage, data }) => {
    const { contract } = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const wizard = await openWizard(page);

    /* Алхмууд нь ДАТАНААС: гадаа бараатай тул «Гадаа үлдэгдэл» алхам бий. */
    await expect(wizard.getByText('1. Гадаа үлдэгдэл')).toBeVisible();
    const next = wizard.getByRole('button', { name: 'Цааш →' });
    await expect(next, 'гадаа бараатай атал цааш явах боломжтой байна').toBeDisabled();

    /* ⚠ ШАЛТГААН нь ДЭЛГЭЦ ДЭЭР байх ёстой. Отгоо эгч идэвхгүй товч дээр
       хулгана БАРЬДАГГҮЙ — `title` дотор нуусан тайлбар түүний хувьд
       БАЙХГҮЙТЭЙ адил («дэлгэц дээр болж буйг анзаардаггүй»). */
    await expect(wizard.getByText(
      new RegExp(`Гадаа ${QTY}ш шийдэгдээгүй байна`)),
      'цааш явуулахгүй байгаа шалтгаан алхам дээрээ харагдахгүй байна').toBeVisible();

    /* ГУРВУУЛАНГ нэрлэнэ — нэрлээгүй гарц нь БАЙХГҮЙ гарц (§3 H7). */
    const blocked = wizard.getByText(/^⚠ Гадаа/);
    for (const exit of ['буцаалт', 'дутагдуулсан', 'худалдаа болгосон']) {
      await expect(blocked, `«${exit}» гарц шалтгаан дээр нэрлэгдээгүй`).toContainText(exit);
    }
    await expect(wizard.getByRole('button', { name: /^Буцаалт бүртгэх/ })).toBeVisible();
    await expect(wizard.getByRole('button', { name: /^Дутагдуулсан/ })).toBeVisible();
    await expect(wizard.getByRole('button', { name: /^Худалдаа болгох/ })).toBeVisible();
  });

test('БУЦААЛТ — гадаа цэвэрлэгдэж, эцсийн тасархай цикл ЖИНХЭНЭ нэхэмжлэл болно',
  async ({ managerPage, data }) => {
    const { contract } = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const wizard = await openWizard(page);

    const ret = await clickToOpen(wizard.getByRole('button', { name: /^Буцаалт бүртгэх/ }),
                                  page.dialog('Буцаалт бүртгэх'), 'Буцаалт бүртгэх цонх');
    /* Мөр дээрх товч нь тоог нь УРЬДЧИЛЖ бөглөнө — «40ш дутагдуулсан» гэж
       дараад 30ш бичигдэх боломжгүй. */
    await expect(ret.getByLabel(/— буцаах тоо$/).first()).toHaveValue(String(QTY));
    await ret.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(ret).toBeHidden();

    /* Гадаа юу ч үлдээгүй тул тэр алхам өөрөө АЛГА болно (`closeSteps`). */
    const promised = await finalPromise(wizard);
    expect(promised, 'эцсийн тасархай циклд нэхэх зүйл гарсангүй').toBeGreaterThan(0);

    /* ---- Төрсөн цаас нь АМЛАСАН дүнтэйгээ ЯГ тэнцэнэ ---- */
    const done = await finishClose(page, wizard, promised);
    await expect(done, 'хаалтын дараа эцсийн нэхэмжлэл гарсангүй')
      .toContainText('Эцсийн тасархай цикл');

    /* Нэхэмжлэлийн хүснэгтэд ч ЯГ тэр дүнгээр орсон, гэрээ хаагдсан. */
    await page.reload(contract.id);
    const invoices = await page.invoiceLines();
    expect(invoices.some((i) => i.total === promised),
      `эцсийн нэхэмжлэл жагсаалтад алга (${invoices.map((i) => i.total).join(', ')})`).toBe(true);
    await expect(page.title).toContainText('Хаагдсан');

    /* ---- Тоолуур ҮНЭХЭЭР зогсов ----
       Хаагдсан гэрээнд «явагдаж буй цикл» байх ЁСГҮЙ: эцсийн тасархай цонх
       нь аль хэдийн ЖИНХЭНЭ нэхэмжлэл болсон. Хэрэв тэр цонх дээрээс нь
       «амьд хуримтлал» гэж дахин тоологдвол ЯГ ТЭР МӨНГӨ ХОЁР УДАА орно —
       гэрээний үлдэгдэл, харилцагчийн авлага, дашбоардын KPI гурвуулаа
       хөөрөгдөнө. */
    const after = await data.detail(contract.id);
    expect(after.status).toBe('closed');
    expect(after.cycle, 'хаагдсан гэрээнд идэвхтэй цикл үлджээ').toBeFalsy();
    const owed = invoices.reduce((s, i) => s + i.outstanding, 0);
    expect(await page.balanceExact(),
      'хаалтын дараах үлдэгдэл нэхэмжлэлүүдийн нийлбэрээс зөрж байна (давхар тоолол)')
      .toBe(owed);
    const profile = await (await data.api.get(`/api/clients/${contract.clientId}`)).json();
    expect(profile.receivable,
      'харилцагчийн авлагад эцсийн цикл давхар тоологдож байна').toBe(owed);
  });

test('ДУТАГДУУЛСАН — wizard-ийн «тоо × НБҮнэ» үржвэр нь нэхэгдсэн дүнтэй тэнцэнэ',
  async ({ managerPage, data }) => {
    const { contract } = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const wizard = await openWizard(page);

    /* Мөр дээр ХОЁР үнэ ЗЭРЭГ зогсоно — сохроор сонгохгүйн тулд. */
    const row = wizard.getByText(new RegExp(`дутагдуулбал ${QTY} × `));
    await expect(row, 'дутагдуулсан гарцын үржвэр мөр дээр алга').toBeVisible();
    await expect(row).toContainText(`дутагдуулбал ${QTY} × ${money(NB)} = ${money(QTY * NB)}`);
    await expect(row).toContainText(`худалдвал ${QTY} × ${money(SALE)} = ${money(QTY * SALE)}`);

    const ret = await clickToOpen(wizard.getByRole('button', { name: /^Дутагдуулсан/ }),
                                  page.dialog('Буцаалт бүртгэх'), 'Дутагдуулсны цонх');
    /* «Дутагдуулсан» нь буцаалтын мөрийн АКТЛАХ багана — тоо нь бүтнээрээ,
       задарсан хэвээр (нуугдсан бол НБҮнээр нэхэгдэх мөнгө харагдалгүй өнгөрнө). */
    await expect(ret.getByLabel('Актлах')).toHaveValue(String(QTY));
    const receipt = await readReceipt(ret, 'дутагдуулсны баримт');
    /* ⚠ ХАМРАХ ХҮРЭЭ ӨРГӨСӨВ (2026-09): «НБҮ» гэсэн товчлол дэлгэцээс
       ХАСАГДАВ — Отгоо эгч тэр гурван үсгийг «нөхөн бүрдүүлэх үнэ» гэж
       уншдаггүй (UI-ЗАРЧИМ §3, нэг ойлголт нэг үг). Одоо «бүртгэлийн үнэ».
       Хоёулаа зөвшөөрөгдөх нь ЮУ Ч СУЛРУУЛАХГҮЙ: баталгаа нь ДҮН дээр
       (`QTY * NB`) хэвээр, зөвхөн мөрийг ОЛОХ хэв нь хоёр үгийг таньж байна. */
    expect(receipt.money(new RegExp(`Актын төлбөл?ө?р \\(${QTY}ш × (НБҮнэ|бүртгэлийн үнэ)\\)`)),
      'актын үржвэр баримт дээр зөрж байна').toBe(QTY * NB);
    expect(receipt.totalMoney(), 'нэхэмжлэлд нэмэгдэх нийт дүн зөрж байна').toBe(QTY * NB);

    await ret.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(ret).toBeHidden();

    /* ---- Амлалт ба ҮР ДҮН: нэхэгдсэн засвар/актын дүн ---- */
    const preview = await data.closePreview(contract.id);
    expect(preview.final_invoices[0].charge_amount,
      'дутагдуулсан нь НБҮнээр нэхэгдсэнгүй').toBe(QTY * NB);
    const detail = await data.detail(contract.id);
    const mv = detail.movements.find((m: any) => m.type === 'RETURN');
    expect(mv.lines[0].writeoff_fee, 'хөдөлгөөний актын дүн үржвэртэй зөрж байна')
      .toBe(QTY * NB);

    /* Хаалт: амласан эцсийн нэхэмжлэл (түрээс + акт) нь төрсөн цаастай тэнцэнэ. */
    const promised = await finalPromise(wizard);
    expect(promised, 'эцсийн нэхэмжлэлд актын дүн ороогүй').toBeGreaterThanOrEqual(QTY * NB);
    await finishClose(page, wizard, promised);
  });

test('ХУДАЛДАА БОЛГОХ — «тоо × худалдах үнэ» нь нэхэгдсэн дүнтэй тэнцэнэ',
  async ({ managerPage, data }) => {
    const { contract } = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const wizard = await openWizard(page);

    const sale = await clickToOpen(wizard.getByRole('button', { name: /^Худалдаа болгох/ }),
                                   page.dialog('Худалдаа болгох'), 'Худалдаа болгох цонх');
    await expect(sale.getByLabel(/— худалдах тоо$/).first()).toHaveValue(String(QTY));
    /* Мөр дээрээ ҮРЖВЭР нь ил: «20 × 69,500 = 1,390,000». */
    await expect(sale.getByText(`${QTY} × ${money(SALE)} = ${money(QTY * SALE)}`),
      'худалдааны үржвэр мөрөн дээр алга').toBeVisible();
    const form = await readReceipt(sale, 'худалдааны баримт');
    expect(form.totalMoney(), 'худалдааны нийт дүн зөрж байна').toBe(QTY * SALE);

    /* Мөнгө хөдөлж байгаа тул баталгаажуулалт — ЯГ тэр тоог дахин харуулна.
       Энэ даралт нь СЕРВЕР рүү юу ч илгээхгүй (`onClick={() => setAsk(true)}`)
       тул хосоор нь барих нь аюулгүй. */
    const ask = await clickToOpen(
      sale.getByRole('button', { name: 'Худалдаа болгох', exact: true }),
      page.dialog('Худалдаа болгох уу?'), 'худалдааны баталгаажуулалт');
    const confirmReceipt = await readReceipt(ask, 'худалдааны баталгаажуулалт');
    expect(confirmReceipt.totalMoney(), 'баталгаажуулах цонх өөр дүн харуулж байна')
      .toBe(QTY * SALE);
    await ask.getByRole('button', { name: 'Тийм, худалдаа болгоё' }).click();
    await expect(ask).toBeHidden();

    /* ---- ХУДАЛДАХ үнээр нэхэгдэв үү (НБҮнээр БИШ) ---- */
    const detail = await data.detail(contract.id);
    const mv = detail.movements.find((m: any) => m.type === 'SALE');
    expect(mv.lines[0].sale_fee, 'худалдааны дүн худалдах үнээр бодогдоогүй')
      .toBe(QTY * SALE);
    expect(mv.lines[0].sale_fee, 'худалдааг НБҮнээр нэхжээ').not.toBe(QTY * NB);
    const preview = await data.closePreview(contract.id);
    expect(preview.final_invoices[0].charge_amount,
      'худалдааны дүн эцсийн нэхэмжлэлд ороогүй').toBe(QTY * SALE);

    /* Хаалт хүртэл: тоолуур зогсож, амласан дүн цаас болов. */
    await finishClose(page, wizard, await finalPromise(wizard));
  });
