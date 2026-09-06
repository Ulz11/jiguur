import { type Locator, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { clickToClose, clickToOpen } from '../../support/interact';
import { openNavigation } from '../../support/shell';
import { PRESSABLE, describeTargets, undersizedTargets, wholePage } from '../../support/layout';
import { SEED, expectReady } from '../../support/routes';

/**
 * ДАРГЫН ХУРУУ — UI-ЗАРЧИМ §4: «36px-ээс намхан дарагддаг юм БАЙХГҮЙ».
 *
 * Үйлдвэрийн дарга планшет дээр, талбай дээр, бээлийтэй ажилладаг. Түүний
 * хувьд 26px өндөртэй товч нь «жижигдүү» биш — БУРУУ ТОВЧ: хуруу нь хажуугийн
 * мөрийг оноод өөр материалын тоог засах цонх нээгддэг. Тэр алдааг Отгоо эгч
 * долоо хоногийн дараа авлагын тоо зөрөхөөр нь олно.
 *
 * ЗӨРЧИЛ БҮРИЙГ нэрлэнэ (эхнийх дээр зогсохгүй): нэг мөр засаад дахин гүйхэд
 * дараагийнх нь гарч ирдэг бол дүр зураг хэзээ ч бүтэн харагдахгүй.
 *
 * ⚠ Зөвхөн `darga-tablet` проектод (`playwright.config.ts`-ийн `testIgnore`) —
 *   хэмжүүр нь ТУХАЙН төхөөрөмжийнх.
 */

/** §4-ийн доод шат — `--target-sm`. */
const MIN = 36;

async function noneUndersized(scope: Parameters<typeof undersizedTargets>[0], where: string) {
  const bad = await undersizedTargets(scope, MIN);
  expect(bad.length,
    `${where}: §4-ийн ${MIN}px-ээс намхан ${bad.length} хүрэх талбай:\n      ` +
    describeTargets(bad)).toBe(0);
}

/** §4-ийн ДЭЭД шат — `--target-lg` (хуруу, планшет). */
const BIG = 52;

/** Хүлээгдэж буй ачилтын «Ачсан ✓» товч — мөрөө нэрлэдэг тул нэрээр нь. */
const shipButton = (page: Page): Locator =>
  page.getByRole('button', { name: /ачилтыг баталгаажуулах$/ }).first();

async function expectBigTarget(button: Locator, who: string) {
  await expect(button, `${who}: хүлээгдэж буй ачилт алга — хэмжих товч байхгүй`)
    .toBeVisible();
  const box = (await button.boundingBox())!;
  expect(Math.round(box.height),
    `${who}: планшет дээрх «Ачсан ✓» ${Math.round(box.height)}px — ` +
    `§4-ийн ${BIG}px-ийн зогсоол биш`).toBeGreaterThanOrEqual(BIG);
}

test.describe('даргын планшет — хүрэх талбай', () => {
  test('төхөөрөмж үнэхээр планшет — тест зөв проект дээр гүйж байна',
    async ({ factoryPage }) => {
      await factoryPage.goto('/');
      const size = factoryPage.viewportSize()!;
      expect(size.width, 'планшетын өргөн биш байна').toBeLessThanOrEqual(1024);
      expect(await factoryPage.evaluate(() => navigator.maxTouchPoints > 0
                                              || 'ontouchstart' in window),
             'хүрэлцэх төхөөрөмж биш — 36px-ийн дүрэм өөр утгатай болно').toBe(true);
    });

  test('өдрийн ажил (даргын нүүр)', async ({ factoryPage }) => {
    await factoryPage.goto('/');
    await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');
    await noneUndersized(wholePage(factoryPage), 'Даргын нүүр');
  });

  test('цэс — 13 мөрийн оронд түүнд 6, гэхдээ бүгд хуруунд', async ({ factoryPage }) => {
    await factoryPage.goto('/');
    /* 840px-ээс доош цэс нь ХАВТАС болж хажуу тийш гардаг — эхлээд нээнэ,
       эс бөгөөс DOM-д байгаа ч дэлгэцнээс гадуур хэмжигдэнэ. */
    const nav = await openNavigation(factoryPage);
    await noneUndersized(nav, 'Навигацийн хавтас');
  });

  test('агуулах — түүний өдөр тутмын дэлгэц', async ({ factoryPage }) => {
    await factoryPage.goto('/warehouse');
    await expectReady(factoryPage, 'Агуулах', 'Агуулах');
    /* Зэрэглэлийн пил бүр нь ТООЛЛОГЫН ЗАЛРУУЛГА нээдэг товч — 26px өндөртэй,
       мөрөнд 40 ширхэг зэрэгцэж байв. Хуруу нь хөршөө оноход өөр материалын
       тоо засагдана. Одоо `:is(button,a).pill-*` нь §4-ийн шатанд орно. */
    await noneUndersized(wholePage(factoryPage), 'Агуулах');
  });

  test('механизм — краны ажил, зарлага', async ({ factoryPage }) => {
    await factoryPage.goto('/machines');
    await expectReady(factoryPage, 'Механизм', 'Механизм');
    await noneUndersized(wholePage(factoryPage), 'Механизм');
  });

  test('ачилт баталгаажуулах цонх — нэг чигийн хаалганы гар',
    async ({ factoryPage, data }) => {
      /* ӨӨРИЙН гэрээ: ачилтыг нь баталгаажуулахгүй тул даргын дараалалд орно.
         Seed-ийн ачилт дээр түших нь зэрэгцээ гүйж буй тестээс хамаарна. */
      const client = await data.createClient();
      const material = await data.createMaterial({ onHand: 300 });
      const contract = await data.createRentContract({
        clientId: client.id, qty: 25, startDaysAgo: 2,
        materialId: material.id, gradeId: material.gradeId,
      });

      await factoryPage.goto('/');
      /* ХУУДАС БЭЛЭН БОЛТОЛ хайхгүй: `<Spinner/>` дээр товч байхгүй нь
         мэдээж, тэр үед «дараалалд алга» гэсэн ХУДАЛ уналт гарна. */
      await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');
      const open = factoryPage.getByRole('button',
        { name: new RegExp(`Гэрээ №${contract.no}[\\s\\S]*баталгаажуулах`) });
      await expect(open, 'миний гэрээ даргын дараалалд алга').toBeVisible();

      const modal = factoryPage.getByRole('dialog');
      await clickToOpen(open, modal.getByRole('heading', { name: 'Ачилт баталгаажуулах' }),
                        'Ачилт баталгаажуулах цонх');
      /* Баримт нь уншигдаж дуустал хэмжихгүй: «уншиж байна…» үед мөрүүд нь
         хожим өсөж, өндөр нь өөрчлөгдөнө. */
      await expect(modal.getByText('уншиж байна…')).toHaveCount(0);
      await noneUndersized(modal, 'Ачилт баталгаажуулах цонх');

      /* ЮУ Ч баталгаажуулахгүй — энэ тест хэмжинэ, мөнгө хөдөлгөхгүй. */
      await clickToClose(modal.getByRole('button', { name: 'Болих' }), modal,
                         'Ачилт баталгаажуулах цонхны «Болих»');
    });

  test('буцаалт бүртгэх цонх — талбай дээрх хамгийн олон товчтой цонх',
    async ({ factoryPage, data }) => {
      const { contract } = await data.rentSetup({ startDaysAgo: 20, qty: 30 });

      await factoryPage.goto(`/contracts/${contract.id}`);
      await expectReady(factoryPage, /./, `гэрээ №${contract.no}`);
      const modal = factoryPage.getByRole('dialog');
      await clickToOpen(
        factoryPage.getByRole('button', { name: 'Буцаалт бүртгэх', exact: true }),
        modal.getByRole('heading', { name: 'Буцаалт бүртгэх' }), 'Буцаалт бүртгэх цонх');
      /* Цонх нь ХООСОН биш гэдгийг батал: материалын мөр гарч ирсэн байх ёстой,
         эс бөгөөс «хэмжих юмгүй тул зөрчилгүй» гэсэн ХУДАЛ ногоон болно. */
      expect(await modal.locator('input,select,button').count(),
             'буцаалтын цонх хоосон — хэмжих зүйлгүй байна').toBeGreaterThan(4);
      await noneUndersized(modal, 'Буцаалт бүртгэх цонх');
    });

  test('шугам өөрөө ажиллаж байгаагийн ЭСРЭГ ТАЛ — намхан товч байвал БАРИНА',
    async ({ factoryPage }) => {
      /* «Зөрчил алга» гэдэг нь ХЭМЖИГЧ ажиллаж байж утгатай. Жинхэнэ хуудсанд
         намхан товч ТАРИАД, шугам түүнийг нэрээр нь барьж байгааг батална. */
      await factoryPage.goto('/warehouse');
      await expectReady(factoryPage, 'Агуулах', 'Агуулах');
      expect(await undersizedTargets(wholePage(factoryPage), MIN)).toEqual([]);

      await factoryPage.evaluate(() => {
        const b = document.createElement('button');
        b.id = 'jz-target-probe';
        b.setAttribute('aria-label', 'ТАРЬСАН намхан товч');
        b.style.cssText = 'height:20px;width:80px;display:block';
        document.querySelector('#jz-main')!.appendChild(b);
      });
      const caught = await undersizedTargets(wholePage(factoryPage), MIN);
      expect(caught.map((c) => `${c.name} ${c.width}×${c.height}`))
        .toEqual(['ТАРЬСАН намхан товч 80×20']);

      await factoryPage.evaluate(() => document.getElementById('jz-target-probe')!.remove());
      expect(await undersizedTargets(wholePage(factoryPage), MIN)).toEqual([]);
    });
});

/* ХУРУУ бол ХУРУУ — хэн барьж байгаагаас үл хамааран.
 *
 * 52px-ийн зогсоол нь `role === "factory"` дээр тогтдог байв: Отгоо эгч ЯГ
 * ЭНЭ iPad дээр ачилт баталгаажуулахад 36px-ийн товч гарч ирнэ — тэр 36px-ийг
 * бид өөрсдөө «даргын хуруунд болохгүй» гэж шийдсэн. Хэмжүүр нь одоо
 * төхөөрөмжийнх (`pointer: coarse` — `src/lib/touch.ts`).
 */
test.describe('планшет дээрх «Ачсан ✓» — ролиос үл хамаарах 52px', () => {
  test('дарга — өөрийн ачилтын дараалал дээр', async ({ factoryPage, data }) => {
    const client = await data.createClient();
    const material = await data.createMaterial({ onHand: 300 });
    await data.createRentContract({
      clientId: client.id, qty: 25, startDaysAgo: 2,
      materialId: material.id, gradeId: material.gradeId,
    });
    await factoryPage.goto('/');
    await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');
    await expectBigTarget(shipButton(factoryPage), 'дарга');
  });

  test('ОТГОО ижил планшет дээр — ижил хуруу, ижил 52px', async ({ managerPage, data }) => {
    const client = await data.createClient();
    const material = await data.createMaterial({ onHand: 300 });
    await data.createRentContract({
      clientId: client.id, qty: 25, startDaysAgo: 2,
      materialId: material.id, gradeId: material.gradeId,
    });
    await managerPage.goto('/');
    await expectReady(managerPage, 'Удирдлагын төв', 'Удирдлагын төв');
    await expectBigTarget(shipButton(managerPage), 'Отгоо');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ХУРУУНЫ ШАТ — 44px. ТӨХӨӨРӨМЖ ШИЙДНЭ, ХУУДАС БИШ.

   Дээрх 36px нь ХУЛГАНЫ доод шат: десктопын нягт хүснэгтэд тэр зөв. Даргын
   iPad дээр (810×1080, WebKit) хэмжихэд 26 ТӨРЛИЙН товч тэр 36-40-ийн зурваст
   зогсож байв — тооллогын залруулгын пил, ⚑ мөрийн товчнууд, ✎ засварууд,
   шүүлтүүрийн чипс, «Буцах», задлах толгой, drawer-ийн ✕, топбарын амьд заагч.
   Тус бүр нь «жижигдүү» биш: бээлийтэй хуруу хөршөө оноход ӨӨР материалын
   тоо засагдана.

   Одоо шат нь `pointer: coarse` дээр БҮХЭЛДЭЭ өснө (`index.css`:
   `--target-sm` 36→44, `--target` 44→48). Энэ шүүлт нь тэр амлалтыг ХУУДСААР
   нь барина: хэмжүүр нь ӨНДӨР — хуруу нь доош ондог, хажуу тийш биш.
   ═══════════════════════════════════════════════════════════════════════════ */
const TOUCH = 44;

/** Даргын өдөр тутам эргэлддэг гурван хуудас — хамгийн олон төрлийн товчтой. */
const TOUCH_PAGES: [string, string | RegExp][] = [
  [`/contracts/${SEED.contractId}`, /Алтан Гадас/],
  ['/warehouse', 'Агуулах'],
  [`/clients/${SEED.clientId}`, /Алтан Гадас/],
];

test.describe('даргын планшет — хурууны 44px', () => {
  for (const [path, heading] of TOUCH_PAGES) {
    test(`«${path}» — дарагддаг юм бүр хуруунд`, async ({ factoryPage }) => {
      await factoryPage.goto(path);
      await expectReady(factoryPage, heading, path);
      /* ХООСОН хуудсан дээр «зөрчил алга» гэдэг нь утгагүй ногоон — эхлээд
         хэмжих юм байгааг батална. */
      expect(await factoryPage.locator(PRESSABLE).count(),
             `«${path}» дээр дарагддаг юм бараг алга — хэмжүүр хоосон зүйл шалгаж байна`)
        .toBeGreaterThan(20);
      const bad = await undersizedTargets(wholePage(factoryPage), TOUCH, 'height');
      expect(bad.length,
        `«${path}»: хурууны ${TOUCH}px-ээс намхан ${bad.length} хүрэх талбай:\n      ` +
        describeTargets(bad)).toBe(0);
    });
  }

  /* САФАРИ ДЭЭРХ СОНГОГЧ — `min-height` нь ҮЙЛЧЛЭХГҮЙ байв.
     Буцаалтын мөрийн «Очих зэрэглэл» ба «Аль падангаас» хоёр нь ЯГ ижил
     `class="inp !min-h-11"`-тэй атал Chromium дээр 44px, WebKit дээр 23px
     өндөртэй зурагддаг байв: Safari нь ӨӨРИЙН зурдаг сонгогч дээр өндрийг
     уншдаггүй. Даргын планшет бол ЯГ WebKit. Хэлбэрийг нь өөрсдөө зурснаар
     (`appearance: none` + өөрийн ᵥ тэмдэг) шат үйлчилнэ.

     Хоёр сонгогч нь буцаах ТОО бичигдсэний дараа л төрдөг тул дээрх цонхны
     шалгалтад ХЭЗЭЭ Ч ороогүй — тиймээс энд тоог нь бөглөнө. */
  test('буцаалтын хоёр сонгогч — Safari дээр ч 44px, дарга дээр ТАРИФГҮЙ',
    async ({ factoryPage, data }) => {
      const { contract } = await data.rentSetup({ startDaysAgo: 30, qty: 30 });
      /* ХОЁР задгай падан — эс бөгөөс «Аль падангаас» гэсэн асуулт хариултгүй
         тул огт зурагддаггүй (`lib/lots.ts` `lotOptions`). */
      await data.issueLot(contract.id, { materialId: contract.materialId,
        gradeId: contract.gradeId, qty: 10, rate: 500, daysAgo: 5 });

      await factoryPage.goto(`/contracts/${contract.id}`);
      await expectReady(factoryPage, /./, `гэрээ №${contract.no}`);
      const modal = factoryPage.getByRole('dialog');
      await clickToOpen(
        factoryPage.getByRole('button', { name: 'Буцаалт бүртгэх', exact: true }),
        modal.getByRole('heading', { name: 'Буцаалт бүртгэх' }), 'Буцаалт бүртгэх цонх');
      await modal.getByLabel(/— буцаах тоо$/).first().fill('10');

      const grade = modal.getByLabel('Очих зэрэглэл');
      const pin = modal.getByLabel('Аль падангаас');
      for (const [sel, who] of [[grade, 'Очих зэрэглэл'], [pin, 'Аль падангаас']] as const) {
        await expect(sel, `«${who}» сонгогч гарсангүй`).toBeVisible();
        const box = (await sel.boundingBox())!;
        expect(Math.round(box.height),
          `«${who}» сонгогч ${Math.round(box.height)}px — Safari нь өндрийг уншаагүй байна`)
          .toBeGreaterThanOrEqual(TOUCH);
      }

      /* ДАРГАД ТАРИФ ГАРАХГҮЙ (`lib/lots.ts`). Түүний дэлгэц дээр үнэ хаа
         сайгүй хумигдсан байтал энэ сонголтын мөр «500₮» гэж ил гаргадаг байв. */
      await expect(pin.locator('option'), 'падангийн сонголт гарсангүй')
        .toContainText([/Авто/, /#/, /#/]);
      expect((await pin.locator('option').allInnerTexts()).join(' | '),
             'даргын падан-сонгогч дээр тариф ил гарлаа').not.toContain('₮');

      /* ЮУ Ч бүртгэхгүй — энэ тест хэмжинэ, мөнгө хөдөлгөхгүй. */
      await clickToClose(modal.getByRole('button', { name: 'Болих' }), modal,
                         'Буцаалт бүртгэх цонхны «Болих»');
    });
});
