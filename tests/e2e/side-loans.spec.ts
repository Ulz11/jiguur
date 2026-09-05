import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures';
import { clickToOpen } from '../support/interact';
import { expectReady } from '../support/routes';
import { readReceipt } from '../support/receipt';

/**
 * ЗЭЭЛ — ХОЦРОЛТ МӨРӨН ДЭЭР, ҮЛДЭГДЛИЙН ШИЛЖИЛТ БАРИМТ ДЭЭР.
 *
 * Сервер `overdue`, `days_late`, `due_day` гурвыг мөр бүр дээр өгдөг мөртөө
 * дэлгэц дээр ЮУ Ч гардаггүй байв: «энэ сарынх төлөгдсөн үү» гэсэн асуултыг
 * Отгоо төлөлтийн түүхийг задалж, огноог нүдээрээ тулгаж хариулна.
 *
 * Түүнчлэн төлөлт бүртгэсний дараа сервер зээлийг АВТОМАТААР хааж болно
 * (`closed: true`) — мөр нь жагсаалтаас алга болдог ба дэлгэц юу ч
 * хэлдэггүй байв.
 */

/** Мэдэгдэл 3,200 мс-д арилдаг — зурвас нь түүнээс ХОЙШ ч зогсох ёстой. */
const AFTER_TOAST_MS = 5_000;
const PRINCIPAL = 300_000_000;
const PAY = 10_000_000;

/** ЭНЭ САРЫН 1-нд төлөх ёстой байсан зээл — гурван сарын өмнө эхэлсэн. */
function startedThreeMonthsAgoOnTheFirst(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 3);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

async function makeLoan(data: any, opts: { start: string; payment?: number }) {
  const name = `E2E-зээл ${randomUUID().slice(0, 8)}`;
  const res = await data.api.post('/api/loans', {
    data: { name, kind: 'bank', principal: PRINCIPAL, monthly_rate: 1.6,
            start_date: opts.start, note: '', monthly_payment: opts.payment ?? 0 },
  });
  expect(res.ok(), `зээл үүсгэх — ${res.status()} ${await res.text()}`).toBeTruthy();
  return { name, id: (await res.json()).id as number };
}

test('хоцорсон төлөлт мөрөн дээрээ УЛААН пилээр, толгойд нь тоогоороо зогсоно',
  async ({ managerPage, data }) => {
    /* Сарын 1-нд ЯМАР Ч зээл хоцорч чадахгүй: төлөх өдөр нь өнөөдөр эсвэл
       хойно (`services/loans.overdue_state`). Тэр өдөр энэ баталгаа утгагүй. */
    test.skip(new Date().getDate() < 2,
              'сарын 1-нд төлөх өдөр хараахан өнгөрөөгүй — хоцролт төрөх боломжгүй');

    const loan = await makeLoan(data, { start: startedThreeMonthsAgoOnTheFirst() });

    await managerPage.goto('/loans');
    await expectReady(managerPage, 'Зээл / Өглөг', 'Зээл / Өглөг');

    const row = managerPage.getByRole('row').filter({ hasText: loan.name });
    await expect(row, 'шинэ зээл жагсаалтад алга').toBeVisible();
    await expect(row, 'хоцролт мөрөн дээр ЮУ Ч хэлээгүй — өнгө дангаараа утга зөөхгүй')
      .toContainText(/Төлөлт хоцорсон · \d+ хоног/);

    /* Толгой дээр ХЭДЭН зээл хоцорсныг тоогоор — «нэг нь хоцорсон уу, бүгд үү»
       гэсэн асуулт жагсаалт гүйлгэхгүйгээр хариулагдана. */
    const hero = managerPage.locator('.card').filter({ hasText: 'Хоцорсон' }).first();
    await expect(hero, 'толгой дээр «Хоцорсон» тоо алга').toContainText(/зээлийн төлөлт хоцорсон/);

    /* «Сарын хүүгийн дарамт» нь Аналитикийн тоотой ХОСООРОО зогсоно. */
    await expect(managerPage.getByText(/Тохирсон сарын төлөлт:/),
                 '«Тохирсон сарын төлөлт» мөр алга — Аналитикийн тоо ганцаараа үлдэнэ')
      .toBeVisible();
  });

test('төлөлтийн цонх үлдэгдлийн ХОЁР тоог баримтлаж, зурвас нь дараа нь ч зогсоно',
  async ({ managerPage, data }) => {
    const loan = await makeLoan(data, { start: startedThreeMonthsAgoOnTheFirst() });

    await managerPage.goto('/loans');
    await expectReady(managerPage, 'Зээл / Өглөг', 'Зээл / Өглөг');

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: `${loan.name} — төлөлт бүртгэх` }),
      managerPage.getByRole('dialog').filter({ hasText: `Төлөлт — ${loan.name}` }),
      'Төлөлтийн цонх');

    /* ҮНДСЭН төлбөр — үлдэгдлийг ҮНЭХЭЭР хөдөлгөдөг цорын ганц хэлбэр. */
    await modal.getByRole('button', { name: 'Үндсэн дүн' }).click();
    await modal.getByLabel('Дүн ₮').fill(String(PAY));

    const receipt = await readReceipt(modal, 'төлөлтийн баримт');
    expect(receipt.value('Үлдэгдэл'),
      'баримт үлдэгдлийн ХОЁР тоог зэрэгцүүлсэнгүй — Отгоо өмнөх тоог санахгүй')
      .toMatch(/^[\d.,]+( сая| тэрбум)?₮ → [\d.,]+( сая| тэрбум)?₮$/);

    /* Гол товч нь БАРИМТЫН дараа ч нүдний өмнө (гүйлтийн ГАДНА). */
    const submit = modal.getByRole('button', { name: 'Бүртгэх' });
    const box = (await submit.boundingBox())!;
    expect(Math.round(box.y + box.height),
      '«Бүртгэх» дэлгэцээс гарлаа').toBeLessThanOrEqual(managerPage.viewportSize()!.height);

    await submit.click();
    await expect(modal, 'төлөлтийн цонх хаагдсангүй').toBeHidden();

    /* ЗУРВАС — тоонуудтайгаа, ба мэдэгдэл арилсны ДАРАА ч зогсож байна. */
    /* Мэдэгдэл (`ui.tsx`) ч `role="status"` — зурвасыг ТООНУУДААРАА нь ялгана
       (мэдэгдэл нь «Төлөлт бүртгэгдлээ» гэсэн ганц өгүүлбэр). */
    const strip = managerPage.getByRole('status').filter({ hasText: /Төлөлт бүртгэгдлээ —/ });
    await expect(strip, 'төлөлтийн дараа зурвас гарсангүй').toBeVisible();
    await expect(strip, 'зурвас үлдэгдлийн хоёр тоог хэлсэнгүй')
      .toContainText(/үлдэгдэл [\d,]+₮ → [\d,]+₮/);

    await managerPage.waitForTimeout(AFTER_TOAST_MS);
    await expect(strip, `${AFTER_TOAST_MS} мс-ийн дараа зурвас алга болжээ`).toBeVisible();
  });
