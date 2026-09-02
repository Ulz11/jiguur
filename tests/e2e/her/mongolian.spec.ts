import { test, expect } from '../../fixtures';
import { scanLatin, describeHits, ALLOWED } from '../../support/latin';
import { HER_ROUTES, expectReady, openHerPage } from '../../support/routes';

/**
 * АНГЛИ ҮГ ТҮҮНИЙ НҮДЭНД ХҮРЭХГҮЙ.
 *
 * Отгоо эгч англи МЭДЭХГҮЙ. Дэлгэц дээрх «void», «rate_change», «cron» гэсэн
 * үг нь түүний хувьд алдааны мессеж биш — ХООСОН НҮД: тэр мөрөнд юу болсныг
 * тааж чадахгүй тул бүхэл хуудсыг «миний хуудас биш» гэж хаяна. Excel-ийн
 * 20 жилд түүний дэвтэрт англи үг НЭГ Ч байгаагүй.
 *
 * Зөвшөөрөгдсөн латин нь `tests/support/latin.ts`-д, БҮГД ТАЙЛБАРТАЙГААР
 * (баримтын дугаар, файлын формат, тестийн өөрийн дата) — тэр жагсаалтад мөр
 * нэмэх нь «энэ англи үгийг Отгоо ойлгоно» гэсэн ил шийдвэр.
 */

test.describe('Отгоо эгчийн хэл', () => {
  for (const route of HER_ROUTES) {
    test(`«${route.path}» дээр латин үг алга`, async ({ managerPage }) => {
      await openHerPage(managerPage, route);
      const hits = await scanLatin(managerPage);
      expect(hits, `«${route.path}» дээр англи үг зурагдлаа:\n      ${describeHits(hits)}`)
        .toEqual([]);
    });
  }

  test('шүүлт өөрөө ажиллаж байгаагийн ЭСРЭГ ТАЛ — англи үг байвал БАРИНА',
    async ({ managerPage }) => {
      /* Хоосон хуудсан дээр «англи алга» гэдэг нь утгагүй ногоон. Тиймээс
         жинхэнэ хуудсанд ганц англи үг ТАРИАД, шүүлт түүнийг олж байгааг
         батална. Дараа нь буцааж авна — DOM-ын өөрчлөлт тул серверт хүрэхгүй. */
      await openHerPage(managerPage, HER_ROUTES[0]);
      expect(await scanLatin(managerPage), 'эхлэхэд аль хэдийн бохир байна').toEqual([]);

      await managerPage.evaluate(() => {
        const probe = document.createElement('div');
        probe.id = 'jz-latin-probe';
        probe.textContent = 'pending approval';
        document.querySelector('main')!.appendChild(probe);
      });
      const caught = await scanLatin(managerPage);
      expect(caught.map((h) => h.word).sort(), 'тарьсан англи үгийг шүүлт олсонгүй')
        .toEqual(['approval', 'pending']);

      await managerPage.evaluate(() => document.getElementById('jz-latin-probe')!.remove());
      expect(await scanLatin(managerPage)).toEqual([]);
    });

  test('зөвшөөрлийн жагсаалт бүрэн ТАЙЛБАРТАЙ — «яагаад» гүй мөр байхгүй', () => {
    /* Зөвшөөрөл нэмэх нь шийдвэр. Шалтгаангүй мөр орвол жагсаалт нь аажмаар
       «англи үг нуух газар» болж хувирна — тэр агшинд энэ бүх suite утгаа
       алдана. Тиймээс хэлбэрийг нь машин барина. */
    for (const a of ALLOWED) {
      expect(a.why.length, `«${a.re.source}» зөвшөөрөл тайлбаргүй байна`).toBeGreaterThan(20);
      expect(a.re.flags, `«${a.re.source}» нь /g тугтай байх ёстой`).toContain('g');
    }
  });
});

/**
 * ҮЙЛДЛИЙН БҮРТГЭЛ — англи түлхүүр гоожиж байсан ГАНЦ газар.
 *
 * `pages/Audit.tsx` нь `ACTIONS[r.action] || r.action` гэсэн чимээгүй уналттай
 * толь ашигладаг байв. Backend-ийн `void`, `close`, `book_penalty`, `cron`
 * үйлдэл ба `akt`, `rate_change`, `penalty_charge`, `machine*` биетүүд тольд
 * БАЙГААГҮЙ тул дэлгэц дээр «void», «rate_change» гэсэн товч, пил шууд
 * зурагддаг байлаа. Cron-ы мөр нь «Хэн» багана дээр «—» гэж зогсдог байв.
 *
 * Дээрх ерөнхий шүүлт нь БАЙГАА мөрүүдийг л хардаг тул энэ тест зөрчлийг
 * ӨӨРӨӨ ТӨРҮҮЛНЭ: гэрээ үүсгээд, акт бичиж, тариф сольж, алданги нэхээд,
 * бүгдийг нь хүчингүй болгож, эцэст нь гэрээгээ хааж — тэгээд /audit дээр
 * тэдгээр мөрүүд монголоор бичигдсэн эсэхийг шалгана.
 * (`cron` үйлдлийг HTTP-ээр төрүүлэх зам байхгүй — түүнийг
 * `system/backend/tests/test_cron.py` ба `src/lib/audit.test.ts` барина.)
 */
test('үйлдлийн бүртгэл: void · akt · rate_change · book_penalty · close бүгд монголоор',
  async ({ managerPage, data }) => {
    const { client, contract, material } = await data.rentSetup({
      startDaysAgo: 75, qty: 8, dailyRate: 300, penaltyPercent: 0.5,
    });
    const api = data.api;

    /* --- create + void: төлбөр --- */
    const payment = await data.registerPayment({ clientId: client.id, amount: 100_000 });
    const voidPay = await api.post(`/api/payments/${payment.id}/void`,
                                   { data: { reason: 'дүнг буруу бичсэн' } });
    expect(voidPay.ok(), await voidPay.text()).toBeTruthy();

    /* --- create + void: акт --- */
    const akt = await data.addAkt(contract.id, {
      date: data.isoDaysAgo(3), amount: 250_000, note: 'эвдэрсэн хэвний засвар',
    });
    const voidAkt = await api.post(`/api/akt/${akt.id}/void`,
                                   { data: { reason: 'давхар бичсэн', confirm: true } });
    expect(voidAkt.ok(), await voidAkt.text()).toBeTruthy();

    /* --- create + void: тарифын өөрчлөлт --- */
    const rate = await api.post(`/api/contracts/${contract.id}/rate-change`, {
      data: {
        material_id: material!.id, grade_id: material!.gradeId,
        old_rate: contract.dailyRate, new_rate: 450,
        effective_from: null, note: 'дахин тохиров', confirm: true,
      },
    });
    expect(rate.ok(), await rate.text()).toBeTruthy();
    const rateId = (await rate.json()).id;
    const voidRate = await api.post(`/api/rate-changes/${rateId}/void`,
                                    { data: { reason: 'буруу тарифаар бичив', confirm: true } });
    expect(voidRate.ok(), await voidRate.text()).toBeTruthy();

    /* --- book_penalty + penalty_charge void ---
       `POST /book-penalty` нь {as_of, total, rows} буцаадаг (нэхэлтийн id БИШ) —
       нэхэлтийн биетийг гэрээний дэлгэрэнгүйгээс уншина. */
    const booked = await data.bookPenalty(contract.id);
    expect(booked.total, 'алданги нэхэгдсэнгүй — гэрээнд алдангийн хувь алга уу?')
      .toBeGreaterThan(0);
    const withCharge = await data.detail(contract.id);
    const chargeId = withCharge.penalty_charges?.at(-1)?.id;
    expect(chargeId, 'алдангийн нэхэлт гэрээн дээр бүртгэгдсэнгүй').toBeTruthy();
    const voidCharge = await api.post(`/api/penalty-charges/${chargeId}/void`,
                                      { data: { reason: 'утсаар ярьж өршөөв', confirm: true } });
    expect(voidCharge.ok(), await voidCharge.text()).toBeTruthy();

    /* --- close: гэрээ хаах (бараа буцсаны дараа) --- */
    const detail = await data.detail(contract.id);
    const issued = detail.movements.find((m: any) => m.type === 'ISSUE' && m.status === 'done');
    const back = await data.addMovement(contract.id, {
      type: 'RETURN', date: data.isoDaysAgo(1), note: 'бүгдийг буцаав',
      lines: [{ material_id: material!.id, grade_id: material!.gradeId, qty: contract.qty,
                issue_line_id: issued.lines[0].id, return_grade_id: material!.gradeId }],
    });
    await data.confirmMovement(back.id);
    const closed = await api.post(`/api/contracts/${contract.id}/close`,
                                  { data: { close_date: data.isoDaysAgo(0) } });
    expect(closed.ok(), await closed.text()).toBeTruthy();

    /* ---------- ДЭЛГЭЦ ---------- */
    await managerPage.goto('/audit');
    await expectReady(managerPage, 'Үйлдлийн бүртгэл', 'Үйлдлийн бүртгэл');

    /* 1. Бүх мөрийн «Юу» багана — түүхий англи түлхүүр байж болохгүй. */
    const actions = await managerPage.locator('tbody td:nth-child(3)').allInnerTexts();
    expect(actions.length, 'бүртгэл хоосон байна — тест юу ч төрүүлээгүй').toBeGreaterThan(5);
    const rawActions = actions.filter((t) => /[A-Za-z]/.test(t));
    expect(rawActions, `«Юу» багана дээр түүхий түлхүүр: ${rawActions.join(' | ')}`).toEqual([]);

    /* 2. Шүүлтүүрийн товчнууд — тэдгээр нь ЯГ тэр толиос гардаг. */
    const filters = await managerPage.locator('.segment > button').allInnerTexts();
    const rawFilters = filters.filter((t) => /[A-Za-z]/.test(t));
    expect(rawFilters, `шүүлтүүр дээр түүхий түлхүүр: ${rawFilters.join(' | ')}`).toEqual([]);

    /* 3. Энэ тестийн төрүүлсэн үйлдлүүд ЯГ ЭНЭ үгсээр гарсан байх ёстой. */
    for (const word of ['Хүчингүй болгосон', 'Алданги нэхсэн', 'Гэрээ хаасан']) {
      await expect(managerPage.getByText(word, { exact: true }).first(),
                   `«${word}» гэсэн үйлдэл бүртгэлд алга`).toBeVisible();
    }
    for (const word of ['Акт', 'Тарифын өөрчлөлт', 'Алдангийн нэхэлт']) {
      await expect(managerPage.locator('.segment > button')
                     .filter({ hasText: new RegExp(`^${word}$`) }).first(),
                   `«${word}» шүүлтүүр алга — биетийн толь дутуу байна`).toBeVisible();
    }

    /* 4. «Хэн» багана — хоосон нүд («—») үлдээж болохгүй.
          Хүн хийгээгүй үйлдэл ч гарын үсэгтэй байна («Систем»). */
    const actors = await managerPage.locator('tbody td:nth-child(2)').allInnerTexts();
    expect(actors.filter((a) => a.trim() === '—'),
           'бүртгэлд ЭЗЭНГҮЙ мөр үлдлээ — «энэ юуг хэн хийв?» гэсэн хариулагдахгүй асуулт')
      .toEqual([]);

    /* 5. Бүхэл хуудас — ерөнхий шүүлт (дэлгэрэнгүй баганыг ч оруулаад). */
    const hits = await scanLatin(managerPage);
    expect(hits, `/audit дээр англи үг зурагдлаа:\n      ${describeHits(hits)}`).toEqual([]);
  });
