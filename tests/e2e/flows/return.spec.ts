import { test, expect, type DataFactory } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { readReceipt } from '../../support/receipt';

/**
 * H5 — ХОНОГИЙГ МАШИН ЭЗЭМШИХГҮЙ, ГАРЫН ҮСГИЙГ ТЭР ЭЗЭМШИНЭ.
 *
 * «Хоёр тал 12 хоног гэж гарын үсэг зурсан бол 12 нь хэлцлийн баримт. 11 гэж
 * хэвлэдэг систем "зөв" биш — гэрээ зөрчиж байна» (§3 H5).
 *
 * Гэвч эрх чөлөө нь СОХОР байж болохгүй: машины тоо нь ХАРАГДАЖ байх ёстой
 * (сануулга), тэр тооноос хазайсныг нь дэлгэц ИЛ хэлэх ёстой (зөрүү), ба
 * ПАДАНГИЙН цонхноос давсан тоог ЧИМЭЭГҮЙ хумиж болохгүй — хумивал хавсралт
 * дээр хоёр тал зөвшөөрөөгүй тоо хэвлэгдэнэ.
 *
 * Гурван зан төлөв, гурван тест: PLACEHOLDER (prefill БИШ), ЗӨРҮҮ (мөнгөтэйгээ),
 * ТАТГАЛЗАЛ (хязгаарыг НЭРЛЭСЭН). Дөрөв дэх нь падан-pin: аль ҮЕИЙН тариф
 * хаагдахыг Отгоо заана.
 */

const QTY = 20;
const RATE = 330;

/** Буцаалтын цонхыг нээж, эхний мөрөнд тоо бичээд бэлэн болгоно. */
async function openReturn(page: ContractDetailPage, qty: number) {
  await page.returnButton.click();
  const modal = page.dialog('Буцаалт бүртгэх');
  await modal.getByLabel(/— буцаах тоо$/).first().fill(String(qty));
  return modal;
}

/** Хаалтын урьдчилсан тооцооны ЭЦСИЙН циклийн түрээс — хоногийн үнэн шалгуур. */
async function finalRent(data: DataFactory, contractId: number): Promise<number> {
  const p = await data.closePreview(contractId);
  expect(p.close_error, `хаалтын тооцоо гарсангүй: ${p.close_error}`).toBeFalsy();
  expect(p.final_invoices.length, 'эцсийн тасархай цикл нэхэгдэхгүй байна').toBeGreaterThan(0);
  return p.final_invoices.reduce((s: number, f: any) => s + f.rent_amount, 0);
}

test('машины хоног нь САНАЛ (placeholder) — юу ч бичихгүй бол авто хэвээр',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    const modal = await openReturn(page, QTY);
    const days = modal.getByLabel('Хоног (гараар)');
    const hint = await days.getAttribute('placeholder');
    expect(Number(hint), 'машины тоолсон хоног санал болгогдсонгүй').toBeGreaterThan(0);
    /* PREFILL БИШ: талбар ХООСОН. Урьдчилж бөглөвөл Отгоогийн «гараар
       тохирсон» тэмдэг бүх мөрөнд шалдаг болно. */
    await expect(days, 'машины тоо талбарт бөглөгдчихлөө — энэ нь САНАЛ байх ёстой')
      .toHaveValue('');
    await expect(modal.getByText(`системээр ${hint} хоног`),
      'машины тоо нүдэн дээр нэрлэгдэхгүй байна').toBeVisible();

    /* Юу ч бичээгүй тул баримт дээр ЗӨРҮҮ гэж байхгүй. */
    const receipt = await readReceipt(modal, 'буцаалтын баримт');
    expect(receipt.has(/Гар хоног/), 'юу ч бичээгүй атал гар хоногийн зөрүү гарчээ').toBe(false);

    await modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(modal).toBeHidden();

    /* Дэвтэр дээр «(гараар)» тэмдэг гарах ЁСГҮЙ — энэ бол машины тоо. */
    const ledger = await page.openLedger(
      (await data.detail(contract.id)).items[0].material,
      (await data.detail(contract.id)).items[0].grade ?? '',
      `${contract.materialId}:${contract.gradeId}`);
    await expect(ledger, 'машины хоног дэвтэр дээр гарсангүй').toContainText(`${hint} хоног`);
    await expect(ledger, 'авто хоног «гараар» гэж тэмдэглэгджээ').not.toContainText('(гараар)');
  });

test('гараар тохирсон хоног — зөрүү ИЛ, баримтын дүн нь ҮНЭХЭЭР нэхэгдэнэ',
  async ({ managerPage, data }) => {
    /* ХОЁР ИЖИЛ гэрээ: нэг нь машины хоногоор, нөгөө нь ТҮҮНИЙ хоногоор.
       Зөрүү нь баримтын амласан ₮-тэй ЯГ тэнцэх ёстой — «баримт худал
       хэлэхгүй» гэдгийн ганц шударга шалгуур. */
    const auto = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    const manual = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });

    const page = new ContractDetailPage(managerPage);

    /* --- 1) Машины хоногоор --- */
    await page.goto(auto.contract.id);
    const autoModal = await openReturn(page, QTY);
    const hint = Number(await autoModal.getByLabel('Хоног (гараар)').getAttribute('placeholder'));
    await autoModal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(autoModal).toBeHidden();
    const autoRent = await finalRent(data, auto.contract.id);

    /* --- 2) ТҮҮНИЙ хоногоор (−5) ---
       Түүний хамгийн түгээмэл гар засвар нь БУУРУУЛАХ («би 10 хоногоор
       тооцлоо») — тэр бол утсаар өгсөн хөнгөлөлт. Хөдөлгүүр нь буцаалтын
       хэсгийг алхалтаас САЛГАЖ, ТҮҮНИЙ хоногоор нэхдэг тул зөрүү нь яг
       (гараар − системээр) × тоо × тариф байх ёстой. */
    const typed = hint - 5;
    expect(typed, 'машины тоо хэт бага — тест утгагүй болно').toBeGreaterThan(0);
    await page.goto(manual.contract.id);
    const modal = await openReturn(page, QTY);
    await modal.getByLabel('Хоног (гараар)').fill(String(typed));

    /* Зөрүү нь мөнгө: (гараар − системээр) × тоо × тариф. Отгоо энэ үржвэрийг
       өөрөө дахин бодох тул дэлгэц дээр ХОЁУЛАА тоо нь нэрлэгдэнэ. */
    const receipt = await readReceipt(modal, 'гар хоногийн баримт');
    const varianceRow = receipt.row(/Гар хоног/);
    expect(varianceRow.label, 'зөрүүний мөр хоёр тоог нэрлэсэнгүй')
      .toBe(`Гар хоног (гараар ${typed} / системээр ${hint})`);
    const promised = receipt.money(/Гар хоног/);
    expect(promised, 'зөрүүний ₮ буруу бодогдов').toBe(-5 * QTY * RATE);
    expect(receipt.totalMoney(), 'нийт нь зөрүүгээ агуулаагүй').toBe(promised);

    await modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(modal).toBeHidden();

    /* --- 3) АМЛАЛТ ба ҮР ДҮН --- */
    const manualRent = await finalRent(data, manual.contract.id);
    expect(manualRent - autoRent,
      'баримтын амласан зөрүү ба нэхэгдэх дүнгийн зөрүү таарсангүй').toBe(promised);

    /* Дэвтэр дээр зөрүү НУУГДАХГҮЙ — «13 хоног (гараар — системээр 12)». */
    const detail = await data.detail(manual.contract.id);
    const ledger = await page.openLedger(detail.items[0].material, detail.items[0].grade,
                                         `${manual.contract.materialId}:${manual.contract.gradeId}`);
    await expect(ledger, 'дэвтэр дээр гар/машины хоногийн зөрүү харагдахгүй байна')
      .toContainText(`${typed} хоног (гараар — системээр ${hint})`);
  });

test('падангийн цонхноос давсан хоног АНХААРУУЛНА, ХААХГҮЙ — хоёр тоог НЭРЛЭЖ',
  async ({ managerPage, data }) => {
    /* Урьд нь энэ зам ЧАНГА ТАТГАЛЗДАГ байв («{max} хоногоос их байж
       болохгүй»). Гэвч хоногийг эзэмшдэг нь Отгоо эгч: хэлцэл (урьдчилж
       тохирсон, тээвэр хоцорсон, өршөөсөн) нь цонхны арифметикаас ӨМНӨ
       байдаг. Одоо машин ХОЁР ТООГ нэрлээд БАТЛУУЛНА — чимээгүй хумилт ч,
       хаалттай хаалга ч биш: гурав дахь зам, ИЛ ЗӨРҮҮ. */
    const { contract } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    const before = (await data.detail(contract.id)).movements.length;
    /* ХОЁРЫГ гадаа үлдээнэ — доорх 4 дэх алхам түүхий API-гаар дахин буцаана. */
    const modal = await openReturn(page, QTY - 2);
    const days = modal.getByLabel('Хоног (гараар)');
    const hint = Number(await days.getAttribute('placeholder'));
    /* Талбар нь тоог нь БИЧИХ замыг хаадаггүй — `max` тавьвал маягт өөрөө
       гарын үсэг зурсан тоог татгалзаж эхэлнэ. */
    expect(await days.getAttribute('max'),
      'маягт хоногийн дээд хязгаар тавьжээ — тохирсон тоог бичих зам хаагдана').toBeNull();

    const over = 45;                       // циклийн уртаас (30) давсан тоо
    await days.fill(String(over));

    /* 1. Талбарын доор — ХОЁР ТОО, «болохгүй» гэсэн үг АЛГА. */
    const warn = modal.getByText(/Та \d+ хоног гэж бичлээ/);
    await expect(warn, 'хоёр тоог нэрлэсэн анхааруулга дэлгэц дээр алга').toBeVisible();
    await expect(warn).toContainText(`Та ${over} хоног гэж бичлээ`);
    await expect(warn).toContainText('системээр 30 хоног багтана');
    await expect(warn, 'анхааруулга нь татгалзал шиг ярьсаар байна')
      .not.toContainText('болохгүй');

    /* 2. Дарвал СЕРВЕР юу ч бичихгүйгээр асууна — тоо нь хараахан хөдлөөгүй. */
    await modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    const ask = modal.getByText(/системээр 30 хоног багтана/).last();
    await expect(ask, 'баталгаажуулах асуулт гарч ирсэнгүй').toBeVisible();
    expect((await data.detail(contract.id)).movements.length,
      'баталгаажуулахаас өмнө буцаалт бүртгэгджээ').toBe(before);

    /* 3. Баталсны дараа ЯГ ТЭР тоо нэхэгдэнэ — хумилт БАЙХГҮЙ. */
    await modal.getByRole('button', { name: 'Тийм, энэ тоогоор нэх' }).click();
    await expect(modal).toBeHidden();
    const after = await data.detail(contract.id);
    const line = after.material_lines.flatMap((g: any) => g.lines || [])
      .find((l: any) => l.type === 'RETURN');
    expect(line.billed_days_override, 'баталсан тоо хадгалагдсангүй').toBe(over);
    expect(line.days_confirmed, 'шийдвэрийн тамга буусангүй').toBe(true);
    expect(line.sources[0].billed_days, 'баталсан тоо ХУМИГДЖЭЭ').toBe(over);
    expect(line.sources[0].days, 'машины тоо алга болжээ — зөрүү харагдахаа болино')
      .toBe(hint);

    /* 4. Хаалт нь СЕРВЕРТ: батлаагүй хүсэлт бичихгүй, батласан нь ЯГ тэрээрээ. */
    const res = await data.api.post(`/api/contracts/${contract.id}/movements`, {
      data: { type: 'RETURN', date: data.isoDaysAgo(0), note: '',
              lines: [{ material_id: contract.materialId, grade_id: contract.gradeId,
                        qty: 1, billed_days_override: over }] },
    });
    expect(res.status(), 'сервер анхааруулгын оронд татгалзжээ').toBe(200);
    const body = await res.json();
    expect(body.id, 'батлаагүй хүсэлт дээр мөр үүсгэжээ').toBeUndefined();
    expect(body.days_warning[0].window_days).toBe(30);

    /* ҮЛДСЭН ХАТУУ ТАТГАЛЗАЛ: сөрөг хоног гэж БАЙХГҮЙ — утгагүй тоо. */
    const neg = await data.api.post(`/api/contracts/${contract.id}/movements`, {
      data: { type: 'RETURN', date: data.isoDaysAgo(0), note: '',
              lines: [{ material_id: contract.materialId, grade_id: contract.gradeId,
                        qty: 1, billed_days_override: -1, days_confirm: true }] },
    });
    expect(neg.status(), 'сөрөг хоног зөвшөөрөгджээ').toBe(400);
  });

test('падан-pin — аль ҮЕИЙН тарифыг хаахыг Отгоо заана', async ({ managerPage, data }) => {
    const { contract, material } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    /* ХОЁР ДАХЬ ПАДАН — өөр тарифаар (Мөнхболдын 300 → 450-ийн хэлбэр). */
    const second = await data.issueLot(contract.id, {
      materialId: contract.materialId, gradeId: contract.gradeId,
      qty: 10, rate: 500, daysAgo: 5 });

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await page.returnButton.click();
    const modal = page.dialog('Буцаалт бүртгэх');
    /* Нэг материал ХОЁР тарифаар гадаа байгаа тул маягт дээр хоёр мөр —
       буцаалтыг нь ЭХНИЙ мөрөөс бичээд ПАДАНГ нь заана. */
    await modal.getByLabel(/— буцаах тоо$/).first().fill('10');

    const pin = modal.getByLabel('Аль падангаас');
    await expect(pin, 'хоёр задгай падантай атал сонгогч гарсангүй').toBeVisible();
    const label = `#${second.lineId} · ${data.isoDaysAgo(5)} · 500₮ · 10ш үлдсэн`;
    await expect(pin.locator('option'), 'падангийн сонголтууд гарсангүй')
      .toContainText([/Авто/, /#/, /#/]);
    await pin.selectOption({ label });
    await modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(modal).toBeHidden();

    /* Дэвтэр дээр: ЯГ тэр падан, ЯГ тэр тарифаас хаагдсан, «(заасан)» гэж. */
    const ledger = await page.openLedger(material!.name, material!.grade,
                                         `${contract.materialId}:${contract.gradeId}`);
    await expect(ledger, 'заасан падан хаагдсангүй')
      .toContainText(`#${second.lineId} · 500₮ → 10ш`);
    await expect(ledger, 'заалт нь дэвтэр дээр тэмдэглэгдсэнгүй').toContainText('(заасан)');

    /* Сервер ч ижилхэн хэлнэ — дэлгэцийн хамаарал ба тооцооны хамаарал НЭГ. */
    const detail = await data.detail(contract.id);
    const ret = detail.movements.find((m: any) => m.type === 'RETURN');
    expect(ret.lines[0].issue_line_id, 'сервер дээр падангийн заалт хадгалагдсангүй')
      .toBe(second.lineId);
  });
