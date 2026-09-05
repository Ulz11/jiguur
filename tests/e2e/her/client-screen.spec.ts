import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
import { ClientsPage } from '../../pages/ClientsPage';
import { clickToOpen } from '../../support/interact';
import { writeClientsXlsx } from '../../support/xlsx';

/**
 * ХАРИЛЦАГЧИЙН ХОЁР ДЭЛГЭЦИЙН МУХАРДМАЛ ХАНАНУУД.
 *
 * · «Импорт: 12 нэмэгдэв, 3 давхардал алгасав» — ХЭН алгасагдсан нь мэдэгдэхгүй
 *   3.2 секундын мэдэгдэл. Отгоо Excel-ээ нээж, 200 мөр дундуур нүдээрээ хайна.
 * · «Энэ нэртэй харилцагч аль хэдийн бүртгэлтэй» — мөн мэдэгдэл, мөн өнгөрнө;
 *   тэр харилцагч ХААНА байгааг хэлэхгүй.
 * · Амлалт («Даваа гарагт 5 сая шилжүүлнэ») нь ЗӨВХӨН «Авлага цуглуулах» дээр
 *   — харилцагчийн хуудсан дээр түүх нь ОГТ гардаггүй байв.
 * · Илүү төлөлт: Хурд групп 78 сая илүү төлсөн атал «Авлага 0₮ · Хэвийн».
 * · Компанийн нэр ХААНА Ч засагддаггүй байв (сервер нь хүлээж авдаг байсан).
 */

const uniq = () => randomUUID().slice(0, 8);

test('импортын үр дүн НЭРСЭЭРЭЭ, цонхонд, «Хаах» дартал зогсоно',
  async ({ managerPage, data }) => {
    const existing = await data.createClient(`Импорт-Хуучин ${uniq()}`);
    const fresh1 = `Импорт-Шинэ ${uniq()}`;
    const fresh2 = `Импорт-Шинэ ${uniq()}`;
    const file = writeClientsXlsx([
      [fresh1, '1122334', 'И.Тест', '9911-2233'],
      [fresh2, '', '', ''],
      [existing.name, '', '', ''],
    ]);

    const list = new ClientsPage(managerPage);
    await list.goto();
    await managerPage.locator('input[type="file"]').setInputFiles(file);

    const modal = managerPage.getByRole('dialog').filter({ hasText: 'Импортын үр дүн' });
    await expect(modal, 'импортын үр дүнгийн цонх гарсангүй').toBeVisible();
    await expect(modal.getByText('Нэмэгдсэн (2)')).toBeVisible();
    await expect(modal.getByText('Алгассан — аль хэдийн байсан (1)')).toBeVisible();
    await expect(modal.getByText(fresh1, { exact: true })).toBeVisible();
    await expect(modal.getByText(fresh2, { exact: true })).toBeVisible();
    await expect(modal.getByText(existing.name, { exact: true }),
      'алгассан нэр цонхон дээр гарсангүй').toBeVisible();

    /* Цонх нь ӨӨРӨӨ арилахгүй — тэр уншиж амжина. */
    await managerPage.waitForTimeout(4_000);
    await expect(modal, 'үр дүнгийн цонх өөрөө хаагдав').toBeVisible();
    /* Толгойн «×» ч «Хаах» гэсэн дуудагдах нэртэй — БИЧИГТЭЙ товчийг нь. */
    await modal.getByRole('button', { name: 'Хаах' })
      .filter({ hasText: 'Хаах' }).click();
    await expect(modal).toBeHidden();
  });

test('давхардсан нэр — серверийн өгүүлбэр цонхонд үлдэж, тэр хүн рүү очих холбоос гарна',
  async ({ managerPage, data }) => {
    const existing = await data.createClient(`Давхар ${uniq()}`);
    const list = new ClientsPage(managerPage);
    await list.goto();

    const modal = await clickToOpen(list.newClientButton,
      managerPage.getByRole('dialog').filter({ hasText: 'Шинэ харилцагч' }),
      'Шинэ харилцагч цонх');
    await modal.getByLabel('Компанийн нэр *').fill(existing.name);
    await modal.getByRole('button', { name: 'Бүртгэх' }).click();

    /* Цонх нь ХААГДАХГҮЙ: шалтгаан нь дотроо, бөглөсөн зүйл нь байрандаа. */
    await expect(modal.getByRole('alert'), 'давхардлын өгүүлбэр цонхонд гарсангүй')
      .toContainText(/аль хэдийн бүртгэлтэй/);
    await expect(modal.getByLabel('Компанийн нэр *')).toHaveValue(existing.name);

    const link = modal.getByRole('link', { name: new RegExp(`${existing.name} руу очих`) });
    await expect(link, '«тэр харилцагч руу очих» холбоос алга').toBeVisible();
    await link.click();
    await managerPage.waitForURL(new RegExp(`/clients/${existing.id}$`));
  });

test('шинэ харилцагч бүртгэмэгц ТҮҮНИЙ хуудас руу орно',
  async ({ managerPage }) => {
    const name = `Шинэ Түрээслэгч ${uniq()}`;
    const list = new ClientsPage(managerPage);
    await list.goto();
    const modal = await clickToOpen(list.newClientButton,
      managerPage.getByRole('dialog').filter({ hasText: 'Шинэ харилцагч' }),
      'Шинэ харилцагч цонх');
    await modal.getByLabel('Компанийн нэр *').fill(name);
    await modal.getByRole('button', { name: 'Бүртгэх' }).click();

    await managerPage.waitForURL(/\/clients\/\d+$/);
    await expect(managerPage.getByRole('heading', { level: 1 })).toContainText(name);
    /* Гэрээгүй харилцагч дээр «Хамтран ажилласан» гэж БИЧИХГҮЙ — тэдэнтэй
       хараахан ямар ч ажил хийгээгүй (өмнө нь өнөөдрийн огноо гардаг байв). */
    await expect(managerPage.getByText(/Хамтран ажилласан/),
      'гэрээгүй харилцагч дээр «Хамтран ажилласан» гарлаа').toHaveCount(0);
    /* Наалдсан зүйлгүй тул устгах хаалга нээлттэй. */
    await expect(managerPage.getByRole('button', { name: 'Харилцагч устгах' })).toBeVisible();
  });

test('компанийн нэр хуудсан дээрээ засагдана (хоёр алхам)',
  async ({ managerPage, data }) => {
    const client = await data.createClient(`Буруу Бичсэн ${uniq()}`);
    const fixed = `Зөв Бичсэн ${uniq()}`;
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    await managerPage.getByRole('button', { name: /^Компанийн нэр: .* · засах$/ }).click();
    await managerPage.getByLabel('Компанийн нэр — шинэ утга').fill(fixed);
    await managerPage.getByRole('button', { name: 'Хадгалахаар үргэлжлүүлэх' }).click();
    await managerPage.getByRole('button', { name: 'Нэрийг солих уу?' }).click();

    await expect(managerPage.getByRole('heading', { level: 1 })).toContainText(fixed);
    await expect(managerPage.getByRole('status')
      .filter({ hasText: `Компанийн нэр засагдлаа — ${fixed}` }),
      'нэр солигдсоны зурвас гарсангүй').toBeVisible();
  });

test('илүү төлөлт нь толгой дээрээ БҮТЭН дүнгээрээ зогсоно',
  async ({ managerPage, data }) => {
    const client = await data.createClient(`Илүү Төлөгч ${uniq()}`);
    /* Гэрээгүй харилцагч руу орсон мөнгө — хуваарилах нэхэмжлэл алга. */
    await data.registerPayment({ clientId: client.id, amount: 78_165_000 });
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    await expect(managerPage.getByText(
      'Илүү төлөлт (кредит): 78,165,000₮ — дараагийн нэхэмжлэлээс хасагдана'),
      'илүү төлөлтийн мөр толгой дээр гарсангүй').toBeVisible();
    await expect(managerPage.getByRole('heading', { level: 1 }),
      'авлага 0 атал төлөв нь «Хэвийн» гэж зогсов').toContainText('Кредиттэй');

    /* Тэг авлага дээр «0₮» гэсэн мөр ХОЁР удаа дараалахаа болив (дугуйлсан
       ба бүтэн хоёр нь ижил тул хоёр дахь мөр унана). Бүтэн МӨР-өөр тоолно:
       «78,165,000₮» дотор «0₮» гэсэн хэсэг байдаг. */
    const stat = profile.stat('Авлага');
    const zeroLines = (await stat.innerText()).split('\n')
      .filter((s) => s.trim() === '0₮');
    expect(zeroLines.length, '«0₮» хоёр удаа дараалж зогслоо').toBe(1);
  });

test('амлалт профайлаас бичигдэж, «Авлага цуглуулах» дээр ч гарна',
  async ({ managerPage, data }) => {
    const { client } = await data.rentSetup({ qty: 20, dailyRate: 330, startDaysAgo: 60 });
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    await expect(managerPage.getByRole('heading', { name: 'Амлалт · холбоо барьсан түүх' }),
      'амлалтын самбар профайл дээр алга').toBeVisible();

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Амлалт бичих' }),
      managerPage.getByRole('dialog').filter({ hasText: `Тэмдэглэл — ${client.name}` }),
      'Амлалт бичих цонх');
    await modal.getByLabel('Юу ярьсан бэ?').fill('Даваа гарагт 5 сая шилжүүлнэ гэв');
    await modal.getByLabel('Амлах дүн ₮').fill('5000000');
    await modal.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(modal).toBeHidden();

    /* САМБАР дээр — тэр харилцагч руу дахин залгахаасаа өмнө уншина.
       (`exact` — зурвас нь мөн ижил өгүүлбэрийг агуулна.) */
    await expect(managerPage.getByText('Даваа гарагт 5 сая шилжүүлнэ гэв',
                                       { exact: true }),
      'амлалт самбар дээр гарсангүй').toBeVisible();
    await expect(managerPage.getByText('Амласан: 5,000,000₮')).toBeVisible();
    await expect(managerPage.getByRole('status')
      .filter({ hasText: /Амлалт бичигдлээ/ }), 'амлалтын зурвас гарсангүй').toBeVisible();

    /* «Авлага цуглуулах» нь ЯГ ижил мөрийг харна — нэг дэвтэр, хоёр дэлгэц. */
    await managerPage.goto('/collections');
    const row = managerPage.getByRole('row').filter({ hasText: client.name });
    await expect(row, 'харилцагч авлага цуглуулах жагсаалтад алга').toBeVisible();
    await expect(row, 'амлалт «Авлага цуглуулах» дээр гарсангүй')
      .toContainText('Даваа гарагт 5 сая шилжүүлнэ гэв');
  });

test('гарын үсэгтнийг идэвхгүй болгож, БУЦААЖ идэвхжүүлнэ',
  async ({ managerPage, data }) => {
    const client = await data.createClient(`Гарын үсэгтэй ${uniq()}`);
    await data.api.post(`/api/clients/${client.id}/contacts`, {
      data: { name: 'Н.Соль', role: 'Нярав', phone: '99966285', phone2: '',
              note: 'БЛҮҮМ-2!O39' } });
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    /* Excel-ийн нүдний хаяг нэрийн доор ГАРАХГҮЙ (машины тэмдэглэгээ). */
    await expect(managerPage.getByText('БЛҮҮМ-2!O39'),
      'нэрийн доор Excel-ийн нүдний хаяг гарлаа').toHaveCount(0);

    const off = await clickToOpen(
      managerPage.getByRole('button', { name: /^Идэвхгүй болгох/ }),
      managerPage.getByRole('dialog').filter({ hasText: 'Идэвхгүй болгох' }),
      'Идэвхгүй болгох цонх');
    await off.getByRole('button', { name: 'Идэвхгүй болгох' }).click();
    await expect(off).toBeHidden();
    await expect(managerPage.getByRole('status')
      .filter({ hasText: /Холбоо барих хүн идэвхгүй болов — Н.Соль/ })).toBeVisible();

    /* БУЦАЖ ИРЭХ ХААЛГА — өмнө нь байхгүй байсан тул ШИНЭ мөр нэмэхээс өөр
       гарцгүй байв (нэг Н.Соль хоёр болно). */
    const on = await clickToOpen(
      managerPage.getByRole('button', { name: /^Идэвхжүүлэх/ }),
      managerPage.getByRole('dialog').filter({ hasText: 'Идэвхжүүлэх' }),
      'Идэвхжүүлэх цонх');
    await on.getByRole('button', { name: 'Идэвхжүүлэх' }).click();
    await expect(on).toBeHidden();
    await expect(managerPage.getByRole('status')
      .filter({ hasText: /Холбоо барих хүн идэвхжлээ — Н.Соль/ })).toBeVisible();
    await expect(managerPage.getByRole('button', { name: /^Идэвхгүй болгох/ }),
      'идэвхжсэн хүн дээр «Идэвхгүй болгох» товч эргэж ирсэнгүй').toBeVisible();
  });

test('гараар бичсэн бичилтийн нэхэмжлэл нь «Хуучин үлдэгдэл» ГЭЖ НЭРЛЭГДЭХГҮЙ',
  async ({ managerPage, data }) => {
    const client = await data.createClient(`Бичилттэй ${uniq()}`);
    const label = 'Өнө Ордтой тооцоо — акт';
    const res = await data.api.post(`/api/clients/${client.id}/entries`, {
      /* ⚠ Эх сурвалж нь ҮЙЛДЛИЙН БҮРТГЭЛ рүү бичигддэг (`fixtures/data.ts`-ийн
         тайлбарыг үз): латин үсэгтэй дата нь /audit дээрх «англи үг алга»
         шүүлтийг ӨӨРӨӨ зөрчинө. Тиймээс кирилл нүдний хаяг. */
      data: { date: new Date().toISOString().slice(0, 10), amount: 139_648_000,
              kind: 'transfer', label,
              note: 'Шилжүүлэлт — хуучин системээс',
              ref: '2026 тооцоо!Р24 · Бутан-Өнөорд' } });
    expect(res.ok(), await res.text()).toBeTruthy();

    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);
    /* Тойм баганын «Нэхэмжлэлийн байдал» дээр — бичилт ӨӨРИЙНХӨӨ шошгоор.
       Урьд нь гэрээний дугаараар шийдэгддэг байсан тул хуучин үлдэгдлийн
       ЗОХИОМОЛ гэрээн дээр суусан бичилт бүр «Хуучин үлдэгдэл» болдог байв. */
    await expect(managerPage.getByText(label).first(),
      'бичилтийн шошго нэхэмжлэлийн нэр болсонгүй').toBeVisible();
    /* ⚠ «Хуучин үлдэгдэл» гэсэн үг ГЭРЭЭНИЙ нэр болж үлдэнэ (бичилт нь тэр
       зохиомол гэрээн дээр сууна — тийм л байх ёстой). БАРИХ зүйл нь
       НЭХЭМЖЛЭЛИЙН нэр: «Хуучин үлдэгдэл · 2026-09-01 хүртэл» гэсэн хос
       (үг + хамрах огноо) нь ЗӨВХӨН жинхэнэ OB нэхэмжлэлийнх. */
    await expect(managerPage.getByText(/Хуучин үлдэгдэл\s*·\s*\d{4}-\d{2}-\d{2} хүртэл/),
      'гараар бичсэн бичилт «Хуучин үлдэгдэл» гэж нэрлэгдлээ').toHaveCount(0);
  });

test('хуулга хэвлэх — сонгосон хугацаа нь хаяг руу яг тэр чигээрээ очно',
  async ({ managerPage, data }) => {
    const { client } = await data.rentSetup({ qty: 20, dailyRate: 330, startDaysAgo: 60 });
    const profile = new ClientProfilePage(managerPage);
    await profile.goto(client.id);

    /* Хүсэлтийг ЗӨВХӨН УНШИНА: PDF нь шинэ таб нээдэг тул дөрвөн хөтөч дээр
       өөр өөр зан гаргана. Серверийн тал доор, API-гаар шалгагдана. */
    await managerPage.route('**/statement-pdf*', (r) => r.abort());

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: 'Хуулга хэвлэх' }),
      managerPage.getByRole('dialog').filter({ hasText: 'Тооцооны хуулга хэвлэх' }),
      'Хуулга хэвлэх цонх');
    await expect(modal.getByText('Бүх хугацаа — эхний бичилтээс өнөөдрийг хүртэл'))
      .toBeVisible();

    await modal.getByRole('button', { name: 'Энэ сар' }).click();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    await expect(modal.getByText(`${from} – ${to}`)).toBeVisible();

    const waitReq = managerPage.waitForRequest(/statement-pdf/);
    await modal.getByRole('button', { name: 'Хэвлэх' }).click();
    const req = await waitReq;
    expect(req.url()).toContain(`/api/clients/${client.id}/statement-pdf`);
    expect(req.url()).toContain(`from=${from}`);
    expect(req.url()).toContain(`to=${to}`);
  });

test('хуулгын хаяг сервер дээр ҮНЭХЭЭР PDF буцаана', async ({ data }) => {
  const { client } = await data.rentSetup({ qty: 20, dailyRate: 330, startDaysAgo: 60 });
  const res = await data.api.get(`/api/clients/${client.id}/statement-pdf`);
  expect(res.ok(), `хуулга гарсангүй — ${res.status()} ${await res.text()}`).toBeTruthy();
  expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
});
