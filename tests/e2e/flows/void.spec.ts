import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { readReceipt } from '../../support/receipt';

/**
 * H1 — ЗАСВАР НЬ УСТГАЛ БИШ, ХҮЧИНГҮЙ.
 *
 * «Буруу бичсэн баримтыг засах зам огт алга» нь Отгоо эгчийг Excel рүү
 * буцаах №1 шалтгаан байв (§3 H1). Тиймээс энэ suite нь ГУРВАН зүйлийг
 * зэрэг барина:
 *
 *   1. Мөр нь ҮЛДЭНЭ — «ХҮЧИНГҮЙ» тэмдэгтэй, ШАЛТГААНТАЙГАА. Устгасан бол
 *      маргааш «би ийм төлбөр бүртгэсэн үү?» гэсэн асуултад хариулах юм
 *      үлдэхгүй.
 *   2. Тооцоо нь ҮНЭХЭЭР суларна — нэхэмжлэл нь төлбөрийн ӨМНӨХ үлдэгдэл рүүгээ
 *      яг эргэж очно.
 *   3. **БАРИМТ ХУДАЛ ХЭЛЭХГҮЙ** — цонх «эдгээр нэхэмжлэлээс X₮ суларна» гэж
 *      амлавал үнэхээр ЯГ X₮ суларсан байх ёстой. Амлалт ба үр дүн зөрөх нь
 *      энэ бүтээгдэхүүний хамгийн муу алдаа: Отгоо дэлгэц дээрх тоог нүдээрээ
 *      нэмж шалгаад зөвшөөрдөг хүн.
 */

/** Аль нэхэмжлэлийн мөр вэ — баримт дээрх «№…» дэд мөрөөр таана. */
function byNo(lines: { no: string }[], no: string) {
  const hit = lines.find((l) => l.no === no);
  expect(hit, `«${no}» нэхэмжлэл дэлгэц дээр алга`).toBeTruthy();
  return hit!;
}

test('төлбөр хүчингүй болоход мөр үлдэж, нэхэмжлэл ЯГ хуучин үлдэгдэл рүүгээ нээгдэнэ',
  async ({ managerPage, data }) => {
    const { contract } = await data.rentSetup();
    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);

    const before = await page.invoiceLines();
    const balanceBefore = await page.balanceExact();
    expect(before.length, 'нэхэмжлэл төрөөгүй байна').toBeGreaterThan(0);

    /* ---- 1. Төлбөр бүртгэнэ — ХУВААРИЛАЛТЫН баримтыг эхлээд уншина ---- */
    const oldest = before[before.length - 1];          // хамгийн хуучин = сүүлийн мөр
    expect(oldest.outstanding, 'хуучин нэхэмжлэл аль хэдийн хаагдсан байна').toBeGreaterThan(2000);
    /* Үлдэгдлээс БАГА, бүтэн мянгат: хэсэгчилсэн төлөлт нь арифметикийг
       дугуйлалтаас ангид байлгана (нэхэмжлэл хаагдвал алдангийн мөр орж ирнэ). */
    const amount = Math.floor(oldest.outstanding / 2 / 1000) * 1000;
    expect(amount).toBeGreaterThan(0);

    await page.payButton.click();
    const payModal = page.dialog('Төлбөр бүртгэх');
    await payModal.getByLabel('Дүн ₮').fill(String(amount));
    const plan = await readReceipt(payModal, 'төлбөрийн хуваарилалт');
    /* Баримт нь ЯГ нэг нэхэмжлэлийг нэрлэх ёстой — тэр мөнгө хаашаа явахыг
       Отгоо хадгалахаас ӨМНӨ уншина. */
    const planned = plan.lines.filter((l) => !l.total);
    expect(planned.length, `хуваарилалт нэг мөр байх ёстой: ${plan.labels().join(' | ')}`).toBe(1);
    expect(planned[0].sub).toBe(oldest.no);
    expect(plan.money(planned[0].label)).toBe(amount);
    expect(plan.totalMoney()).toBe(amount);

    await payModal.getByRole('button', { name: 'Бүртгэх', exact: true }).click();
    await expect(payModal).toBeHidden();

    /* ---- 2. Баримт амласан зүйл ҮНЭХЭЭР болов уу ----
       Цонх хаагдсаны дараа хуудас СЕРВЕРЭЭС дахин уншина (`onDone` → `load()`).
       Тиймээс эхний уншилт нь тэр шинэчлэлтийг ХҮЛЭЭНЭ — тогтмол хугацаа биш,
       ЖИНХЭНЭ нөхцөлөөр. */
    await expect.poll(
      async () => byNo(await page.invoiceLines(), oldest.no).paid,
      { message: 'төлсөн дүн баримтын мөртэй таарсангүй' },
    ).toBe(oldest.paid + amount);
    const paid = await page.invoiceLines();
    const oldestPaid = byNo(paid, oldest.no);
    expect(oldestPaid.outstanding).toBe(oldest.outstanding - amount);
    expect(await page.balanceExact(), 'гэрээний үлдэгдэл төлбөрийн хэмжээгээр буугаагүй')
      .toBe(balanceBefore - amount);

    /* ---- 3. Цуцлалт: ШАЛТГААНГҮЙ бол хаалга нээгдэхгүй ---- */
    const row = page.paymentRow(`${amount.toLocaleString('en-US')}₮`);
    await expect(row, 'бүртгэсэн төлбөр жагсаалтад алга').toBeVisible();
    await row.getByRole('button', { name: /^Хүчингүй болгох/ }).click();

    const voidModal = page.dialog('Төлбөр хүчингүй болгох');
    const confirm = voidModal.getByRole('button', { name: 'Хүчингүй болгох', exact: true });
    await expect(confirm, 'шалтгаангүйгээр цуцлах товч идэвхтэй байна').toBeDisabled();

    /* ---- 4. «Суларах дүн» гэсэн АМЛАЛТ ---- */
    const promise = await readReceipt(voidModal, 'цуцлалтын баримт');
    const released = promise.lines.filter((l) => !l.total);
    expect(released.length, 'сулрах нэхэмжлэл нэрлэгдсэнгүй').toBe(1);
    expect(released[0].label, 'сулрах мөр нэхэмжлэлийн дугаараар нэрлэгдээгүй').toBe(oldest.no);
    expect(promise.money(released[0].label)).toBe(amount);
    expect(promise.totalMoney(), 'нийт суларах дүн төлбөрөөс зөрж байна').toBe(amount);

    const reason = 'дүнг буруу бичсэн';
    await voidModal.getByLabel(/Цуцлах шалтгаан/).fill(reason);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(voidModal).toBeHidden();

    /* ---- 5. Мөр ҮЛДСЭН, шалтгаан нь ИЛ ---- */
    await expect(row, 'цуцалсан төлбөрийн мөр алга болжээ — устгал биш байх ёстой').toBeVisible();
    await expect(row.getByText('ХҮЧИНГҮЙ')).toBeVisible();
    await expect(row, 'цуцлалтын шалтгаан мөрөн дээрээ ил байх ёстой')
      .toContainText(`Шалтгаан: ${reason}`);
    await expect(row.getByRole('button', { name: /^Хүчингүй болгох/ }),
      'нэг төлбөрийг ХОЁР удаа цуцлах товч үлдсэн байна').toHaveCount(0);

    /* ---- 6. Амласан «суларах» дүн ЯГ тэр хэмжээгээр буцав ---- */
    const after = await page.invoiceLines();
    expect(byNo(after, oldest.no).outstanding,
      'нэхэмжлэл төлбөрийн ӨМНӨХ үлдэгдэл рүүгээ буцсангүй').toBe(oldest.outstanding);
    expect(byNo(after, oldest.no).paid).toBe(oldest.paid);
    expect(await page.balanceExact(), 'гэрээний үлдэгдэл цуцлалтын баримттай зөрж байна')
      .toBe(balanceBefore);

    /* Сервер ч ХОЁР ДАХЬ цуцлалтыг татгалзана — товч алга болсон нь UI-гийн
       эелдэг байдал, хаалт нь СЕРВЕРТ (гараар хаяг цохисон ч зогсоно). */
    const payments = (await data.detail(contract.id)).payments;
    const voided = payments.find((p: any) => p.amount === amount);
    expect(voided?.voided, 'сервер дээр төлбөр хүчингүй болоогүй байна').toBe(true);
    const second = await data.api.post(`/api/payments/${voided.id}/void`,
                                       { data: { reason: 'дахин' } });
    expect(second.status(), 'давхар цуцлалт зөвшөөрөгдчихлөө').toBe(409);
    expect((await second.json()).detail).toBe('Энэ төлбөр аль хэдийн хүчингүй болсон байна');
  });

test('шалтгаангүй цуцлалт СЕРВЕР дээр ч зогсоно — 400, монголоор',
  async ({ data }) => {
    const { client, contract } = await data.rentSetup();
    const payment = await data.registerPayment({
      clientId: client.id, contractId: contract.id, amount: 10_000 });
    const res = await data.api.post(`/api/payments/${payment.id}/void`,
                                    { data: { reason: '   ' } });
    expect(res.status(), 'хоосон шалтгаантай цуцлалт өнгөрчихлөө').toBe(400);
    expect((await res.json()).detail).toBe('Цуцлах шалтгаан заавал бичигдэнэ');
    /* Татгалзсан бол ЮУ Ч болоогүй байх ёстой — хагас цуцлалт байхгүй. */
    const after = (await data.detail(contract.id)).payments
      .find((p: any) => p.id === payment.id);
    expect(after.voided, 'татгалзсан хүсэлт төлбөрийг цуцалчихжээ').toBe(false);
  });

test('ачилт хүчингүй болоход НӨӨЦ агуулах руугаа буцна',
  async ({ managerPage, data }) => {
    /* ӨӨРИЙН материал: нөөцийн мөр (material × grade) нь ганц тул seed-ийн
       хэвийг хуваалцсан зэрэгцээ тест «агуулахад буцав уу» гэсэн баталгааг
       хөдөлгөж чадахгүй. 10 хоногийн өмнөх эхлэл — цикл хаагдаагүй тул
       нэхэмжлэл алга: цуцлалт нь дахин бодолтын хаалгагүй, ШУУД явна. */
    const qty = 40;
    const { contract, material, movementId } = await data.rentSetup({
      ownMaterial: true, qty, startDaysAgo: 10 });
    expect(material, 'өөрийн материал үүсээгүй').toBeTruthy();

    const stockOf = async () => {
      const mats = await (await data.api.get('/api/materials')).json();
      const m = mats.find((x: any) => x.id === material!.id);
      expect(m, 'тестийн материал каталогоос алга болжээ').toBeTruthy();
      return m.stock.find((s: any) => s.grade_id === material!.gradeId);
    };

    const issued = await stockOf();
    expect(issued.on_hand, 'ачилт агуулахаас хасагдаагүй').toBe(material!.onHand - qty);
    expect(issued.on_rent, 'ачилт түрээсэнд гараагүй').toBe(qty);

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const detail = await data.detail(contract.id);
    const mv = detail.movements.find((m: any) => m.id === movementId);
    const panel = await page.openMovement(movementId, mv.date, 'Ачилт');
    await panel.getByRole('button', { name: /^Хүчингүй болгох/ }).click();

    const modal = page.dialog('Ачилт хүчингүй болгох');
    const promise = await readReceipt(modal, 'ачилт цуцлах баримт');
    const line = promise.lines[0];
    expect(line.label, 'цуцлалтын баримт материалаа нэрлэсэнгүй')
      .toBe(`${material!.name} (${material!.grade})`);
    expect(line.sub, 'нөөц ХААШАА хөдлөхийг баримт хэлэх ёстой').toBe('агуулахад буцна');
    expect(line.value, 'буцах тоо баримт дээр зөрүүтэй').toBe(`+${qty.toLocaleString('en-US')}ш`);

    const reason = 'буруу гэрээнд бичсэн';
    await modal.getByLabel(/Цуцлах шалтгаан/).fill(reason);
    await modal.getByRole('button', { name: 'Хүчингүй болгох', exact: true }).click();
    await expect(modal).toBeHidden();

    /* Мөр нь түүхэндээ ҮЛДЭЖ, шалтгаан нь мөрөн дээрээ ил (tooltip дотор биш) */
    await page.openHistory();
    await expect(managerPage.getByText('ХҮЧИНГҮЙ').first()).toBeVisible();
    await expect(managerPage.getByText(reason), 'цуцлалтын шалтгаан түүхэнд харагдахгүй байна')
      .toBeVisible();

    /* НӨӨЦ нь баримтын амласнаар БҮТНЭЭР буцав */
    const back = await stockOf();
    expect(back.on_hand, 'нөөц агуулах руугаа буцаагүй').toBe(material!.onHand);
    expect(back.on_rent, 'түрээсийн тоо тэглэгдээгүй').toBe(0);
    /* Гэрээн дээр гадаа юу ч үлдээгүй — тоолуур ҮНЭХЭЭР зогсов */
    const after = await data.detail(contract.id);
    expect(after.qty_out, 'цуцалсан ачилт «түрээсэнд» гэж тоологдсоор байна').toBe(0);
  });
