import { expect, type Page } from '@playwright/test';

/**
 * ОТГОО ЭГЧИЙН БҮХ ХУУДАС — нэг жагсаалт, нэг эх сурвалж.
 *
 * `tests/e2e/her/`-ийн гурван шүүлт (монгол хэл, 1366 дэлгэц, нэг тоо) бүгд
 * ЭНЭ жагсаалтаар алхана. Аппд шинэ хуудас нэмэгдвэл мөр нь энд нэмэгдэх ба
 * тэр агшинд гурвуулаа шинэ хуудсыг шалгаж эхэлнэ — «шинэ хуудас шалгагдалгүй
 * үлдэх» боломж бүтцээрээ үгүй.
 */

/** Seed-ийн ТОГТМОЛ биетүүд (`app/seed.py`) — зөвхөн УНШИХ шалгалтад. */
export const SEED = {
  /** Гэрээ №24/03 «Алтан Гадас Констракшн» — seed-ийн хамгийн том түрээс */
  contractId: 1,
  /** «Алтан Гадас Констракшн» — тэр гэрээний эзэн */
  clientId: 1,
  /** «Хэв хашмал 6012» — хамгийн олон гэрээнд тархсан материал */
  materialId: 1,
};

export type HerRoute = {
  path: string;
  /** `<h1>` дээр гарах ёстой үг — хуудас ҮНЭХЭЭР суусан гэдгийн дохио */
  heading: string | RegExp;
  /**
   * Тэр хуудсан дээр Отгоо гар сунгадаг ГОЛ үйлдэл (UI-ЗАРЧИМ §2 —
   * баруун дээд булангийн `command-action`; түүнгүй хуудсанд тухайн
   * хуудасны ажил өөрөө эхэлдэг товч).
   */
  action: string | RegExp;
  /** Дата НЯГТ хуудас: хүснэгт нь картныхаа дотор таслагдах эрсдэлтэй */
  dense?: boolean;
};

export const HER_ROUTES: HerRoute[] = [
  { path: '/', heading: 'Удирдлагын төв', action: '+ Шинэ гэрээ' },
  { path: '/contracts', heading: 'Гэрээнүүд', action: '+ Шинэ гэрээ' },
  { path: `/contracts/${SEED.contractId}`, heading: /Алтан Гадас/,
    action: 'Төлбөр бүртгэх', dense: true },
  { path: '/clients', heading: 'Харилцагч', action: '+ Шинэ харилцагч' },
  { path: `/clients/${SEED.clientId}`, heading: /Алтан Гадас/, action: 'Төлбөр бүртгэх' },
  /* Авлага цуглуулах = «хэнд эхлээд залгах вэ» — ажил нь мөр бүрийн
     «+ Тэмдэглэл» дээр эхэлнэ (залгасныг тэмдэглэх). */
  { path: '/collections', heading: 'Авлага цуглуулах', action: '+ Тэмдэглэл', dense: true },
  { path: '/warehouse', heading: 'Агуулах', action: '▣ Тооллого хийх' },
  { path: `/warehouse/materials/${SEED.materialId}`, heading: /Хэв хашмал/,
    action: '▣ Тооллого хийх' },
  { path: '/loans', heading: 'Зээл / Өглөг', action: '+ Шинэ зээл', dense: true },
  { path: '/salary', heading: 'Цалин', action: 'Цалин бодох', dense: true },
  { path: '/machines', heading: 'Механизм', action: '+ Машин нэмэх' },
  { path: '/reports', heading: 'Тайлан', action: '⇩ Excel татах' },
  { path: '/analytics', heading: 'Аналитик', action: 'Материалын өгөөж' },
  { path: '/audit', heading: 'Үйлдлийн бүртгэл', action: 'Үйлдлийн бүртгэлээс хайх' },
  { path: '/settings', heading: 'Тохиргоо', action: '+ Материал нэмэх' },
];

/**
 * АЧААЛАЛТЫН цонх — БАТАЛГААНЫ цонх БИШ.
 *
 * `playwright.config.ts` нь `expect`-ийг 10 секундэд барьдаг: удаан ЗУРАГДСАН
 * дэлгэц улаан болох ёстой. Гэвч «хуудас ачаалж дуусав уу» гэдэг нь
 * БАТАЛГАА биш, НАВИГАЦИЙН үе шат — тэр үе шат нь тохиргоондоо аль хэдийн
 * 45 секундын төсөвтэй (`navigationTimeout`, «статик файлын дараалал»
 * гэсэн тайлбартай).
 *
 * `--repeat-each=3` дээр ганц ажилчинтай тестийн сервер таван хөтчийн 546КБ
 * багц, зураг, БА API-г нэгэн зэрэг хариулна; түүнчлэн тестүүд өөрсдөө
 * гэрээ үүсгэсээр байдаг тул `/api/dashboard` нь гүйлтийн туршид улам
 * удааширна (гэрээ бүрийг алхдаг). Тэр үед `<h1>` 10 секундэд гарч
 * амжихгүй байв — АППЫН алдаагүйгээр.
 *
 * Тиймээс ЗӨВХӨН энэ хоёр «бэлэн үү» гэсэн хаалга нь навигацийн төсөвтэй
 * явна. Хуудсан дээрх БҮХ бодит баталгаа 10 секундэд хэвээр.
 */
const READY_MS = 45_000;

/**
 * Хуудсыг нээж, ҮНЭХЭЭР суусныг батална.
 *
 * Хоёр дохио: (1) `<h1>` нь хүлээсэн үгээ агуулна — Spinner дуусч, ЗӨВ хуудас
 * нээгдсэн; (2) «Ачаалж байна…» гэсэн мөр үлдээгүй — дэд самбарууд ч ирсэн.
 */
export async function openHerPage(page: Page, route: HerRoute): Promise<void> {
  await page.goto(route.path);
  await expect(page.getByRole('heading', { level: 1 }),
               `«${route.path}» — гарчиг зурагдсангүй`)
    .toContainText(route.heading, { timeout: READY_MS });
  await expect(page.getByText('Ачаалж байна…'),
               `«${route.path}» — дэд самбар ачаалж дуусаагүй`)
    .toHaveCount(0, { timeout: READY_MS });
}

/** Дурын хуудасны «бэлэн болов уу» хаалга — ижил төсөвтэй. */
export async function expectReady(page: Page, heading: string | RegExp,
                                  where: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 }), `«${where}» — гарчиг зурагдсангүй`)
    .toContainText(heading, { timeout: READY_MS });
  await expect(page.getByText('Ачаалж байна…'), `«${where}» — дэд самбар ачаалж дуусаагүй`)
    .toHaveCount(0, { timeout: READY_MS });
}
