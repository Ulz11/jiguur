import { test, expect } from '../../fixtures';
import { expectReady } from '../../support/routes';

/**
 * УТАС — 390×844. ДЭЭД МӨР НЬ ХОЁР ЗҮЙЛ ХЭЛДЭГ, ХОЁУЛАА ТАСАРЧ БАЙВ.
 *
 * Отгоо, дарга хоёр талбай дээр утсаараа орно (Отгоо банкны хуулга ирэхэд,
 * дарга агуулахын мөрөнд). Тэр өргөнд топбар гурван зүйлийг нэг мөрөнд
 * шахдаг байсны үр дүн:
 *   · амьд заагч 26px өргөн ЦЭГ болж хоцордог — «Шинэчилсэн: 14:03» гэсэн
 *     бүх бичиг нь нуугдаж, цэг нь ДАНГААРАА ЮУ Ч хэлэхгүй (өнгө нь утга
 *     зөөхгүй гэдэг нь UI-ЗАРЧИМ §4);
 *   · байршлын мөр «… 202…» гэж ӨДРИЙН ДУНДУУР тасардаг.
 * Хоёулаа МЭДЭЭЛЭЛ БИШ болж хувирна.
 *
 * Одоо: заагч нь ЦЭГ + ЦАГ; байршлын мөр нь ХУУДСЫНХАА нэрийг БҮТНЭЭР барьж,
 * огноо ба компанийн нэрээ `title` рүү зөөнө (алдагдахгүй, зөвхөн нүүнэ).
 * Энэ файл тэр хоёрыг ХЭМЖИНЭ.
 *
 * ⚠ Зөвхөн `chromium` проектод (`playwright.config.ts`-ийн `testIgnore`) —
 *   хэмжүүр нь ТУХАЙН өргөнийх, бусад проект дээр утгагүй.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Утсан дээр байршлын мөр таслагдаж болох ХАМГИЙН УРТ нэртэй хуудас ба
 *  хамгийн богино нь — хоёулангийнх нь дээр бүтэн байх ёстой. */
const PHONE_ROUTES: [string, string | RegExp, string][] = [
  ['/warehouse', 'Агуулах', 'АГУУЛАХ'],
  ['/collections', 'Авлага цуглуулах', 'АВЛАГА ЦУГЛУУЛАХ'],
];

test.describe('утас — 390×844', () => {
  test('дэлгэц үнэхээр утас — тест зөв проект дээр гүйж байна', async ({ managerPage }) => {
    await managerPage.goto('/warehouse');
    expect(managerPage.viewportSize()?.width, 'утасны өргөн биш байна').toBe(390);
    expect(managerPage.viewportSize()?.height).toBe(844);
  });

  test('амьд заагч — ЦЭГ + ЦАГ (ганц цэг үлдэхгүй)', async ({ managerPage }) => {
    await managerPage.goto('/warehouse');
    await expectReady(managerPage, 'Агуулах', '/warehouse');

    const live = managerPage.locator('.top-live');
    await expect(live, 'амьд заагч алга').toBeVisible();

    /* Бүтэн өгүүлбэр нь энэ өргөнд хумигдана — ГЭХДЭЭ хураангуй нь үлдэнэ. */
    await expect(live.locator('.top-live-text')).toBeHidden();
    const short = live.locator('.top-live-short');
    await expect(short, 'хураангуй шошго гарсангүй — заагч дахин ганц цэг болжээ')
      .toBeVisible();
    expect((await short.innerText()).trim(),
           'хураангуй нь цаг ч биш, төлөвийн үг ч биш')
      .toMatch(/^(\d{2}:\d{2}|тасарсан|хоцорсон|…|\d+ мин)$/);

    /* Заагч нь ХУМИГДАХГҮЙ: 26px өргөн болж хоцордог байсан. */
    const box = (await live.boundingBox())!;
    expect(Math.round(box.width),
           `амьд заагч ${Math.round(box.width)}px өргөн — дахин цэг болж хумигджээ`)
      .toBeGreaterThan(50);

    /* Бүтэн өгүүлбэр нь уншигчид ба хулганад хэвээр. */
    expect(await live.getAttribute('aria-label')).toMatch(/Шинэчил|Холболт/);
  });

  for (const [path, heading, upper] of PHONE_ROUTES) {
    test(`«${path}» — байршлын мөр ТАСРАХГҮЙ, огноо нь title дээр`,
      async ({ managerPage }) => {
        await managerPage.goto(path);
        await expectReady(managerPage, heading, path);

        const loc = managerPage.locator('.jz-location');
        await expect(loc).toBeVisible();
        const text = (await loc.innerText()).replace(/\s+/g, ' ').trim();

        /* 1. ХААНА байгааг хэлсээр байна — 390px дээр үлдэх ГАНЦ чухал үг нь
              ХУУДСЫНХ нь нэр. */
        expect(text, `«${path}»: байршил хуудсаа нэрлэхээ больжээ`).toContain(upper);

        /* 2. Огноо ба компанийн нэр мөрөөс гарсан — гэхдээ АЛДАГДААГҮЙ:
              хоёулаа `title` дээр бүтнээрээ үлдэнэ. */
        expect(text, 'утсан дээр огноо мөрөндөө үлдсэн байна').not.toMatch(/\d{4}-\d{2}-\d{2}/);
        const title = await loc.getAttribute('title');
        expect(title, 'огноо `title`-аас ч алга болжээ').toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(title, 'компанийн нэр `title`-аас ч алга болжээ').toContain('ЖИГҮҮР ЗАМ ХХК');
        expect(title).toContain(upper);

        /* 3. ЮУ Ч «…» болж таслагдаагүй — `text-overflow: ellipsis` нь
              `textContent`-ыг өөрчилдөггүй тул ХЭМЖИЖ л барина. */
        const cut = await loc.evaluate((el) => ({
          scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        }));
        expect(cut.scrollWidth,
          `«${path}»: байршлын мөр ${cut.scrollWidth - cut.clientWidth}px-ээр таслагдаж ` +
          '«…» болж байна').toBeLessThanOrEqual(cut.clientWidth + 1);

        /* 4. Хуудас ӨӨРӨӨ хажуу тийш гүйхгүй (топбар нь өргөнөө хэтрүүлээгүй) */
        const { scrollWidth, innerWidth } = await managerPage.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth, `«${path}» утсан дээр хэвтээ гүйлт төрлөө`)
          .toBeLessThanOrEqual(innerWidth);
      });
  }
});
