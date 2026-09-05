import { test, expect, type DataFactory } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToClose, clickToOpen } from '../../support/interact';
import { readReceipt, signedTugrik } from '../../support/receipt';

/**
 * ЦОНХ ӨӨРӨӨ ГҮЙНЭ, ГОЛ ТОВЧ НЬ НҮДНИЙ ӨМНӨ ЗОГСОНО.
 *
 * Отгоо эгчийн дэлгэц 768px өндөртэй. Хэмжсэн тоо (2026-09): «Буцаалт
 * бүртгэх» цонх 15 материалын мөртэй үед 1,468px, «Нэмэлт олголт» 1,177px,
 * «Худалдаа болгох» 1,524px, «Гэрээ хаах» 1,759px — нэг нь ч дотроо
 * гүйдэггүй байв. Тэгэхээр ХУУДАС гүйдэг: «✓ Буцаалт бүртгэх» товч нүднээс
 * 700px доор үлдэнэ.
 *
 * Тэр товчийг олохын тулд ЦОНХ ДОТРОО гүйлгэх гэсэн хөдөлгөөн түүний
 * толгойд БАЙХГҮЙ (Excel-ийн 20 жилд ийм юм байгаагүй; тэр хуудсаа доош
 * гүйлгэдэг, цонхыг биш). Түүний хувьд «бөглөсөн ч бүртгэх товч алга» —
 * ажил дуусахгүй.
 *
 * Энэ файл ГУРВАН зүйл барина, ЗУРГААН мөртэй ЖИНХЭНЭ гэрээн дээр:
 *   1. агуулга нь ҮНЭХЭЭР багтахгүй байгаа (эс бөгөөс баталгаа нь хоосон);
 *   2. гэсэн ч «Болих» ба гол товч хоёул дэлгэцэн дотор, ГҮЙЛГЭЛГҮЙГЭЭР;
 *   3. товчнуудынхаа дээр ҮР ДҮН зогсож, бичих бүрд шинэчлэгдэнэ.
 *
 * ⚠ Дэлгэцийн хэмжээ нь ЭНЭ файлын хэмжүүр тул проектоос үл хамааран
 *   1366×768 болгож тогтооно (`fits-her-screen.spec.ts` нь проектоороо
 *   хамрагддаг; энэ нь дөрвүүлэн дээр ижил хэмжүүрээр гүйнэ).
 */
test.use({ viewport: { width: 1366, height: 768 } });

const VIEWPORT_H = 768;
const MAIN_QTY = 20;
const MAIN_RATE = 330;
/** Нэмэлт мөрүүд — эхнийх нь 200₮/11ш, дараа нь 300₮/12ш … */
const EXTRA_LINES = 5;

type Line = { name: string; grade: string; qty: number; rate: number };

/** ЗУРГААН материалын мөртэй гэрээ — Блүүмийн хэмжээний жинхэнэ хуудас. */
async function sixLineContract(data: DataFactory) {
  const { contract, material } = await data.rentSetup({
    qty: MAIN_QTY, dailyRate: MAIN_RATE, startDaysAgo: 45 });
  const lines: Line[] = [{ name: material!.name, grade: material!.grade,
                           qty: MAIN_QTY, rate: MAIN_RATE }];
  for (let i = 1; i <= EXTRA_LINES; i += 1) {
    const rate = 100 * (i + 1);
    const qty = 10 + i;
    const m = await data.createMaterial({ baseRate: rate, onHand: 300 });
    await data.issueLot(contract.id, { materialId: m.id, gradeId: m.gradeId,
                                       qty, rate, daysAgo: 40 });
    lines.push({ name: m.name, grade: m.grade, qty, rate });
  }
  return { contract, lines };
}

/** Цонх дотор ҮНЭХЭЭР гүйдэг хайрцаг байна уу (агуулга нь багтахгүй байна уу). */
async function scrollsInside(dialog: ReturnType<ContractDetailPage['dialog']>) {
  return dialog.evaluate((el) =>
    Array.from(el.querySelectorAll('*')).some((n) => {
      const box = n as HTMLElement;
      return /auto|scroll/.test(getComputedStyle(box).overflowY)
             && box.scrollHeight > box.clientHeight + 1;
    }));
}

/** Товч ГҮЙЛГЭЛГҮЙГЭЭР дэлгэцэн дотор бүтнээрээ байна уу. */
async function expectInsideViewport(button: ReturnType<ContractDetailPage['dialog']>,
                                    what: string) {
  await expect(button, `«${what}» товч алга`).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.y, `«${what}» дээшээ гарлаа`).toBeGreaterThanOrEqual(0);
  expect(Math.round(box.y + box.height),
    `«${what}» товч дэлгэцийн доод ирмэгээс ${Math.round(box.y + box.height - VIEWPORT_H)}px `
    + 'доор үлдлээ — Отгоо түүнийг олохын тулд цонх дотор гүйлгэх хэрэгтэй болно')
    .toBeLessThanOrEqual(VIEWPORT_H);
}

test('буцаалтын цонх 1366×768-д багтаж, гол товч нь гүйлгэлгүйгээр гарт бэлэн',
  async ({ managerPage, data }) => {
    const { contract } = await sixLineContract(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    const modal = await clickToOpen(page.returnButton, page.dialog('Буцаалт бүртгэх'),
                                    'Буцаалт бүртгэх цонх');

    /* 1. Агуулга нь ҮНЭХЭЭР багтахгүй байна — эс бөгөөс доорх баталгаа нь
          «богино цонх дэлгэцэнд багтав» гэсэн хоосон ногоон болно. */
    expect(await scrollsInside(modal),
      'зургаан мөртэй буцаалтын цонх дэлгэцэнд бүтнээрээ багтчихлаа — '
      + 'энэ тест юу ч гэрчлэхгүй боллоо').toBe(true);

    /* 2. Гэсэн ч биет нь дэлгэцээс ГАРААГҮЙ. */
    const panel = (await modal.boundingBox())!;
    expect(Math.round(panel.y + panel.height),
      'цонх дэлгэцийн доод ирмэгээс давлаа').toBeLessThanOrEqual(VIEWPORT_H);

    /* 3. Хоёр товч хоёулаа нүдний өмнө — ГҮЙЛГЭЛГҮЙГЭЭР. */
    await expectInsideViewport(modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }),
                               '✓ Буцаалт бүртгэх');
    await expectInsideViewport(modal.getByRole('button', { name: 'Болих', exact: true }),
                               'Болих');
    /* Хуудас өөрөө ч хэвтээ гүйхгүй (цонх нь 85vh-д хумигдсан). */
    expect(await managerPage.evaluate(() => document.documentElement.scrollWidth),
      'цонх нээхэд хуудас хэвтээ гүйлт төрүүлэв').toBeLessThanOrEqual(1366);
  });

test('хоёр тоо бичихэд баримт нь товчны дэргэд ҮР ДҮНГЭЭ хэлнэ',
  async ({ managerPage, data }) => {
    const { contract, lines } = await sixLineContract(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const dayBefore = await page.metricMoney('Өдрийн дүн');

    const modal = await clickToOpen(page.returnButton, page.dialog('Буцаалт бүртгэх'),
                                    'Буцаалт бүртгэх цонх');

    /* ХОЁР МӨР — тодорхой материал дээр, тодорхой тоогоор (мөрийн дараалал
       серверийнх тул нэрээр нь ононо). */
    const [a, b] = [lines[0], lines[1]];
    await modal.getByLabel(`${a.name} — буцаах тоо`).fill('5');
    await modal.getByLabel(`${b.name} — буцаах тоо`).fill('7');
    const drop = 5 * a.rate + 7 * b.rate;

    /* Баримт нь ХОЁР дахь (эхнийх нь мөрүүдийн доорх ДЭЛГЭРЭНГҮЙ задаргаа:
       засвар, акт, гар хоног). Энэ нь ХУРААНГУЙ — гүйлтийн ГАДНА зогсдог. */
    const receipt = await readReceipt(modal, 'буцаалтын хураангуй', 1);
    expect(receipt.value('Буцаах'), 'хэдэн мөр, хэдэн ширхэг гэдэг нь баримт дээр алга')
      .toBe('2 мөр · 12 ш');
    expect(receipt.value('Түрээс'), 'түрээс хэзээ зогсохыг баримт хэлсэнгүй')
      .toMatch(/^\d{4}-\d{2}-\d{2}-нд зогсоно$/);

    /* «Өдрийн дүн X₮ → Y₮» — ХОЁР тоог хамт. Ганц тоо нь өөрчлөлтийг
       хэлдэггүй: Отгоо өмнөх тоог санахгүй тул зөрүүг өөрөө бодож чадахгүй. */
    const shift = receipt.value('Өдрийн дүн');
    const [from, to] = shift.split('→').map((s) => signedTugrik(s, 'өдрийн дүн'));
    expect(from, 'баримтын эхний тоо хуудасны «Өдрийн дүн»-тэй зөрлөө').toBe(dayBefore);
    expect(to, 'буцаалтын дараах өдрийн дүн буруу бодогдов').toBe(dayBefore - drop);

    /* Баримт гарсны ДАРАА ч гол товч нүдний өмнө хэвээр. */
    await expectInsideViewport(modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }),
                               '✓ Буцаалт бүртгэх');

    /* §6 — цонхны мөрийн бичиг 13px-ээс жижиг байхгүй (тэр 60 настай,
       ойрын хараа нь суларсан). Баримтын нэр ба мөрийн сануулга хоёр нь
       хамгийн жижиг бичиг байсан. */
    const smallest = await modal.evaluate((el) => {
      const rows = Array.from(el.querySelectorAll('.receipt-row > span'));
      return Math.min(...rows.map((r) => parseFloat(getComputedStyle(r).fontSize)));
    });
    expect(smallest, 'баримтын мөр 13px-ээс жижиг бичигтэй байна').toBeGreaterThanOrEqual(13);
    const hint = modal.getByText(/^системээр \d+ хоног$/).first();
    expect(parseFloat(await hint.evaluate((el) => getComputedStyle(el).fontSize)),
      'мөрийн сануулга 13px-ээс жижиг байна').toBeGreaterThanOrEqual(13);
  });

test('нэмэлт олголтын цонх ч дотроо гүйж, ХҮЛЭЭЛТЭЭ баримт дээрээ хэлнэ',
  async ({ managerPage, data }) => {
    const { contract, lines } = await sixLineContract(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const dayBefore = await page.metricMoney('Өдрийн дүн');

    const modal = await clickToOpen(page.addIssueButton, page.dialog('Нэмэлт олголт'),
                                    'Нэмэлт олголт цонх');
    const a = lines[0];
    await modal.getByLabel(`${a.name} (${a.grade}) — нэмэх тоо`).fill('40');

    const receipt = await readReceipt(modal, 'олголтын хураангуй');
    expect(receipt.value('Нэмэх')).toBe('40 ш');
    const [from, to] = receipt.value('Өдрийн дүн').split('→')
      .map((s) => signedTugrik(s, 'өдрийн дүн'));
    expect(from).toBe(dayBefore);
    expect(to, 'олголтын дараах өдрийн дүн буруу бодогдов').toBe(dayBefore + 40 * a.rate);
    /* Тэр тоо нь ХАРААХАН ҮНЭН БИШ — дарга «Ачсан ✓» дартал юу ч хөдлөхгүй. */
    expect(receipt.value('Тооцоонд')).toBe('дарга баталгаажуулсны дараа');

    await expectInsideViewport(modal.getByRole('button', { name: 'Илгээх' }), 'Илгээх');
    await expectInsideViewport(modal.getByRole('button', { name: 'Болих', exact: true }),
                               'Болих');
  });

test('гэрээ хаах ба худалдаа болгох цонхнууд ч дэлгэцэн дотор дуусна',
  async ({ managerPage, data }) => {
    const { contract } = await sixLineContract(data);
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    const sale = await clickToOpen(page.saleButton, page.dialog('Худалдаа болгох'),
                                   'Худалдаа болгох цонх');
    await expectInsideViewport(sale.getByRole('button', { name: 'Худалдаа болгох', exact: true }),
                               'Худалдаа болгох');
    await clickToClose(sale.getByRole('button', { name: 'Хаах' }), sale,
                       'Худалдаа болгох цонх');

    const close = await clickToOpen(page.closeButton, page.dialog('Гэрээ хаах'),
                                    'Гэрээ хаах цонх');
    /* Эхний алхам нь «гадаа юу үлдэв» — зургаан мөр тул урт. Гол товч
       («Цааш →» эсвэл «Гэрээ хаах») нь ямар ч тохиолдолд гарт бэлэн. */
    await expectInsideViewport(
      close.getByRole('button', { name: /^(Цааш →|Гэрээ хаах)$/ }), 'Цааш →');
    await expectInsideViewport(close.getByRole('button', { name: 'Болих', exact: true }),
                               'Болих');
  });
