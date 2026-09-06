import { test, expect } from '../../fixtures';
import { expectReady } from '../../support/routes';

/**
 * ХААЛТТАЙ ХУУДАС — ЭРГЭЛДЭГЧ БИШ, ӨГҮҮЛБЭР.
 *
 * Үйлдвэрийн даргын цэсэнд «Тайлан» байхгүй. Гэвч ХАЯГ нь ажилласаар байв:
 * хавчуургаа дарсан, хуучин линк дээр товшсон, эсвэл зүгээр л `/reports` гэж
 * бичсэн дарга ХООСОН дэлгэц дээр «Ачаалж байна…» ширтэж үлддэг — хуудас нь
 * дата хүлээж байгаа ч сервер 403 буцаасан тул тэр дата ХЭЗЭЭ Ч ирэхгүй.
 * Юу болсныг хэлэх зүйл дэлгэц дээр байхгүй.
 *
 * Одоо: Удирдлагын төв рүү буцаагаад, ШАЛТГААНАА зурвас болгож үлдээнэ.
 *
 * ⚠ Хаалттай зам БҮРИЙГ тусдаа тест болговол ролийн хуудас (нэвтрэлт +
 *   контекст) тав дахин үүсч, ганц ажилчинтай тестийн сервер дээр БҮХ suite
 *   удааширна (`playwright.config.ts`-ийн «статик файлын дараалал» тайлбар).
 *   Тиймээс нэг хуудсан дээр ээлжлэн шалгана — алдааны мессеж бүр АЛЬ зам
 *   унасныг өөрөө нэрлэдэг тул нарийвчлал алдагдахгүй.
 */
test('даргыг санхүүгийн хуудсууд дээр эргэлдэгч дээр орхихгүй',
  async ({ factoryPage }) => {
    const CLOSED = ['/reports', '/loans', '/analytics', '/collections', '/salary'];
    for (const path of CLOSED) {
      await factoryPage.goto(path);
      /* 1. Ажил байгаа хуудас руу нь буцаана — даргынх нь «Өнөөдрийн ажил». */
      await expectReady(factoryPage, 'Өнөөдрийн ажил', path);
      expect(new URL(factoryPage.url()).pathname,
             `«${path}» дээр үлдлээ — 403-ын эргэлдэгч дээр зогсох болно`).toBe('/');

      /* 2. ЯАГААД гэдгийг хэлнэ — «тэгвэл хэн хийх вэ?» гэсэн асуулт
            дэлгэц дээр хариултаа авч явна (серверийн 403-ын мөртэй нэг үг). */
      await expect(
        factoryPage.getByText('Энэ хуудас танд хаалттай — зөвхөн менежер, санхүү'),
        `«${path}»: хаагдсан шалтгаан дэлгэц дээр алга`).toBeVisible();
    }
  });

test('Тохиргоо, Үйлдлийн бүртгэл нь САНХҮҮЧИД ч хаалттай', async ({ financePage }) => {
  for (const path of ['/settings', '/audit']) {
    await financePage.goto(path);
    await expectReady(financePage, 'Удирдлагын төв', path);
    expect(new URL(financePage.url()).pathname).toBe('/');
    await expect(financePage.getByText('Энэ хуудас танд хаалттай — зөвхөн менежер'),
                 `«${path}»: шалтгаан алга`).toBeVisible();
  }
});

test('зурвас ӨӨРӨӨ АРИЛАХГҮЙ, гэхдээ ХААЖ болно', async ({ factoryPage }) => {
  await factoryPage.goto('/reports');
  await expectReady(factoryPage, 'Өнөөдрийн ажил', '/reports');
  const strip = factoryPage.getByText('Энэ хуудас танд хаалттай — зөвхөн менежер, санхүү');
  await expect(strip).toBeVisible();

  /* Toast шиг 3.2 секундэд алга болвол дарга цаасаа эргүүлж байгаад эргэж
     ирэхэд юу ч олдохгүй — «дараад юу ч болсонгүй» гэсэн мэдрэмж. */
  await factoryPage.waitForTimeout(4000);
  await expect(strip, 'зурвас өөрөө арилжээ — toast-той адил өнгөрч одов').toBeVisible();

  await factoryPage.getByRole('button', { name: 'Мэдэгдлийг хаах' }).first().click();
  await expect(strip, 'хаасан зурвас дахин гарч ирлээ').toHaveCount(0);
});

/**
 * ХААСАН ЗУРВАС F5 ДЭЭР ДАХИН АМИЛАХГҮЙ.
 *
 * Зурвас нь `history.state`-аас уншигддаг байв — браузер тэр төлөвийг хуудас
 * дахин ачаалахад ЯГ хэвээр нь сэргээдэг. Үр дүнд нь дарга нэг л удаа
 * хаадаг зурвасаа F5 бүрд, эргэж ирэх бүрдээ дахин хаана: «би үүнийг хаасан
 * шүү дээ» гэсэн мэдрэмж нь системд итгэх итгэлийг иддэг. Одоо зурвас нь
 * бүрхүүлийн ТӨЛӨВД амьдарна; түүх нь цэвэрхэн үлдэнэ.
 */
test('хаалттай хуудсын зурвас — F5 дээр дахин амилахгүй', async ({ factoryPage }) => {
  await factoryPage.goto('/reports');
  await expectReady(factoryPage, 'Өнөөдрийн ажил', '/reports');
  const strip = factoryPage.getByText('Энэ хуудас танд хаалттай — зөвхөн менежер, санхүү');
  await expect(strip, 'буцаалтын шалтгаан анх удаа ч гарсангүй').toBeVisible();

  await factoryPage.reload();
  await expectReady(factoryPage, 'Өнөөдрийн ажил', 'F5-ийн дараа');
  await expect(strip,
    'F5 дарахад хаагдсан хуудсын зурвас дахин амилжээ — дарга түүнийг ' +
    'дахин дахин хаах болно').toHaveCount(0);
});

/**
 * 404 — БУРУУ ХАЯГ Ч ХАМАА НЭРТЭЙ.
 *
 * Танихгүй зам дээр таб нь «Жигүүр Зам · Жигүүр Зам» болж, дээд мөрийн
 * байршил ХООСОРДОГ байв: Отгоо буруу хаяг дээр зогсож байгаагаа мэдэхгүй,
 * зөвхөн «юу ч байхгүй» гэдгийг хардаг.
 *
 * Менежерийн хаалга ХЭТРЭЭГҮЙ гэдгийг ч энэ нэг хуудас ачаалалтад батална.
 */
test('олдоогүй хуудас нэртэйгээ; менежерт хаалга хэтрээгүй',
  async ({ managerPage }) => {
    await managerPage.goto('/hongololt-2026');

    await expect(managerPage.getByRole('heading', { name: 'Хуудас олдсонгүй' }),
                 '404 дээр гарчиг алга').toBeVisible();
    /* Дээд мөрийн байршил — «ЖИГҮҮР ЗАМ ХХК · ХУУДАС ОЛДСОНГҮЙ · огноо».
       (`getByText` нь ТОМ/ЖИЖИГ үсэг ялгадаггүй тул доорх h3-той мөргөлдөхгүйн
       тулд ЯГ тэр мөрийг нэрлэнэ.) */
    await expect(managerPage.locator('.jz-location'),
                 'дээд мөрийн байршил хоосон үлдлээ').toContainText('ХУУДАС ОЛДСОНГҮЙ');
    await expect(managerPage).toHaveTitle(/^Хуудас олдсонгүй · Жигүүр Зам$/);

    /* Гарах зам нь заавал байна — мухардмал дэлгэц үлдээхгүй. */
    await managerPage.getByRole('link', { name: 'Удирдлагын төв рүү буцах' }).click();
    await expectReady(managerPage, 'Удирдлагын төв', '404-өөс буцах');

    /* Хамгаалалт ХЭТРЭЭГҮЙ: менежерт бүх хаалга нээлттэй хэвээр. */
    await managerPage.goto('/reports');
    await expectReady(managerPage, 'Тайлан', '/reports');
    await expect(managerPage.getByText('Энэ хуудас танд хаалттай')).toHaveCount(0);
  });
