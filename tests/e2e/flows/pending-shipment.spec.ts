import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen } from '../../support/interact';

/**
 * ХҮЛЭЭГДЭЖ БУЙ АЧИЛТ — ГЭРЭЭНИЙ ХУУДАС ДЭЭР, ЗАМЫГ НЬ ХАМТ.
 *
 * «+ Нэмэлт олголт» нь `pending` хөдөлгөөн үүсгэдэг: нөөц хөдөлдөггүй,
 * өдрийн дүн өсдөггүй, гэрээ нь «дутуу» мэт харагдана. Гэрээний хуудас
 * энэ тухай ганц шар пил («+450ш хүлээгдэж буй») хүснэгтийн мөрөндөө
 * зурдаг байсан бөгөөд баталгаажуулах хаалга нь ЗӨВХӨН Удирдлагын төв
 * дээр байв. Отгоо ЯАГААД тоо нь өсөөгүйг мэдэхгүй, дарга нь өөр хуудсанд.
 *
 * Одоо: материалын хүснэгтийн ДЭЭР нэрлэсэн зурвас, дотор нь «Ачсан ✓».
 * Тэр даралт нь дашбоардынхтай ЯГ ижил асуулт (ижил гарчиг, ижил баримт,
 * ижил сануулга) — нэг үйлдэл хоёр газар хоёр өөр асуулттай байвал Отгоо
 * аль нь «жинхэнэ» гэдгээ мэдэхгүй.
 *
 * Мөн хуудас нь АМЬД (`lib/live.ts`): дарга өөр компьютер дээрээс
 * баталгаажуулахад Отгоогийн нээлттэй хуудас F5-гүйгээр өөрөө шинэчлэгдэнэ.
 */

const QTY = 20;
const RATE = 330;
const ADD = 30;

test('нэмэлт олголт → зурвас → дарга гэрээн дээрээс «Ачсан ✓» → тооцоонд орно',
  async ({ managerPage, factoryPage, data }) => {
    const { contract, material } = await data.rentSetup({
      qty: QTY, dailyRate: RATE, startDaysAgo: 45 });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const dayBefore = await page.metricMoney('Өдрийн дүн');
    expect(dayBefore, 'тестийн суурь буруу — ачилт баталгаажаагүй байна').toBe(QTY * RATE);

    /* ---- 1. Отгоо нэмэлт олголт бүртгэнэ ---- */
    const add = await clickToOpen(page.addIssueButton, page.dialog('Нэмэлт олголт'),
                                  'Нэмэлт олголт цонх');
    await add.getByLabel(`${material!.name} (${material!.grade}) — нэмэх тоо`).fill(String(ADD));
    await add.getByRole('button', { name: 'Илгээх' }).click();
    await expect(add).toBeHidden();

    /* Хийгдсэн зүйл нь ХУУДСАН ДЭЭР үлдэнэ — 3.2 секундын мэдэгдэл биш. */
    await expect(managerPage.getByText(new RegExp(`Нэмэлт олголт бүртгэгдлээ — ${ADD}ш`)),
      'олголтын үр дүн хуудсан дээр үлдсэнгүй').toBeVisible();

    /* ---- 2. Зурвас нь материалын хүснэгтийн ДЭЭР ---- */
    const banner = managerPage.locator('.card').filter({
      has: managerPage.getByRole('heading', { name: /Ачилт хүлээгдэж байна/ }) });
    await expect(banner, 'хүлээгдэж буй ачилтын зурвас гарсангүй').toBeVisible();
    await expect(banner).toContainText(`${ADD}ш ${material!.name}`);
    await expect(banner, 'ХЭН дарах ёстойг зурвас хэлсэнгүй')
      .toContainText('дарга «Ачсан ✓» дарсны дараа тооцоонд орно');
    /* Тооцоо нь ХӨДӨЛӨӨГҮЙ — энэ бол хүлээлт. */
    expect(await page.metricMoney('Өдрийн дүн'),
      'баталгаажаагүй олголт тооцоонд орчихлоо').toBe(dayBefore);

    /* ---- 3. ДАРГА гэрээний хуудсан дээрээс баталгаажуулна ---- */
    const dargaPage = new ContractDetailPage(factoryPage);
    await dargaPage.goto(contract.id);
    const dargaBanner = factoryPage.locator('.card').filter({
      has: factoryPage.getByRole('heading', { name: /Ачилт хүлээгдэж байна/ }) });
    await expect(dargaBanner, 'даргад зурвас харагдсангүй').toBeVisible();
    /* Зурвасын товч МӨРӨӨ нэрлэдэг тул нэр нь ялгаатай («✓» нь чимэг тул
       уншигчид нуугдана — дашбоардын дараалалтай ЯГ ижил дүрэм). Цонхных нь
       ЯГ «Ачсан ✓». */
    const ask = await clickToOpen(
      dargaBanner.getByRole('button', { name: new RegExp(`^Ачсан — ${ADD}ш`) }),
      dargaPage.dialog('Ачилт баталгаажуулах'), 'Ачилт баталгаажуулах цонх');
    await expect(ask, 'баталгаажуулах цонх ачих тоогоо нэрлээгүй')
      .toContainText(`${ADD} ш`);
    await ask.getByRole('button', { name: 'Ачсан ✓', exact: true }).click();
    await expect(ask).toBeHidden();

    /* ---- 4. Зурвас арилж, тоо нь ТҮРЭЭСЭНД орлоо ---- */
    await expect(dargaBanner, 'баталгаажсан ч зурвас үлдлээ').toBeHidden();
    await expect(factoryPage.getByText(new RegExp(`Ачилт баталгаажлаа — ${ADD}ш`)),
      'даргын хуудсан дээр үр дүн үлдсэнгүй').toBeVisible();
    const after = await data.detail(contract.id);
    expect(after.qty_out, 'баталгаажсан олголт түрээсэнд гарсангүй').toBe(QTY + ADD);

    /* ---- 5. ОТГООГИЙН НЭЭЛТТЭЙ ХУУДАС ӨӨРӨӨ ШИНЭЧЛЭГДЭНЭ (X3) ----
       Дарга өөр компьютер дээрээс дарсан — Отгоо F5 дардаггүй. Хуудас нь
       цонх руу буцаж ирэхэд шинэчлэгддэг (`lib/live.ts`).
       ⚠ 5 секундын хүлээлт нь СОХОР БИШ: `Poller.minGapMs` нь сүүлийн
       татлагаас хойш 5 секунд болоогүй бол ЗОРИУД татдаггүй (лаптоп сэрэхэд
       focus + visibilitychange давхардахаас). Тэр цонхыг л хүлээж байна. */
    await factoryPage.close();
    await data.addMovement(contract.id, {
      type: 'ISSUE', date: data.isoDaysAgo(0), note: 'E2E хоёр дахь падан',
      lines: [{ material_id: contract.materialId, grade_id: contract.gradeId, qty: 5 }],
    });
    await managerPage.waitForTimeout(5_200);
    await managerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(banner, 'дарга дээр гарсан ачилт Отгоогийн нээлттэй хуудсан дээр гарч ирсэнгүй')
      .toContainText('5ш');
  });
