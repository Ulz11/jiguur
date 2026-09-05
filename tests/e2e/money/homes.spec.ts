import { test, expect, type Page } from '../../fixtures';
import { ClientsPage } from '../../pages/ClientsPage';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen, clickToExpand } from '../../support/interact';
import { readReceipt } from '../../support/receipt';
import { parseTugrik, scaleOf } from '../../support/money';

/**
 * ГУРВАН ШИНЭ БАЙР — Отгоо эгчийн дэвтрээс алдагдаж байсан гурван факт.
 *
 *  1. БАРЬЦАА = ГҮЙДЭГ ДЭВТЭР (H8). Зулаа-3!G30 нь нэг тоо биш:
 *     «=20000000-8265000+3000000+3000000+10000000» — таван шийдвэр.
 *  2. ТҮРЭЭС БИШ БИЧИЛТ (H11). Бутан-Өнөорд!G23 = 164,492,000₮ олгосон зээл,
 *     C28 = 2,800,000₮ ажилчдын цалин, АшидДонж-11!P30 = 10,000,000₮ кран.
 *  3. «ТООЦОО НИЙЛСЭН» (№69). Хуудас бүр гарын үсгийн блокоор дуусдаг —
 *     тэр бол чимэг биш, ТӨЛӨВ.
 *
 * Гурвуулаа МӨНГӨ хөдөлгөдөг тул тестийн хэмжүүр нь ГАНЦ: **баримт дээр
 * бичигдсэн тоо ба гарсан үр дүн ХОСООРОО байх**. Баримт худал хэлэх нь
 * «товч ажиллахгүй байна»-аас хамаагүй аюултай: Отгоо арифметикээ нүдээрээ
 * шалгаад зөвшөөрөөд, өөр тоо гарна.
 */

/** Дэлгэц дээр зурагдсан авлагыг ХОЁР гадаргуугаас уншина (H9b). */
async function receivableOnBothSurfaces(page: Page, client: string) {
  const clients = new ClientsPage(page);
  await clients.goto();
  const list = await clients.receivableExact(client);

  await clients.openProfile(client);
  const profile = new ClientProfilePage(page);
  await profile.expectLoaded();
  return { list, profile: await profile.receivableExact() };
}

// ---------- 1. Барьцаа: байршуулав → суутгав ----------

test('барьцаа БАЙРШУУЛАВ → СУУТГАВ: баримтын тоо ба гарсан үлдэгдэл ХОСООРОО',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 60, qty: 40 });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* «Байршуулаагүй» нь 0₮ БИШ (№55) — явдалгүй гэрээнд ЗӨВХӨН
       «+ Байршуулах» гарна, «Суутгах» гарахгүй. */
    await expect(managerPage.getByRole('button', { name: '+ Байршуулах' })).toBeVisible();
    await expect(managerPage.getByRole('button', { name: '+ Суутгах' })).toBeHidden();

    const lodge = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Байршуулах' }),
      page.dialog('Барьцаа байршуулах'), 'Барьцаа байршуулах цонх');
    await lodge.getByLabel('Дүн ₮').fill('20000000');
    await lodge.getByRole('button', { name: 'Байршуулах' }).click();
    await expect(lodge, 'байршуулалтын цонх хаагдсангүй').toBeHidden();

    /* Дэвтэр нь одоо НЭГ мөртэй, үлдэгдэл нь 20 сая. */
    await expect(managerPage.getByText('Барьцааны үлдэгдэл')).toBeVisible();
    await expect(managerPage.getByRole('button', { name: /Барьцааны түүх/ })).toBeVisible();

    /* СУУТГАЛ нь МӨНГӨ хөдөлгөнө: FormModal → баримт → баталгаажуулалт. */
    const apply = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Суутгах' }),
      page.dialog('Барьцаанаас авлагад суутгах'), 'Суутгах цонх');
    await apply.getByLabel('Дүн ₮').fill('8265000');

    const form = await readReceipt(apply, 'суутгалын маягт');
    expect(form.money('Одоогийн барьцаа')).toBe(20_000_000);
    expect(form.totalMoney(), 'маягт дээрх «дараа нь» тоо').toBe(11_735_000);

    const confirm = await clickToOpen(
      apply.getByRole('button', { name: 'Үргэлжлүүлэх' }),
      page.dialog('Барьцаанаас авлагад суутгах').filter({ hasText: 'Суутгал нь ЖИНХЭНЭ' }),
      'суутгалын баталгаажуулалт');
    const receipt = await readReceipt(confirm, 'суутгалын баримт');
    const promised = receipt.totalMoney();
    expect(promised, 'баримт нь 20,000,000 − 8,265,000 гэж амлана').toBe(11_735_000);
    await confirm.getByRole('button', { name: 'Суутгах' }).click();
    await expect(confirm, 'баталгаажуулах цонх хаагдсангүй').toBeHidden();

    /* АМЛАЛТ ба ҮР ДҮН ХОСООРОО: серверийн үлдэгдэл нь баримтын тоо мөн үү. */
    const detail = await data.detail(contract.id);
    expect(detail.deposit, 'баримт 11,735,000₮ гэж амласан').toBe(promised);
    expect(detail.deposit_applied).toBe(8_265_000);
    expect(detail.deposit_status).toBe('held');

    /* Дэвтэр нь ХОЁР шийдвэрээ мөр мөрөөр нь авч явна — «5 үйл явдал 1 тоо
       болж нурав» гэдэг нь ЭНД зогсоно (H8). */
    await page.reload(contract.id);
    await clickToExpand(managerPage.getByRole('button', { name: /Барьцааны түүх/ }),
                        'Барьцааны түүх');
    const history = managerPage.getByRole('button', { name: /Барьцааны түүх/ })
      .locator('xpath=following-sibling::div[1]');
    /* `exact` — мөр бүрийн «Хүчингүй болгох» товч нь дуудагдах нэртээ ЯГ тэр
       үгсийг авч явдаг (sr-only), тул хэсэгчилсэн тохирол хоёр биет олдог. */
    await expect(history.getByText('Байршуулав', { exact: true })).toBeVisible();
    await expect(history.getByText('Авлагад суутгав', { exact: true })).toBeVisible();
    await expect(history.getByText('үлдэгдэл 11,735,000₮')).toBeVisible();
  });

// ---------- 2. Түрээс биш бичилт: авлага ХОЁР дэлгэц дээр ИЖИЛ ----------

test('олгосон зээл авлагыг ЯГ тэр дүнгээр, ХОЁР дэлгэц дээр ИЖИЛ хөдөлгөнө',
  async ({ managerPage, data }) => {
    /* ⚠ ТООНЫ СОНГОЛТ САНААТАЙ — ЗӨРҮҮТЭЙ ХЭМЖЭЭГ ЗОРИУДААР ТӨРҮҮЛНЭ.
       30ш × 330₮ = 9,900₮/хоног: гэрээ өөрөө бүхэлдээ 1 саяас доогуур, харин
       164,492,000₮ бичилтийн ДАРАА авлагын толгой нь «сая»-гийн шатанд
       үсэрч, циклийн хуримтлал нь мянгаараа үлдэнэ — ЯГ тэр «толгой сая /
       дэд мөр мянга» хос (бодит датад бараг мөр бүр дээр гардаг).
       Урьд нь энэ тест 400ш дээр гүйж тэр хосыг ЗАЙЛСХИЙДЭГ байсан
       (нэхэмжилсэн ба хуримтлал хоёул «сая»-д багтдаг) — дэд мөр нь
       толгойныхоо шатыг дагадаг болсон учир одоо БАРЬДАГ болов. */
    const { client } = await data.rentSetup({ startDaysAgo: 70, qty: 30 });
    const before = await receivableOnBothSurfaces(managerPage, client.name);
    expect(before.list, 'тулгах авлага 0 байна — тест юу ч баталахгүй').toBeGreaterThan(0);
    expect(before.profile, 'эхлэхдээ хоёр дэлгэц зөрлөө').toBe(before.list);

    /* Профайл дээрээ үлдээд «Бусад бичилт» таб руу. */
    const profile = new ClientProfilePage(managerPage);
    await profile.expectLoaded();
    await managerPage.getByRole('button', { name: /^Бусад бичилт/ }).click();

    const dialog = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Бичилт' }),
      managerPage.getByRole('dialog', { name: 'Бусад бичилт' }), 'Бусад бичилт цонх');

    await dialog.getByLabel('Дүн ₮').fill('164492000');
    await dialog.getByLabel('Юуны төлөө').fill('2025 онд бэлэн мөнгө зээлсэн');
    /* Эх сурвалж нь ҮЙЛДЛИЙН БҮРТГЭЛ рүү бичигдэнэ — хуудасны нүдний хаяг
       («Бутан-Өнөорд!G23») нь латин үсэгтэй тул тестийн дата нь /audit дээрх
       «англи үг алга» шүүлтийг өөрөө зөрчинө. Тиймээс энд кирилл эх сурвалж. */
    await dialog.getByLabel('Эх сурвалж').fill('Бутангуудын 2025 оны акт');

    /* Отгоо ХАСАХ ТЭМДЭГ бичихгүй — чиглэлээ товчоор хэлнэ. Анхны утга нь
       ДЕБИТ тул энд солихгүй; баримт нь чиглэлээ ӨӨРӨӨ хэлэх ёстой. */
    const form = await readReceipt(dialog, 'бичилтийн маягт');
    expect(form.money('Одоогийн авлага')).toBe(before.list);
    expect(form.totalMoney(), 'маягт «авлага болно» гэж амлана')
      .toBe(before.list + 164_492_000);

    const confirm = await clickToOpen(
      dialog.getByRole('button', { name: 'Үргэлжлүүлэх' }),
      managerPage.getByRole('dialog', { name: 'Бичилт хийх' }), 'бичилтийн баталгаажуулалт');
    const receipt = await readReceipt(confirm, 'бичилтийн баримт');
    const promised = receipt.totalMoney();
    expect(promised).toBe(before.list + 164_492_000);
    await confirm.getByRole('button', { name: 'Бичих' }).click();
    await expect(confirm, 'баталгаажуулах цонх хаагдсангүй').toBeHidden();

    /* ХОЁР ДЭЛГЭЦ, НЭГ ТОО — АМЛАСАН тоо (H9b). */
    const after = await receivableOnBothSurfaces(managerPage, client.name);
    expect({
      'Харилцагч (жагсаалт)': after.list,
      'Харилцагчийн профайл': after.profile,
    }).toEqual({
      'Харилцагч (жагсаалт)': promised,
      'Харилцагчийн профайл': promised,
    });

    /* НЭГ НҮД — НЭГ ХЭМЖҮҮР. Бичилт авлагыг «сая»-гийн шатанд өргөсөн ч
       циклийн хуримтлал нь мянгаараа үлдэнэ: тэр хоёр НЭГ нүдэнд зэрэгцэх
       тул дэд мөр нь ТОЛГОЙНХОО шатаар бичигдэх ёстой («0.11 сая₮» гэдэг
       богино ч бүрэн үнэн). Хуучин байдал: «165.2 сая₮» дээр «108,900₮». */
    const clients = new ClientsPage(managerPage);
    await clients.goto();
    const cell = clients.row(client.name).getByRole('cell').nth(2);
    const sub = cell.locator('[title^="Одоогийн цикл"]');
    await expect(sub, 'нэхэгдээгүй хуримтлалын дэд мөр алга').toBeVisible();
    const subExact = parseTugrik(await sub.getAttribute('title'), 'циклийн хуримтлал');
    expect(promised, 'толгой 1 саяас доогуур — шалгах ХЭЛБЭР төрсөнгүй')
      .toBeGreaterThanOrEqual(1_000_000);
    expect(subExact, 'хуримтлал 1 саяас дээш — шалгах ХЭЛБЭР төрсөнгүй')
      .toBeGreaterThan(0);
    expect(subExact, 'хуримтлал 1 саяас дээш — шалгах ХЭЛБЭР төрсөнгүй')
      .toBeLessThan(1_000_000);
    const head = (await cell.innerText()).split('\n')[0].trim();
    expect(scaleOf(head), `толгой «${head}» «сая»-гаар зурагдсангүй`).toBe('сая');
    expect(scaleOf((await sub.innerText()).trim()),
      `«${head}» дээр «${(await sub.innerText()).trim()}» — НЭГ нүдэнд ХОЁР хэмжүүр`)
      .toBe(scaleOf(head));

    /* Мөр нь дэвтэр дээрээ шошготойгоо, ± тэмдэгтэйгээ үлдэнэ. */
    await clients.openProfile(client.name);
    await profile.expectLoaded();
    await managerPage.getByRole('button', { name: /^Бусад бичилт/ }).click();
    const row = managerPage.getByRole('row')
      .filter({ hasText: '2025 онд бэлэн мөнгө зээлсэн' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Олгосон зээл')).toBeVisible();
    await expect(row.getByText('+164,492,000₮')).toBeVisible();
    /* СОЛИВ (2026-09, харилцагчийн дэлгэцийн засвар): «Эх сурвалж» (`ref`) нь
       дэлгэц дээр ГАРАХАА БОЛИВ. Шилжүүлсэн мөр бүр дээр тэр талбар нь
       Excel-ийн НҮДНИЙ ХАЯГ («2026 тооцоо!R24 · Бутан-Өнөорд») — Отгоо эгчийн
       мэдээлэл БИШ, машины ул мөр. Талбар нь өгөгдөл дээрээ бүтнээрээ үлдэж,
       ҮЙЛДЛИЙН БҮРТГЭЛД (audit) хэвээр бичигдэнэ — зөвхөн мөрийн доорх
       12px-ийн зогсоолоо алдав (`lib/entry.entrySubText`). */
    await expect(row.getByText('Бутангуудын 2025 оны акт'),
      'эх сурвалж мөрөн дээр эргэж гарлаа').toHaveCount(0);
    /* Түүний оронд БАРИМТЫН № зогсоно — тэр нь авлагад ЯГ хаана буусныг хэлнэ. */
    await expect(row.getByText(/^№A-\d+-\d+$/),
      'бичилтийн төрүүлсэн нэхэмжлэлийн № мөрөн дээр алга').toBeVisible();
  });

// ---------- 3. «Тооцоо нийлсэн» ----------

test('нэхэмжлэлийг «Тооцоо нийлсэн» гэж тэмдэглэвэл мөр дээрээ ХЭН, ХЭЗЭЭ гэдгээ авч явна',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 60, qty: 10 });
    const detail = await data.detail(contract.id);
    const inv = detail.invoices[detail.invoices.length - 1];
    expect(inv, 'нэхэмжлэл төрөөгүй байна').toBeTruthy();

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const row = page.invoiceRow(inv.id);
    await expect(row).toBeVisible();

    const dialog = await clickToOpen(
      row.getByRole('button', { name: 'Нийлсэн гэж тэмдэглэх' }),
      page.dialog('Тооцоо нийлсэн гэж тэмдэглэх'), 'Тооцоо нийлсэн цонх');

    /* Мөнгө ХӨДӨЛДӨГГҮЙ тул улаан БИШ — гэхдээ дүнгээ баримт дээр харуулна. */
    const receipt = await readReceipt(dialog, 'нийлсэн тэмдгийн баримт');
    expect(receipt.money(/Үлдэгдэл/)).toBe(Math.round(inv.outstanding));

    await dialog.getByLabel('Хэн гарын үсэг зурсан').fill('Н.Манлай');
    await dialog.getByLabel('Огноо').fill('2026-07-20');
    await dialog.getByRole('button', { name: 'Тэмдэглэх' }).click();
    await expect(dialog, 'тэмдэглэх цонх хаагдсангүй').toBeHidden();

    await expect(row.getByText('✓ Тооцоо нийлсэн 2026-07-20 · Н.Манлай')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Нийлсэн гэж тэмдэглэх' })).toBeHidden();
    await expect(row.getByRole('button', { name: 'Нийлснийг цуцлах' })).toBeVisible();

    /* Сервер ч мөн адил санана — дэлгэцийн тэмдэг ба төлөв ХОСООРОО. */
    const after = await data.detail(contract.id);
    const same = after.invoices.find((i: { id: number }) => i.id === inv.id);
    expect(same.agreed_at).toBe('2026-07-20');
    expect(same.agreed_by).toBe('Н.Манлай');
  });

test('«Тооцоо нийлсэн» тэмдгийг цуцлахад дүн нь ХЭВЭЭР үлдэнэ',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 60, qty: 10 });
    const detail = await data.detail(contract.id);
    const inv = detail.invoices[detail.invoices.length - 1];
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const row = page.invoiceRow(inv.id);

    const mark = await clickToOpen(
      row.getByRole('button', { name: 'Нийлсэн гэж тэмдэглэх' }),
      page.dialog('Тооцоо нийлсэн гэж тэмдэглэх'), 'Тооцоо нийлсэн цонх');
    await mark.getByLabel('Хэн гарын үсэг зурсан').fill('Н.Манлай');
    await mark.getByRole('button', { name: 'Тэмдэглэх' }).click();
    await expect(mark).toBeHidden();

    const total = await row.getByRole('cell').nth(1).innerText();
    const cancel = await clickToOpen(
      row.getByRole('button', { name: 'Нийлснийг цуцлах' }),
      page.dialog('Нийлсэн тэмдгийг цуцлах'), 'Нийлснийг цуцлах цонх');
    await cancel.getByLabel('Шалтгаан').fill('тоо зөрж байсан');
    await cancel.getByRole('button', { name: 'Цуцлах' }).click();
    await expect(cancel).toBeHidden();

    await expect(row.getByText(/Тооцоо нийлсэн/)).toBeHidden();
    expect(parseTugrik((await row.getByRole('cell').nth(1).innerText()).split('\n')[0],
                       'нэхэмжлэлийн дүн'),
           'тэмдэг цуцлахад ДҮН өөрчлөгдөх ёсгүй')
      .toBe(parseTugrik(total.split('\n')[0], 'нэхэмжлэлийн дүн'));
  });
