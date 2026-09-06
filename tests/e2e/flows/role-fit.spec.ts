import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen } from '../../support/interact';
import { expectReady } from '../../support/routes';
import { openNavigation } from '../../support/shell';

/**
 * РОЛЬ ↔ ЗАГВАР ЗӨРӨӨ — «дэлгэц нэг юм хэлж, сервер өөр юм хийдэг» газрууд.
 *
 * Хоёр төрлийн эвдрэл, хоёулаа ижил үндэстэй: ХУДАЛ АМЛАЛТ.
 *
 *   · БАЙХ ЁСГҮЙ ТОВЧ. Санхүүчид «+ Шинэ гэрээ» гарч байв: тэр дарж,
 *     харилцагч, материал, тариф бөглөж дуустлаа явуулаад л 403 иднэ.
 *     Даргад харилцагчийн Регистр/Утас нь тасархай зураастай — дарж,
 *     бичиж, ✓ дараад улаан зурвас уншина.
 *   · БАЙХ ЁСТОЙ АТЛАА БАЙХГҮЙ ТОВЧ. Буцаалтыг талбай дээр бүртгэдэг нь
 *     ДАРГА («40ш» гэж бичээд 38 байсныг олох нь өдөр бүрийн явдал) ч
 *     тоог нь засах зам түүнд байгаагүй — ганц гарц нь Отгоо руу залгах.
 *
 * Дөрөв дэх нь БҮРТГЭЛ: тооллого хийсэн хүн үр дүнгээ хардаггүй байв.
 */

const NEW_CONTRACT = '+ Шинэ гэрээ';

test.describe('шинэ гэрээ — зөвхөн менежерийн товч', () => {
  test('санхүүчид Удирдлагын төв ба Гэрээнүүд дээр товч ГАРАХГҮЙ',
    async ({ financePage }) => {
      await financePage.goto('/');
      await expectReady(financePage, 'Удирдлагын төв', 'Удирдлагын төв');
      await expect(financePage.getByRole('link', { name: NEW_CONTRACT }),
        'санхүүчид «+ Шинэ гэрээ» гарлаа — сервер түүнийг 403-оор хаадаг').toHaveCount(0);

      await financePage.goto('/contracts');
      await expectReady(financePage, 'Гэрээнүүд', 'Гэрээнүүд');
      await expect(financePage.getByRole('link', { name: NEW_CONTRACT }),
        'Гэрээнүүд дээр санхүүчид «+ Шинэ гэрээ» гарлаа').toHaveCount(0);
    });

  test('хаягаар шууд орсон санхүүчийг ЗУРВАСТАЙГАА буцаана',
    async ({ financePage }) => {
      await financePage.goto('/contracts/new');
      /* Хаалттай зам → Удирдлагын төв, ЯАГААД гэдгээ авчирна (`lib/guard.ts`).
         Урьд нь маягт нээгдэж, бөглөсний ДАРАА л 403 иддэг байв. */
      await expectReady(financePage, 'Удирдлагын төв', 'Удирдлагын төв');
      await expect(financePage.getByText(/зөвхөн менежер/),
        'хаалтын шалтгаан нэрлэгдсэнгүй').toBeVisible();
    });

  test('Отгоод хоёр хуудсан дээр ХЭВЭЭР', async ({ managerPage }) => {
    await managerPage.goto('/');
    await expectReady(managerPage, 'Удирдлагын төв', 'Удирдлагын төв');
    await expect(managerPage.getByRole('link', { name: NEW_CONTRACT })).toBeVisible();
  });
});

test('харилцагчийн Регистр · Хариуцагч · Утас — даргад ЖИРИЙН ТЕКСТ',
  async ({ factoryPage, managerPage, data }) => {
    const client = await data.createClient();

    await factoryPage.goto(`/clients/${client.id}`);
    await expectReady(factoryPage, new RegExp(client.name.slice(0, 6)), 'харилцагчийн хуудас');
    for (const field of ['Регистр', 'Хариуцагч', 'Утас', 'Тэмдэглэл']) {
      await expect(factoryPage.getByRole('button', { name: new RegExp(`^${field}:`) }),
        `даргад «${field}» засварын товч гарлаа — сервер 403 буцаадаг`).toHaveCount(0);
    }
    /* Талбарууд нь УНШИГДАХ хэвээр: нуух биш, ЗАСВАРЫГ л хаасан. */
    await expect(factoryPage.getByText('Регистр:'), 'Регистр мөр огт алга болжээ').toBeVisible();

    /* Отгоод ЯГ тэр гурав засагдсан хэвээр. */
    await managerPage.goto(`/clients/${client.id}`);
    await expectReady(managerPage, new RegExp(client.name.slice(0, 6)), 'харилцагчийн хуудас');
    await expect(managerPage.getByRole('button', { name: /^Утас:/ }),
      'Отгоогийн утас засварын зам хаагдчихжээ').toBeVisible();
  });

test('дарга ӨӨРИЙН бүртгэсэн буцаалтын ТООГ дэвтэр дээрээсээ засна',
  async ({ factoryPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 10, qty: 100 });
    await data.addMovement(contract.id, {
      type: 'RETURN', date: data.isoDaysAgo(0),
      lines: [{ material_id: contract.materialId, grade_id: contract.gradeId, qty: 40 }],
    });
    const detail = await data.detail(contract.id);
    const item = detail.items[0];

    const page = new ContractDetailPage(factoryPage);
    await page.goto(contract.id);
    const ledger = await page.openLedger(item.material, item.grade ?? '',
                                         `${contract.materialId}:${contract.gradeId}`);

    /* ТАРИФ нь МӨНГӨ — даргад багана нь ч байхгүй. ТОО нь түүний ажил. */
    const qtyEdit = ledger.getByRole('button', { name: /· Буцаалт — тоо: −40 · засах$/ });
    await expect(qtyEdit, 'даргад буцаалтын тоог засах зам алга').toBeVisible();

    const field = factoryPage.getByLabel(/· Буцаалт — тоо — шинэ утга$/);
    await clickToOpen(qtyEdit, field, 'буцаалтын тооны засвар');
    await field.fill('38');
    const confirm = factoryPage.getByRole('button', { name: 'Тоо солих уу?' });
    await clickToOpen(factoryPage.getByRole('button', { name: 'Хадгалахаар үргэлжлүүлэх' }),
                      confirm, 'тоо солих баталгаажуулалт');
    await confirm.click();

    /* Талбарын доорх улаан мөр гарах ЁСГҮЙ — сервер энэ мөрийг түүнд нээсэн. */
    await expect(factoryPage.locator('.inline-edit-err'),
      'сервер даргын засварыг татгалзлаа').toHaveCount(0);
    await expect.poll(async () => {
      const d = await data.detail(contract.id);
      return d.movements.find((m: any) => m.type === 'RETURN').lines[0].qty;
    }, { message: 'даргын засвар сервер дээр суусангүй' }).toBe(38);
  });

test('ОЛГОЛТЫН мөр даргад ЗАСАГДАХГҮЙ — падан, тариф нь мөнгөний ертөнц',
  async ({ factoryPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 10, qty: 100 });
    const detail = await data.detail(contract.id);
    const item = detail.items[0];

    const page = new ContractDetailPage(factoryPage);
    await page.goto(contract.id);
    const ledger = await page.openLedger(item.material, item.grade ?? '',
                                         `${contract.materialId}:${contract.gradeId}`);
    await expect(ledger.getByRole('button', { name: /Ачилт — тоо: .* · засах$/ }),
      'даргад олголтын тоог засах товч гарлаа — сервер 403 буцаадаг').toHaveCount(0);
    /* Отгоогийн бүртгэсэн хөдөлгөөний ОГНОО ч түүнд хаалттай. */
    await page.openMovement(detail.movements[0].id, detail.movements[0].date, 'Ачилт');
    await expect(factoryPage.getByRole('button', { name: /— огноо: .* · засах$/ }),
      'бусдын хөдөлгөөний огноо даргад засагдахаар байна').toHaveCount(0);
  });

test('«Миний бүртгэл» — хүн бүр өөрийн үлдээсэн мөрөө уншина',
  async ({ factoryPage, managerPage }) => {
    /* Дарга нэвтэрсэн байна → /audit дээр ядаж «Нэвтрэв» мөр бий. */
    await factoryPage.goto('/');
    await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');
    /* 840px-ээс доош (даргын iPad) цэс нь ХАВТАС — эхлээд нээнэ. */
    await (await openNavigation(factoryPage)).getByRole('link', { name: 'Миний бүртгэл' }).click();
    await expectReady(factoryPage, 'Миний бүртгэл', 'Миний бүртгэл');
    /* Бүх мөр НАДАЛХ тул «Хэн» багана ч, «Хэн хийсэн» шүүлт ч байхгүй. */
    await expect(factoryPage.getByRole('columnheader', { name: 'Хэн' }),
      '«Миний бүртгэл» дээр «Хэн» багана үлджээ').toHaveCount(0);
    await expect(factoryPage.getByLabel('Хэн хийсэн'),
      '«Миний бүртгэл» дээр «Хэн хийсэн» шүүлт үлджээ').toHaveCount(0);
    /* Мөр нь ҮНЭХЭЭР байна: нэвтрэлт бүр бүртгэлд мөр үлдээдэг. Хажуугийн
       цэсэн дэх ролийн шошгоор биш, ХҮСНЭГТИЙН нүднээс баталъя. */
    await expect(factoryPage.getByRole('cell', { name: /Нэвтрэв/ }).first(),
      'даргын өөрийн мөр олдсонгүй').toBeVisible();

    /* Эзний чип нь БҮТЭН бүртгэл рүү — тэр хуудас түүнийх. */
    await managerPage.goto('/');
    await expectReady(managerPage, 'Удирдлагын төв', 'Удирдлагын төв');
    await (await openNavigation(managerPage)).getByRole('link', { name: 'Миний бүртгэл' }).click();
    await expectReady(managerPage, 'Үйлдлийн бүртгэл', 'Үйлдлийн бүртгэл');
    expect(managerPage.url(), 'менежер «миний» хуудас руу шидэгджээ').toContain('/audit');
    expect(managerPage.url()).not.toContain('/audit/mine');
  });

test('тооллого хийсэн ДАРГА үр дүнгээ бүртгэлээсээ хардаг',
  async ({ factoryPage, data }) => {
    /* 40 минут тоолсны дараа «суусан уу?» гэдгийг зөвхөн утсаар мэддэг
       байв: үр дүнгийн холбоос нь ЗӨВХӨН менежерт гардаг байсан (бүтэн
       бүртгэл түүнд хаалттай тул худал холбоос болох байсан). Одоо түүний
       ӨӨРИЙН бүртгэл рүү очно. */
    const material = await data.createMaterial({ onHand: 40 });

    await factoryPage.goto('/warehouse/stocktake');
    await expectReady(factoryPage, 'Тооллого', 'Тооллого');
    await factoryPage.getByLabel('Материал хайх').fill(material.name);
    await factoryPage.getByLabel(new RegExp(`${material.name}.*тоолсон тоо`, 'i')).first()
      .fill('33');
    await factoryPage.getByRole('button', { name: '✓ Тооллого дуусгах' }).click();

    const link = factoryPage.getByRole('link', { name: /энэ тооллогыг харах/ });
    await expect(link, 'тоолсон хүнд үр дүнгийн зам үлдсэнгүй').toBeVisible();
    await expect(link, 'даргыг хаалттай бүтэн бүртгэл рүү илгээж байна')
      .toHaveText(/Миний бүртгэлээс/);

    await link.click();
    await expectReady(factoryPage, 'Миний бүртгэл', 'Миний бүртгэл');
    await expect(factoryPage.getByText(material.name).first(),
      'тооллогын мөр даргын бүртгэлээс олдсонгүй').toBeVisible();
  });
