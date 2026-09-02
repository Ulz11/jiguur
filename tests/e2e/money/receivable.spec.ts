import { test, expect } from '../../fixtures';
import { ClientsPage } from '../../pages/ClientsPage';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
import { CollectionsPage } from '../../pages/CollectionsPage';
import { DashboardPage } from '../../pages/DashboardPage';

/**
 * НЭГ АВЛАГА — дөрвөн дэлгэц, ГАНЦ тоо (H9b).
 *
 * Энэ бол бодит алдааны регресс: нэг харилцагчийн авлага дэлгэц бүр дээр
 * өөр гарч, 16,632,000₮ зөрөөд байсан. Отгоо эгчийн хувьд энэ нь зүгээр нэг
 * алдаа биш — Excel рүү буцах шалтгаан («хуудсууд минь шиг л зөрж байна»).
 *
 * Тиймээс тулгалт нь СЕРВЕРИЙН хариугаар биш, ДЭЛГЭЦ ДЭЭР ЗУРАГДСАН тоогоор
 * явна. Дугуйлсан «24.3 сая» биш, бүтэн ₮-өөр: 100,000₮-ийн зөрүү «сая»-гийн
 * дугуйлалт дотор чимээгүй нуугдана.
 */

/** Seed-ийн хамгийн том авлагатай харилцагч — дөрвүүлэн дэлгэцэд гарна. */
const CLIENT = 'Алтан Гадас Констракшн';

/** Дөрвөн дэлгэцээс тухайн харилцагчийн авлагыг цуглуулна. */
async function readAllSurfaces(page: import('@playwright/test').Page, client: string) {
  const clients = new ClientsPage(page);
  await clients.goto();
  const list = await clients.receivableExact(client);

  await clients.openProfile(client);
  const profile = new ClientProfilePage(page);
  await profile.expectLoaded();
  expect(await profile.clientName()).toContain(client);
  const profileValue = await profile.receivableExact();

  const collections = new CollectionsPage(page);
  await collections.goto();
  const collectionsValue = await collections.receivableExact(client);
  const overdue = await collections.overdueExact(client);

  const dashboard = new DashboardPage(page);
  await dashboard.goto();
  const schedule = await dashboard.scheduleReceivable(client);

  return { list, profile: profileValue, collections: collectionsValue, schedule, overdue };
}

test('нэг харилцагчийн авлага ДӨРВӨН дэлгэц дээр ЯГ ижил', async ({ managerPage }) => {
  const seen = await readAllSurfaces(managerPage, CLIENT);

  /* Дөрвүүлээ 0 байсан ч «ижил» болно — тулгалт утгатай байхын тулд тоо нь
     ЖИНХЭНЭ байх ёстой. */
  expect(seen.list, 'тулгах авлага 0 байна — тест юу ч баталахгүй').toBeGreaterThan(0);

  /* Дөрвийг НЭГ дор жиших: аль дэлгэц зөрснийг алдааны мессеж шууд хэлнэ. */
  expect({
    'Харилцагч (жагсаалт)': seen.list,
    'Харилцагчийн профайл': seen.profile,
    'Авлага цуглуулах': seen.collections,
    'Удирдлагын төв (Хүлээгдэж буй төлбөр)': seen.schedule,
  }).toEqual({
    'Харилцагч (жагсаалт)': seen.list,
    'Харилцагчийн профайл': seen.list,
    'Авлага цуглуулах': seen.list,
    'Удирдлагын төв (Хүлээгдэж буй төлбөр)': seen.list,
  });

  /* «Хэтэрсэн» нь авлагын ДОТОРХ хэсэг — түүнээс их байж БОЛОХГҮЙ.
     (Хэрэв их бол хоёр багана хоёр өөр тодорхойлолтоор бодогдож байна.) */
  expect(seen.overdue).toBeLessThanOrEqual(seen.list);
});

test('дашбоардын авлагын KPI нь харилцагчийн жагсаалтын нийлбэртэй тэнцэнэ',
  async ({ managerPage }) => {
    const clients = new ClientsPage(managerPage);
    const dashboard = new DashboardPage(managerPage);

    /* ⚠ Зэрэгцээ гүйлт: өөр тест энэ хоёр хуудсын хооронд шинэ харилцагч
       үүсгэж болно. Тиймээс ХОЁУЛАНГ нь дахин уншиж, нийлдэг эсэхийг хүлээнэ:
       үнэхээр ЗӨРСӨН бол дахин уншихад ч зөрсөн хэвээр (тест унана), зүгээр
       уралдсан бол дараагийн уншилтад нийлнэ. */
    await expect.poll(async () => {
      await clients.goto();
      const rows = await clients.allReceivablesExact();
      await dashboard.goto();
      const kpi = await dashboard.receivableExact();
      const sum = rows.reduce((s, r) => s + r.receivable, 0);
      /* Дугуйлалт: сервер харилцагч тус бүрийг дугуйлж, KPI-г НИЙЛБЭР дээр нь
         дугуйлдаг — харилцагч тутамд 1₮ хүртэл зөрж болно. Энэ тестийн барих
         алдаа нь 16.6 САЯ₮-ийн зөрүү. */
      return Math.abs(kpi - sum) <= rows.length ? 'нийлэв' : `KPI ${kpi} ≠ нийлбэр ${sum}`;
    }, { timeout: 30_000, message: 'KPI ба харилцагчийн жагсаалтын нийлбэр зөрж байна' })
      .toBe('нийлэв');
  });

test('ШИНЭ харилцагчийн авлага ч дөрвөн дэлгэц дээр ижил гарна',
  async ({ managerPage, data }) => {
    /* Фикстур бүтэн гинжийг өөрөө барина: харилцагч → түрээсийн гэрээ →
       баталгаажсан ачилт → нэхэмжлэл. 60 хоногийн өмнөх эхлэлтэй тул эхний
       цикл хаагдаж, хугацаа нь хэтэрсэн — Авлага цуглуулах жагсаалтад орно. */
    const { client, invoices } = await data.rentSetup();
    expect(invoices, 'нэхэмжлэл төрөөгүй байна').toBeGreaterThan(0);

    const seen = await readAllSurfaces(managerPage, client.name);
    expect(seen.list, 'шинэ гэрээнд авлага үүсээгүй байна').toBeGreaterThan(0);
    expect({
      'Харилцагч (жагсаалт)': seen.list,
      'Харилцагчийн профайл': seen.profile,
      'Авлага цуглуулах': seen.collections,
      'Удирдлагын төв (Хүлээгдэж буй төлбөр)': seen.schedule,
    }).toEqual({
      'Харилцагч (жагсаалт)': seen.list,
      'Харилцагчийн профайл': seen.list,
      'Авлага цуглуулах': seen.list,
      'Удирдлагын төв (Хүлээгдэж буй төлбөр)': seen.list,
    });
  });
