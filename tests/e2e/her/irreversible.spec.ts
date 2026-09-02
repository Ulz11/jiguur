import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { expectOneWayDoor, tooltipOnlyReasons } from '../../support/danger';
import { expectReady } from '../../support/routes';

/**
 * НЭГ ЧИГИЙН ХААЛГА БҮР ӨӨРИЙГӨӨ ЗАРЛАНА.
 *
 * Отгоо эгчийн хоёр зан чанар энэ файлыг бүхэлд нь тодорхойлно:
 *   · тэр дэлгэц дээр болж буйг АНЗААРДАГГҮЙ — toast, pill, hover-оор
 *     хэлсэн зүйл түүнд ХЭЛЭГДЭЭГҮЙТЭЙ адил;
 *   · тэр жагсаалт дундуур ENTER ДАРДАГ — 20 жилийн Excel-ийн дадал.
 *
 * Тиймээс буцаах боломжгүй үйлдэл бүр дээр:
 *   1. «Энэ үйлдлийг буцаах боломжгүй» гэсэн ӨГҮҮЛБЭР цонхон дээрээ БАЙНА;
 *   2. УСТГАХ улаан товч дээр фокус ЗОГСОХГҮЙ — `ConfirmModal`-ийн `danger`
 *      тугтай цонхнуудад фокус нь ЯГ «Болих» дээр;
 *   3. «яагаад болохгүй байна» гэсэн шалтгаан нь ТЕКСТ, зөвхөн `title`-д БИШ.
 *
 * Энэ файл ЮУ Ч ГҮЙЦЭТГЭХГҮЙ: хаалга бүрийг нээж, уншаад, «Болих» дарна.
 */

/** Хаалга бүрийн дараа: юу ч болоогүйг батал (цонх хаагдсан, тоо хөдлөөгүй). */
async function cancel(dialog: ReturnType<ContractDetailPage['dialog']>) {
  await dialog.getByRole('button', { name: 'Болих', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('буцаах боломжгүй үйлдлүүд', () => {
  test('ачилт баталгаажуулах — даргын ӨДӨР ТУТМЫН хаалга (улаангүй, гэхдээ ил хэлсэн)',
    async ({ factoryPage, data }) => {
      const client = await data.createClient();
      const material = await data.createMaterial({ onHand: 300 });
      const contract = await data.createRentContract({
        clientId: client.id, qty: 15, startDaysAgo: 2,
        materialId: material.id, gradeId: material.gradeId,
      });

      await factoryPage.goto('/');
      await expectReady(factoryPage, 'Өнөөдрийн ажил', 'Даргын нүүр');
      await factoryPage.getByRole('button',
        { name: new RegExp(`Гэрээ №${contract.no}[\\s\\S]*баталгаажуулах`) }).click();
      const dialog = factoryPage.getByRole('dialog', { name: 'Ачилт баталгаажуулах' });
      await expect(dialog.getByText('уншиж байна…')).toHaveCount(0);

      /* ⚠ ЗОРИУДААР `expectDanger: false` — энэ бол ОДООГИЙН, БИЧИГДСЭН
         шийдвэр (`ui.tsx`-ийн `danger` тайлбар): улаан бол «хэтэрсэн · акт ·
         устгах»-ын өнгө бөгөөд дарга үүнийг өдөрт олон удаа дардаг. Өдөр
         тутмын товчийг улаан болговол улаан утгаа алдана. Гэхдээ үр дагавар
         нь ил хэлэгдсэн байх ЁСТОЙ — тэр мөрийг энд барина. */
      const door = await expectOneWayDoor(dialog, 'Ачилт баталгаажуулах',
                                          { expectDanger: false });
      expect(door.sentence).toContain('буцаах боломжгүй');
      expect(door.text, 'үр дагавар нь тоогоороо хэлэгдээгүй байна')
        .toContain('нөөц хөдөлж, тооцоо эхэлнэ');
      await cancel(dialog);
    });

  test('цалин олгох — санамсаргүй Enter сая төгрөг олгож болохгүй',
    async ({ managerPage, data }) => {
      const run = await data.createSalaryRun();

      await managerPage.goto('/salary');
      await expectReady(managerPage, 'Цалин', 'Цалин');
      await managerPage.getByRole('button',
        { name: `${run.period} · ${run.half}-р хагас — цалин олгох` }).click();

      const dialog = managerPage.getByRole('dialog', { name: 'Цалин олгох' });
      await expectOneWayDoor(dialog, 'Цалин олгох', { expectDanger: true });
      await cancel(dialog);
    });

  test('барьцааны тооцоо — гэрээнд НЭГ л удаа', async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 40, qty: 10 });
    await data.patchContract(contract.id, { deposit: 5_000_000 });

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await managerPage.getByRole('button', { name: 'Барьцааны тооцоо хийх' }).click();

    /* Гараар угсарсан цонх (`FormModal`) — `ConfirmModal`-ийн фокусын дүрэм
       автоматаар үйлчлэхгүй. Шаардлага нь ХЭВЭЭР: устгах товч дээр фокус
       зогсохгүй. (Одоо фокус нь «×» дээр — аюулгүй боловч «Болих» БИШ.
       Энэ ялгааг тайланд онцолсон.) */
    const dialog = page.dialog('Барьцааны тооцоо');
    await expectOneWayDoor(dialog, 'Барьцааны тооцоо',
                           { expectDanger: true, focus: 'not-destructive' });
    await cancel(dialog);
  });

  test('гэрээ хаах — «Цааш →» дарсан хуруун доор УСТГАХ товч төрөхгүй',
    async ({ managerPage, data }) => {
      const { contract, material } = await data.rentSetup({ startDaysAgo: 40, qty: 10 });
      /* Хаах боломжтой болгохын тулд гадаа үлдсэнийг эхлээд буцаана —
         эс бөгөөс wizard «Гадаа үлдэгдэл» алхам дээр зогсоно. */
      const detail = await data.detail(contract.id);
      const issue = detail.movements.find((m: any) => m.type === 'ISSUE' && m.status === 'done');
      const back = await data.addMovement(contract.id, {
        type: 'RETURN', date: data.isoDaysAgo(1), note: 'бүгдийг буцаав',
        lines: [{ material_id: material!.id, grade_id: material!.gradeId, qty: contract.qty,
                  issue_line_id: issue.lines[0].id, return_grade_id: material!.gradeId }],
      });
      await data.confirmMovement(back.id);

      const page = new ContractDetailPage(managerPage);
      await page.goto(contract.id);
      await page.closeButton.click();
      const wizard = page.dialog('Гэрээ хаах');
      await expect(wizard.getByText('1. Эцсийн тооцоо')).toBeVisible();

      /* ⚠ ЖИНХЭНЭ УНАЛТ: «Цааш →» ба «Гэрээ хаах» хоёр нь JSX-ийн ижил
         байрлалд солигддог тул React нэг л `<button>` зангилааг дахин
         ашиглана — фокус нь товчтойгоо хамт УСТГАХ товч болж хувирдаг байв.
         Тэр агшинд дарагдсан нэг Enter гэрээг ХААНА. */
      await wizard.getByRole('button', { name: 'Цааш →' }).click();
      /* Алхам ҮНЭХЭЭР солигдсоныг эхлээд батал: «Цааш →» дарсны дараа React
         дахин зурах хүртэл цонх ХУУЧИН алхмаа харуулсаар байдаг — тэр агшинд
         уншвал «улаан товч алга» гэсэн ХУДАЛ хариу гарна. */
      await expect(wizard.getByRole('button', { name: 'Гэрээ хаах', exact: true }),
                   'сүүлчийн алхам руу шилжсэнгүй').toBeVisible();
      const door = await expectOneWayDoor(wizard, 'Гэрээ хаах (сүүлчийн алхам)',
                                          { expectDanger: true });
      expect(door.sentence).toContain('Гэрээ хаах үйлдлийг буцаах боломжгүй');
      await cancel(wizard);
    });

  test('алданги нэхэх — нэхсэн алданги ӨР болно', async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 75, penaltyPercent: 0.5 });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await page.chargePenaltyButton.click();

    const dialog = page.dialog('Алданги нэхэх');
    await expectOneWayDoor(dialog, 'Алданги нэхэх', { expectDanger: true });
    await cancel(dialog);
  });

  /* ---------------- ЦУЦЛАЛТУУД (H1) ---------------- */

  test('төлбөр хүчингүй болгох', async ({ managerPage, data }) => {
    const { client, contract } = await data.rentSetup({ startDaysAgo: 40 });
    await data.registerPayment({ clientId: client.id, contractId: contract.id, amount: 250_000 });

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await page.paymentRow('250,000₮').getByRole('button', { name: /^Хүчингүй болгох/ }).click();

    const dialog = page.dialog('Төлбөр хүчингүй болгох');
    const door = await expectOneWayDoor(dialog, 'Төлбөр хүчингүй болгох', { expectDanger: true });
    /* H1-ийн зарчим: УСТГАХГҮЙ, ХҮЧИНГҮЙ. Тэр ялгаа нь цонхон дээрээ бичигдсэн
       байх ёстой — эс бөгөөс Отгоо «устгачихлаа» гэж айна. */
    expect(door.text).toContain('УСТАХГҮЙ');
    await cancel(dialog);
  });

  test('ачилт хүчингүй болгох (хөдөлгөөн)', async ({ managerPage, data }) => {
    const { contract, movementId } = await data.rentSetup({ startDaysAgo: 40 });
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const panel = await page.openMovement(movementId, contract.startDate, 'Ачилт');
    await panel.getByRole('button', { name: /^Хүчингүй болгох/ }).click();

    const dialog = page.dialog('Ачилт хүчингүй болгох');
    await expectOneWayDoor(dialog, 'Ачилт хүчингүй болгох', { expectDanger: true });
    await cancel(dialog);
  });

  test('актын бичилт хүчингүй болгох', async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 40 });
    const note = 'эвдэрсэн хэвний засвар';
    await data.addAkt(contract.id, { date: data.isoDaysAgo(2), amount: 180_000, note });

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await page.aktRow(note).getByRole('button', { name: /^Хүчингүй болгох/ }).click();

    const dialog = page.dialog('Актын бичилт хүчингүй болгох');
    await expectOneWayDoor(dialog, 'Актын бичилт хүчингүй болгох', { expectDanger: true });
    await cancel(dialog);
  });

  test('тарифын өөрчлөлт хүчингүй болгох', async ({ managerPage, data }) => {
    const { contract, material } = await data.rentSetup({ startDaysAgo: 40, dailyRate: 300 });
    const res = await data.api.post(`/api/contracts/${contract.id}/rate-change`, {
      data: { material_id: material!.id, grade_id: material!.gradeId,
              old_rate: 300, new_rate: 450, effective_from: null,
              note: 'дахин тохиров', confirm: true },
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await page.rateChangeList().getByRole('button', { name: /^Хүчингүй болгох/ }).first().click();

    const dialog = page.dialog('Тарифын өөрчлөлт хүчингүй болгох');
    await expectOneWayDoor(dialog, 'Тарифын өөрчлөлт хүчингүй болгох', { expectDanger: true });
    await cancel(dialog);
  });

  test('алдангийн нэхэлт хүчингүй болгох', async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup({ startDaysAgo: 75, penaltyPercent: 0.5 });
    const asOf = data.isoDaysAgo(0);
    const booked = await data.bookPenalty(contract.id, asOf);
    expect(booked.total, 'алданги нэхэгдсэнгүй').toBeGreaterThan(0);

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    await page.penaltyChargeRow(asOf).getByRole('button', { name: /^Хүчингүй болгох/ }).click();

    const dialog = page.dialog('Алдангийн нэхэлт хүчингүй болгох');
    await expectOneWayDoor(dialog, 'Алдангийн нэхэлт хүчингүй болгох', { expectDanger: true });
    await cancel(dialog);
  });
});

/* =====================================================================
   ХААЛТТАЙ ТӨЛӨВИЙН ШАЛТГААН — ТЕКСТ, `title` БИШ.

   Отгоо эгч идэвхгүй товч дээр хулгана БАРЬДАГГҮЙ. «Яагаад дарагдахгүй
   байна вэ» гэсэн хариулт нь зөвхөн hover-оор гарч ирдэг бол тэр хариулт
   түүний хувьд БАЙХГҮЙ: «дараад юу ч болсонгүй» гэж л үлдэнэ.
   ===================================================================== */
test.describe('хаалттай төлөвийн шалтгаан', () => {
  test('гадаа бараатай байхад «Цааш →» хаалттай — шалтгаан нь МӨР болж зурагдана',
    async ({ managerPage, data }) => {
      const { contract } = await data.rentSetup({ startDaysAgo: 40, qty: 12 });
      const page = new ContractDetailPage(managerPage);
      await page.goto(contract.id);
      await page.closeButton.click();

      const wizard = page.dialog('Гэрээ хаах');
      const next = wizard.getByRole('button', { name: 'Цааш →' });
      await expect(next, 'гадаа бараатай атал цааш явж байна').toBeDisabled();

      /* Шалтгаан нь ХАРАГДАХ текст. `role="status"` мөр нь уншигчид ч хэлнэ. */
      const reason = wizard.locator('[role="status"]');
      await expect(reason, 'зогсоох шалтгаан ил мөр болж зурагдаагүй').toBeVisible();
      await expect(reason).toContainText(/түрээсэнд|гадаа/i);

      /* Хуудсан дээр `title`-д НУУГДСАН тайлбар үлдээгүй эсэх. */
      const hidden = await tooltipOnlyReasons(managerPage);
      expect(hidden.map((h) => `«${h.name}» → title="${h.title}"`),
        'идэвхгүй удирдлагын тайлбар ЗӨВХӨН hover дээр гарч байна').toEqual([]);

      await cancel(wizard);
    });

  test('шалтгаангүй цуцлалт байхгүй — товч хаалттай, шаардлага нь ил бичигдсэн',
    async ({ managerPage, data }) => {
      const { client, contract } = await data.rentSetup({ startDaysAgo: 40 });
      await data.registerPayment({ clientId: client.id, contractId: contract.id, amount: 90_000 });

      const page = new ContractDetailPage(managerPage);
      await page.goto(contract.id);
      await page.paymentRow('90,000₮').getByRole('button', { name: /^Хүчингүй болгох/ }).click();

      const dialog = page.dialog('Төлбөр хүчингүй болгох');
      const confirm = dialog.getByRole('button', { name: 'Хүчингүй болгох', exact: true });
      await expect(confirm, 'шалтгаангүйгээр цуцлах боломжтой байна').toBeDisabled();
      /* Шаардлага нь ХАРАГДАХ шошго болж зогсоно (`*`-тайгаа) — hover биш. */
      await expect(dialog.getByText('Цуцлах шалтгаан')).toBeVisible();

      const hidden = await tooltipOnlyReasons(managerPage);
      expect(hidden.map((h) => `«${h.name}» → title="${h.title}"`)).toEqual([]);

      await cancel(dialog);
    });
});
