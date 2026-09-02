import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';

/**
 * H10 — ХАДГАЛАЛТ ЧИМЭЭГҮЙ УНАХГҮЙ.
 *
 * «InlineEdit нь 403/валидацийг ЗАЛГИДАГ» байв: Отгоо эгч залруулгаа бичээд
 * ✓ дарахад ЮУ Ч болохгүй, тоо нь хуучнаараа үлдэнэ. Дэлгэц дээр болж буйг
 * анзаардаггүй, машинд аль хэдийн итгэлгүй хүнд «машин бичсэнийг минь алдлаа»
 * гэдэг бол ЭЦСИЙН шийдвэр — тэр Excel рүү буцна.
 *
 * Тиймээс татгалзал ДӨРВӨН мөрөөр гарах ёстой:
 *   1. бичсэн утга нь ТАЛБАРТАА үлдэнэ (алдагдахгүй!),
 *   2. яг тэр талбарын доор ШАЛТГААН нь нэрлэгдэнэ,
 *   3. товч нь «Дахин оролдох» болж дахин оролдох зам үлдээнэ,
 *   4. өөрөө арилдаггүй мэдэгдэл ЮУ хадгалагдаагүйг НЭРЛЭНЭ.
 *
 * Хоёр тест: ХИЙМЭЛ 403 (сүлжээ таслав) ба ЖИНХЭНЭ серверийн татгалзал —
 * хоёулаа ижил дөрвөн мөрийг өгөх ёстой.
 */

const DENIED = 'Энэ үйлдлийг хийх эрх байхгүй';

test('403 буцахад бичсэн утга АЛДАГДАХГҮЙ — шалтгаан, дахин оролдох зам үлдэнэ',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 10 });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    /* Хадгалалтыг ТАСАЛНА — зөвхөн PATCH. Уншилт (GET) нь хэвийн үлдэнэ,
       эс бөгөөс хуудас бүхэлдээ унаж, тест өөр зүйл шалгах болно. */
    await managerPage.route('**/api/contracts/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 403, contentType: 'application/json',
                              body: JSON.stringify({ detail: DENIED }) });
        return;
      }
      await route.continue();
    });

    const typed = 'тээврийг захиалагч хариуцна';
    await managerPage.getByRole('button', { name: /^Тэмдэглэл:/ }).click();
    const field = managerPage.getByLabel('Тэмдэглэл — шинэ утга');
    await field.fill(typed);
    await managerPage.getByRole('button', { name: 'Хадгалахаар үргэлжлүүлэх' }).click();
    const confirm = managerPage.getByRole('button', { name: 'Хадгалах уу?' });
    await confirm.click();

    /* 1. БИЧСЭН УТГА БАЙРАНДАА — энэ бол хамгийн чухал баталгаа. */
    await expect(field, 'татгалзсаны дараа бичсэн утга алга болжээ').toHaveValue(typed);
    /* 2. ШАЛТГААН нь ЯГ тэр талбарын доор. */
    await expect(managerPage.locator('.inline-edit-err'),
      'татгалзлын шалтгаан талбарын доор гарсангүй').toHaveText(new RegExp(DENIED));
    /* 3. ДАХИН ОРОЛДОХ зам — «нэг дарснаа дахин дарж байгаа»-гаа мэдэж байна. */
    const retry = managerPage.getByRole('button', { name: 'Дахин оролдох' });
    await expect(retry, 'дахин оролдох товч гарсангүй').toBeVisible();
    /* 4. ӨӨРӨӨ АРИЛДАГГҮЙ мэдэгдэл (алдааны toast нь ✕ дартал зогсоно). */
    await expect(page.errorToast, 'татгалзлын мэдэгдэл гарсангүй').toContainText(DENIED);

    /* Талбараа орхиод явахад мэдэгдэл нь ЮУ хадгалагдаагүйг НЭРЛЭНЭ —
       улаан хүрээ нь дэлгэцнээс алга болох ч мэдэгдэл дагаж үлдэнэ. */
    await page.title.click();
    await expect(page.errorToast, 'явахад «юу хадгалагдаагүй» гэдэг нь нэрлэгдсэнгүй')
      .toContainText(`Тэмдэглэл хадгалагдсангүй — ${DENIED}`);
    /* Сервер дээр ч ЮУ Ч бичигдээгүй — хагас хадгалалт байхгүй. */
    expect((await data.detail(contract.id)).note,
      'татгалзсан атал сервер дээр хадгалагджээ').toBe('E2E');

    /* ---- Саадыг авбал ЯГ ТЭР засвар амжилттай болно ---- */
    await managerPage.unroute('**/api/contracts/*');
    await expect(field, 'дахин оролдохын өмнө утга алдагдсан байна').toHaveValue(typed);
    await retry.click();
    await expect(managerPage.locator('.inline-edit-err'),
      'амжилттай хадгалсны дараа ч алдааны мөр үлджээ').toHaveCount(0);
    await expect(managerPage.getByRole('button', { name: `Тэмдэглэл: ${typed} · засах` }),
      'хадгалагдсан утга мөрөн дээрээ гарсангүй').toBeVisible();
    expect((await data.detail(contract.id)).note, 'сервер дээр утга хадгалагдсангүй')
      .toBe(typed);
  });

test('ЖИНХЭНЭ серверийн татгалзал ч ижилхэн — залгигдахгүй, шалтгаантайгаа зогсоно',
  async ({ managerPage, data }) => {
    /* Хиймэл 403 нь зөвхөн замыг шалгана; жинхэнэ хаалганы ард ижил зан төлөв
       байгаа эсэхийг СЕРВЕРИЙН татгалзал л батална. Агуулахад байхгүй тоо
       бичих нь Отгоогийн хамгийн түгээмэл алдаа: 20ш ачилтыг 999 болгож
       засахад агуулах хүрэлцэхгүй. */
    const qty = 20;
    const { contract, movementId } = await data.rentSetup({
      ownMaterial: true, startDaysAgo: 10, qty });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const mv = (await data.detail(contract.id)).movements
      .find((m: any) => m.id === movementId);
    const panel = await page.openMovement(movementId, mv.date, 'Ачилт');

    const line = mv.lines[0];
    const label = `${line.material} (${line.grade}) · ${mv.date} — тоо`;
    /* Дуудагдах нэр нь «{материал} ({зэрэглэл}) · {огноо} — тоо: 20 · засах» —
       нэрийг ХЭВЭЭР нь дамжуулна (Playwright дэд мөрөөр таарна); regex болговол
       зэрэглэлийн хаалт нь бүлэг болж, хайлт хоосорно. */
    await panel.getByRole('button', { name: `${label}: ${line.qty}` }).click();
    const field = managerPage.getByLabel(`${label} — шинэ утга`);
    await field.fill('999');
    await managerPage.getByRole('button', { name: 'Хадгалахаар үргэлжлүүлэх' }).click();
    await managerPage.getByRole('button', { name: 'Тоо солих уу?' }).click();

    await expect(field, 'серверийн татгалзлын дараа бичсэн тоо алга болжээ')
      .toHaveValue('999');
    await expect(managerPage.locator('.inline-edit-err'),
      'серверийн шалтгаан талбарын доор гарсангүй').toContainText('Агуулахад хүрэлцэхгүй');
    await expect(managerPage.getByRole('button', { name: 'Дахин оролдох' })).toBeVisible();
    await expect(page.errorToast).toContainText('Агуулахад хүрэлцэхгүй');
    /* Хөдөлгөөн нь ХЭВЭЭР — хагас хадгалалт байхгүй. */
    const after = (await data.detail(contract.id)).movements
      .find((m: any) => m.id === movementId);
    expect(after.lines[0].qty, 'татгалзсан атал тоо өөрчлөгджээ').toBe(qty);
  });
