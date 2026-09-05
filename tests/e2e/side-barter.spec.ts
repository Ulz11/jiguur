import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures';
import { clickToOpen } from '../support/interact';
import { expectReady } from '../support/routes';

/**
 * БАРТЕР — ОРЖ ИРСЭН ОГНОО ЗАСАГДАНА, ОРЖ ИРСЭН ҮНЭ ӨӨРИЙГӨӨ НЭРЛЭНЭ.
 *
 * Бартер хөрөнгө нь ихэвчлэн БУРУУ өдрөөр (төлбөр бүртгэсэн өдрөөр) орж
 * ирдэг тул «хэдэн хоног хэвтэв», «зогсонги эсэх» гэсэн тоонууд худал
 * болно. Сервер `date_in`-ыг хүлээж авдаг.
 *
 * «Орж ирсэн үнэ» нь ХЭРЭГЖСЭН АШГИЙН СУУРЬ: 0 бол зарсан үнэ бүхэлдээ
 * «ашиг» болж тайланд орно. Сервер 400 буцаадаг ч цонх нь зөвхөн товчоо
 * түгжиж, ЯАГААД гэдгийг хэлдэггүй байв — Отгоо бүгдийг бөглөчихөөд ямар
 * талбар дутууг тааж суудаг.
 */

const VALUE_IN = 15_000_000;

async function makeAsset(data: any) {
  const name = `E2E-бартер ${randomUUID().slice(0, 8)}`;
  const res = await data.api.post('/api/barter', {
    data: { type: 'Материал', name, detail: '', date_in: data.isoDaysAgo(10),
            value_in: VALUE_IN, asking_price: 0, note: '' },
  });
  expect(res.ok(), `бартер хөрөнгө — ${res.status()} ${await res.text()}`).toBeTruthy();
  return { name, id: (await res.json()).id as number };
}

test('орж ирсэн үнэ 0 бол цонх ӨӨРӨӨ хэлнэ — сервер рүү явахгүй',
  async ({ managerPage, data }) => {
    const asset = await makeAsset(data);

    await managerPage.goto('/barter');
    await expectReady(managerPage, 'Бартер', 'Бартер');

    const row = managerPage.getByRole('row').filter({ hasText: asset.name });
    const modal = await clickToOpen(
      row.getByRole('button', { name: 'Засах' }),
      managerPage.getByRole('dialog').filter({ hasText: 'Хөрөнгө засах' }),
      'Хөрөнгө засах цонх');

    const field = modal.getByLabel('Орж ирсэн үнэ ₮ *');
    await field.fill('0');
    await field.blur();

    await expect(modal.getByText('Орж ирсэн үнэ 0-ээс их байх ёстой'),
                 'шалтгаан талбарынхаа доор гарсангүй — товч чимээгүй түгжигдэнэ')
      .toBeVisible();
    await expect(modal.getByRole('button', { name: 'Хадгалах' }),
                 '0 үнэтэйгээр хадгалах зам нээлттэй үлджээ').toBeDisabled();
  });

test('орж ирсэн ОГНОО засагдаж, зурвас нь юу хадгалагдсаныг хэлнэ',
  async ({ managerPage, data }) => {
    const asset = await makeAsset(data);
    const newDate = data.isoDaysAgo(40);

    await managerPage.goto('/barter');
    await expectReady(managerPage, 'Бартер', 'Бартер');

    const row = managerPage.getByRole('row').filter({ hasText: asset.name });
    const modal = await clickToOpen(
      row.getByRole('button', { name: 'Засах' }),
      managerPage.getByRole('dialog').filter({ hasText: 'Хөрөнгө засах' }),
      'Хөрөнгө засах цонх');

    await modal.getByLabel('Орж ирсэн огноо').fill(newDate);
    await modal.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(modal, 'цонх хаагдсангүй').toBeHidden();

    await expect(managerPage.getByRole('status').filter({ hasText: 'Хөрөнгө засагдлаа' }),
                 'зурвас гарсангүй — «дараад юу ч болсонгүй» гэсэн мэдрэмж үлдэнэ')
      .toContainText(`орж ирсэн ${newDate}`);

    /* Огноо нь ҮНЭХЭЭР сууна — мөр дээрээ шинэ огноогоо үүрч байна. */
    await expect(managerPage.getByRole('row').filter({ hasText: asset.name }),
                 'мөрөн дээрх орж ирсэн огноо хуучнаараа үлдлээ')
      .toContainText(`${newDate}-нд орж ирсэн`);
  });

test('хөрөнгийн толгойн тоонууд БҮТЭН ₮-өө доороо зогсооно',
  async ({ managerPage, data }) => {
    await makeAsset(data);

    await managerPage.goto('/barter');
    await expectReady(managerPage, 'Бартер', 'Бартер');

    /* Дугуйлсан «15.2 сая₮» нь ХАРЦНЫХ; бүтэн тоог Отгоо дэвтэртээ буулгана.
       Урьд нь бүтэн тоо нь ЗӨВХӨН `title`-д байсан — тэр хулгана хүргэж
       хүлээх зуршилгүй. */
    const hero = managerPage.locator('.command-hero').first();
    await expect(hero, 'толгойн тоо бүтэн ₮-өө хэлсэнгүй').toContainText(/[\d,]{7,}₮/);
  });
