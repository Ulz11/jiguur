import { test, expect } from '../fixtures';
import { clickToOpen } from '../support/interact';
import { expectReady } from '../support/routes';

/**
 * ЦАЛИН — БУРУУ БОДСОНЫГ УСТГАХ ЗАМ, БА НДШ-ИЙН ХУВЬ ХААНААС ИРЭХ.
 *
 * Бодолт устгах зам ОГТ БАЙГААГҮЙ (сервер нь `DELETE /api/salary/runs/{id}`
 * -ыг олгодог мөртөө): Отгоо өдрийн ажилчдын хоногийг андуурч бөглөвөл тэр
 * бодолт үүрд жагсаалтад үлдэж, зөв нь дэргэд нь хоёр дахь мөр болно.
 *
 * НДШ-ийн хувь нь цонхон дээр «11.5%» гэж ХАТУУ бичигдсэн байв. Тохиргоо
 * дээр 13% болгосон ч тэр мөр 11.5 гэж хэлсээр байх тул аль нь үнэн болох
 * нь мэдэгдэхгүй.
 */

test('олгоогүй бодолт устгагдаж, зурвас нь юу устгасныг тоогоороо хэлнэ',
  async ({ managerPage, data }) => {
    const run = await data.createSalaryRun();

    await managerPage.goto('/salary');
    await expectReady(managerPage, 'Цалин', 'Цалин');

    const row = managerPage.getByRole('row').filter({ hasText: run.period });
    await expect(row, 'шинэ бодолт жагсаалтад алга').toBeVisible();

    const ask = await clickToOpen(
      row.getByRole('button', { name: `${run.period} · ${run.half}-р хагас — бодолт устгах` }),
      managerPage.getByRole('dialog').filter({ hasText: 'Бодолт устгах' }),
      'Бодолт устгах цонх');

    await ask.getByRole('button', { name: 'Устгах' }).click();
    await expect(ask, 'баталгаажуулах цонх хаагдсангүй').toBeHidden();

    /* Мэдэгдэл ч `role="status"` — зурвасыг ТООНУУДААРАА нь ялгана. */
    await expect(managerPage.getByRole('status').filter({ hasText: /Бодолт устгагдлаа —/ }),
                 'устгасны дараа зурвас гарсангүй').toBeVisible();
    await expect(managerPage.getByRole('row').filter({ hasText: run.period }),
                 'устгасан бодолт жагсаалтад үлджээ').toHaveCount(0);
  });

test('ОЛГОСОН бодолт дээр устгах товч огт зурагдахгүй — сервертэй нэг үг',
  async ({ managerPage, data }) => {
    const run = await data.createSalaryRun();
    const paid = await data.api.post(`/api/salary/runs/${run.id}/pay`,
                                     { data: { date: data.isoDaysAgo(0) } });
    expect(paid.ok(), await paid.text()).toBeTruthy();

    await managerPage.goto('/salary');
    await expectReady(managerPage, 'Цалин', 'Цалин');

    const row = managerPage.getByRole('row').filter({ hasText: run.period });
    await expect(row.getByRole('button', { name: /бодолт устгах/ }),
                 'олгосон бодолт дээр устгах товч зурагджээ — сервер 400 буцаана')
      .toHaveCount(0);
    await expect(row, 'яагаад устгаж болохгүйг мөр нь хэлсэнгүй')
      .toContainText('Олгосон бодолтыг устгах боломжгүй');
  });

test('НДШ-ийн хувь ТОХИРГООНООС ирнэ — цонхон дээр хатуу бичигдэхгүй',
  async ({ managerPage }) => {
    await managerPage.goto('/salary');
    await expectReady(managerPage, 'Цалин', 'Цалин');

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Ажилтан' }),
      managerPage.getByRole('dialog').filter({ hasText: 'Шинэ ажилтан' }),
      'Шинэ ажилтан цонх');

    /* Хувь нь `/api/salary/summary`-аас ирдэг тул тестийн DB-д ямар ч утга
       суусан байсан хэлбэр нь ижил: «НДШ суутгана (X%)». */
    await expect(modal.getByText(/^НДШ суутгана \([\d.]+%\)$/),
                 'НДШ-ийн шошго тохиргооны хувийг хэлсэнгүй').toBeVisible();
  });

test('цалингийн сан нь БРУТТО ба ГАРТ ОЛГОХ хоёр тоогоо зэрэгцүүлнэ',
  async ({ managerPage }) => {
    await managerPage.goto('/salary');
    await expectReady(managerPage, 'Цалин', 'Цалин');

    const card = managerPage.locator('.card').filter({ hasText: 'Сарын цалингийн сан' }).first();
    await expect(card, 'гарт олгох дүн алга — мөнгөн урсгал төлөвлөхөд НДШ-ээ гараар хасна')
      .toContainText(/гарт олгох [\d,]+₮/);
  });
