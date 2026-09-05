import { test, expect } from '../../fixtures';
import { clickToOpen, clickToPick } from '../../support/interact';
import { expectReady } from '../../support/routes';

/**
 * ШИНЭ ГЭРЭЭНИЙ ХАТУУ ЗОГСООЛ — УЛААН ӨНГӨ НЬ ХОРИГ БИШ.
 *
 * 2-р алхам нь агуулахад 34ш байхад 120ш олгох мөрийг улаанаар тэмдэглээд
 * «Үргэлжлүүлэх →»-ийг НЭЭЛТТЭЙ үлдээдэг байв; 0₮ тариф ч чөлөөтэй өнгөрдөг.
 * Тэр хоёр гэрээ ТӨРСӨН ЦАГААСАА буруу тоо үйлдвэрлэнэ — нөөц сөрөг болж,
 * өдрийн дүн 0 гарна. Отгоо тэр алдааг сар хагасын дараа, авлага зөрөхөөр нь
 * олно; тэр үед засах нь гэрээ дахин бичихтэй тэнцэнэ.
 *
 * UI-ЗАРЧИМ §4: «өнгө дангаараа утга зөөхгүй». Улаан хүрээ «болохгүй» гэж
 * ХЭЛДЭГГҮЙ — үг л хэлнэ, тэр үг нь ХОЁР тоог (юу байна / юу гуйж байна)
 * нэрлэж, ХААНА засахыг зааж өгнө.
 */

const ON_HAND = 34;
const TOO_MANY = 120;

/** 1-р алхмыг давж, материалын сонголт дээр зогсоно. */
async function toStepTwo(page: any, clientName: string) {
  await page.goto('/contracts/new');
  await expectReady(page, 'Шинэ гэрээ', 'Шинэ гэрээ');
  await clickToPick(page.getByRole('button', { name: clientName }),
                    `харилцагч ${clientName}`);
  await clickToOpen(page.getByRole('button', { name: 'Үргэлжлүүлэх →' }),
                    page.getByLabel('Материал хайх'), '2. Материал алхам');
}

test('нөөцөөс их тоо ба 0₮ тариф хоёул «Цааш»-ийг ХААНА — 4-р алхам хүрэхгүй',
  async ({ managerPage, data }) => {
    const client = await data.createClient();
    const material = await data.createMaterial({ baseRate: 330, onHand: ON_HAND });
    await toStepTwo(managerPage, client.name);

    await managerPage.getByLabel('Материал хайх').fill(material.name);
    const qty = managerPage.getByLabel(`${material.name} — тоо ширхэг`);
    await clickToOpen(managerPage.getByRole('button', { name: material.name }), qty,
                      `материал ${material.name}`);
    const next = managerPage.getByRole('button', { name: 'Үргэлжлүүлэх →' });

    /* ---- 1. НӨӨЦӨӨС ИХ ---- */
    await qty.fill(String(TOO_MANY));
    await expect(managerPage.getByText(
      `Агуулахад ${ON_HAND}ш байна — ${TOO_MANY}ш олгох боломжгүй`),
      'нөөцийн зогсоол хоёр тоогоо нэрлэсэнгүй').toBeVisible();
    await expect(next, 'нөөцөөс их мөртэй атал «Цааш» нээлттэй үлдлээ').toBeDisabled();
    /* Товч чимээгүй унтарвал «дараад юу ч болсонгүй» — шалтгаан нь ил. */
    await expect(managerPage.getByText('Улаанаар тэмдэглэсэн мөрийг засвал цааш үргэлжилнэ.'),
      'зогсоолын шалтгаан товчны дэргэд гарсангүй').toBeVisible();

    /* Тоог засмагц зам нээгдэнэ. */
    await qty.fill(String(ON_HAND));
    await expect(next, 'тоо засагдсан ч зам хаалттай хэвээр').toBeEnabled();

    /* ---- 2. ТАРИФ 0₮ ---- */
    const rate = managerPage.getByLabel(`${material.name} — тариф ₮/ш/хоног`);
    await rate.fill('0');
    await expect(managerPage.getByText(
      'Тариф 0₮ — үнийг тогтооно уу (Тохиргоо → Материалын каталог)'),
      'үнэгүй мөр хаанаас засахыг хэлсэнгүй').toBeVisible();
    await expect(next, '0₮ тарифтай мөр «Цааш»-ийг зогсоосонгүй').toBeDisabled();

    /* ---- 3. 4-Р АЛХАМ ХҮРЭХГҮЙ ----
       Хоёр зогсоолын аль нэг нь байхад 3-р алхам ч, 4-р алхам ч нээгдэхгүй:
       товч дарагдахгүй тул хуудас 2-р алхам дээрээ үлдэнэ. */
    await expect(managerPage.getByLabel('Материал хайх'),
      '2-р алхмаас гарчихлаа').toBeVisible();
    await expect(managerPage.getByRole('button', { name: '✓ Гэрээ баталгаажуулах' }),
      '4-р алхам хүртэл нэвтэрчихлээ').toHaveCount(0);

    /* ---- 4. ЗАСМАГЦ ЗАМ НЭЭГДЭНЭ ---- */
    await rate.fill('330');
    await clickToOpen(next, managerPage.getByLabel('Алданги %/хоног'), '3. Нөхцөл алхам');
    await clickToOpen(managerPage.getByRole('button', { name: 'Үргэлжлүүлэх →' }),
                      managerPage.getByRole('button', { name: '✓ Гэрээ баталгаажуулах' }),
                      '4. Баталгаажуулах алхам');
  });
