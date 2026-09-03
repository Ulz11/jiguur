import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen } from '../../support/interact';
import { readReceipt } from '../../support/receipt';
import { parseTugrik } from '../../support/money';

/**
 * H6 / R3 — ТАРИФ ДАХИН ТОХИРОГДОНО, ГЭХДЭЭ «ХЭЗЭЭНЭЭС» гэдэг нь ТҮҮНИЙ асуулт.
 *
 * Отгоо эгчийн Excel-д тариф циклүүдийн хооронд дахин тохирогддог (Мөнхболд
 * 300 → 350 → 450). Семантик нь нэг мөр: ШИНЭ ТАРИФ ДАРААГИЙН ЦИКЛЭЭС, гарын
 * үсэг зурсан өнгөрсөн нь ХЭВЭЭР.
 *
 * Систем нь урьд нь нэг нүдний InlineEdit байсан: тоог дарж бичихэд падангийн
 * тариф ЧИМЭЭГҮЙ ухарч, нэхэмжлэгдсэн циклүүд хуучин дүнгээ хэдэн сар авч
 * яваад ОГТ ХАМААРАЛГҮЙ засварын үед гэнэт үсэрдэг байв — «машин санамсаргүй
 * түүх дахин бичлээ».
 *
 * Тиймээс энэ suite гурвыг барина: сонголтууд нь БОДИТ циклийн хил дээр
 * зогсож байна уу, анхдагч нь АЮУЛГҮЙ нь мөн үү, ба түүх засах сонголт нь
 * ЭХЛЭЭД зөрүүг харуулаад л бичиж байна уу.
 */

const QTY = 20;
const RATE = 330;
const NEW_RATE = 500;

/** «99,000₮ → 150,000₮» → [99000, 150000] (дахин бодолтын мөрийн хэлбэр). */
function beforeAfter(value: string, where: string): [number, number] {
  const parts = value.split('→');
  expect(parts.length, `${where}: «хуучин → шинэ» хэлбэртэй биш: ${value}`).toBe(2);
  return [parseTugrik(parts[0], `${where} · хуучин`), parseTugrik(parts[1], `${where} · шинэ`)];
}

/** Материалын хүснэгтийн ТАРИФ дээр дарж «дахин тохирох» цонхыг нээнэ. */
async function openRateModal(page: ContractDetailPage) {
  return clickToOpen(
    page.page.getByRole('button', { name: /тариф: .* · дахин тохирох/ }).first(),
    page.dialog('Тариф дахин тохирох'), 'Тариф дахин тохирох цонх');
}

test('«Хэзээнээс» гурван сонголт — БОДИТ циклийн хил дээр, анхдагч нь АЮУЛГҮЙ нь',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    const bounds = (await data.detail(contract.id)).cycle_bounds;
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const modal = await openRateModal(page);

    /* Огноог UI ТААМАГЛАХГҮЙ — СЕРВЕРИЙН `cycle_bounds` дээр зогсоно. Дэлгэц
       «дараагийн цикл» гэж бичээд сервер өөр өдөр ойлговол Отгоо хоёр өөр тоо
       хараад аль алинд нь итгэхээ болино. */
    const options = [
      ['Дараагийн циклээс', bounds.next_start],
      ['Энэ циклээс', bounds.current_start],
      ['Бүх түүхэнд', bounds.contract_start],
    ] as const;
    for (const [title, day] of options) {
      await expect(modal.getByRole('radio', { name: `${title} — ${day}` }),
        `«${title}» сонголт бодит огноогүй байна`).toBeVisible();
    }

    /* АНХДАГЧ нь АЮУЛГҮЙ нь: гарын үсэг зурсан өнгөрсөнд хүрэхгүй. */
    await expect(modal.getByRole('radio', { name: `Дараагийн циклээс — ${bounds.next_start}` }),
      'анхдагч сонголт нь дараагийн цикл БИШ байна').toBeChecked();
    await expect(modal.getByText(/нэхэмжилсэн циклүүдэд хүрвэл/),
      'аюулгүй сонголт дээр анхааруулга гарчихлаа').toHaveCount(0);
  });

test('түүх засах сонголт ЭХЛЭЭД анхааруулж, зөрүүг харуулаад л дахин бодно',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    const bounds = (await data.detail(contract.id)).cycle_bounds;
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const before = await page.invoiceLines();
    expect(before.length, 'нэхэмжлэгдсэн цикл алга — түүх засах утгагүй').toBeGreaterThan(0);

    const modal = await openRateModal(page);
    await modal.getByLabel('Шинэ тариф ₮/ш/хоног').fill(String(NEW_RATE));
    await modal.getByRole('radio', { name: `Бүх түүхэнд — ${bounds.contract_start}` }).check();

    /* 1. АНХААРУУЛГА — дарахаас ӨМНӨ. */
    await expect(modal.getByText(/нэхэмжилсэн циклүүдэд хүрвэл/),
      'түүх дахин бичих сонголт дээр анхааруулга гарсангүй').toBeVisible();

    /* 2. Баримт: хуучин/шинэ тариф, гадаа байгаа тоо, шинэ өдрийн дүн. */
    const plan = await readReceipt(modal, 'тарифын баримт');
    expect(plan.money('Одоогийн тариф')).toBe(RATE);
    expect(plan.money('Шинэ тариф')).toBe(NEW_RATE);
    expect(plan.value('Гадаа байгаа тоо')).toBe(`${QTY} ш`);
    expect(plan.totalMoney(), 'шинэ өдрийн дүн = тоо × шинэ тариф').toBe(QTY * NEW_RATE);
    expect(plan.totalLine().label).toBe(`${bounds.contract_start}-ээс өдрийн дүн`);

    await modal.getByRole('button', { name: 'Тариф тохирох' }).click();

    /* 3. ХОЁРДУГААР ХААЛГА: түүхэнд хүрэх засвар нь ЗӨРҮҮГЭЭ харуулна. */
    const rebuild = page.dialog('Тооцоо дахин бодогдоно');
    await expect(rebuild, 'түүх дахин бичих засвар зөрүүгүйгээр өнгөрөв').toBeVisible();
    const diff = await readReceipt(rebuild, 'дахин бодолтын зөрүү');

    /* ⚠ Хараахан ЮУ Ч бичигдээгүй байх ёстой — «эхлээд харуул, дараа нь бич». */
    const midway = await data.detail(contract.id);
    expect(midway.rate_changes, 'баталгаажуулахаас ӨМНӨ тариф бичигдчихлээ').toEqual([]);
    for (const inv of midway.invoices) {
      const was = before.find((b) => b.no === `№${inv.no}`);
      expect(inv.total, `${inv.no}: баталгаажуулахаас өмнө нэхэмжлэл өөрчлөгдлөө`)
        .toBe(was?.total);
    }

    /* 4. Амлалт: цикл бүрийн ХУУЧИН → ШИНЭ дүн. */
    const rows = diff.lines.filter((l) => !l.total);
    expect(rows.length, 'зөрүүний мөр гарсангүй').toBe(before.length);
    const promised = new Map<string, number>();
    for (const r of rows) {
      const [was, will] = beforeAfter(r.value, r.label);
      const known = before.find((b) => b.title === r.label);
      expect(known, `«${r.label}» гэсэн цикл нэхэмжлэлийн жагсаалтад алга`).toBeTruthy();
      expect(was, `${r.label}: хуучин дүн жагсаалттай зөрж байна`).toBe(known!.total);
      expect(will, `${r.label}: шинэ дүн өсөх ёстой (${RATE} → ${NEW_RATE})`)
        .toBeGreaterThan(was);
      promised.set(r.label, will);
    }
    const [, promisedSum] = beforeAfter(diff.totalLine().value, 'нийт');

    await rebuild.getByRole('button', { name: 'Баталгаажуулж дахин бодох' }).click();
    await expect(rebuild).toBeHidden();
    await page.reload(contract.id);

    /* 5. ҮР ДҮН нь АМЛАЛТТАЙГАА ЯГ тэнцэнэ — цикл бүрээр. */
    const after = await page.invoiceLines();
    for (const inv of after) {
      const will = promised.get(inv.title);
      expect(will, `«${inv.title}» цикл амлалтад байхгүй байсан`).toBeDefined();
      expect(inv.total, `${inv.title}: амласан дүн ба дахин бодогдсон дүн зөрж байна`)
        .toBe(will);
    }
    expect(after.reduce((s, i) => s + i.total, 0),
      'нэхэмжлэлийн нийт дүн амлалтаас зөрж байна').toBe(promisedSum);

    /* 6. Тариф нь ЯВДАЛ болж мөрөндөө үлдэнэ (хэзээнээс, юунаас юу болов). */
    await expect(page.rateChangeList(), 'тарифын өөрчлөлт түүхэнд бичигдсэнгүй')
      .toContainText(`${RATE}₮ → ${NEW_RATE}₮ · ${bounds.contract_start}-ээс`);
    await expect(managerPage.getByRole('button',
      { name: new RegExp(`тариф: ${NEW_RATE} · дахин тохирох`) }),
      'материалын мөр дээр шинэ тариф гарсангүй').toBeVisible();
  });

test('дараагийн циклээс — гарын үсэг зурсан ӨНГӨРСӨН нь ХЭВЭЭР',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 45, qty: QTY, dailyRate: RATE });
    const bounds = (await data.detail(contract.id)).cycle_bounds;
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const before = await page.invoiceLines();

    const modal = await openRateModal(page);
    await modal.getByLabel('Шинэ тариф ₮/ш/хоног').fill(String(NEW_RATE));
    /* Анхдагч сонголт (дараагийн цикл) хэвээр — дарахад л болно. */
    await modal.getByRole('button', { name: 'Тариф тохирох' }).click();

    /* Түүхэнд хүрэхгүй тул дахин бодолтын хаалга ОГТ гарахгүй.
       ДАРААЛАЛ чухал: эхлээд маягт хаагдсаныг хүлээнэ (сервер хариулсны
       баталгаа), тэгж байж «хоёрдугаар цонх гараагүй» гэдэг утгатай болно —
       эс бөгөөс хүсэлт нисэж яваа хоромд шалгаад чимээгүй ногоон болно. */
    await expect(modal, 'тариф хадгалагдсангүй').toBeHidden();
    await expect(page.dialog('Тооцоо дахин бодогдоно'),
      'ирээдүйн тариф түүх дахин бичих гэж байна').toHaveCount(0);
    await page.reload(contract.id);

    const after = await page.invoiceLines();
    expect(after.map((i) => `${i.no}=${i.total}`),
      'дараагийн циклийн тариф өнгөрсөн нэхэмжлэлийг хөдөлгөв')
      .toEqual(before.map((i) => `${i.no}=${i.total}`));
    await expect(page.rateChangeList(), 'ирээдүйн тариф түүхэнд бичигдсэнгүй')
      .toContainText(`${RATE}₮ → ${NEW_RATE}₮ · ${bounds.next_start}-ээс`);
  });
