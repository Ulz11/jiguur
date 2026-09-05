import { test, expect } from '../fixtures';
import { expectReady } from '../support/routes';
import { scanLatin, describeHits } from '../support/latin';

/**
 * ҮЙЛДЛИЙН БҮРТГЭЛ — ШҮҮГДЭХ, ХУУДАСЛАГДАХ, ЦАГАА ХЭЛДЭГ.
 *
 * Гурван бодит уналт (2026-09):
 *   1. Сервер `{rows, total}` буцаадаг болсныг хуудас нь МАССИВ гэж уншиж
 *      байсан — `rows.filter` нь `undefined` дээр унаж, /audit БҮХЭЛДЭЭ
 *      цагаан болно.
 *   2. Шүүлтүүрийн товч нь АЧААЛАГДСАН мөрүүдээс төрдөг: сүүлийн 300 мөрөнд
 *      «Бартер» гараагүй бол тэр товч ОГТ байхгүй — Отгоо эгч «бартерын
 *      түүх алга» гэж уншина. Толь нь дүүрэн байхад.
 *   3. Огноогоор шүүх зам байхгүй, `offset` ашиглагдаагүй: 300 дахь мөрөөс
 *      цааш бүртгэл нь ОРШИН БАЙГАА боловч ХҮРЭХГҮЙ.
 */

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

test('бүртгэл нь `{rows, total}` уншиж, цагаа ОРОН НУТГИЙН огноо-цагаар хэлнэ',
  async ({ managerPage, data }) => {
    /* Мөр ТӨРҮҮЛНЭ — хоосон хуудсан дээр «уншигдлаа» гэдэг нь хоосон ногоон. */
    await data.createClient();

    await managerPage.goto('/audit');
    await expectReady(managerPage, 'Үйлдлийн бүртгэл', 'Үйлдлийн бүртгэл');

    const rows = managerPage.locator('tbody tr');
    expect(await rows.count(), 'бүртгэл хоосон — хуудас `.rows`-оо уншсангүй бололтой')
      .toBeGreaterThan(0);

    /* «Хэзээ» багана — ОГНОО ба ЦАГ хамт. Түүхий ISO мөр (`T`, `+08:00`) нь
       ЛАТИН тул Отгоогийн нүдэнд хүрэх ёсгүй; цаг нь ганцаараа зогсвол
       «хэзээ билээ» гэсэн асуулт үлдэнэ. */
    const stamps = await managerPage.locator('tbody td:nth-child(1)').allInnerTexts();
    const bad = stamps.map((t) => t.trim()).filter((t) => !STAMP.test(t));
    expect(bad, `«Хэзээ» багана огноо-цагаараа зурагдсангүй: ${bad.slice(0, 3).join(' | ')}`)
      .toEqual([]);

    /* Толгой нь ХЭДИЙГ ХЭДЭЭС үзүүлж байгааг хэлнэ. */
    await expect(managerPage.getByRole('heading', { level: 1 }).locator('..'),
                 'толгой дээр нийт бичилтийн тоо алга').toContainText(/БИЧИЛТ/);

    const hits = await scanLatin(managerPage);
    expect(hits, `/audit дээр англи үг зурагдлаа:\n      ${describeHits(hits)}`).toEqual([]);
  });

test('шүүлтүүр нь ТОЛИНООС төрнө — сүүлийн 30 хоногт гараагүй биет ч замтай',
  async ({ managerPage }) => {
    await managerPage.goto('/audit');
    await expectReady(managerPage, 'Үйлдлийн бүртгэл', 'Үйлдлийн бүртгэл');

    /* Эдгээр биет тестийн DB-д сүүлийн 30 хоногт гарсан ЭСЭХ нь мэдэгдэхгүй —
       гэсэн ч зам нь нээлттэй байх ЁСТОЙ (толинд байгаа болохоор). */
    for (const word of ['Бартер', 'Цалин', 'Механизмын нэхэмжлэл', 'Тарифын өөрчлөлт']) {
      await expect(managerPage.locator('.segment > button')
                     .filter({ hasText: new RegExp(`^${word}$`) }).first(),
                   `«${word}» шүүлтүүр алга — товч мөрөөс биш, толиос төрөх ёстой`)
        .toBeVisible();
    }

    /* Үйлдлийн жагсаалт ч мөн адил — ТҮЛХҮҮРЭЭР шалгана (хоёр түлхүүр нэг
       монгол нэртэй байж болно: `stocktake` ба `adjust` хоёул «Тооллого»). */
    const opts = await managerPage.getByLabel('Юу хийсэн').evaluate(
      (el) => Array.from((el as HTMLSelectElement).options).map((o) => ({ v: o.value, t: o.text })));
    for (const key of ['stocktake', 'rebuild', 'cron', 'close']) {
      expect(opts.map((o) => o.v), `«${key}» үйлдэл сонголтод алга — толь дутуу`)
        .toContain(key);
    }
    const raw = opts.map((o) => o.t).filter((t) => /[A-Za-z]/.test(t));
    expect(raw, `үйлдлийн сонголт дээр түүхий түлхүүр: ${raw.join(' | ')}`).toEqual([]);
  });

test('огнооны цонх СЕРВЕР дээр шүүнэ — хоосон үед хугацаагаа нэрлэнэ',
  async ({ managerPage }) => {
    await managerPage.goto('/audit');
    await expectReady(managerPage, 'Үйлдлийн бүртгэл', 'Үйлдлийн бүртгэл');

    /* Хол өнгөрсөн цонх — систем тэр үед оршин ч байгаагүй. */
    await managerPage.getByLabel('Эхлэх огноо').fill('2019-01-01');
    await managerPage.getByLabel('Дуусах огноо').fill('2019-01-31');

    /* Хоосон нь ГАРЦГҮЙ ХАНА байх ёсгүй: юу хайснаа хэлж, буцах товчтой. */
    await expect(managerPage.getByText('Энэ хугацаанд бичилт алга — хугацааг сунгах'),
                 'хоосон төлөв хугацаагаа нэрлэсэнгүй').toBeVisible();
    await expect(managerPage.getByText('2019-01-01 – 2019-01-31'),
                 'харсан хугацаа хаана ч бичигдээгүй').toBeVisible();

    /* Шүүлт арилгах → мөрүүд буцаж ирнэ (сервер рүү ШИНЭ хүсэлт явсны дохио). */
    await managerPage.getByRole('button', { name: 'Шүүлт арилгах' }).first().click();
    await expect(managerPage.locator('tbody tr').first(),
                 'шүүлт арилгасны дараа мөр буцаж ирсэнгүй').toBeVisible();
  });
