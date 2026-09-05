import { test, expect } from '../../fixtures';
import { ContractDetailPage } from '../../pages/ContractDetailPage';
import { clickToOpen } from '../../support/interact';
import { fullText } from '../../support/money';
import { readReceipt } from '../../support/receipt';

/**
 * ХУУЧИН ӨР НЬ ТӨЛБӨРИЙН БАРИМТААС ХАРАГДАНА.
 *
 * Гэрээний хуудсан дээрх «Төлбөр бүртгэх» нь ЗӨВХӨН тэр гэрээний
 * нэхэмжлэлүүдийг мэддэг байв. Гэтэл харилцагчийн хуучин үлдэгдэл, олгосон
 * зээл, кран, ажилчдын цалин гэх мэт түрээсийн мөчлөгт хамаарахгүй бүх
 * бичилт нь түүний ДАНСНЫ гэрээн дээр (`OB-{id}`) сууна.
 *
 * Тэгэхээр 1.5 сая₮ хуучин өртэй харилцагчаас мөнгө орж ирэхэд баримт нь
 * «Илүү — кредит болно» гэж бичдэг байсан: Отгоо мөнгийг бүртгээд, хуучин
 * өр хаагдсан эсэхийг ХАРААГҮЙ хэвээр цонхоо хаана. Баримт нь худал
 * хэлэхгүй байх нь энэ suite-ийн гол хэмжүүр (`support/receipt.ts`).
 *
 * ⚠ ЭНЭ НЬ УРЬДЧИЛСАН ХАРАГДАЦ (`lib/alloc.ts` — `payCandidates`). Серверийн
 *   жинхэнэ хуваарилалт нь өөрийн замаар явна; тест нь ЦОНХНЫ баримтыг л
 *   уншина.
 */

const OLD_DEBT = 1_500_000;

test('харилцагчийн ХУУЧИН ӨР төлбөрийн баримт дээр нэр дэвшинэ — «илүү» биш',
  async ({ managerPage, data }) => {
    const { client, contract } = await data.rentSetup({
      qty: 10, dailyRate: 330, startDaysAgo: 60 });

    /* Хуучин өр — харилцагчийн ДАНСНЫ гэрээн дээр, гэрээнийхээс ХУУЧИН
       огноотой (тиймээс баримтын ЭХНИЙ мөр болох ёстой). */
    const entry = await data.api.post(`/api/clients/${client.id}/entries`, {
      data: { date: data.isoDaysAgo(120), amount: OLD_DEBT, kind: 'adjustment',
              label: 'Хуучин дэвтрийн үлдэгдэл', note: 'E2E' },
    });
    expect(entry.ok(), `дансны бичилт үүссэнгүй — ${await entry.text()}`).toBeTruthy();

    const detail = await data.detail(contract.id);
    const own = (detail.invoices ?? []).reduce((s: number, i: any) => s + i.outstanding, 0);
    expect(own, 'тестийн суурь буруу — гэрээнд нээлттэй нэхэмжлэл алга').toBeGreaterThan(0);

    const page = new ContractDetailPage(managerPage);
    await page.goto(contract.id);
    const pay = await clickToOpen(page.payButton, page.dialog('Төлбөр бүртгэх'),
                                  'Төлбөр бүртгэх цонх');
    /* Гэрээний өр + хуучин өр ЯГ дүйцэх дүн: бүхэлдээ хуваарилагдах ёстой. */
    await pay.getByLabel('Дүн ₮').fill(String(Math.round(own + OLD_DEBT)));

    const receipt = await readReceipt(pay, 'төлбөрийн баримт');
    expect(receipt.has('Илүү'),
      'хуучин өртэй атал баримт «Илүү — кредит болно» гэж бичив').toBe(false);
    /* Хамгийн ХУУЧИН мөр эхэнд — тэр нь дансны бичилт. */
    expect(receipt.lines[0].value,
      `хуучин өр (${fullText(OLD_DEBT)}₮) баримтын эхний мөр болсонгүй — `
      + `байгаа мөрүүд: ${receipt.labels().join(' | ')}`).toBe(`${fullText(OLD_DEBT)}₮`);
    expect(receipt.totalMoney(), 'баримтын нийт нь бичсэн дүнтэй зөрлөө')
      .toBe(Math.round(own + OLD_DEBT));
  });
