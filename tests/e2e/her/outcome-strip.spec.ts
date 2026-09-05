import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen } from '../../support/interact';

/**
 * ХИЙГДСЭН ЗҮЙЛ ДЭЛГЭЦЭН ДЭЭР ҮЛДЭНЭ.
 *
 * Отгоо эгч дэлгэц дээр ӨНГӨРЧ БУЙ зүйлийг анзаардаггүй. Амжилтын мэдэгдэл
 * (`ui.tsx`) 3,200 мс-ийн дараа өөрөө арилж, дараагийнх нь түүнийг дардаг —
 * тэр «Бүртгэх» дараад цаас руугаа харж, утсаа авч, буцаж ирэхэд дэлгэц
 * ЮУ Ч БОЛООГҮЙ мэт зогсож байна. «Дараад юу ч болсонгүй» гэсэн мэдрэмж
 * ЯГ эндээс төрдөг: тэр дахин дарж, нэг буцаалт хоёр удаа бүртгэгддэг.
 *
 * Одоо мутаци бүрийн дараа толгойн доор ЗУРВАС үлдэнэ: юу болсон, ХЭДЭН
 * ширхэг, ХЭЗЭЭ, өдрийн дүн ХЭДЭЭС ХЭД болов. Тэр нь ӨӨРӨӨ АРИЛАХГҮЙ —
 * «Хаах» дартал, эсвэл өөр хуудас руу явтал зогсоно.
 */

const QTY = 20;
const RATE = 330;
const BACK = 15;
/** Мэдэгдэл 3,200 мс-д арилдаг — зурвас нь түүнээс ХОЙШ ч зогсох ёстой. */
const AFTER_TOAST_MS = 5_000;

test('буцаалтын дараах зурвас 5 секундын дараа ч тоонуудтайгаа зогсоно',
  async ({ managerPage, data }) => {
    const { contract, material } = await data.rentSetup({
      qty: QTY, dailyRate: RATE, startDaysAgo: 45 });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const dayBefore = await page.metricMoney('Өдрийн дүн');

    const modal = await clickToOpen(page.returnButton, page.dialog('Буцаалт бүртгэх'),
                                    'Буцаалт бүртгэх цонх');
    await modal.getByLabel(`${material!.name} — буцаах тоо`).fill(String(BACK));
    await modal.getByRole('button', { name: '✓ Буцаалт бүртгэх' }).click();
    await expect(modal).toBeHidden();

    /* Зурвас нь ТООГООРОО ярина — «бүртгэгдлээ» гэсэн ганц үг нь юу
       бүртгэгдсэнийг хэлдэггүй. */
    const strip = managerPage.getByRole('status')
      .filter({ hasText: new RegExp(`Буцаалт бүртгэгдлээ — ${BACK}ш`) });
    await expect(strip, 'буцаалтын дараа зурвас гарсангүй').toBeVisible();
    await expect(strip, 'зурвас өдрийн дүнгийн ХОЁР тоог хэлсэнгүй')
      .toContainText(/өдрийн дүн [\d,]+₮ → [\d,]+₮/);

    /* Шинэ мөр нь ХАРЦНЫ ЗОГСООЛТОЙ — Отгоо цонх хаагаад «тэр мөр хаана
       билээ» гэж хайхад хүрэхгүй. */
    await page.openHistory();
    await expect(managerPage.locator('.row-fresh').first(),
      'шинээр бүртгэгдсэн хөдөлгөөн тодрохгүй байна').toBeVisible();

    /* ---- ГОЛ БАТАЛГАА: мэдэгдэл арилсан ч зурвас ҮЛДЭНЭ ---- */
    await managerPage.waitForTimeout(AFTER_TOAST_MS);
    await expect(strip, `${AFTER_TOAST_MS} мс-ийн дараа зурвас алга болжээ — `
      + 'Отгоо цаасаа эргүүлээд буцаж ирэхэд дэлгэц юу ч болоогүй мэт зогсоно')
      .toBeVisible();

    /* Тоо нь ҮНЭН: өдрийн дүн зурвас дээр амласнаараа буурсан. */
    expect(await page.metricMoney('Өдрийн дүн'),
      'зурвасын амласан тоо хуудасны тоотой зөрлөө').toBe(dayBefore - BACK * RATE);

    /* Зурвасыг ТЭР ӨӨРӨӨ хаана. */
    await strip.getByRole('button', { name: 'Хаах' }).click();
    await expect(strip, '«Хаах» дарсан ч зурвас үлдлээ').toBeHidden();
  });
