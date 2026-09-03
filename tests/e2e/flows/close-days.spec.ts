import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen, clickToPick } from '../../support/interact';
import { readReceipt } from '../../support/receipt';

/**
 * H5-ийн СҮҮЛЧИЙН МИЛЬ — хаалт нь тохирсон хоногийг чимээгүй хумидаг байв.
 *
 * Гэрээ хаахад эцсийн цикл ТАСАРНА. Тэр богино цонх нь падангийн цонхыг
 * богиносгодог тул бүртгэх агшинд ЗӨВШӨӨРӨГДСӨН 12 хоног хавсралт дээр 10
 * болж хэвлэгддэг байв — гарын үсэг зурсан тоог машин хаалтын мөчид дарж
 * байсан гэсэн үг. «Гар тоолж 12, дэлгэц 10» гэвэл Отгоо эгч «машин тоолж
 * чаддаггүй» гэж дүгнэнэ: суурь итгэлийн шалгалт.
 *
 * ШИНЭ ДҮРЭМ: тэр тохирсон хоногоо нэхнэ. Машин бодож, санал болгож,
 * АНХААРУУЛЖ болно — түүний тоог ЧИМЭЭГҮЙ ӨӨРЧЛӨХ эрхгүй.
 *
 * ЭНЭ SUITE-ИЙН ЗАСАГЛАХ ДҮРЭМ: Receipt-ийн АМЛАЛТ == ҮР ДҮН. Wizard 67,320₮
 * гэж амлавал төрсөн цаас нь ЯГ 67,320₮ байх ёстой — аль тоог сонгосон ч.
 *
 * ТООНУУД: 45 хоногийн өмнөх гэрээ, 20ш × 330₮. 2-р цикл [−15, +15).
 *   · −8-нд 8ш буцав, Отгоо 12 хоног гэж тохирсон (бүтэн цонхонд багтана);
 *   · −6-нд үлдсэн 12ш буцав;
 *   · −6-аар хаавал тасархай цонх [−15, −5) нь ердөө 10 хоног.
 * Зөрүү нь ЯГ (12 − 10) × 8ш × 330₮ = 5,280₮.
 */

const QTY = 20;
const RATE = 330;
const RET = 8;                // ТҮҮНИЙ хоногтой буцаалт
const AGREED = 12;            // тохирсон хоног
const WINDOW = 10;            // хаалтын цонхонд багтах хоног
const DAY_AMOUNT = RET * RATE;                       // 2,640₮ — нэг хоногийн ₮
const DIFF = (AGREED - WINDOW) * DAY_AMOUNT;         // 5,280₮

/* Эцсийн тасархай цонх [−15, −5): 8ш × сонгосон хоног + 12ш × 9 хоног. */
const rentFor = (days: number) => (RET * days + (QTY - RET) * 9) * RATE;
const HER_RENT = rentFor(AGREED);                    // 67,320₮
const WINDOW_RENT = rentFor(WINDOW);                 // 62,040₮

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')}₮`;

/** Гэрээ + хоёр буцаалт: эхнийх нь ТҮҮНИЙ хоногтой, хоёр дахь нь гадааг цэвэрлэнэ. */
async function setup(data: any) {
  const s = await data.rentSetup({
    ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
  const line = { material_id: s.contract.materialId, grade_id: s.contract.gradeId };
  await data.addMovement(s.contract.id, {
    type: 'RETURN', date: data.isoDaysAgo(8),
    lines: [{ ...line, qty: RET, billed_days_override: AGREED }] });
  await data.addMovement(s.contract.id, {
    type: 'RETURN', date: data.isoDaysAgo(6),
    lines: [{ ...line, qty: QTY - RET }] });
  return s;
}

/** Wizard-ыг нээж, хаах огноог −6 болгоно — тэр агшинд зөрчил төрнө. */
async function openAt(page: ContractDetailPage, data: any, days = 6) {
  const wizard = await clickToOpen(page.closeButton, page.dialog('Гэрээ хаах'),
                                   'Гэрээ хаах wizard');
  await wizard.getByLabel('Хаах огноо').fill(data.isoDaysAgo(days));
  return wizard;
}

/** «Эцсийн нэхэмжлэл» мөрөн дээрх АМЛАЛТ. */
async function promise(wizard: any) {
  const receipt = await readReceipt(wizard, 'эцсийн тооцоо');
  return receipt.money('Эцсийн нэхэмжлэл');
}

test('ЗӨРЧИЛ нь ХОЁР ТООГООРОО ба ₮ ЗӨРҮҮГЭЭРЭЭ гарч ирнэ — өгөгдмөл нь ТҮҮНИЙХ',
  async ({ managerPage, data }) => {
    const s = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(s.contract.id);
    const wizard = await openAt(page, data);

    /* ХОЁР ТОО ба ЗӨРҮҮ нь НЭГ өгүүлбэрт — Отгоо эгч дэлгэц дээр болж буйг
       анзаардаггүй тул шийдвэрийн бүх бүрэлдэхүүн нэг харцанд байх ёстой. */
    const block = wizard.getByText(/Та .* хоног гэж тохирсон/);
    await expect(block, 'хаалтын зөрчил дэлгэц дээр огт гарсангүй').toBeVisible();
    await expect(block).toContainText(`Та ${AGREED} хоног гэж тохирсон`);
    await expect(block).toContainText(`${WINDOW} хоног багтана`);
    await expect(block, 'зөрүүний ₮ нэрлэгдсэнгүй').toContainText(money(DIFF));

    /* ГУРВУУЛАН ЗАМ нэрлэгдэнэ — нэрлээгүй гарц нь БАЙХГҮЙ гарц. */
    const agreed = wizard.getByRole('button', { name: `${AGREED} хоног — тохирсон` });
    const win = wizard.getByRole('button', { name: `${WINDOW} хоног — хаалтын цонх` });
    const other = wizard.getByRole('button', { name: 'Өөр тоо' });
    for (const b of [agreed, win, other]) await expect(b).toBeVisible();

    /* ӨГӨГДМӨЛ нь ТОХИРСОН тоо — гарын үсэг зурсан нь тэр. */
    await expect(agreed, 'өгөгдмөл нь түүний тохирсон тоо БИШ байна')
      .toHaveAttribute('aria-pressed', 'true');
    await expect(win).toHaveAttribute('aria-pressed', 'false');

    /* Арифметик нь ЗАДЛАГДСАН — цаасан дээр дахин гаргаж болно. */
    await expect(wizard.getByText(
      `${AGREED} хоног × ${DAY_AMOUNT.toLocaleString('en-US')}₮ = `
      + `${(AGREED * DAY_AMOUNT).toLocaleString('en-US')}₮`),
      'мөрийн үржвэр задлагдаагүй').toBeVisible();

    expect(await promise(wizard),
      'амлалт нь ТҮҮНИЙ тохирсон хоногоор бодогдоогүй').toBe(HER_RENT);
  });

test('СОНГОСОН тоо нь АМЛАЛТЫГ хөдөлгөнө — гурван зам, гурван ₮',
  async ({ managerPage, data }) => {
    const s = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(s.contract.id);
    const wizard = await openAt(page, data);
    expect(await promise(wizard)).toBe(HER_RENT);

    /* ЦОНХНЫ тоо — амлалт нь ЯГ зөрүүгээрээ буурна. */
    await clickToPick(wizard.getByRole('button', { name: `${WINDOW} хоног — хаалтын цонх` }),
                      'хаалтын цонхны хоног');
    await expect.poll(() => promise(wizard),
      { message: 'цонхны тоог сонгоход амлалт хөдөлсөнгүй' }).toBe(WINDOW_RENT);
    expect(HER_RENT - WINDOW_RENT, 'хоёр замын ₮ зөрүү мөрөн дээрхтэй таарахгүй').toBe(DIFF);

    /* ӨӨР тоо — бүрэн эрх чөлөө. */
    await clickToPick(wizard.getByRole('button', { name: 'Өөр тоо' }), 'Өөр тоо');
    await wizard.getByLabel('Хоног', { exact: true }).fill('15');
    await expect.poll(() => promise(wizard),
      { message: 'гурав дахь тоо амлалтад буусангүй' }).toBe(rentFor(15));

    /* БУЦААД тохирсон тоо руугаа — сонголт нь эргэдэг, түгждэггүй. */
    await clickToPick(wizard.getByRole('button', { name: `${AGREED} хоног — тохирсон` }),
                      'тохирсон хоног');
    await expect.poll(() => promise(wizard)).toBe(HER_RENT);
  });

test('АМЛАЛТ == ҮР ДҮН: сонгосон тоо ЯГ тэрээрээ нэхэгдэж, хавсралтад хэвлэгдэнэ',
  async ({ managerPage, data }) => {
    const s = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(s.contract.id);
    const wizard = await openAt(page, data);

    await clickToPick(wizard.getByRole('button', { name: `${WINDOW} хоног — хаалтын цонх` }),
                      'хаалтын цонхны хоног');
    await expect.poll(() => promise(wizard)).toBe(WINDOW_RENT);
    const promised = await promise(wizard);

    const commit = wizard.getByRole('button', { name: 'Гэрээ хаах', exact: true });
    await clickToOpen(wizard.getByRole('button', { name: 'Цааш →' }), commit,
                      'хаалтын сүүлчийн алхам');
    await commit.click();
    const done = page.dialog('Гэрээ хаагдлаа');
    await expect(done, 'хаалт гүйцэтгэгдсэнгүй').toBeVisible();
    await expect(done, 'төрсөн цаас амласан дүнгээсээ зөрж байна')
      .toContainText(money(promised));

    /* Сонголт нь МӨРӨН ДЭЭР үлдэнэ — хавсралт ч ЯГ тэр тоог хэвлэнэ.
       Хоногууд нь ДЭВТЭРТ (`material_lines`) амьдарна: `movements` нь түүхий
       хөдөлгөөн, хоногийн хамаарлыг авч явдаггүй. */
    const detail = await data.detail(s.contract.id);
    const line = detail.material_lines
      .flatMap((g: any) => g.lines || [])
      .find((l: any) => l.type === 'RETURN' && l.qty === RET);
    expect(line.billed_days_override, 'сонгосон хоног мөрөн дээр бичигдсэнгүй')
      .toBe(WINDOW);
    expect(line.days_confirmed, 'шийдвэрийн тамга мөрөн дээр буусангүй').toBe(true);
    expect(line.sources[0].billed_days, 'дэвтэр дээрх хоног сонголттой зөрж байна')
      .toBe(WINDOW);
    const final = detail.invoices.reduce(
      (a: any, b: any) => (a.cycle_start > b.cycle_start ? a : b));
    expect(final.rent_amount, 'нэхэмжлэлийн түрээс сонгосон тоогоор бодогдоогүй')
      .toBe(WINDOW_RENT);
  });

test('ТОХИРСОН тоогоороо хаавал ХУМИГДАХГҮЙ — 12 нь 10 болохоо болив',
  async ({ managerPage, data }) => {
    const s = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(s.contract.id);
    const wizard = await openAt(page, data);
    const promised = await promise(wizard);
    expect(promised).toBe(HER_RENT);

    const commit = wizard.getByRole('button', { name: 'Гэрээ хаах', exact: true });
    await clickToOpen(wizard.getByRole('button', { name: 'Цааш →' }), commit,
                      'хаалтын сүүлчийн алхам');
    await commit.click();
    await expect(page.dialog('Гэрээ хаагдлаа')).toContainText(money(promised));

    /* ЖИНХЭНЭ БАТАЛГАА: цаас нь гэрээтэйгээ таарав. Урьд нь эндээс 5,280₮
       чимээгүй алга болж, хавсралт дээр 10 хоног хэвлэгддэг байв. */
    const detail = await data.detail(s.contract.id);
    const final = detail.invoices.reduce(
      (a: any, b: any) => (a.cycle_start > b.cycle_start ? a : b));
    expect(final.rent_amount).toBe(HER_RENT);
    expect(final.rent_amount - WINDOW_RENT,
      'тохирсон хоног хаалтын мөчид хумигдсан хэвээр байна').toBe(DIFF);
  });

test('ЗӨРЧИЛГҮЙ хаалт ЮУ Ч АСУУХГҮЙ — хэрэггүй шийдвэр зохиож гаргахгүй',
  async ({ managerPage, data }) => {
    const s = await setup(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(s.contract.id);
    /* Өнөөдрөөр хаавал цонх [−15, +1) = 16 хоног — 12 нь тайван багтана. */
    const wizard = await clickToOpen(page.closeButton, page.dialog('Гэрээ хаах'),
                                     'Гэрээ хаах wizard');
    await expect(wizard.getByText('Эцсийн нэхэмжлэл')).toBeVisible();
    await expect(wizard.getByText(/Та .* хоног гэж тохирсон/),
      'зөрчилгүй атал хоногийн асуулт гарч ирлээ').toHaveCount(0);
    await expect(wizard.getByRole('button', { name: 'Өөр тоо' })).toHaveCount(0);
  });
