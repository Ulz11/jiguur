import { test, expect } from '../../fixtures';
import { HER_ROUTES, openHerPage } from '../../support/routes';
import { clippedInsideCards, deadControls, pageWidths } from '../../support/layout';

/**
 * 1366×768 — ОТГОО ЭГЧИЙН ЖИНХЭНЭ ДЭЛГЭЦ.
 *
 * «Миний дээр болж байна» гэдэг нь энэ системд нотолгоо биш: хөгжүүлэгчийн
 * дэлгэц 1512–2560px, түүнийх 1366×768. Ялгаа нь чимэглэлийн БИШ —
 * хажуу тийш гүйлгэх гэсэн хөдөлгөөн нь Excel-ийн 20 жилд түүнд ОГТ
 * байгаагүй. Тэр хүснэгтээ ДООШ гүйлгэдэг; баруун тийш ЯВДАГГҮЙ.
 *
 * Хуудас бүрд ДӨРВӨН зүйл барина:
 *   1. хуудас БҮХЭЛДЭЭ хэвтээ гүйхгүй;
 *   2. харагдаж байгаа товч бүр ҮНЭХЭЭР дарагдана (үл үзэгдэх давхаргын
 *      ард үхээгүй);
 *   3. хуудсын ГОЛ үйлдэл хажуу тийш хөдөлгөөнгүйгээр гарт бэлэн;
 *   4. дата НЯГТ хуудсанд картын ДОТОР таслагдсан хүснэгт нь ҮЙЛДЭЛ эсвэл
 *      БҮТЭН БАГАНА (НДШ) нуухгүй.
 *
 * ⚠ ДӨРВҮҮЛЭЭ НЭГ хуудас ачаалалт дээр хийгдэнэ. Тусад нь дөрвөн тест
 *   болговол хуудас бүр дөрөв ачаалагдаж, ганц ажилчинтай тестийн сервер
 *   546КБ багцыг дөрөв дамжуулна — тэр ачаалал өөрөө флейк төрүүлдэг
 *   (`--repeat-each=3` дээр баригдсан). Алдааны мессеж бүр АЛЬ шалгалт
 *   унасныг өөрөө нэрлэдэг тул нарийвчлал алдагдахгүй.
 *
 * ⚠ Зөвхөн `otgoo-1366` проектод гүйнэ (`playwright.config.ts`-ийн
 *   `testIgnore`). Бусад проект дээр дэлгэц нь өөр тул энэ баталгаа утгагүй —
 *   даргын планшет нь `targets.spec.ts`-ийн ажил.
 */
test.describe('1366×768', () => {
  test('дэлгэцийн өргөн үнэхээр 1366 — тест зөв проект дээр гүйж байна',
    async ({ managerPage }) => {
      /* Хэрэв проектын тохиргоо өөрчлөгдвөл доорх БҮХ баталгаа өөр дэлгэц
         дээр «ногоон» болно. Хэмжүүрээ эхлээд шалгана. */
      await openHerPage(managerPage, HER_ROUTES[0]);
      const { innerWidth } = await pageWidths(managerPage);
      expect(innerWidth, 'проектын viewport 1366 биш байна').toBe(1366);
      expect(managerPage.viewportSize()?.height).toBe(768);
    });

  for (const route of HER_ROUTES) {
    test(`«${route.path}» түүний дэлгэцэнд багтана`, async ({ managerPage }) => {
      await openHerPage(managerPage, route);

      /* ---- 1. Хуудас хэвтээ гүйхгүй ---- */
      const { scrollWidth, innerWidth } = await pageWidths(managerPage);
      expect(scrollWidth,
        `«${route.path}» хуудас ${scrollWidth - innerWidth}px хэтэрч, хэвтээ гүйлт төрлөө`)
        .toBeLessThanOrEqual(innerWidth);

      /* ---- 2. ҮХСЭН ТОВЧ алга ----
         `.command-hero` нь `position: static` байсан тул түүний чимэглэлийн
         давхарга (absolute, өндөр 100%, баруун 53%) ХУУДАС БҮХЭЛДЭЭ дүүрч,
         /collections-ийн «+ Тэмдэглэл» ба /analytics-ийн харагдац солигч
         хоёр үл үзэгдэх шилний ард үлдсэн байв. Алдаа ч, чимээ ч гардаггүй —
         Отгоо эгч «энэ товч ажиллахгүй байна» гээд дэвтэр рүүгээ буцна. */
      const dead = await deadControls(managerPage);
      expect(dead.map((d) => `«${d.name}» (${d.tag}.${d.cls}) — дээр нь: ${d.covered}`),
        `«${route.path}»: доорх товчнууд харагдаж байгаа хэрнээ ДАРАГДАХГҮЙ`).toEqual([]);

      /* ---- 3. ГОЛ ҮЙЛДЭЛ нүдний өмнө ----
         UI-ЗАРЧИМ §2: гол үйлдэл баруун дээд буланд. Яг тэр булан нь нарийн
         дэлгэц дээр ЭХЭЛЖ таслагддаг газар. */
      const action = managerPage.getByRole('button', { name: route.action })
        .or(managerPage.getByRole('link', { name: route.action }))
        .or(managerPage.getByLabel(route.action))
        .first();
      await expect(action, `«${route.path}» дээр «${route.action}» алга`).toBeVisible();

      /* ДООШ гүйлгэх нь зөвшөөрөгдөнө — Excel-ийн 20 жилд түүний дадсан ганц
         хөдөлгөөн нь ЯГ ЭНЭ. Хориотой нь ХАЖУУ ТИЙШ явах. Тиймээс эхлээд
         босоо тэнхлэгээр байрандаа авчраад, ЗӨВХӨН хэвтээ байрлалыг хэмжинэ. */
      await action.scrollIntoViewIfNeeded();
      const box = (await action.boundingBox())!;
      expect(box.x, `«${route.action}» зүүн ирмэгээсээ гарлаа`).toBeGreaterThanOrEqual(0);
      expect(Math.round(box.x + box.width),
        `«${route.action}» баруун ирмэгээс ` +
        `${Math.round(box.x + box.width - innerWidth)}px давлаа — хүрэхийн тулд ` +
        'хажуу тийш гүйлгэх хэрэгтэй болно').toBeLessThanOrEqual(innerWidth);

      await expect(action).toBeEnabled();
      expect(await action.evaluate((el) =>
        Array.from(el.getClientRects()).some((line) => {
          const top = document.elementFromPoint(line.x + line.width / 2,
                                                line.y + line.height / 2);
          return top !== null && (top === el || el.contains(top));
        })), `«${route.action}» дээр өөр зүйл тогтжээ — товшилт хүрэхгүй`).toBe(true);

      if (!route.dense) return;

      /* ---- 4. КАРТЫН ДОТОРХ ГҮЙЛТ — Excel-ийн хүнд ОГТ БАЙХГҮЙ хөдөлгөөн ----
         Хуудас өөрөө гүйхгүй ч картын дотор хүснэгт таслагдвал баруун талын
         багана нь ОРШИН БАЙДАГГҮЙТЭЙ адил: тэр нүдэн дээр хулгана хүргээд
         хажуу тийш гүйлгэх гэдэг зүйл түүний толгойд байхгүй. Урьд нь ЯГ
         ингэж Цалингийн «НДШ» багана ба мөрийн устгах товч нуугдаж байсан. */
      const boxes = await clippedInsideCards(managerPage);

      const hidingControls = boxes.filter((b) => b.controls.length);
      expect(hidingControls.map((b) => `${b.box} (${b.scrollWidth}/${b.clientWidth}px) → ` +
                                        b.controls.join(' ; ')),
        `«${route.path}»: картын доторх гүйлтийн ард ҮЙЛДЭЛ нуугдлаа — ` +
        'Отгоо тэр товчийг хэзээ ч олохгүй').toEqual([]);

      const hidingColumns = boxes.filter((b) => b.headers.length);
      expect(hidingColumns.map((b) => `${b.box} (${b.scrollWidth}/${b.clientWidth}px) → ` +
                                       b.headers.join(' ; ')),
        `«${route.path}»: картын доторх гүйлтийн ард БҮТЭН БАГАНА нуугдлаа — ` +
        '«НДШ» багана яг ингэж алга болж байсан').toEqual([]);

      /* ---- 5. МӨР БҮРИЙН ажлын товч ГАРТ БЭЛЭН ----
         Дээрх 4-р шалгалт нь ГҮЙЛТИЙН хайрцгийн ирмэгийг хардаг; энэ нь
         ДЭЛГЭЦИЙНХИЙГ. Бодит датан дээр /collections-ийн хүснэгт 1,044px
         хэрэгсэж, картын 1,018px-д багтдаггүй байв — мөр бүрийн
         «+ Тэмдэглэл» товч баруун ирмэгээс 12px гадуур үлдэнэ. Энэ хуудасны
         БҮХ ажил тэр товч дээр эхэлдэг («залгасан, тэр амлав»): хажуу тийш
         гүйлгэх хөдөлгөөн нь Отгоо эгчид байхгүй тул товч нь оршин
         байдаггүйтэй адил. Seed-ийн дата нь нарийхан тул зөрчил зөвхөн
         жинхэнэ дэвтэр дээр гардаг — хэмжүүр нь энд, БАГАНЫН өргөнөөр
         барина (`min-w`, толгойн үгийн эвхэлт). */
      if (route.path !== '/collections') return;
      const firstNote = managerPage.getByRole('button', { name: '+ Тэмдэглэл' }).first();
      await expect(firstNote, '/collections дээр «+ Тэмдэглэл» товч алга').toBeVisible();
      const nb = (await firstNote.boundingBox())!;
      expect(Math.round(nb.x + nb.width),
        'эхний мөрийн «+ Тэмдэглэл» товч дэлгэцийн баруун ирмэгээс ' +
        `${Math.round(nb.x + nb.width - innerWidth)}px давлаа — хүрэхийн тулд ` +
        'хүснэгтийг хажуу тийш гүйлгэх хэрэгтэй болно').toBeLessThanOrEqual(innerWidth);
      /* Товч нь КАРТЫНХАА дотор ч бүтнээрээ багтана — карт нь өөрөө
         гүйдэг хайрцаг тул дэлгэцэнд багтсан ч ирмэгээр нь тасарч болно. */
      const cardRight = await firstNote.evaluate((el) => {
        const box = el.closest('.card');
        return box ? box.getBoundingClientRect().right : Infinity;
      });
      expect(Math.round(nb.x + nb.width),
        'эхний мөрийн «+ Тэмдэглэл» товч картын гүйлтийн ард үлдлээ')
        .toBeLessThanOrEqual(Math.round(cardRight));
    });
  }
});
