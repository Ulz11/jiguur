import { test, expect } from '../../fixtures';
import { ClientsPage } from '../../pages/ClientsPage';
import { ClientProfilePage } from '../../pages/ClientProfilePage';
import { CollectionsPage } from '../../pages/CollectionsPage';
import { ContractsPage } from '../../pages/ContractsPage';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { fullText, parseTugrik, sayaText, scaleOf } from '../../support/money';
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

   ХОЁР ДАХЬ УНАЛТ (мөн 2026-09) нь бүр өргөн: дэд мөр `sayaFmt`-аар
   бичигдэхэд өөрийнхөө хэмжээгээр шатладаг тул ТОЛГОЙ нь ≥1 сая, дэд мөр
   нь <1 сая байхад л ХОЁР хэмжүүр төрдөг байв — бодит датад авлага нь зуун
   сая, циклийн хуримтлал нь мянгаар хэмжигддэг тул БАРАГ МӨР БҮР дээр.
   Тэр яг хосыг доорх «≥1 сая / <1 сая» тест зориудаар төрүүлж барина.
   ===================================================================== */
test.describe('дэд мөрийн хэмжүүр', () => {
  const SUB = 'үүнээс нэхэмжлэгдээгүй';

  /**
   * НЭГ НҮД — толгой ба дэд мөр нэг ХЭМЖҮҮРТЭЙ юу.
   *
   * ХЭЛБЭРИЙГ нь эхлээд батална: толгой нь ҮНЭХЭЭР ≥1 сая, дэд мөр нь
   * ҮНЭХЭЭР <1 сая байх ёстой — эс бөгөөс тест ямар ч зөрчил төрөхгүй
   * хэмжээн дээр гүйж, ХООСОН ногоон болно (яг тэрийг хийж байсан хоёр
   * тестийг энэ засварын хамт буцааж өргөсгөв).
   */
  async function expectOneScale(cell: import('@playwright/test').Locator,
                                headExact: number, where: string) {
    const sub = cell.locator('[title^="Одоогийн цикл"]');
    await expect(sub, `${where}: «${SUB}» дэд мөр огт зурагдсангүй`).toBeVisible();
    const subExact = parseTugrik(await sub.getAttribute('title'), `${where} · хуримтлал`);
    expect(headExact, `${where}: толгой 1 саяас доогуур — шалгах ХЭЛБЭР төрсөнгүй`)
      .toBeGreaterThanOrEqual(1_000_000);
    expect(subExact, `${where}: хуримтлал 1 саяас дээш — шалгах ХЭЛБЭР төрсөнгүй`)
      .toBeGreaterThan(0);
    expect(subExact, `${where}: хуримтлал 1 саяас дээш — шалгах ХЭЛБЭР төрсөнгүй`)
      .toBeLessThan(1_000_000);

    const head = (await cell.innerText()).split('\n')[0].trim();
    const subText = (await sub.innerText()).trim();
    expect(scaleOf(head), `${where}: толгой «${head}» «сая»-гаар зурагдсангүй`).toBe('сая');
    expect(scaleOf(subText),
      `${where}: «${head}» дээр «${subText}» тогтжээ — НЭГ нүдэнд ХОЁР хэмжүүр`)
      .toBe(scaleOf(head));
  }

  /**
   * ЯГ ТЭР ХЭЛБЭР: толгой «сая», хуримтлал саяас БАГА.
   *
   * 60 хоног × 60ш × 330₮ = өдөрт 19,800₮. Хоёр цикл (60 хоног) нэхэгдэж
   * 1,188,000₮ болох ба гурав дахь цикл 1 хоног хуримтлана (19,800₮):
   * ТОЛГОЙ нь «сая»-гийн шатанд, ДЭД мөр нь бүтэн ₮-ийн хэмжээнд. Урьд нь
   * энэ нүд «1.2 сая₮» дээр «үүнээс нэхэмжлэгдээгүй: 19,800₮» гэж бичигдэж
   * байв — Отгоо эгчийн хувьд НЭГ нүдэнд хоёр өөр нэгж.
   */
  test('ТОЛГОЙ нь «сая», хуримтлал нь саяас БАГА — дэд мөр ч «сая»-гаар',
    async ({ managerPage, data }) => {
      const { client } = await data.rentSetup({ startDaysAgo: 60, qty: 60 });

      const clients = new ClientsPage(managerPage);
      await clients.goto();
      await expectOneScale(clients.row(client.name).getByRole('cell').nth(2),
                           await clients.receivableExact(client.name), 'Харилцагч жагсаалт');

      const collections = new CollectionsPage(managerPage);
      await collections.goto();
      await expectOneScale(collections.row(client.name).getByRole('cell').nth(2),
                           await collections.receivableExact(client.name), 'Авлага цуглуулах');

      /* Профайлын үзүүлэлт нь ЗОРИУДААР хоёр мөртэй («1.2 сая₮» ба доор нь
         бүтэн ₮) — дэд мөр нь тэдгээрийн ДУГУЙЛСАН нь дагана. */
      const profile = new ClientProfilePage(managerPage);
      await profile.goto(client.id);
      const lines = (await profile.stat('Авлага').innerText()).split('\n').map((l) => l.trim());
      const note = lines.find((l) => l.includes(SUB));
      expect(note, 'профайл дээр нэхэгдээгүй хуримтлалын дэд мөр алга').toBeTruthy();
      expect(scaleOf(note!), `профайл: «${lines[1]}» дээр «${note}» — ХОЁР хэмжүүр`)
        .toBe(scaleOf(lines[1]));
    });

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
      /* 60ш (20 биш) — толгой нь «сая»-гийн шатанд гарч, хуримтлал нь
         түүнээс доогуур үлдэнэ: шүүлт нь ЗӨРЧИЛ ТӨРӨХ хэмжээн дээр гүйнэ.
         20ш дээр бүх тоо 1 саяас доогуур байсан тул толгой ба дэд мөр
         хоёул бүтэн ₮-өөр бичигдэж, дүрэм эвдэрсэн ч ногоон болох байв. */
      await data.rentSetup({ startDaysAgo: 60, qty: 60 });

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
