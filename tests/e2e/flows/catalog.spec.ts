import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures';
import { WarehousePage } from '../../pages/WarehousePage';
import { clickToOpen } from '../../support/interact';
import { expectReady } from '../../support/routes';

/**
 * КАТАЛОГ — АГУУЛАХ ДЭЭРЭЭС.
 *
 * ================== ЭЗНИЙ ГОМДОЛ ==================
 *
 * «Агуулах модуль дээр харилцагч шинэ материал, хэрэгслийн төрөл, каталог
 *  нэмэх боломж алга; байгаа материал дээр шинэ төрөл нэмэх ч боломжгүй.»
 *
 * Чадвар нь БАЙСАН — Тохиргоо (цэсний 13 дахь мөр) дотор. Гомдол нь
 * БАЙРШЛЫНХ: Отгоо шинэ материал бүртгэх хэрэгтэй болохдоо АГУУЛАХ дээр,
 * яг тэр материалуудыг ширтэж зогсдог. Одоо өрөө нь нэг, хаалга нь хоёр
 * (`components/CatalogModals.tsx` — ГАНЦ хэрэгжилт; Тохиргоо ХЭВЭЭР).
 *
 * ================== ЭНД ЮУ БАРИГДАХ ВЭ ==================
 *
 * Гурван зам нь Отгоогийн гурван өгүүлбэрт ЯГ таарна:
 *   1. «шинэ материал нэмэх»            → толгойн «+ Материал нэмэх»;
 *   2. «байгаа материал дээр шинэ төрөл» → МӨРӨН дээрх «Материал засах»
 *      (зэрэглэлийн мөрөнд үнэ бичихэд тэр материал шинэ зэрэглэлээ авна);
 *   3. «зэрэглэл нэмэх»                  → толгойн «+ Зэрэглэл», нэмэгдмэгц
 *      материал бүрийн цонхонд үнийн МӨР болж гарч ирнэ.
 * Дөрөв дэх нь ЭСРЭГ тал: даргад эдгээр хаалга ЗУРАГДАХГҮЙ (сервер тал
 * `require_roles("manager")` — `test_api.py` дээр тусад нь баригдсан).
 *
 * ⚠ ЗЭРЭГЛЭЛ нь ДЭЛХИЙН биет: нэмсэн зэрэглэл БҮХ материалын цонханд мөр
 *   нэмнэ. Тиймээс тестийн зэрэглэл нь (а) давтагдашгүй кодтой, (б) `sort`
 *   нь 900+ — `fixtures/data.ts` нь `grades[0]`-ийг материалдаа хэрэглэдэг
 *   тул шинэ зэрэглэл ХЭЗЭЭ Ч эхэнд зогсох ёсгүй.
 *
 * ⚠ ЗЭРЭГЛЭЛИЙН КОД нь ЗААВАЛ КИРИЛЛ. Тэр код нь Тохиргооны каталог дээр
 *   үнийн pill болж (`{grade}: {nb_price}₮`) БУСАД тестийн дэлгэц рүү гарч
 *   ирдэг — `her/mongolian.spec.ts` нь «/settings» дээрх латин үсгийг барьдаг
 *   тул латин код нь ЭНД биш ТЭНД, огт өөр тест дээр улаан болно (яг ингэж
 *   баригдсан). `support/latin.ts`-ийн зөвшөөрөл нь `E2E-<8 оронтой 16-т>`
 *   гэсэн МАТЕРИАЛЫН хэвийг л мэднэ. Кирилл + цифр нь шүүлтэд огт орохгүй —
 *   бөгөөд seed-ийн код («шинэ», «А», «В») ч яг ийм байдаг.
 */

/** Мөрөн дээрх каталогийн товчны дуудагдах нэр — `Warehouse.tsx`-тэй ижил. */
const rowEdit = (name: string) => `${name} — материал засах (категори, тариф, зэрэглэлийн үнэ)`;

/** Зэрэглэлийн үнийн талбарууд — `CatalogModals.tsx`-ийн `aria-label`. */
const nbField = (code: string) => `${code} зэрэглэл — НБҮнэ (актын үнэ) ₮`;
const saleField = (code: string) => `${code} зэрэглэл — худалдах үнэ ₮`;

async function gradeList(api: { get: (u: string) => Promise<any> }) {
  const res = await api.get('/api/grades');
  expect(res.ok(), 'зэрэглэлийн жагсаалт ирсэнгүй').toBeTruthy();
  return res.json() as Promise<Array<{ id: number; code: string; sort: number }>>;
}

async function materialById(api: { get: (u: string) => Promise<any> }, id: number) {
  const res = await api.get('/api/materials');
  expect(res.ok(), 'каталог ирсэнгүй').toBeTruthy();
  const found = (await res.json()).find((m: any) => m.id === id);
  expect(found, `материал #${id} каталогт алга`).toBeTruthy();
  return found;
}

test('Агуулахаас ШИНЭ МАТЕРИАЛ нэмнэ — жагсаалтад ТЭР ДАРУЙ гарч ирнэ',
  async ({ managerPage, data }) => {
    const warehouse = new WarehousePage(managerPage);
    await warehouse.goto();
    const grades = await gradeList(data.api);
    const g = grades[0];
    /* `E2E-мат` угтвар нь `fixtures/data.ts`-ийн `pickMaterial`-д хэлнэ:
       энэ материал ЭЗЭНТЭЙ, хуваалцахгүй. */
    const name = `E2E-мат ${randomUUID().slice(0, 8)}`;

    const dialog = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Материал нэмэх' }),
      managerPage.getByRole('dialog', { name: 'Шинэ материал' }),
      'Агуулах дээрх «+ Материал нэмэх» цонх');

    await dialog.getByLabel('Нэр *').fill(name);
    /* «Хэрэгслийн төрөл» гэдэг нь ЭНЭ сонголт — Механизм бол хэв биш. */
    await dialog.getByLabel('Категори').selectOption('Механизм');
    await dialog.getByLabel('Суурь тариф ₮/ш/хоног').fill('450');
    await dialog.getByLabel('Засварын фикс үнэ ₮/ш').fill('22000');
    await dialog.getByLabel(nbField(g.code), { exact: true }).fill('58000');
    await dialog.getByLabel(saleField(g.code), { exact: true }).fill('69500');

    /* ХАДГАЛАХ нь POST — ГАНЦ удаа дарна (`support/interact.ts`-ийн хил). */
    await dialog.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dialog, 'хадгалсны дараа цонх хаагдсангүй').toBeHidden();

    /* Отгоо дахин ачаалах гэж БОДОХГҮЙ — мөр нь өөрөө ирсэн байх ёстой. */
    await expect(warehouse.row(name),
      'шинэ материал агуулахын жагсаалтад гарч ирсэнгүй — Отгоо хуудсаа дахин ачаалах учиргүй')
      .toBeVisible();

    /* Сервер дээр ЮУ буусан бэ — мөнгөн талбарууд нэг бүрчлэн. */
    const res = await data.api.get('/api/materials');
    const saved = (await res.json()).find((m: any) => m.name === name);
    expect(saved, 'материал сервер дээр үүсээгүй').toBeTruthy();
    expect(saved.category, 'категори буруу хадгалагдлаа').toBe('Механизм');
    expect(saved.base_rate).toBe(450);
    expect(saved.repair_fee).toBe(22000);
    /* Үнэ өгөөгүй зэрэглэлүүд НЭГ Ч мөр үлдээгээгүй байх ёстой — эс бөгөөс
       каталог нь 0₮-ийн худал мөрөөр дүүрнэ. */
    expect(saved.prices, 'зөвхөн үнэ бичсэн зэрэглэл хадгалагдах ёстой').toEqual([
      { grade_id: g.id, grade: g.code, nb_price: 58000, sale_price: 69500 },
    ]);
  });

test('Мөрөн дээрээс БАЙГАА материалыг нээж, ЗЭРЭГЛЭЛД ҮНЭ өгнө — «шинэ төрөл» тэр материал дээр суулаа',
  async ({ managerPage, data }) => {
    const material = await data.createMaterial({ onHand: 40 });
    const grades = await gradeList(data.api);
    /* Фабрик нь `grades[0]`-д л үнэ өгсөн — үнэГҮЙ зэрэглэлийг сонгоно.
       Тэр бол Отгоогийн «байгаа материал дээр шинэ төрөл» гэдэг нь. */
    const target = grades.find((x) => x.id !== material.gradeId);
    expect(target, 'үнэгүй зэрэглэл олдсонгүй — тест утгаа алдана').toBeTruthy();

    const warehouse = new WarehousePage(managerPage);
    await warehouse.goto();

    const dialog = await clickToOpen(
      managerPage.getByRole('button', { name: rowEdit(material.name) }),
      managerPage.getByRole('dialog', { name: 'Материал засах' }),
      `${material.name} — мөрөн дээрх каталогийн цонх`);

    /* Цонх нь ТЭР материалын датагаар нээгдсэн үү (хоосон биш)? */
    await expect(dialog.getByLabel('Нэр *'), 'цонх өөр материалаар нээгджээ')
      .toHaveValue(material.name);
    await expect(dialog.getByLabel(nbField(material.grade), { exact: true }),
      'байгаа НБҮнэ цонхонд ирсэнгүй').toHaveValue(String(material.nbPrice));
    /* Жагсаалтад байхгүй категори нь ЧИМЭЭГҮЙ «Хэв» болж харагддаг байв —
       харагдац ба хадгалагдах утга ХОЁР өөр болно. */
    await expect(dialog.getByLabel('Категори'), 'категори нь өөр утга үзүүлж байна')
      .toHaveValue('Тестийн материал');

    await dialog.getByLabel(nbField(target!.code), { exact: true }).fill('41000');
    await dialog.getByLabel(saleField(target!.code), { exact: true }).fill('52000');
    await dialog.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dialog, 'хадгалсны дараа цонх хаагдсангүй').toBeHidden();

    const after = await materialById(data.api, material.id);
    expect(after.prices, 'шинэ зэрэглэлийн үнэ материал дээр суусангүй')
      .toContainEqual({ grade_id: target!.id, grade: target!.code,
                        nb_price: 41000, sale_price: 52000 });
    /* БАЙСАН үнэ хөндөгдөөгүй — шинэ төрөл нэмэх нь хуучныг гутаахгүй. */
    expect(after.prices, 'байсан зэрэглэлийн үнэ өөрчлөгджээ')
      .toContainEqual({ grade_id: material.gradeId, grade: material.grade,
                        nb_price: material.nbPrice, sale_price: material.salePrice });
    expect(after.category, 'үнэ засахад категори солигдлоо').toBe('Тестийн материал');
    expect(after.base_rate, 'үнэ засахад суурь тариф хөдөллөө').toBe(material.baseRate);

    /* Дахин нээхэд шинэ үнэ нь ЦОНХОНДОО буцаж ирнэ — Отгоо нүдээрээ батална. */
    await managerPage.reload();
    const again = await clickToOpen(
      managerPage.getByRole('button', { name: rowEdit(material.name) }),
      managerPage.getByRole('dialog', { name: 'Материал засах' }),
      `${material.name} — каталогийн цонх (дахин)`);
    await expect(again.getByLabel(nbField(target!.code), { exact: true }))
      .toHaveValue('41000');
  });

test('Агуулахаас ШИНЭ ЗЭРЭГЛЭЛ нэмнэ — материалын цонхонд үнийн МӨР болж гарч ирнэ',
  async ({ managerPage, data }) => {
    const material = await data.createMaterial({ onHand: 25 });
    const warehouse = new WarehousePage(managerPage);
    await warehouse.goto();

    /* Кирилл угтвар + uuid-ийн ЦИФРүүд — латин үсэг НЭГ Ч алга (дээрх ⚠).
       `Date.now()` нь урт нь хүрэхийг батална (uuid цифргүй байх онолын
       боломж) ба зэрэгцээ дөрвөн проектыг бие биенээс нь салгана. */
    const code = `Э${(randomUUID().replace(/\D/g, '') + Date.now()).slice(0, 10)}`;
    const gradeDialog = await clickToOpen(
      managerPage.getByRole('button', { name: '+ Зэрэглэл' }),
      managerPage.getByRole('dialog', { name: 'Шинэ зэрэглэл' }),
      'Агуулах дээрх «+ Зэрэглэл» цонх');
    await gradeDialog.getByLabel('Код (богино)').fill(code);
    await gradeDialog.getByLabel('Нэр', { exact: true }).fill(`${code} зэрэглэл`);
    /* ⚠ 900 — эрэмбийн ХОЙД тал. `fixtures/data.ts` нь `grades[0]`-ийг
       материалдаа хэрэглэдэг тул тестийн зэрэглэл эхэнд зогсвол ЗЭРЭГЦЭЭ
       гүйж буй бусад тест өөр зэрэглэл дээр ажиллаж эхэлнэ. */
    await gradeDialog.getByLabel('Эрэмбэ').fill('900');
    await gradeDialog.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(gradeDialog, 'зэрэглэл хадгалсны дараа цонх хаагдсангүй').toBeHidden();

    const grades = await gradeList(data.api);
    const added = grades.find((x) => x.code === code);
    expect(added, 'шинэ зэрэглэл сервер дээр үүсээгүй').toBeTruthy();

    /* ЯГ ТЭР хуудсан дээр, дахин ачаалалгүйгээр: материалын цонх нээхэд
       шинэ зэрэглэл нь өөрийн үнийн мөртэй зогсох ёстой. */
    const dialog = await clickToOpen(
      managerPage.getByRole('button', { name: rowEdit(material.name) }),
      managerPage.getByRole('dialog', { name: 'Материал засах' }),
      `${material.name} — каталогийн цонх`);
    const nb = dialog.getByLabel(nbField(code), { exact: true });
    await expect(nb, 'шинэ зэрэглэл материалын цонхонд мөр болж гарч ирсэнгүй')
      .toBeVisible();
    await expect(nb, 'шинэ зэрэглэлийн мөр 0-ээс өөр утгаар нээгджээ').toHaveValue('0');

    /* Мөрөнд үнэ бичихэд тэр материал шинэ зэрэглэлээ АВНА. */
    await nb.fill('33000');
    await dialog.getByLabel(saleField(code), { exact: true }).fill('44000');
    await dialog.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dialog).toBeHidden();

    const after = await materialById(data.api, material.id);
    expect(after.prices, 'шинэ зэрэглэлийн үнэ хадгалагдсангүй')
      .toContainEqual({ grade_id: added!.id, grade: code,
                        nb_price: 33000, sale_price: 44000 });
  });

test('ДАРГАД каталогийн хаалга ЗУРАГДАХГҮЙ — гэхдээ агуулах нь бүтнээрээ түүнийх',
  async ({ factoryPage, data }) => {
    const material = await data.createMaterial({ onHand: 10 });
    const warehouse = new WarehousePage(factoryPage);
    await factoryPage.goto('/warehouse');
    await expectReady(factoryPage, 'Агуулах', 'Даргын агуулах');

    /* Сервер тал `require_roles("manager")` — товч нуух нь ЭМХ ЦЭГЦ, хана
       БИШ (жинхэнэ зураас нь `test_api.py`-ийн 403 тестүүд дээр). */
    await expect(factoryPage.getByRole('button', { name: '+ Материал нэмэх' }),
      'даргад материал нэмэх товч зурагджээ').toHaveCount(0);
    await expect(factoryPage.getByRole('button', { name: '+ Зэрэглэл' }),
      'даргад зэрэглэл нэмэх товч зурагджээ').toHaveCount(0);
    await expect(factoryPage.getByRole('button', { name: /материал засах/ }),
      'даргад мөрөн дээрх каталогийн товч зурагджээ').toHaveCount(0);

    /* ХООСОН ДЭЛГЭЦ ногоон болохгүй: хуудас нь бүтэн, ажил нь байрандаа. */
    await expect(warehouse.stocktakeLink, 'даргын тооллогын хаалга алга').toBeVisible();
    await expect(warehouse.row(material.name), 'даргад материалын мөр харагдахгүй байна')
      .toBeVisible();
  });
