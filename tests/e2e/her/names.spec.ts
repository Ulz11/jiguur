import { test, expect } from '../../fixtures';
import { openNavigation } from '../../support/shell';
import { SEED, expectReady } from '../../support/routes';

/**
 * НЭГ ЮМ — НЭГ НЭР.
 *
 * Хүн дэлгэц дээр өөрийгөө байрлуулахдаа НЭРЭЭР нь байрлуулна: цэснээс нэг
 * юм дараад, дээд мөрөндөө ижил үгийг хараад, гарчигтаа ижил үгийг уншина.
 * Тэр гурав зөрөх бүрд «би зөв газраа орж ирэв үү?» гэсэн ганц секундын
 * эргэлзээ төрнө — өдөрт хэдэн арван удаа.
 *
 * Энэ файл ХОЁР зөрөлтийг барина:
 *   1. Үйлдвэрийн даргын нүүр — цэс, таб, дээд мөр гурвуулаа «Удирдлагын төв»
 *      гэж дуудаж байхад хуудасны `<h1>` нь «Өнөөдрийн ажил» гэдэг байв.
 *   2. Материалын гарчиг — ангилалын пил `<h1>` ДОТОР суусан тул хуудасны нэр
 *      «Хэв хашмал 6012 Хэв» болж уншигдана (уншигч, хайлт хоёулаа тэгж уншина).
 */

test.describe('нэр нь бүх газартаа ижил', () => {
  test('даргын нүүр — цэс, дээд мөр, таб, гарчиг ДӨРВҮҮЛЭЭ «Өнөөдрийн ажил»',
    async ({ factoryPage }) => {
      await factoryPage.goto('/');
      await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');

      /* 840px-ээс доош (даргын iPad) цэс нь ХАВТАС — эхлээд нээнэ. */
      const nav = await openNavigation(factoryPage);
      await expect(nav.getByRole('link', { name: 'Өнөөдрийн ажил' }),
                   'цэсний мөр нь хуудсаа өөр нэрээр дуудсаар байна').toBeVisible();
      await expect(nav.getByRole('link', { name: 'Удирдлагын төв' }),
                   'даргын цэсэнд «Удирдлагын төв» үлдлээ').toHaveCount(0);

      await expect(factoryPage.locator('.jz-location'),
                   'дээд мөрийн байршил өөр нэр хэлж байна').toContainText('ӨНӨӨДРИЙН АЖИЛ');
      await expect(factoryPage).toHaveTitle(/^Өнөөдрийн ажил · Жигүүр Зам$/);
    });

  test('менежерийнх «Удирдлагын төв» ХЭВЭЭР — өөрчлөлт нь зөвхөн даргынх',
    async ({ managerPage }) => {
      await managerPage.goto('/');
      await expectReady(managerPage, 'Удирдлагын төв', 'Удирдлагын төв');
      const nav = await openNavigation(managerPage);
      await expect(nav.getByRole('link', { name: 'Удирдлагын төв' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Өнөөдрийн ажил' })).toHaveCount(0);
      await expect(managerPage.locator('.jz-location')).toContainText('УДИРДЛАГЫН ТӨВ');
      await expect(managerPage).toHaveTitle(/^Удирдлагын төв · Жигүүр Зам$/);
    });

  test('материалын гарчиг = материалын НЭР; ангилал нь хажуудаа зогсоно',
    async ({ managerPage }) => {
      await managerPage.goto(`/warehouse/materials/${SEED.materialId}`);
      await expectReady(managerPage, /Хэв хашмал/, 'Материалын дэлгэрэнгүй');

      await expect(managerPage.getByRole('heading', { level: 1 }),
        'гарчиг нь ангилалаа өөртөө наасаар байна («Хэв хашмал 6012 Хэв»)')
        .toHaveText('Хэв хашмал 6012');

      /* Ангилал нь АЛГА БОЛООГҮЙ — зөвхөн гарчгаас гарч, хажууд нь зогсов. */
      await expect(managerPage.locator('h1 + .pill-grey'),
                   'ангилалын пил гарчгийн хажуунаас ч алга болжээ').toBeVisible();
    });
});
