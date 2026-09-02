import { test, expect } from '../../fixtures';
import { ClientsPage } from '../../pages/ClientsPage';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
import { CollectionsPage } from '../../pages/CollectionsPage';
import { ContractsPage } from '../../pages/ContractsPage';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { fullText, sayaText, scaleOf } from '../../support/money';
import { HER_ROUTES, openHerPage } from '../../support/routes';

/**
 * НЭГ БАРИМТ — НЭГ ТОО.
 *
 * Отгоо эгч компьютерээс ГАНЦ л зүйл шаарддаг: тоог нь БАРЬЖ БАЙХ. Түүний
 * гурван дэвтэрт нэг баримт гурван хэлбэрээр бичигдэж, зөрөхийг нь тэвчдэг
 * байсан (Өнө Орд 6-р сар — 700,920₮ зөрүү, олон жил зогссон #REF!). Тэр
 * зөрүү бүр нь түүний толгойд «аль нь үнэн бол?» гэсэн асуулт болж үлддэг.
 * Машин үүнийг ДАХИН ҮЙЛДВЭРЛЭВЭЛ түүнд ямар ч давуу тал үлдэхгүй —
 * тэр Excel рүүгээ буцна.
 *
 * Тиймээс энэ файл ХОЁР зүйл барина:
 *   1. НЭГ ХАРИЛЦАГЧИЙН авлага дөрвөн дэлгэц дээр ЯГ нэг тоо;
 *      НЭГ ГЭРЭЭНИЙ үлдэгдэл жагсаалт ба дэлгэрэнгүй дээр ЯГ нэг тоо.
 *      Дэлгэц бүр өөрийн нягтралаар зурж болно («12.3 сая» / «12,330,000»)
 *      — гэхдээ ТЭР ЛЭ тоог, өөр тоог биш.
 *   2. Нэг нүдэн дэх ТОЛГОЙ ба ДЭД мөр ижил ХЭМЖҮҮРТЭЙ байх: «12.3 сая₮»
 *      дээр «үүнээс нэхэмжлэгдээгүй: 2,345,678₮» тогтвол нэг нүдэнд хоёр
 *      өөр хэмжүүр уншигдана — тэр хоёрыг хасаж болохгүй гэдгийг хэн ч
 *      хэлж өгөхгүй.
 */

/** Дэлгэц дээр ЗУРАГДСАН тоо тэр НЭГ дүнгийн зөв харагдац мөн үү. */
function expectRenders(rendered: string, exact: number, where: string): void {
  const clean = rendered.replace(/[₮\s]/g, '');
  const allowed = [sayaText(exact).replace(/\s/g, ''), fullText(exact)];
  expect(allowed,
    `${where}: «${rendered}» гэж зурагдсан нь ${fullText(exact)}₮ гэсэн дүнгийн ` +
    'харагдац БИШ — хоёр дэлгэц хоёр өөр тоо хэлж байна').toContain(clean);
}

test('нэг харилцагчийн АВЛАГА дөрвөн дэлгэц дээр ЯГ НЭГ тоо',
  async ({ managerPage, data }) => {
    /* 60 хоног — хоёр цикл хаагдаж, эхнийх нь хугацаа хэтэрсэн (Авлага
       цуглуулах жагсаалтад орно) ба гурав дахь цикл хуримтлагдаж байна
       (нэхэмжлэгдээгүй хэсэг төрнө). */
    const { client, contract } = await data.rentSetup({ startDaysAgo: 60, qty: 20 });
    expect(contract.id).toBeTruthy();

    const clients = new ClientsPage(managerPage);
    await clients.goto();
    const onList = await clients.receivableExact(client.name);
    expect(onList, 'тест авлагагүй харилцагч дээр гүйж байна — юу ч гэрчлэхгүй')
      .toBeGreaterThan(0);
    const listRendered = (await clients.row(client.name).getByRole('cell').nth(2)
      .innerText()).split('\n')[0].trim();

    const profile = new ClientProfilePage(managerPage);
    await profile.goto(contract.clientId);
    const onProfile = await profile.receivableExact();
    const profileRendered = (await profile.stat('Авлага').innerText()).split('\n')[1].trim();

    const collections = new CollectionsPage(managerPage);
    await collections.goto();
    const onCollections = await collections.receivableExact(client.name);
    const collectionsRendered = (await collections.row(client.name).getByRole('cell').nth(2)
      .innerText()).split('\n')[0].trim();

    const dashboard = new DashboardPage(managerPage);
    await dashboard.goto();
    const onDashboard = await dashboard.scheduleReceivable(client.name);
    const dashboardRendered = (await dashboard.scheduleRow(client.name)
      .getByRole('cell').nth(4).innerText()).split('\n')[0].trim();

    /* 1. НАРИЙН дүн — дөрвүүлээ ЯГ тэнцүү (нэг төгрөгийн зөрүү ч зөрүү). */
    expect({ жагсаалт: onList, профайл: onProfile,
             авлага: onCollections, самбар: onDashboard },
           'нэг харилцагчийн авлага дэлгэц бүр дээр ӨӨР тоо харуулж байна')
      .toEqual({ жагсаалт: onList, профайл: onList,
                 авлага: onList, самбар: onList });

    /* 2. ЗУРАГДСАН тоо — дэлгэц бүр өөрийн нягтралаар, гэхдээ ТЭР ЛЭ дүнгээр. */
    expectRenders(listRendered, onList, 'Харилцагч жагсаалт');
    expectRenders(profileRendered, onList, 'Харилцагчийн хуудас');
    expectRenders(collectionsRendered, onList, 'Авлага цуглуулах');
    expectRenders(dashboardRendered, onList, 'Удирдлагын төв');
  });

test('нэг гэрээний ҮЛДЭГДЭЛ жагсаалт ба дэлгэрэнгүй дээр ЯГ НЭГ тоо',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 60, qty: 15 });

    const detail = new ContractDetailPage(managerPage);
    await detail.goto(contract.id);
    const onDetail = await detail.balanceExact();
    expect(onDetail, 'тест үлдэгдэлгүй гэрээ дээр гүйж байна').toBeGreaterThan(0);

    const list = new ContractsPage(managerPage);
    await list.goto();
    const row = managerPage.getByRole('row').filter({ hasText: contract.no });
    await expect(row, `№${contract.no} гэрээнүүдийн жагсаалтад алга`).toBeVisible();
    /* Жагсаалт нь ДУГУЙЛСАН тоог зурж, бүтнийг нь `title`-даа авч явна. */
    const cell = row.locator('span[title]').first();
    const exactOnList = Number((await cell.getAttribute('title'))!.replace(/[^\d.-]/g, ''));
    const renderedOnList = (await cell.innerText()).trim();

    expect(exactOnList, 'гэрээний үлдэгдэл жагсаалт ба дэлгэрэнгүй дээр ЗӨРЖ байна')
      .toBe(onDetail);
    expectRenders(renderedOnList, onDetail, 'Гэрээнүүд жагсаалт');
  });

/* =====================================================================
   ТОЛГОЙ ба ДЭД МӨР — НЭГ ХЭМЖҮҮР.

   «үүнээс нэхэмжлэгдээгүй» нь ҮРГЭЛЖ өөрийн толгой мөрийн ДООР зогсдог.
   Хэрэв толгой нь «12.3 сая₮», дэд мөр нь «2,345,678₮» бол Отгоо эгч тэр
   хоёрыг хооронд нь хасах гэж оролдоод утгагүй тоо гаргана — эсвэл (илүү
   аюултай нь) тоонд нь итгэхээ болино.

   Бодит уналт (2026-09): Удирдлагын төвийн «Хүлээгдэж буй төлбөр» хүснэгтэд
   толгой нь бүтэн ₮, дэд мөр нь «сая»-гаар бичигдэж байв.
   ===================================================================== */
test.describe('дэд мөрийн хэмжүүр', () => {
  const SUB = 'үүнээс нэхэмжлэгдээгүй';

  /**
   * Нэг хуудсан дээрх толгой↔дэд мөрийн хосуудыг уншина.
   *
   * ⚠ Энэ шүүлт нь дата ҮҮСГЭХГҮЙ. Урьд нь хуудас тутамд `rentSetup` дуудаж
   * байсан нь гүйлт бүрд 15 нэмэлт гэрээ төрүүлж, тестийн DB-г 600 гаруй
   * гэрээ хүртэл өсгөж байв — тэр үед `/api/dashboard` ба `/api/clients` нь
   * гэрээ БҮРИЙГ алхдаг тул БҮХ suite аажмаар удааширч, `--repeat-each=3`
   * дээр огт хамаагүй тестүүд цаг хэтрэлтээр унаж эхэлдэг байлаа. Дэд мөр
   * төрүүлэх ҮҮРЭГ нь доорх ГАНЦ тестийнх; энэ шүүлт нь хуудсан дээр байгаа
   * бүх хосыг (seed + зэрэгцээ тестүүдийнх) шалгана.
   */
  async function scalePairs(page: import('@playwright/test').Page) {
    return page.evaluate((needle) => {
      const out: { sub: string; head: string[] }[] = [];
      /* Хамгийн ГҮНД нь байгаа элементийг л авна — эцэг нь мөн адил тэр
         текстийг агуулж байдаг тул давхардана. */
      const holders = Array.from(document.querySelectorAll('*')).filter((el) =>
        (el.textContent || '').includes(needle) &&
        !Array.from(el.children).some((c) => (c.textContent || '').includes(needle)));
      for (const el of holders) {
        const parent = el.parentElement;
        if (!parent) continue;
        const subText = (el as HTMLElement).innerText || el.textContent || '';
        const whole = (parent as HTMLElement).innerText || '';
        /* Толгойн ХЭСЭГ = хайрцгийн бусад бүх ₮-тэй мөр. Нэг хайрцагт хоёр
           нягтрал ЗОРИУДААР зэрэгцэж болно (харилцагчийн хуудасны үзүүлэлт:
           «12.3 сая₮» дээр «12,330,000₮») — тиймээс дэд мөрийн хэмжүүр
           тэдгээрийн АЛЬ НЭГТЭЙ таарвал болно. */
        const head = whole.split('\n')
          .map((l) => l.trim())
          .filter((l) => l && l.includes('₮') && !l.includes(needle));
        out.push({ sub: subText.trim(), head });
      }
      return out;
    }, SUB);
  }

  /** Хосуудаас ЗӨРСӨН нь — толгойныхоо аль ч мөртэй хэмжүүр нь таараагүй. */
  function mismatched(pairs: { sub: string; head: string[] }[]): string[] {
    return pairs
      .filter((p) => p.head.length > 0 &&
        !p.head.some((h) => scaleOf(h) === scaleOf(p.sub)))
      .map((p) => `дэд мөр «${p.sub}» ← толгой ${JSON.stringify(p.head)}`);
  }

  /**
   * ДАТАТАЙ баталгаа — дэд мөр ҮНЭХЭЭР зурагдаж байгааг эхлээд батална.
   *
   * Доорх маршрутын шүүлт нь хуудсан дээр байгаа зүйлийг л шалгадаг тул
   * хоосон хуудсан дээр «зөрчил алга» гэж ХУДЛААР ногоон болж чадна. Энэ
   * тест нь нэхэгдээгүй хуримтлалтай харилцагч ӨӨРӨӨ үүсгээд, гурван гол
   * дэлгэц дээр хос ҮНЭХЭЭР гарч, ижил хэмжүүртэй байгааг батална.
   */
  test('нэхэгдээгүй хуримтлал ГУРВАН дэлгэц дээр хосоороо, ижил хэмжүүрээр',
    async ({ managerPage, data }) => {
      await data.rentSetup({ startDaysAgo: 60, qty: 20 });

      for (const path of ['/', '/clients', '/collections']) {
        const route = HER_ROUTES.find((r) => r.path === path)!;
        await openHerPage(managerPage, route);
        const pairs = await scalePairs(managerPage);
        expect(pairs.length,
          `«${path}» дээр «${SUB}» дэд мөр огт зурагдсангүй — ` +
          'шүүлт хоосон хуудсан дээр ногоон болох аюултай').toBeGreaterThan(0);
        expect(mismatched(pairs), `«${path}»: нэг нүдэнд ХОЁР ӨӨР хэмжүүр`).toEqual([]);
      }
    });

  for (const route of HER_ROUTES) {
    test(`«${route.path}» дээрх «${SUB}» бүр толгойтойгоо ижил хэмжүүртэй`,
      async ({ managerPage }) => {
        await openHerPage(managerPage, route);
        expect(mismatched(await scalePairs(managerPage)),
          `«${route.path}»: нэг нүдэнд ХОЁР ӨӨР хэмжүүр зэрэгцэв`).toEqual([]);
      });
  }

  test('шалгагч өөрөө ажиллаж байгаагийн ЭСРЭГ ТАЛ — хэмжүүрийг ялгаж байна', () => {
    /* Дүрэм өөрөө үнэн эсэхийг эхлээд батал: «сая» ба бүтэн ₮ хоёр нь
       ЯЛГААТАЙ шат гэдгийг шалгагч мэдэж байх ёстой. */
    expect(scaleOf('12.3 сая₮')).toBe('сая');
    expect(scaleOf('12,330,000₮')).toBe('бүтэн');
    expect(scaleOf('3.72 тэрбум₮')).toBe('сая');
    expect(scaleOf(`үүнээс нэхэмжлэгдээгүй: ${sayaText(12_330_000)}₮`)).toBe('сая');
    expect(scaleOf(`үүнээс нэхэмжлэгдээгүй: ${fullText(12_330_000)}₮`)).toBe('бүтэн');
  });
});
