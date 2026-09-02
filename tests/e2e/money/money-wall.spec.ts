import { test, expect, USERS } from '../../fixtures';
import { request as apiRequest } from '@playwright/test';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { ContractsPage } from '../../pages/ContractsPage';
import { WarehousePage } from '../../pages/WarehousePage';

/**
 * МӨНГӨНИЙ ХАНА — гэрээний дэлгэрэнгүй дээр үйлдвэрийн дарга ₮ ХАРАХГҮЙ.
 *
 * Хана нь CSS БИШ: `serializers.factory_contract_detail` нь тариф, өдрийн
 * дүн, хуримтлал, нэхэмжлэл, төлбөр, барьцааг хариунаас БҮРМӨСӨН хасдаг.
 * Тиймээс энд гурван давхарга бий:
 *   1. даргын дэлгэц дээр ₮ алга (текст ба АТРИБУТ хоёулаа);
 *   2. даргын API хариунд мөнгөний ТҮЛХҮҮР алга;
 *   3. ЯГ ТЭР хуудсан дээр менежер мөнгөө ХАРНА — эс бөгөөс энэ тест хоосон
 *      хуудсан дээр ч ногоон болох байсан.
 */

/** Гэрээ №1 — «Алтан Гадас Констракшн», seed-ийн хамгийн том түрээс. */
const CONTRACT_ID = 1;

/** Даргын хариунаас ХАСАГДСАН байх ёстой түлхүүрүүд (`serializers._F_*`). */
const MONEY_KEYS = [
  'balance', 'penalty', 'penalty_booked', 'penalty_unbooked', 'penalty_percent',
  'day_amount', 'deposit', 'deposit_status', 'deposit_applied', 'deposit_returned',
  'vat_percent', 'invoices', 'payments', 'akt_entries', 'rate_changes', 'penalty_charges',
];
const ITEM_MONEY_KEYS = ['daily_rate', 'unit_price', 'orig_rate', 'day_amount',
                         'repair_fee', 'writeoff_price', 'sale_price'];
const LINE_MONEY_KEYS = ['rate', 'repair_fee', 'writeoff_fee', 'sale_fee'];

test('дарга гэрээний дэлгэрэнгүй дээр ₮ ОГТ харахгүй — текст ч, атрибут ч',
  async ({ factoryPage }) => {
    const detail = new ContractDetailPage(factoryPage);
    await detail.goto(CONTRACT_ID);

    /* Хуудас ҮНЭХЭЭР ачаалагдсаныг эхлээд батал: нэвтрэх дэлгэц дээр «₮ алга»
       гэдэг нь утгагүй ногоон гэрчилгээ. (Ролийн фикстур ч мөн үүнийг
       навигаци бүр дээр шалгадаг.) */
    await expect(detail.materialsHeading).toBeVisible();

    const leak = await detail.scanForTugrik();
    expect(leak.text, `дэлгэц дээр ₮ гарсан: ${leak.text.join(' | ')}`).toEqual([]);
    expect(leak.attributes,
      `атрибут дотор ₮ нуугдсан: ${leak.attributes.join(' | ')}`).toEqual([]);

    /* Хана нь харааг хаадаггүй гэдгийг ч батал — тоо, зэрэглэл, түүх нь
       даргын АЖИЛ тул байрандаа үлдэнэ. */
    await expect(detail.title).toContainText('Алтан Гадас');
  });

test('даргын API хариунд мөнгөний талбар ОГТ ирэхгүй', async ({ baseURL }) => {
  const anon = await apiRequest.newContext({ baseURL });
  const login = await anon.post('/api/auth/login', {
    data: { username: USERS.factory.username, password: USERS.factory.password },
  });
  const { token } = await login.json();
  await anon.dispose();

  const factory = await apiRequest.newContext({
    baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  try {
    const res = await factory.get(`/api/contracts/${CONTRACT_ID}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    for (const key of MONEY_KEYS) {
      expect(Object.keys(body), `«${key}» талбар даргын хариунд ирсэн`).not.toContain(key);
    }
    for (const item of body.items ?? []) {
      for (const key of ITEM_MONEY_KEYS) {
        expect(Object.keys(item), `материалын мөрөнд «${key}» ирсэн`).not.toContain(key);
      }
    }
    for (const mv of body.movements ?? []) {
      for (const line of mv.lines ?? []) {
        for (const key of LINE_MONEY_KEYS) {
          expect(Object.keys(line), `падангийн мөрөнд «${key}» ирсэн`).not.toContain(key);
        }
      }
    }
    /* Циклийн хуримтлал нь МӨНГӨ — хугацааны явц нь БИШ. Хугацаа үлдэнэ. */
    if (body.cycle) {
      expect(Object.keys(body.cycle)).not.toContain('accrued');
      expect(Object.keys(body.cycle)).not.toContain('day_amount');
      expect(body.cycle.days_total, 'циклийн явц даргаас ч хасагдчихлаа').toBeGreaterThan(0);
    }
    /* Түүний ажлын тоо нь ХЭВЭЭР — хариу хоосон болчихсонгүй. */
    expect(body.items?.length, 'даргад материалын мөр ирсэнгүй').toBeGreaterThan(0);
    expect(body.items[0].qty, 'тоо ширхэг ч хасагдчихлаа').toBeGreaterThan(0);
  } finally {
    await factory.dispose();
  }
});

test('ЯГ тэр хуудсан дээр менежер мөнгөө ХАРНА — хана ажиллаж байгаагийн эсрэг тал',
  async ({ managerPage }) => {
    const detail = new ContractDetailPage(managerPage);
    await detail.goto(CONTRACT_ID);

    const seen = await detail.scanForTugrik();
    expect(seen.text.length,
      'менежерт ч ₮ харагдахгүй байна — тест хоосон хуудас шалгаж байж мэднэ').toBeGreaterThan(0);

    /* Тодорхой тоо: «Нийт үлдэгдэл» нь бүтэн ₮-өөр зогсоно (дугуйлсан «сая»
       биш) — Отгоо яг хэдийг нэхэхээ эндээс уншина. */
    expect(await detail.balanceExact()).toBeGreaterThan(0);
    await expect(detail.metric('Өдрийн дүн')).toBeVisible();
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

test('дарга өөрийн талбай руугаа (Агуулах) ороход тоо нь бүрэн харагдана',
  async ({ factoryPage }) => {
    /* Хана нь «дарга юу ч харахгүй» гэсэн үг БИШ. Агуулах бол түүний өдөр
       тутмын дэлгэц — үлдэгдэл, түрээсэнд байгаа тоо нь бүрэн байх ёстой. */
    const warehouse = new WarehousePage(factoryPage);
    await warehouse.goto();
    expect(await warehouse.kpiQuantity('Агуулахад')).toBeGreaterThan(0);
    expect(await warehouse.kpiQuantity('Түрээсэнд гарсан')).toBeGreaterThan(0);
    await expect(warehouse.stocktakeLink).toBeVisible();
  });
