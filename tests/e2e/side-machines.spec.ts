import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures';
import { clickToOpen } from '../support/interact';
import { expectReady } from '../support/routes';
import { readReceipt } from '../support/receipt';

/**
 * МЕХАНИЗМ — НЭХЭМЖЛЭЛ ГАРГАХЫН ӨМНӨ СЕРВЕР ӨӨРӨӨ ХЭЛНЭ.
 *
 * Урьд нь цонх нь мөрүүдээ ӨӨРӨӨ шүүж, НӨАТ-аа ӨӨРӨӨ бодож харуулдаг байв.
 * Хоёр эрсдэл:
 *   · НӨАТ% нь компанийн ерөнхий түлхүүрээс уншигдаж байсан бол сервер
 *     механизмын ӨӨРИЙН түлхүүрээр (`machine_vat_percent`) боддог — цонх
 *     «1,800,000₮» гэж амлаад баримт дээр өөр тоо хэвлэнэ;
 *   · ДАВХАРДАЛ нь зөвхөн «Үүсгэх» дарсны ДАРАА, 409 болж мэдэгддэг: Отгоо
 *     огноогоо гурав дахин сонгож байж тааруулна.
 *
 * Одоо `dry_run: true` нь ЮУ Ч БИЧИХГҮЙГЭЭР баримтын ЯГ тэр агуулгыг
 * буцаана; үүссэн баримтын мөрүүд нь ХӨЛДӨНӨ (`detail_json`) ба тэднийг
 * PDF татахгүйгээр харна.
 */

const JOB = 1_200_000;

async function makeMachineWithJobs(data: any) {
  const name = `E2E-кран ${randomUUID().slice(0, 8)}`;
  const client = `E2E-захиалагч ${randomUUID().slice(0, 8)}`;
  const created = await data.api.post('/api/machines', { data: { name } });
  expect(created.ok(), `машин үүсгэх — ${created.status()} ${await created.text()}`).toBeTruthy();
  const id = (await created.json()).id as number;
  for (const daysAgo of [3, 2]) {
    const log = await data.api.post(`/api/machines/${id}/logs`, {
      data: { date: data.isoDaysAgo(daysAgo), entry: 'job', label: 'Бүтэн өдөр',
              client, amount: JOB, method: 'BANK', note: '' },
    });
    expect(log.ok(), `краны ажил — ${log.status()} ${await log.text()}`).toBeTruthy();
  }
  return { id, name, client };
}

test('нэхэмжлэл нь УРЬДЧИЛЖ харагдаад л үүснэ, дараа нь мөрүүдээ хөлдөөж хадгална',
  async ({ managerPage, data }) => {
    const m = await makeMachineWithJobs(data);

    await managerPage.goto('/machines');
    await expectReady(managerPage, 'Механизм', 'Механизм');

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: `${m.name} — нэхэмжлэл үүсгэх` }).first(),
      managerPage.getByRole('dialog').filter({ hasText: `Нэхэмжлэл үүсгэх — ${m.name}` }),
      'Нэхэмжлэл үүсгэх цонх');

    /* НӨАТ нь ХААНААС ирснийг цонх өөрөө хэлж, засах ЗАМАА зааж өгнө. */
    await expect(modal.getByText(/Механизмын НӨАТ: [\d.]+%/),
                 'НӨАТ хаанаас ирснийг цонх хэлсэнгүй').toBeVisible();
    await expect(modal.getByRole('link', { name: 'Тохиргоо' }),
                 'НӨАТ-ыг солих зам заагаагүй').toBeVisible();

    await modal.getByLabel('Харилцагч *').fill(m.client);
    await modal.getByLabel('Эхлэх огноо').fill(data.isoDaysAgo(7));
    await modal.getByLabel('Дуусах огноо').fill(data.isoDaysAgo(0));

    /* 1. УРЬДЧИЛСАН ХАРАГДАЦ — сервер юу ч бичээгүй, гэхдээ баримтын
          дугаар, мөрүүд, нийт дүнгээ аль хэдийн хэлж байна. */
    await modal.getByRole('button', { name: 'Урьдчилж харах' }).click();
    await expect(modal.getByText(/Баримтын дугаар: №/),
                 'урьдчилсан харагдац дугаараа хэлсэнгүй').toBeVisible();

    const preview = await readReceipt(modal, 'нэхэмжлэлийн урьдчилсан баримт');
    expect(preview.totalMoney(),
      'урьдчилсан баримтын нийт дүн хоёр өдрийн ажилтай тэнцсэнгүй').toBe(JOB * 2);

    /* 2. ҮҮСГЭХ — зурвас нь юу үүссэнийг тоонуудтай нь үлдээнэ. */
    await modal.getByRole('button', { name: 'Үүсгэх' }).click();
    await expect(modal, 'нэхэмжлэлийн цонх хаагдсангүй').toBeHidden();
    await expect(managerPage.getByRole('status').filter({ hasText: 'Нэхэмжлэл үүслээ' }),
                 'нэхэмжлэл үүссэний зурвас алга').toContainText('2 мөр');

    /* 3. ХӨЛДӨӨСӨН МӨРҮҮД — PDF татахгүйгээр харагдана.
          Нэхэмжлэлийн жагсаалт нь СОНГОГДСОН машиных тул эхлээд машинаа
          нээнэ (картын оролт нь харагдаж буй самбарыг санаатай хөдөлгөдөггүй). */
    await managerPage.getByRole('button', { name: `${m.name} — бичилтүүдийг нээх` }).click();
    const rowsButton = managerPage.getByRole('button', { name: /— нэхэмжлэлийн мөрүүдийг харах$/ });
    await expect(rowsButton.first(), 'машины нэхэмжлэлийн жагсаалт нээгдсэнгүй').toBeVisible();
    const detail = await clickToOpen(
      rowsButton.first(),
      managerPage.getByRole('dialog').filter({ hasText: 'Нэхэмжлэл №' }),
      'Нэхэмжлэлийн мөрүүд');
    await expect(detail.getByRole('row'),
                 'хөлдөөсөн мөрүүд гарсангүй').toHaveCount(3);   // толгой + 2 ажил
    await expect(detail, 'баримт харилцагчаа нэрлэсэнгүй').toContainText(m.client);
    await expect(detail.getByRole('button', { name: 'Хэвлэх' }),
                 'баримтаас хэвлэх зам алга').toBeVisible();
  });

test('давхацсан хугацаа нь «Үүсгэх» дарахаас ӨМНӨ сануулга болж гарна',
  async ({ managerPage, data }) => {
    const m = await makeMachineWithJobs(data);
    /* Эхний баримтыг API-гаар үүсгэнэ — дэлгэц дээрх хоёр дахь оролдлого
       ЯГ тэр хугацаан дээр давхацна. */
    const first = await data.api.post(`/api/machines/${m.id}/invoices`, {
      data: { client: m.client, d_from: data.isoDaysAgo(7), d_to: data.isoDaysAgo(0) },
    });
    expect(first.ok(), `эхний нэхэмжлэл — ${first.status()} ${await first.text()}`).toBeTruthy();

    await managerPage.goto('/machines');
    await expectReady(managerPage, 'Механизм', 'Механизм');

    const modal = await clickToOpen(
      managerPage.getByRole('button', { name: `${m.name} — нэхэмжлэл үүсгэх` }).first(),
      managerPage.getByRole('dialog').filter({ hasText: `Нэхэмжлэл үүсгэх — ${m.name}` }),
      'Нэхэмжлэл үүсгэх цонх');

    await modal.getByLabel('Харилцагч *').fill(m.client);
    await modal.getByLabel('Эхлэх огноо').fill(data.isoDaysAgo(7));
    await modal.getByLabel('Дуусах огноо').fill(data.isoDaysAgo(0));
    await modal.getByRole('button', { name: 'Урьдчилж харах' }).click();

    await expect(modal.getByRole('alert'),
                 'давхардлын сануулга гарсангүй — Отгоо 409 алдаа хүлээх болно')
      .toContainText('аль хэдийн нэхэмжилсэн байна');
    await expect(modal.getByRole('button', { name: 'Үүсгэх' }),
                 'давхардсан хугацаан дээр «Үүсгэх» нээлттэй үлджээ').toBeDisabled();
  });
