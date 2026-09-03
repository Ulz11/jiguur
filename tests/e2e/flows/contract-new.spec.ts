import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { ContractsPage } from '../../pages/ContractsPage';
import { readReceipt } from '../../support/receipt';
import { expectReady } from '../../support/routes';

/**
 * ШИНЭ ГЭРЭЭ — дөрвөн алхмын wizard, эхнээс нь эцэс хүртэл.
 *
 * Энэ бол системд ОРЖ ИРЭХ ганц хаалга: гэрээ буруу төрвөл түүнээс хойших
 * бүх тооцоо буруу байна. Тиймээс тест нь гурван зүйлийг барина:
 *   · дөрвөн алхам ҮНЭХЭЭР дуустал явдаг (сүүлийн баримт нь бөглөсөн зүйлээ
 *     эргэж харуулна — Отгоо хадгалахаасаа ӨМНӨ шалгадаг);
 *   · АЛДАНГИ анхдагчаар 0 (H2/R25 — wizard урьд нь 0.5%-ийг хатуу бичдэг
 *     байсан тул тэр гэрээ бүрээ санамсаргүй ЗЭВСЭГЛЭДЭГ байв);
 *   · хадгалмагц ачилтын хүсэлт ҮЙЛДВЭРИЙН ДАРГЫН дараалалд очно — нөөц нь
 *     дарга «Ачсан ✓» гэж баталгаажуулах хүртэл ХӨДӨЛӨХГҮЙ.
 */

const QTY = 25;
const RATE = 350;

test('4 алхмаар гэрээ үүсч, ачилтын хүсэлт даргын дараалалд орно',
  async ({ managerPage, factoryPage, data }) => {
    const client = await data.createClient();
    const material = await data.createMaterial({ baseRate: RATE, onHand: 400 });
    const no = `E2E-${randomUUID().slice(0, 8)}`;

    await managerPage.goto('/contracts/new');
    /* «Бэлэн болов уу» гэдэг нь БАТАЛГАА биш, НАВИГАЦИЙН үе шат — тиймээс
       `expectReady`-гээр (`support/routes.ts`-ийн 45с төсөв). Энэ мөр урьд нь
       жирийн 10с `expect` байсан тул `--repeat-each=3` дээр (1344 тест, ганц
       ажилчинтай сервер) wizard «Ачаалж байна…» дээр зогсоод УНАДАГ байв —
       аппын алдаагүйгээр. Бусад suite (`her/`) энэ хаалгыг аль хэдийн
       ийм замаар давдаг. */
    await expectReady(managerPage, 'Шинэ гэрээ', 'Шинэ гэрээ');

    /* ---- 1. Харилцагч ---- */
    await managerPage.getByRole('button', { name: client.name }).click();
    await managerPage.getByRole('button', { name: 'Үргэлжлүүлэх →' }).click();

    /* ---- 2. Материал ---- */
    await managerPage.getByLabel('Материал хайх').fill(material.name);
    await managerPage.getByRole('button', { name: material.name }).click();
    await managerPage.getByLabel(`${material.name} — тоо ширхэг`).fill(String(QTY));
    await managerPage.getByLabel(`${material.name} — тариф ₮/ш/хоног`).fill(String(RATE));

    /* Циклийн үнэ нь БОДОГДОЖ харагдана — Отгоо энэ үржвэрийг өөрөө шалгана. */
    const picked = await readReceipt(managerPage.locator('.card'), 'материалын баримт');
    expect(picked.value('Сонгосон материал')).toBe(`1 мөр · ${QTY}ш`);
    expect(picked.money('Өдрийн нийт тооцоо')).toBe(QTY * RATE);
    expect(picked.totalMoney(), '30 хоногийн циклийн дүн зөрж байна').toBe(QTY * RATE * 30);
    await managerPage.getByRole('button', { name: 'Үргэлжлүүлэх →' }).click();

    /* ---- 3. Нөхцөл: АЛДАНГИ анхдагчаар 0 (H2) ---- */
    await expect(managerPage.getByLabel('Алданги %/хоног'),
      'wizard гэрээг санамсаргүй зэвсэглэж байна (алдангийн анхдагч 0 биш)')
      .toHaveValue('0');
    await expect(managerPage.getByText('0 = алданги автоматаар нэхэгдэхгүй (гараар нэхэж болно)'),
      'алдангийн талбар өөрийгөө тайлбарлахгүй байна').toBeVisible();
    await managerPage.getByLabel('Гэрээний № (хоосон бол автомат)').fill(no);
    await managerPage.getByRole('button', { name: 'Үргэлжлүүлэх →' }).click();

    /* ---- 4. Баталгаажуулах: бөглөсөн зүйл эргэж харагдана ---- */
    const summary = await readReceipt(managerPage.locator('.card'), 'гэрээний баримт');
    expect(summary.value('Харилцагч')).toBe(client.name);
    expect(summary.value('Материал')).toBe(`1 мөр · ${QTY}ш`);
    expect(summary.value(`${material.name} (${material.grade})`),
      'материалын мөр тоо × тарифаа харуулахгүй байна')
      .toBe(`${QTY}ш × ${RATE}₮/хоног`);
    expect(summary.money('Өдрийн тооцоо')).toBe(QTY * RATE);
    expect(summary.value('Алданги'), 'алдангийн шийдвэр баримт дээр нэрлэгдээгүй')
      .toBe('нэхэхгүй (гараар нэхэж болно)');
    expect(summary.totalLine().label).toBe('Циклийн нэхэмжлэл (НӨАТ-гүй)');
    expect(summary.totalMoney()).toBe(QTY * RATE * 30);

    await managerPage.getByRole('button', { name: '✓ Гэрээ баталгаажуулах' }).click();
    await managerPage.waitForURL(/\/contracts\/\d+$/);
    const contractId = Number(managerPage.url().split('/').pop());

    /* ---- Гэрээ нь ЗӨВ төлөвтэй төрөв ---- */
    const detail = new ContractDetailPage(managerPage);
    await expect(detail.backLink).toBeVisible();
    await expect(detail.title).toContainText(client.name);
    await expect(detail.title).toContainText('Идэвхтэй');
    await expect(detail.title).toContainText('Түрээс');
    /* ⚠ ӨДРИЙН ДҮН нь хараахан 0: wizard-ийн «өдрийн тооцоо» бол ТӨСӨӨЛӨЛ,
       гэрээний хуудасны тоо нь АМЬД байдал. Бараа гарах хүртэл юу ч
       хуримтлагдахгүй — «нөөц хөдөлж, тооцоо эхэлнэ» гэдэг НЭГ агшин. */
    expect(await detail.metricMoney('Өдрийн дүн'),
      'баталгаажаагүй ачилт дээр хуримтлал эхэлчихлээ').toBe(0);

    /* Нөөц хараахан ХӨДӨЛӨӨГҮЙ — дарга баталгаажуулах хүртэл. */
    await expect(managerPage.getByText(`+${QTY}ш хүлээгдэж буй`),
      'хүлээгдэж буй ачилт мөрөн дээрээ гарсангүй').toBeVisible();
    const api = await data.detail(contractId);
    expect(api.movements[0].status, 'ачилт шууд баталгаажчихлаа').toBe('pending');
    expect(api.qty_out, 'баталгаажаагүй ачилт «түрээсэнд» гэж тоологджээ').toBe(0);
    const stock = (await (await data.api.get('/api/materials')).json())
      .find((m: any) => m.id === material.id)
      .stock.find((s: any) => s.grade_id === material.gradeId);
    expect(stock.on_hand, 'баталгаажаагүй ачилт агуулахаас хасагджээ').toBe(material.onHand);

    /* ---- Жагсаалтад ЗӨВ төлөвөөр гарна ---- */
    const list = new ContractsPage(managerPage);
    await list.goto();
    await list.searchFor(no);
    const row = list.row(no);
    await expect(row, 'шинэ гэрээ жагсаалтад алга').toBeVisible();
    await expect(row).toContainText(client.name);
    await expect(row, 'шинэ гэрээ «Идэвхтэй» биш төлөвтэй байна').toContainText('Идэвхтэй');

    /* ---- Ачилтын хүсэлт ДАРГЫН дараалалд ---- */
    await factoryPage.goto('/');
    await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');
    const queue = factoryPage.locator('.card').filter({
      has: factoryPage.getByRole('heading', { name: 'Ачилт хүлээгдэж буй' }) });
    await expect(queue, 'шинэ ачилт даргын дараалалд ирсэнгүй')
      .toContainText(`${client.name} — №${no}`);
    /* Даргын ДАРААЛАЛД ₮ ОРОХГҮЙ. Энэ бол ЭМХ ЦЭГЦИЙН дүрэм (эзний шийдвэр
       2026-09 — хана биш): дашбоард нь түүний АЖЛЫН ДАРААЛАЛ тул мөнгө
       тэнд огт байрлахгүй. Гэрээ, харилцагч, бартер, механизм дээрх мөнгө
       нь хумигдсан «Санхүү» задаргаанд байдаг (money-tidy.spec.ts) —
       ЭНД тийм задаргаа ч байхгүй: дараалал бол цэвэр ажил. */
    expect(await queue.innerText(), 'даргын дараалалд ₮ гарчихлаа').not.toContain('₮');

    /* ---- Дарга «Ачсан ✓» гэмэгц НӨӨЦ хөдөлж, ТООЦОО эхэлнэ ---- */
    const confirmButton = queue.getByRole('button',
      { name: new RegExp(`№${no}.*ачилтыг баталгаажуулах`) });
    await expect(confirmButton, 'даргын «Ачсан ✓» товч мөрөө нэрлээгүй').toBeVisible();
    await confirmButton.click();
    const ask = factoryPage.getByRole('dialog', { name: 'Ачилт баталгаажуулах' });
    /* Мөрүүд нь СЕРВЕРЭЭС ирдэг («уншиж байна…» → жинхэнэ мөрүүд) — тэр
       агшныг хүлээнэ, эс бөгөөс хоосон баримт уншина. */
    await expect(ask.getByText(`${material.name} (${material.grade})`),
      'ачилтын мөрүүд цонхонд ирсэнгүй').toBeVisible();
    const lines = await readReceipt(ask, 'ачилтын баримт');
    expect(lines.value(`${material.name} (${material.grade})`),
      'баталгаажуулах цонх ачих тоогоо нэрлээгүй').toBe(`${QTY} ш`);
    expect(lines.totalLine().value).toBe(`${QTY} ш`);
    await ask.getByRole('button', { name: 'Ачсан ✓' }).click();
    await expect(ask).toBeHidden();

    const moved = (await (await data.api.get('/api/materials')).json())
      .find((m: any) => m.id === material.id)
      .stock.find((s: any) => s.grade_id === material.gradeId);
    expect(moved.on_hand, 'баталгаажсан ачилт агуулахаас хасагдсангүй')
      .toBe(material.onHand - QTY);
    expect(moved.on_rent, 'баталгаажсан ачилт түрээсэнд гарсангүй').toBe(QTY);

    /* Тэр агшнаас л тооцоо эхэлнэ — wizard-ийн амласан өдрийн дүн амь орлоо. */
    await detail.goto(contractId);
    expect(await detail.metricMoney('Өдрийн дүн'),
      'ачилт баталгаажсан ч өдрийн дүн wizard-ийн амласантай таарсангүй')
      .toBe(QTY * RATE);
  });
