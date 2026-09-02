import { test, expect } from '../../fixtures';
import { openNavigation } from '../../support/shell';
import { describeTargets, undersizedTargets, wholePage } from '../../support/layout';
import { expectReady } from '../../support/routes';

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
      await open.click();

      const modal = factoryPage.getByRole('dialog');
      await expect(modal.getByRole('heading', { name: 'Ачилт баталгаажуулах' })).toBeVisible();
      /* Баримт нь уншигдаж дуустал хэмжихгүй: «уншиж байна…» үед мөрүүд нь
         хожим өсөж, өндөр нь өөрчлөгдөнө. */
      await expect(modal.getByText('уншиж байна…')).toHaveCount(0);
      await noneUndersized(modal, 'Ачилт баталгаажуулах цонх');

      /* ЮУ Ч баталгаажуулахгүй — энэ тест хэмжинэ, мөнгө хөдөлгөхгүй. */
      await modal.getByRole('button', { name: 'Болих' }).click();
      await expect(modal).toBeHidden();
    });

  test('буцаалт бүртгэх цонх — талбай дээрх хамгийн олон товчтой цонх',
    async ({ factoryPage, data }) => {
      const { contract } = await data.rentSetup({ startDaysAgo: 20, qty: 30 });

      await factoryPage.goto(`/contracts/${contract.id}`);
      await expectReady(factoryPage, /./, `гэрээ №${contract.no}`);
      await factoryPage.getByRole('button', { name: 'Буцаалт бүртгэх', exact: true }).click();

      const modal = factoryPage.getByRole('dialog');
      await expect(modal.getByRole('heading', { name: 'Буцаалт бүртгэх' })).toBeVisible();
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
