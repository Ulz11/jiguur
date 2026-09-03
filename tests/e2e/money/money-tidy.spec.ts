import { test, expect, USERS } from '../../fixtures';
import { request as apiRequest, type APIRequestContext, type Page } from '@playwright/test';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { ContractsPage } from '../../pages/ContractsPage';
import { WarehousePage } from '../../pages/WarehousePage';
import { expectReady, SEED } from '../../support/routes';
import { fullText } from '../../support/money';
import {
  expectFinanceAfter, expectFingerSized, expectTidyDefault, financeToggle, mapTugrik, openFinance,
} from '../../support/finance';

/**
 * МӨНГӨ ба ҮЙЛДВЭРИЙН ДАРГА — ХАНА БИШ, ЭМХ ЦЭГЦ.
 *
 * ⚠ ЭНЭ ФАЙЛ УРЬД НЬ `money-wall.spec.ts` НЭРТЭЙ, ЭСРЭГ ДҮРМИЙГ барьдаг байв:
 * «дарга `/contracts/1` дээр ₮ ОГТ харахгүй — текст ч, атрибут ч». Хана нь
 * сервер дээр байсан (`serializers.factory_contract_detail` талбар бүрийг
 * хасдаг), тиймээс даргаас «энэ гэрээ хэдэн төгрөгтэй вэ» гэж асуухад тэр
 * хариулах ЮМГҮЙ байв.
 *
 * ЭЗЭН 2026-09-д: «энэ бол ЭМХ ЦЭГЦНИЙ асуудал, нууцлалынх биш. Тэр
 * санхүүгийн талаар асуухад хариулж чаддаг байх ЁСТОЙ — зүгээр цэгцтэй байг».
 *
 * ШИНЭ ДҮРЭМ, тестийн хэлээр (`support/finance.ts`):
 *   1. АНХНЫ ТӨЛӨВТ түүний АЖЛЫН агуулгад ₮ БАЙХГҮЙ;
 *   2. хуудсан дээрх цорын ганц ₮ нь «Санхүү» задаргааны товч дээрх ГАНЦ
 *      хураангуй тоо (утгатай тоогүй дэлгэц дээр тэр ч байхгүй);
 *   3. задаргаа нь ХУМИГДСАН төрнө;
 *   4. нээхэд тоонууд ГАРЧ ИРНЭ — тэр хариулж чадна;
 *   5. задаргаа нь ажлынхаа агуулгын ХОЙНО зогсоно;
 *   6. ЗУРГААН дэлгэц дээр ЯГ ИЖИЛ хэлбэр (өөр өөр эмчилгээ = эмх цэгцгүй).
 *
 * Менежер, санхүүчийн дэлгэц ЮУ Ч ӨӨРЧЛӨГДӨӨГҮЙ — тэр нь эсрэг тал болж
 * энд мөн шалгагдана (эс бөгөөс «хоосон хуудас» ч ногоон болно).
 */

const CONTRACT_ID = SEED.contractId;   // №24/03 «Алтан Гадас Констракшн»
const CLIENT_ID = SEED.clientId;
const MATERIAL_ID = SEED.materialId;

/** Даргын хариунд БАЙХ ЁСТОЙ түлхүүрүүд (урьд нь ЭНЭ жагсаалт «байхгүй»-г барьдаг байв). */
const MONEY_KEYS = [
  'balance', 'penalty', 'penalty_booked', 'penalty_unbooked', 'penalty_percent',
  'day_amount', 'deposit', 'deposit_status', 'vat_percent',
  'invoices', 'payments', 'akt_entries', 'rate_changes', 'penalty_charges',
];
const ITEM_MONEY_KEYS = ['daily_rate', 'unit_price', 'orig_rate', 'day_amount',
                         'repair_fee', 'writeoff_price', 'sale_price'];
const LINE_MONEY_KEYS = ['rate', 'repair_fee', 'writeoff_fee'];

/** Тухайн ролиор нэвтэрсэн API контекст — токен нь UI-гийнхтэй ижил замаар. */
async function apiAs(baseURL: string | undefined, role: 'manager' | 'factory'):
  Promise<APIRequestContext> {
  const anon = await apiRequest.newContext({ baseURL });
  const login = await anon.post('/api/auth/login', {
    data: { username: USERS[role].username, password: USERS[role].password },
  });
  expect(login.ok(), `${role} нэвтэрсэнгүй`).toBeTruthy();
  const { token } = await login.json();
  await anon.dispose();
  return apiRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

/* ═══════════════ 1. СЕРВЕР — хана унасан, эрх нь хэвээр ═══════════════ */

test('даргын API хариунд мөнгөний талбар БҮГД ирнэ — асуухад хариулах юмтай',
  async ({ baseURL }) => {
    const factory = await apiAs(baseURL, 'factory');
    try {
      const res = await factory.get(`/api/contracts/${CONTRACT_ID}`);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();

      for (const key of MONEY_KEYS) {
        expect(Object.keys(body), `«${key}» талбар даргын хариунд ирсэнгүй`).toContain(key);
      }
      for (const item of body.items ?? []) {
        for (const key of ITEM_MONEY_KEYS) {
          expect(Object.keys(item), `материалын мөрөнд «${key}» ирсэнгүй`).toContain(key);
        }
      }
      for (const mv of body.movements ?? []) {
        for (const line of mv.lines ?? []) {
          for (const key of LINE_MONEY_KEYS) {
            expect(Object.keys(line), `падангийн мөрөнд «${key}» ирсэнгүй`).toContain(key);
          }
        }
      }
      if (body.cycle) {
        expect(Object.keys(body.cycle)).toContain('accrued');
        expect(body.cycle.days_total, 'циклийн явц алга').toBeGreaterThan(0);
      }
      /* Түүний ажлын тоо нь МӨН хэвээр — хариу «мөнгө болж хувираагүй». */
      expect(body.items?.length, 'даргад материалын мөр ирсэнгүй').toBeGreaterThan(0);
      expect(body.items[0].qty, 'тоо ширхэг алга болжээ').toBeGreaterThan(0);
    } finally {
      await factory.dispose();
    }
  });

test('даргын хариу нь менежерийнхтэй ЯГ ижил — рольд хамаарах салаа алга',
  async ({ baseURL }) => {
    const [factory, manager] = await Promise.all([
      apiAs(baseURL, 'factory'), apiAs(baseURL, 'manager'),
    ]);
    try {
      const [a, b] = await Promise.all([
        factory.get(`/api/contracts/${CONTRACT_ID}`).then((r) => r.json()),
        manager.get(`/api/contracts/${CONTRACT_ID}`).then((r) => r.json()),
      ]);
      expect(a).toEqual(b);
    } finally {
      await Promise.all([factory.dispose(), manager.dispose()]);
    }
  });

test('УНШИНА гэдэг нь ХӨДӨЛГӨНӨ гэсэн үг БИШ — мөнгөний зам даргад хаалттай',
  async ({ baseURL }) => {
    const factory = await apiAs(baseURL, 'factory');
    try {
      const d = await factory.get(`/api/contracts/${CONTRACT_ID}`).then((r) => r.json());
      const today = new Date().toISOString().slice(0, 10);
      const shut: [string, Record<string, unknown>][] = [
        ['/api/payments',
         { client_id: d.client_id, date: today, amount: 1000, method: 'CASH' }],
        [`/api/contracts/${CONTRACT_ID}/book-penalty`, { as_of: today }],
        [`/api/contracts/${CONTRACT_ID}/akt`, { date: today, amount: 1000, note: 'Тээвэр' }],
      ];
      for (const [path, data] of shut) {
        const r = await factory.post(path, { data });
        expect(r.status(), `${path} даргад нээлттэй байна`).toBe(403);
      }
      expect((await factory.get(`/api/contracts/${CONTRACT_ID}/close-preview`)).status()).toBe(403);
    } finally {
      await factory.dispose();
    }
  });

/* ═══════════════ 2. ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ — гол дэлгэц ═══════════════ */

test('гэрээ: даргын ажил цэвэр, мөнгө нь ХУМИГДСАН нэг тоон дор',
  async ({ factoryPage, baseURL }) => {
    const factory = await apiAs(baseURL, 'factory');
    const balance = await factory.get(`/api/contracts/${CONTRACT_ID}`)
      .then((r) => r.json()).then((d) => d.balance as number);
    await factory.dispose();
    expect(balance, 'тестийн суурь буруу — гэрээ үлдэгдэлгүй байна').toBeGreaterThan(0);

    const detail = new ContractDetailPage(factoryPage);
    await detail.goto(CONTRACT_ID);

    /* Түүний АЖИЛ нь эхэлж, байрандаа: материалын хүснэгт, хөдөлгөөний түүх. */
    await expect(detail.materialsHeading).toBeVisible();
    await expect(detail.title).toContainText('Алтан Гадас');

    /* НЭГ ТОО — дэлгэц дээрх цорын ганц ₮ нь гэрээний «Нийт үлдэгдэл»
       (H9: авлагын тухай асуултад НЭГ хариу, бүх дэлгэц дээр ижил). */
    await expectTidyDefault(factoryPage, 'гэрээний дэлгэрэнгүй',
                            `${fullText(balance)}₮`);
    await expectFinanceAfter(factoryPage, detail.materialsHeading, 'гэрээний дэлгэрэнгүй');
    await expectFingerSized(factoryPage, 'гэрээний дэлгэрэнгүй');
  });

test('гэрээ: задаргааг нээхэд тариф, нэхэмжлэл, төлбөр нь ГАРЧ ИРНЭ',
  async ({ factoryPage }) => {
    const detail = new ContractDetailPage(factoryPage);
    await detail.goto(CONTRACT_ID);

    const panel = await openFinance(factoryPage, 'гэрээний дэлгэрэнгүй');
    for (const block of ['Хураангуй', 'Тариф', 'Нэхэмжлэлүүд', 'Төлбөрүүд']) {
      await expect(panel.getByRole('heading', { name: block, exact: true }),
                   `«${block}» блок задаргаанд алга`).toBeVisible();
    }
    /* Нээсний дараа мөнгө нь ҮНЭХЭЭР гарч ирнэ — «хоосон хайрцаг» биш. */
    const map = await mapTugrik(factoryPage);
    expect(map.outside.length,
      'задаргаа нээгдсэн ч мөнгө гарч ирсэнгүй — дарга хариулах юмгүй хэвээр')
      .toBeGreaterThan(5);
    /* Хэв хашмалын тариф (330₮/ш/хоног) нь ЯГ энэ задаргаанаас уншигдана. */
    await expect(panel).toContainText('330');
  });

test('ЯГ ТЭР хуудсан дээр менежерийн харагдац ХӨНДӨГДӨӨГҮЙ',
  async ({ managerPage }) => {
    const detail = new ContractDetailPage(managerPage);
    await detail.goto(CONTRACT_ID);

    /* Мөнгө нь урьдын адил ИЛ — задаргаа ч түүнд байхгүй. */
    expect(await detail.balanceExact()).toBeGreaterThan(0);
    await expect(detail.metric('Өдрийн дүн')).toBeVisible();
    await expect(financeToggle(managerPage),
                 'менежерт «Санхүү» задаргаа гарчээ — түүний харагдац хөндөгдөх ёсгүй')
      .toHaveCount(0);
  });

test('менежер гэрээний жагсаалтаас дэлгэрэнгүй рүү орж мөнгөө хардаг',
  async ({ managerPage }) => {
    const list = new ContractsPage(managerPage);
    await list.goto();
    await expect(list.scopeSwitch).toBeVisible();
    await list.openContract('24/03', CONTRACT_ID);

    const detail = new ContractDetailPage(managerPage);
    await expect(detail.backLink).toBeVisible();
    expect(await detail.balanceExact()).toBeGreaterThan(0);
  });

/* ═══════════════ 3. ЗУРГААН ДЭЛГЭЦ — НЭГ ХЭЛБЭР ═══════════════ */

/**
 * Даргын навигацийн мөр дэх бүх дэлгэц.
 *
 * `summary`: `null` = энэ дэлгэц дээр НЭГ дүн болж нийлдэг мөнгө байхгүй тул
 * хураангуй тоо ЗОРИУДААР алга (байхгүй тоог зохиохоос нэрлэсэн хаалга дээр).
 * `work`: түүний ажлын агуулга — задаргаа нь ҮҮНИЙ ХОЙНО зогсох ёстой.
 */
const SURFACES: {
  path: string; heading: string | RegExp; where: string;
  summaryLabel: string | null; work: (p: Page) => ReturnType<Page['getByRole']>;
}[] = [
  { path: '/contracts', heading: 'Гэрээнүүд', where: 'Гэрээнүүд',
    summaryLabel: 'Нийт үлдэгдэл',
    work: (p) => p.getByRole('columnheader', { name: 'Гэрээ / Харилцагч' }) },
  { path: '/clients', heading: 'Харилцагч', where: 'Харилцагч',
    summaryLabel: 'Авлагын үлдэгдэл',
    work: (p) => p.getByRole('columnheader', { name: 'Идэвхтэй гэрээ' }) },
  { path: `/clients/${CLIENT_ID}`, heading: /Алтан Гадас/, where: 'Харилцагчийн профайл',
    summaryLabel: 'Авлагын үлдэгдэл',
    work: (p) => p.getByRole('heading', { name: 'Сүүлийн үйл явдлууд' }) },
  { path: '/warehouse', heading: 'Агуулах', where: 'Агуулах',
    summaryLabel: null,
    work: (p) => p.getByRole('columnheader', { name: 'Түрээсэнд' }) },
  { path: `/warehouse/materials/${MATERIAL_ID}`, heading: /Хэв хашмал/, where: 'Материал',
    summaryLabel: 'Суурь тариф',
    work: (p) => p.getByRole('heading', { name: /^Хуваарилалт/ }) },
  { path: '/barter', heading: 'Бартер', where: 'Бартер',
    summaryLabel: 'Хадгалагдаж буй хөрөнгө',
    work: (p) => p.getByRole('columnheader', { name: 'Хэвтсэн хугацаа' }) },
  { path: '/machines', heading: 'Механизм', where: 'Механизм',
    summaryLabel: 'Цэвэр ашиг',
    work: (p) => p.getByRole('heading', { name: /бичилтүүд$/ }) },
];

for (const s of SURFACES) {
  test(`${s.where}: ажил нь цэвэр, «Санхүү» нь хумигдсан — нэг л хэлбэр`,
    async ({ factoryPage }) => {
      await factoryPage.goto(s.path);
      await expectReady(factoryPage, s.heading, s.where);

      /* 1–3: ажлын агуулгад ₮ алга, задаргаа хумигдсан, хураангуй нь НЭГ тоо. */
      const map = await mapTugrik(factoryPage);
      expect(map.hasDisclosure, `${s.where}: «Санхүү» задаргаа алга`).toBe(true);
      expect(map.outside,
        `${s.where}: ажлын агуулгад ₮ гарсан — ${map.outside.join(' | ')}`).toEqual([]);
      expect(map.attributes,
        `${s.where}: атрибут дотор ₮ нуугдсан — ${map.attributes.join(' | ')}`).toEqual([]);
      if (s.summaryLabel === null) {
        expect(map.summary, `${s.where}: хураангуй тоогүй байх ёстой`).toEqual([]);
      } else {
        expect(map.summary, `${s.where}: хураангуй нь НЭГ тоо байх ёстой`).toHaveLength(1);
        await expect(financeToggle(factoryPage)).toContainText(s.summaryLabel);
      }

      const toggle = financeToggle(factoryPage);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(await toggle.getAttribute('aria-controls'),
        `${s.where}: хумигдсан атал холбоос заасан байна`).toBeNull();

      /* 5: задаргаа нь ажлын агуулгын ХОЙНО. */
      await expectFinanceAfter(factoryPage, s.work(factoryPage), s.where);
      /* §4: даргын хуруу — товч нь доод шатнаас намхан байж болохгүй. */
      await expectFingerSized(factoryPage, s.where);

      /* 4: нээхэд тоо нь ГАРЧ ИРНЭ. */
      const panel = await openFinance(factoryPage, s.where);
      const opened = await mapTugrik(factoryPage);
      expect(opened.outside.length,
        `${s.where}: задаргаа нээгдсэн ч мөнгө гарч ирсэнгүй`).toBeGreaterThan(0);
      await expect(panel).toBeVisible();
    });
}

test('зургаан дэлгэц дээр задаргаа НЭГ л нэртэй — өөр өөр эмчилгээ = эмх цэгцгүй',
  async ({ factoryPage }) => {
    for (const s of SURFACES) {
      await factoryPage.goto(s.path);
      await expectReady(factoryPage, s.heading, s.where);
      /* Хэлбэр нь гэрийн загвараар: `Chevron` + `aria-expanded` + нэр нь
         ҮРГЭЛЖ «Санхүү» (`lib/disclosure.ts`, `ui.tsx` FinanceDisclosure). */
      await expect(financeToggle(factoryPage),
                   `${s.where}: задаргаа нь өөр нэртэй/олон биет болжээ`).toHaveCount(1);
    }
  });

/* ═══════════════ 4. БАРТЕР — өмнөх «ПИН» шийдэгдэв ═══════════════ */

/**
 * ЭНЭ ТЕСТ НЭГ ПИНИЙГ СОЛЬЖ БАЙНА.
 *
 * `money-wall.spec.ts` дотор «ПИН: дарга Бартер хуудсан дээр компанийн ₮-г
 * ХАРСААР байна (шийдвэр хүлээж буй)» гэсэн тест байв: тэр үед хана нь
 * гэрээний дэлгэрэнгүй дээр бүтэн байсан атал Бартер хуудас нь хөрөнгийн
 * НИЙТ ҮНЭ, зарсан дүн, ОЛСОН АШГИЙГ даргын планшет дээр бүтнээр зурдаг
 * байсан — тэр зөрчлийг «эзний шийдвэр хүлээж» гэж тэмдэглэн барьсан.
 *
 * ШИЙДВЭР ГАРЛАА: хуудсыг хаахгүй (бартераар орсон материалыг агуулахад
 * тооцох нь ТҮҮНИЙ ажил), тоог нь ч булаахгүй — ЦЭГЦЛЭНЭ. Тиймээс пин
 * УСТАЖ, түүний оронд бусад дэлгэцтэй ЯГ ижил дүрэм тавигдав.
 */
test('Бартер: түүний ажил мөрөндөө, үнэ/ашиг нь задаргаанд — пин шийдэгдэв',
  async ({ factoryPage }) => {
    await factoryPage.goto('/barter');
    await expectReady(factoryPage, 'Бартер', 'Бартер');

    /* Түүний ажил: юу орж ирэв, хэдэн хоног хэвтэв, төлөв нь юу вэ. */
    await expect(factoryPage.getByRole('columnheader', { name: 'Хэвтсэн хугацаа' })).toBeVisible();
    await expect(factoryPage.getByRole('link', { name: 'Бартер' })).toBeVisible();

    /* Хураангуй нь ГАНЦ тоо: «Хадгалагдаж буй хөрөнгө» — «хэдэн төгрөг
       зарагдалгүй хэвтэж байна вэ» гэдэг бартерын гол асуулт. */
    await expectTidyDefault(factoryPage, 'Бартер');
    await expect(financeToggle(factoryPage)).toContainText('Хадгалагдаж буй хөрөнгө');

    const panel = await openFinance(factoryPage, 'Бартер');
    await expect(panel.getByRole('heading', { name: 'Хураангуй', exact: true })).toBeVisible();
    await expect(panel).toContainText('Хэрэгжсэн ашиг / алдагдал');

    /* ХУДАЛДАХ нь ЭРХ — задаргаа нээсэн ч гарахгүй (сервер ч 403). */
    await expect(factoryPage.getByRole('button', { name: 'Зарах' }),
                 'даргад «Зарах» товч гарчээ').toHaveCount(0);
  });

/* ═══════════════ 5. АГУУЛАХ — түүний талбай, тоо нь бүтэн ═══════════════ */

test('дарга өөрийн талбай (Агуулах) дээр тоогоо бүтнээр харна',
  async ({ factoryPage }) => {
    /* Эмх цэгц нь «дарга юу ч харахгүй» гэсэн үг БИШ: үлдэгдэл, түрээсэнд
       байгаа тоо нь түүний өдөр тутмын ажил тул мөрөндөө ил зогсоно. */
    const warehouse = new WarehousePage(factoryPage);
    await warehouse.goto();
    expect(await warehouse.kpiQuantity('Агуулахад')).toBeGreaterThan(0);
    expect(await warehouse.kpiQuantity('Түрээсэнд гарсан')).toBeGreaterThan(0);
    await expect(warehouse.stocktakeLink).toBeVisible();
  });
