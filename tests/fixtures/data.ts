import { expect, request as playwrightRequest,
         type APIRequestContext, type APIResponse } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test as authTest, USERS } from './auth';

/**
 * Тестийн ӨӨРИЙН дата — REST API-гаар, менежерийн эрхээр.
 *
 * ЯАГААД: `fullyParallel` дээр дөрвөн проект нэг backend дээр зэрэг гүйнэ.
 * Хэрэв тестүүд seed-ийн «Алтан Гадас» дээр бичвэл бие биенийхээ тоог
 * хөдөлгөнө. Тест бүр ӨӨРИЙН харилцагч, ӨӨРИЙН гэрээтэй байх ёстой.
 *
 * Гэрээний дугаар нь мөргөлдөхгүй: сервер автоматаар `26/07` маягаар өгдөг
 * бөгөөд зэрэг ирсэн хоёр хүсэлт ижил дугаар сонгож болно. Тиймээс ӨӨРСДӨӨ
 * `E2E-<uuid>` дугаар өгнө.
 *
 * МӨНГӨ ХӨДӨЛГӨДӨГ тестүүд (цуцлалт, алданги, акт, хаалт) нь бүр цаашаа
 * явна: ӨӨРИЙН МАТЕРИАЛ хүртэл үүсгэнэ (`createMaterial`). Нөөц (`Stock`)
 * нь материал×зэрэглэл бүрд ГАНЦ мөр тул seed-ийн хэвийг хуваалцсан хоёр
 * тест бие биенийхээ агуулахын тоог хөдөлгөнө — «нөөц буцаж ирэв үү» гэсэн
 * баталгаа тэр үед уралдаанаас хамаарна. Өөрийн материал дээр НБҮнэ,
 * худалдах үнэ, засварын хөлс ч ТОДОРХОЙ болно: `тоо × үнэ` гэсэн үржвэрийг
 * тест мэдэж байж л «wizard-ийн амласан дүн ба гарсан дүн тэнцэв» гэж хэлж
 * чадна.
 */

export type CreatedClient = { id: number; name: string };
export type CreatedMaterial = {
  id: number;
  name: string;
  gradeId: number;
  grade: string;
  baseRate: number;
  repairFee: number;
  /** Дансны/нөхөн үнэ — ДУТАГДУУЛСАН гарц үүгээр нэхэгдэнэ (R13) */
  nbPrice: number;
  /** Худалдах үнэ — ХУДАЛДАА БОЛГОХ гарц үүгээр нэхэгдэнэ (H7) */
  salePrice: number;
  onHand: number;
};
export type CreatedContract = {
  id: number;
  no: string;
  clientId: number;
  materialId: number;
  gradeId: number;
  qty: number;
  dailyRate: number;
  penaltyPercent: number;
  startDate: string;
};

export type RentSetup = {
  client: CreatedClient;
  contract: CreatedContract;
  movementId: number;
  invoices: number;
  /** Өөрийн материал үүсгэсэн бол — үнэ нь тестэд хэрэгтэй */
  material?: CreatedMaterial;
};

type MovementLineIn = {
  material_id: number;
  grade_id: number;
  qty: number;
  rate?: number;
  issue_line_id?: number;
  return_grade_id?: number;
  repair_qty?: number;
  writeoff_qty?: number;
  billed_days_override?: number | null;
};

export type DataFactory = {
  /** Түүхий API — өөр endpoint шалгах хэрэгтэй үед. */
  api: APIRequestContext;
  isoDaysAgo(days: number): string;
  createClient(name?: string): Promise<CreatedClient>;
  /**
   * ӨӨРИЙН материал + зэрэглэлийн үнэ + агуулахын үлдэгдэл.
   * Тест бүр өөрийн нөөцтэй болно — «нөөц буцлаа» гэдэг баталгаа
   * зэрэгцээ гүйлтээс хамаарахаа болино.
   */
  createMaterial(opts?: {
    baseRate?: number; repairFee?: number; nbPrice?: number;
    salePrice?: number; onHand?: number;
  }): Promise<CreatedMaterial>;
  /** Агуулахад хангалттай үлдэгдэлтэй SEED материал+зэрэглэл сонгоно. */
  pickMaterial(minQty: number): Promise<{ materialId: number; gradeId: number; name: string }>;
  createRentContract(opts: {
    clientId: number;
    startDaysAgo?: number;
    qty?: number;
    dailyRate?: number;
    cycleDays?: number;
    penaltyPercent?: number;
    materialId?: number;
    gradeId?: number;
  }): Promise<CreatedContract>;
  /** Гэрээний хүлээгдэж буй эхний ачилтыг баталгаажуулна (нөөц хөдөлж, тооцоо эхэлнэ). */
  confirmFirstShipment(contractId: number): Promise<number>;
  /** Дууссан цикл бүрд нэхэмжлэл төрүүлж, гэрээн дээрх НИЙТ тоог нь буцаана. */
  generateInvoices(contractId: number): Promise<number>;
  /**
   * Бүтэн гинж: харилцагч → түрээсийн гэрээ (материалтай) → баталгаажсан
   * ачилт → нэхэмжлэл. `startDaysAgo` нь анхдагчаар 60 — хоёр цикл хаагдаж,
   * эхнийх нь ХУГАЦАА ХЭТЭРСЭН болно (Авлага цуглуулах жагсаалтад орно).
   *
   * МАТЕРИАЛ нь анхдагчаар ӨӨРИЙНХ (`ownMaterial: false` гэвэл seed-ийнхээс
   * сонгоно) — тайлбарыг `ownMaterial`-ийн хэрэгжилтээс үз.
   */
  rentSetup(opts?: {
    startDaysAgo?: number; qty?: number; dailyRate?: number;
    penaltyPercent?: number; ownMaterial?: boolean;
    nbPrice?: number; salePrice?: number; repairFee?: number;
  }): Promise<RentSetup>;

  /* ---------- Мөнгө хөдөлгөх туслахууд ---------- */
  /** Гэрээний дэлгэрэнгүй — дэлгэц дээрх тоог СЕРВЕРИЙНХТЭЙ тулгахад. */
  detail(contractId: number): Promise<any>;
  /** Шинэ хөдөлгөөн (ISSUE/RETURN/SALE) — түүхий эрх. */
  addMovement(contractId: number, body: {
    type: 'ISSUE' | 'RETURN' | 'SALE' | 'WRITEOFF';
    date: string; note?: string; lines: MovementLineIn[];
  }): Promise<{ id: number; status: string }>;
  confirmMovement(movementId: number): Promise<void>;
  /** Хоёр дахь ПАДАН — өөр тарифаар, баталгаажсан. Мөрийн id-г буцаана. */
  issueLot(contractId: number, opts: {
    materialId: number; gradeId: number; qty: number; rate: number; daysAgo: number;
  }): Promise<{ movementId: number; lineId: number }>;
  registerPayment(opts: {
    clientId: number; contractId?: number | null; amount: number;
    date?: string; method?: 'CASH' | 'BANK' | 'BARTER'; barterDesc?: string;
  }): Promise<any>;
  addAkt(contractId: number, opts: { date: string; amount: number; note: string }): Promise<any>;
  bookPenalty(contractId: number, asOf?: string): Promise<any>;
  closePreview(contractId: number, closeDate?: string): Promise<any>;
};

/**
 * `days` хоногийн өмнөх огноо — ЛОКАЛ хуанлигаар.
 *
 * ⚠ `toISOString()` нь UTC руу хөрвүүлдэг: UTC+8 дээр шөнийн 00:00–08:00-д
 * тэр нь ӨМНӨХ ӨДРИЙГ буцаана. Тэгвэл гэрээ `n` биш `n+1` хоногийн өмнө
 * эхэлж, циклийн хил бүхэлдээ нэг хоногоор гулсана — «хугацаа хэтэрсэн
 * нэхэмжлэл хэд вэ», «алданги хэдэн хоног вэ» гэсэн баталгаанууд ШӨНӨ
 * гүйхэд өөр хариу өгнө. Backend нь `date.today()` (локал), хөтөч нь
 * `lib/schedule.todayIso()` (локал) — тест ч ижил хуанлигаар явна.
 */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * ТЭЭВРИЙН гэмтэлд ГАНЦ удаа дахин оролдоно.
 *
 * `keep-alive` холболтыг сервер хаах агшин ба клиент дараагийн хүсэлтээ
 * илгээх агшин давхацвал `ECONNRESET` гарна — энэ нь аппын БИШ, залгуурын
 * уралдаан (`--repeat-each=3` дээр 1600 гүйлтэд нэг удаа баригдсан). Тестийн
 * бэлтгэл нь идемпотент хүсэлтүүд тул дахин илгээх нь аюулгүй; аппын хариу
 * (4xx/5xx) нь ЭНД баригдахгүй — доорх `expect` нь тэднийг ХЭВЭЭР унагана.
 */
const TRANSPORT_ERR = /ECONNRESET|socket hang up|EPIPE|Connection closed|network error/i;

async function send(run: () => Promise<APIResponse>): Promise<APIResponse> {
  try {
    return await run();
  } catch (e: any) {
    if (!TRANSPORT_ERR.test(String(e?.message ?? e))) throw e;
    return run();
  }
}

async function ok(what: string, run: () => Promise<APIResponse>) {
  const res = await send(run);
  expect(res.ok(), `${what} — ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** Тестийн үүсгэсэн материалыг НЭРЭЭР нь таних тэмдэг. */
const E2E_MATERIAL_PREFIX = 'E2E-мат';

export function makeDataFactory(api: APIRequestContext): DataFactory {
  const factory: DataFactory = {
    api,
    isoDaysAgo,

    async createClient(name?: string) {
      const body = {
        name: name ?? `E2E ${randomUUID().slice(0, 8)}`,
        reg: '', person: 'Тест хариуцагч', phone: '9900-0000', note: 'E2E тестийн харилцагч',
      };
      const created = await ok('харилцагч үүсгэх', () => api.post('/api/clients', { data: body }));
      return { id: created.id, name: created.name };
    },

    async createMaterial({ baseRate = 330, repairFee = 12_000, nbPrice = 58_000,
                           salePrice = 69_500, onHand = 500 } = {}) {
      const grades = await ok('зэрэглэлийн жагсаалт', () => api.get('/api/grades'));
      expect(grades.length, 'зэрэглэл алга').toBeGreaterThan(0);
      const grade = grades[0];
      const name = `${E2E_MATERIAL_PREFIX} ${randomUUID().slice(0, 8)}`;
      const m = await ok('материал үүсгэх', () => api.post('/api/materials', {
        data: {
          name, category: 'Тестийн материал', code: '', unit: 'ш',
          base_rate: baseRate, repair_fee: repairFee,
          prices: [{ grade_id: grade.id, nb_price: nbPrice, sale_price: salePrice }],
        },
      }));
      await ok('нөөц тогтоох', () => api.post('/api/stock/adjust', {
        data: { material_id: m.id, grade_id: grade.id, on_hand: onHand },
      }));
      return { id: m.id, name, gradeId: grade.id, grade: grade.code,
               baseRate, repairFee, nbPrice, salePrice, onHand };
    },

    async pickMaterial(minQty: number) {
      const materials = await ok('каталог', () => api.get('/api/materials'));
      for (const m of materials) {
        /* Тестийн үүсгэсэн материалыг АЛГАСНА: тэдгээр нь эзэнтэй (нэг тест
           тэднийг бүхэлд нь тоолж байна) — хуваалцвал тусгаарлалт задарна. */
        if (String(m.name).startsWith(E2E_MATERIAL_PREFIX)) continue;
        for (const s of m.stock ?? []) {
          if (s.on_hand >= minQty) return { materialId: m.id, gradeId: s.grade_id, name: m.name };
        }
      }
      throw new Error(`Агуулахад ${minQty}ш байгаа материал олдсонгүй`);
    },

    async createRentContract({ clientId, startDaysAgo = 60, qty = 10, dailyRate = 330,
                               cycleDays = 30, penaltyPercent = 0,
                               materialId, gradeId }) {
      const mat = materialId && gradeId
        ? { materialId, gradeId }
        : await factory.pickMaterial(qty);
      const startDate = isoDaysAgo(startDaysAgo);
      const body = {
        client_id: clientId,
        type: 'rent',
        no: `E2E-${randomUUID().slice(0, 8)}`,
        start_date: startDate,
        end_date: null,
        cycle_days: cycleDays,
        cycle_mode: 'days',
        /* Алданги нь анхдагчаар 0 — H2/R25: систем ХЭЗЭЭ Ч өөрөө нэхэхгүй.
           Алдангийн хөшүүргийг шалгах тест л ЗОРИУД зэвсэглэнэ. */
        penalty_percent: penaltyPercent,
        deposit: 0,
        vat_percent: 0,
        note: 'E2E',
        items: [{ material_id: mat.materialId, grade_id: mat.gradeId, qty, daily_rate: dailyRate, unit_price: 0 }],
      };
      const created = await ok('гэрээ үүсгэх', () => api.post('/api/contracts', { data: body }));
      return {
        id: created.id, no: created.no, clientId,
        materialId: mat.materialId, gradeId: mat.gradeId, qty, dailyRate,
        penaltyPercent, startDate,
      };
    },

    async confirmFirstShipment(contractId: number) {
      const detail = await ok('гэрээ уншиx', () => api.get(`/api/contracts/${contractId}`));
      const pending = (detail.movements ?? []).find((m: any) => m.status === 'pending');
      expect(pending, 'хүлээгдэж буй ачилт олдсонгүй').toBeTruthy();
      await ok('ачилт баталгаажуулах', () => api.post(`/api/movements/${pending.id}/confirm`));
      return pending.id as number;
    },

    async generateInvoices(contractId: number) {
      await ok('нэхэмжлэл үүсгэх',
               () => api.post(`/api/contracts/${contractId}/generate-invoices`));
      /* ⚠ БАЙГАА нэхэмжлэлийн тоог буцаана, «би хэдийг үүсгэв»-ийг БИШ.
         `ensure_invoices` нь ОЛОН замаар дуудагддаг (`GET /api/clients` нь
         идэвхтэй гэрээ БҮРД, дашбоард, авлага цуглуулах…). Зэрэгцээ гүйж буй
         өөр тестийн хуудасны ачаалалт миний гэрээний нэхэмжлэлийг ӨМНӨ нь
         үүсгэчихвэл POST «created: 0» гэж буцаана — гэрээ нэхэмжлэлтэй атал
         «нэхэмжлэл төрөөгүй» гэсэн ХУДАЛ уналт болно. */
      const detail = await factory.detail(contractId);
      return (detail.invoices ?? []).length as number;
    },

    /* ⚠ `ownMaterial` нь анхдагчаар ҮНЭН — АГУУЛАХЫН НӨӨЦ ХУВААГДДАГГҮЙ.
       Seed-ийн хэв бүр тодорхой тооны ширхэгтэй бөгөөс тест бүр 10–40ш авч
       ЯВДАГ, буцаадаггүй. Зэрэгцээ гүйлт дээр «каталог уншиж → хамгийн эхний
       хүрэлцэх материалыг сонгож → гэрээ үүсгэх» гэсэн хоёр алхмын завсарт
       өөр тест тэр нөөцийг дуусгаж, гэрээ үүсгэх нь «агуулахад хүрэлцэхгүй»
       гэж унадаг байв (`--repeat-each=3` дээр баригдсан жинхэнэ уралдаан).
       Өөрийн материал нь энэ ангийн бүх флейкийг БҮТЦЭЭР нь хаана: нөөцийн
       мөр (материал × зэрэглэл) тухайн тестийнх, өөр хэн ч хүрэхгүй. */
    async rentSetup({ startDaysAgo = 60, qty = 10, dailyRate = 330, penaltyPercent = 0,
                      ownMaterial = true, nbPrice, salePrice, repairFee } = {}) {
      const client = await factory.createClient();
      const material = ownMaterial
        ? await factory.createMaterial({
            baseRate: dailyRate,
            ...(nbPrice !== undefined ? { nbPrice } : {}),
            ...(salePrice !== undefined ? { salePrice } : {}),
            ...(repairFee !== undefined ? { repairFee } : {}),
            onHand: Math.max(qty * 10, 200),
          })
        : undefined;
      const contract = await factory.createRentContract({
        clientId: client.id, startDaysAgo, qty, dailyRate, penaltyPercent,
        ...(material ? { materialId: material.id, gradeId: material.gradeId } : {}),
      });
      const movementId = await factory.confirmFirstShipment(contract.id);
      const invoices = await factory.generateInvoices(contract.id);
      return { client, contract, movementId, invoices, material };
    },

    async detail(contractId: number) {
      return ok('гэрээний дэлгэрэнгүй', () => api.get(`/api/contracts/${contractId}`));
    },

    async addMovement(contractId, body) {
      return ok(`${body.type} хөдөлгөөн үүсгэх`,
                () => api.post(`/api/contracts/${contractId}/movements`, { data: body }));
    },

    async confirmMovement(movementId: number) {
      await ok('хөдөлгөөн баталгаажуулах',
               () => api.post(`/api/movements/${movementId}/confirm`));
    },

    async issueLot(contractId, { materialId, gradeId, qty, rate, daysAgo }) {
      const mv = await factory.addMovement(contractId, {
        type: 'ISSUE', date: isoDaysAgo(daysAgo), note: 'E2E нэмэлт падан',
        lines: [{ material_id: materialId, grade_id: gradeId, qty, rate }],
      });
      await factory.confirmMovement(mv.id);
      const detail = await factory.detail(contractId);
      const found = (detail.movements ?? []).find((m: any) => m.id === mv.id);
      expect(found, 'нэмэлт падан олдсонгүй').toBeTruthy();
      return { movementId: mv.id, lineId: found.lines[0].id as number };
    },

    async registerPayment({ clientId, contractId = null, amount, date, method = 'BANK',
                            barterDesc = '' }) {
      return ok('төлбөр бүртгэх', () => api.post('/api/payments', {
        data: { client_id: clientId, contract_id: contractId, date: date ?? isoDaysAgo(0),
                amount, method, barter_desc: barterDesc, note: 'E2E' },
      }));
    },

    async addAkt(contractId, { date, amount, note }) {
      return ok('акт бичих',
                () => api.post(`/api/contracts/${contractId}/akt`, { data: { date, amount, note } }));
    },

    async bookPenalty(contractId, asOf) {
      return ok('алданги нэхэх', () => api.post(`/api/contracts/${contractId}/book-penalty`,
                                               { data: { as_of: asOf ?? isoDaysAgo(0) } }));
    },

    async closePreview(contractId, closeDate) {
      const q = closeDate ? `?close_date=${closeDate}` : '';
      return ok('хаалтын урьдчилсан тооцоо',
                () => api.get(`/api/contracts/${contractId}/close-preview${q}`));
    },
  };
  return factory;
}

type DataFixtures = { data: DataFactory };

/* Токеныг worker процесс тутамд НЭГ л удаа авна (модулийн хүрээ = worker-ийн
   хүрээ). `baseURL` нь тест-хүрээний сонголт тул worker-fixture болгож
   болохгүй — Playwright «worker fixture cannot depend on a test fixture»
   гэж татгалзана. Тиймээс энгийн кэш. */
const tokenCache = new Map<string, Promise<string>>();

function managerToken(baseURL: string): Promise<string> {
  const hit = tokenCache.get(baseURL);
  if (hit) return hit;
  const pending = (async () => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    try {
      const res = await ctx.post('/api/auth/login', {
        data: { username: USERS.manager.username, password: USERS.manager.password },
      });
      expect(res.ok(), 'менежерийн токен авч чадсангүй').toBeTruthy();
      return (await res.json()).token as string;
    } finally {
      await ctx.dispose();
    }
  })();
  tokenCache.set(baseURL, pending);
  return pending;
}

/**
 * `auth.ts`-ийн `test`-ийг өргөтгөнө — нэг файлаас `test` импортлоход
 * ролийн хуудас БА дата фабрик хоёул гарна.
 */
export const test = authTest.extend<DataFixtures>({
  data: async ({ baseURL }, use) => {
    const api = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await managerToken(baseURL!)}` },
    });
    try {
      await use(makeDataFactory(api));
    } finally {
      await api.dispose();
    }
  },
});

export { expect };
