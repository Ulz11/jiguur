import { expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
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
 */

export type CreatedClient = { id: number; name: string };
export type CreatedContract = {
  id: number;
  no: string;
  clientId: number;
  materialId: number;
  gradeId: number;
  qty: number;
  dailyRate: number;
};

export type DataFactory = {
  /** Түүхий API — өөр endpoint шалгах хэрэгтэй үед. */
  api: APIRequestContext;
  createClient(name?: string): Promise<CreatedClient>;
  /** Агуулахад хангалттай үлдэгдэлтэй материал+зэрэглэл сонгоно. */
  pickMaterial(minQty: number): Promise<{ materialId: number; gradeId: number; name: string }>;
  createRentContract(opts: {
    clientId: number;
    startDaysAgo?: number;
    qty?: number;
    dailyRate?: number;
    cycleDays?: number;
  }): Promise<CreatedContract>;
  /** Гэрээний хүлээгдэж буй эхний ачилтыг баталгаажуулна (нөөц хөдөлж, тооцоо эхэлнэ). */
  confirmFirstShipment(contractId: number): Promise<number>;
  /** Дууссан цикл бүрд нэхэмжлэл төрүүлж, тоог нь буцаана. */
  generateInvoices(contractId: number): Promise<number>;
  /**
   * Бүтэн гинж: харилцагч → түрээсийн гэрээ (материалтай) → баталгаажсан
   * ачилт → нэхэмжлэл. `startDaysAgo` нь анхдагчаар 60 — хоёр цикл хаагдаж,
   * эхнийх нь ХУГАЦАА ХЭТЭРСЭН болно (Авлага цуглуулах жагсаалтад орно).
   */
  rentSetup(opts?: { startDaysAgo?: number; qty?: number; dailyRate?: number }): Promise<{
    client: CreatedClient;
    contract: CreatedContract;
    movementId: number;
    invoices: number;
  }>;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function ok(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string) {
  expect(res.ok(), `${what} — ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

export function makeDataFactory(api: APIRequestContext): DataFactory {
  const factory: DataFactory = {
    api,

    async createClient(name?: string) {
      const body = {
        name: name ?? `E2E ${randomUUID().slice(0, 8)}`,
        reg: '', person: 'Тест хариуцагч', phone: '9900-0000', note: 'E2E тестийн харилцагч',
      };
      const created = await ok(await api.post('/api/clients', { data: body }), 'харилцагч үүсгэх');
      return { id: created.id, name: created.name };
    },

    async pickMaterial(minQty: number) {
      const res = await api.get('/api/materials');
      expect(res.ok(), 'каталог уншигдсангүй').toBeTruthy();
      const materials = await res.json();
      for (const m of materials) {
        for (const s of m.stock ?? []) {
          if (s.on_hand >= minQty) return { materialId: m.id, gradeId: s.grade_id, name: m.name };
        }
      }
      throw new Error(`Агуулахад ${minQty}ш байгаа материал олдсонгүй`);
    },

    async createRentContract({ clientId, startDaysAgo = 60, qty = 10, dailyRate = 330, cycleDays = 30 }) {
      const mat = await factory.pickMaterial(qty);
      const body = {
        client_id: clientId,
        type: 'rent',
        no: `E2E-${randomUUID().slice(0, 8)}`,
        start_date: isoDaysAgo(startDaysAgo),
        end_date: null,
        cycle_days: cycleDays,
        cycle_mode: 'days',
        /* Алданги 0 — H2/R25: тест нь алдангийн машиныг биш, авлагыг шалгана. */
        penalty_percent: 0,
        deposit: 0,
        vat_percent: 0,
        note: 'E2E',
        items: [{ material_id: mat.materialId, grade_id: mat.gradeId, qty, daily_rate: dailyRate, unit_price: 0 }],
      };
      const created = await ok(await api.post('/api/contracts', { data: body }), 'гэрээ үүсгэх');
      return {
        id: created.id, no: created.no, clientId,
        materialId: mat.materialId, gradeId: mat.gradeId, qty, dailyRate,
      };
    },

    async confirmFirstShipment(contractId: number) {
      const detail = await ok(await api.get(`/api/contracts/${contractId}`), 'гэрээ уншиx');
      const pending = (detail.movements ?? []).find((m: any) => m.status === 'pending');
      expect(pending, 'хүлээгдэж буй ачилт олдсонгүй').toBeTruthy();
      await ok(await api.post(`/api/movements/${pending.id}/confirm`), 'ачилт баталгаажуулах');
      return pending.id as number;
    },

    async generateInvoices(contractId: number) {
      const r = await ok(await api.post(`/api/contracts/${contractId}/generate-invoices`),
                         'нэхэмжлэл үүсгэх');
      return r.created as number;
    },

    async rentSetup({ startDaysAgo = 60, qty = 10, dailyRate = 330 } = {}) {
      const client = await factory.createClient();
      const contract = await factory.createRentContract({ clientId: client.id, startDaysAgo, qty, dailyRate });
      const movementId = await factory.confirmFirstShipment(contract.id);
      const invoices = await factory.generateInvoices(contract.id);
      return { client, contract, movementId, invoices };
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
