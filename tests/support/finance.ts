import { expect, type Locator, type Page } from '@playwright/test';

/**
 * САНХҮҮГИЙН ЗАДАРГАА — үйлдвэрийн даргын дэлгэц дээрх НЭГ хэлбэр.
 *
 * ⚠ ЭНЭ ФАЙЛ ХАНЫГ СОЛЬСОН. Урьд нь дүрэм нь «дарга ₮ ОГТ харахгүй» байсан:
 * сервер өөрөө талбарыг хасдаг (`serializers.factory_contract_detail`), тест
 * нь хуудсан дээрх ₮-ийн ТООГ тэгтэй тулгадаг байв.
 *
 * ЭЗЭН 2026-09-д: «энэ бол ЭМХ ЦЭГЦНИЙ асуудал, нууцлалынх биш. Тэр
 * санхүүгийн талаар асуухад хариулж чаддаг байх ЁСТОЙ — зүгээр цэгцтэй байг».
 *
 * Шинэ дүрэм ХЭМЖИГДЭХҮҮН болбол:
 *   1. АНХНЫ ТӨЛӨВТ түүний АЖЛЫН агуулгад ₮ БАЙХГҮЙ (текст ч, атрибут ч);
 *   2. хуудсан дээрх цорын ганц ₮ нь задаргааны ӨӨРИЙНХ нь товч дээрх
 *      ГАНЦ хураангуй тоо (зарим дэлгэц дээр тэр ч байхгүй);
 *   3. задаргаа нь ХУМИГДСАН төрнө (`aria-expanded="false"`, самбар нь
 *      DOM-д огт байхгүй);
 *   4. нээхэд тоонууд нь ГАРЧ ИРНЭ — тэр асуултад хариулж чадна;
 *   5. задаргаа нь ажлынх нь агуулгын ХОЙНО зогсоно.
 */

/** Хуудсан дээрх ₮-ийн зураглал: хаана байна, задаргаан дотор уу гадна уу. */
export type TugrikMap = {
  /** Задаргааны товчин ДЭЭР харагдаж буй ₮ (хураангуй тоо) */
  summary: string[];
  /** Задаргаанаас ГАДНА, ажлын агуулгад гарсан ₮ — ЭНЭ нь тэг байх ёстой */
  outside: string[];
  /** Атрибутын утган дотор нуугдсан ₮ («tag[attr]=утга») — мөн тэг */
  attributes: string[];
  /** «Санхүү» товч хуудсан дээр олдов уу */
  hasDisclosure: boolean;
};

/**
 * ₮-ийн БҮРЭН эрэл — харагдах текст МӨН атрибут бүрийн утга.
 *
 * Атрибутыг ч шалгах шалтгаан бий: нэг удаа `title="24,276,060₮"` дотор мөнгө
 * нуугдаж, «дэлгэц цэвэр» гэсэн тест ногоон болж байсан. Хулгана хүрэхэд
 * гарч ирдэг зүйл нь НУУСАН БИШ.
 */
export async function mapTugrik(page: Page): Promise<TugrikMap> {
  return page.evaluate(() => {
    /* Задаргааны товчийг НЭРЭЭР нь олно — `data-testid` аппын эх кодод
       тавихгүй (репогийн дүрэм). Сум нь `aria-hidden` тул текстээс хасна. */
    const toggle = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').replace(/[›▾]/g, '').trim().startsWith('Санхүү')) || null;

    const summary: string[] = [];
    const outside: string[] = [];
    const attributes: string[] = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = (n.nodeValue || '').trim();
      if (!v.includes('₮')) continue;
      (toggle && n.parentElement && toggle.contains(n.parentElement) ? summary : outside).push(v);
    }
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) {
        if (!a.value.includes('₮')) continue;
        if (toggle && toggle.contains(el)) continue;   // хураангуй тооны өөрийн атрибут
        attributes.push(`${el.tagName.toLowerCase()}[${a.name}]=${a.value}`);
      }
    }
    return { summary, outside, attributes, hasDisclosure: !!toggle };
  });
}

/** Задаргааны товч — нэрээрээ («Санхүү» + хураангуй тоо). */
export function financeToggle(page: Page): Locator {
  return page.getByRole('button', { name: /^Санхүү/ });
}

/**
 * АНХНЫ ТӨЛӨВ: ажил нь цэвэр, задаргаа нь хумигдсан.
 *
 * `expectedSummary`:
 *   · `null`      — энэ дэлгэц дээр хураангуй тоо БАЙХГҮЙ (₮ огт харагдахгүй);
 *   · текст       — ЯГ тэр нэг тоо товчин дээрээ зогсоно;
 *   · өгөөгүй бол — тоо нь НЭГ л ширхэг байхыг шалгаад утгыг нь хөндөхгүй.
 */
export async function expectTidyDefault(
  page: Page, where: string, expectedSummary?: string | null,
): Promise<void> {
  const map = await mapTugrik(page);
  expect(map.hasDisclosure, `${where}: «Санхүү» задаргаа алга`).toBe(true);

  expect(map.outside,
    `${where}: ажлын агуулгад ₮ гарсан — ${map.outside.join(' | ')}`).toEqual([]);
  expect(map.attributes,
    `${where}: атрибут дотор ₮ нуугдсан — ${map.attributes.join(' | ')}`).toEqual([]);

  if (expectedSummary === null) {
    expect(map.summary,
      `${where}: хураангуй тоогүй байх ёстой атал ₮ гарсан`).toEqual([]);
  } else {
    /* «ХАМГИЙН ИХДЭЭ НЭГ хураангуй тоо» — хоёр дахь тоо гарвал энэ унана. */
    expect(map.summary, `${where}: хураангуй нь НЭГ тоо байх ёстой`).toHaveLength(1);
    if (expectedSummary !== undefined) expect(map.summary[0]).toContain(expectedSummary);
  }

  const toggle = financeToggle(page);
  await expect(toggle, `${where}: задаргааны товч харагдахгүй`).toBeVisible();
  await expect(toggle, `${where}: задаргаа НЭЭЛТТЭЙ төрсөн — хумигдсан байх ёстой`)
    .toHaveAttribute('aria-expanded', 'false');
  /* Хумигдсан үед самбар нь DOM-д огт БАЙХГҮЙ тул `aria-controls` ч алга
     (`lib/disclosure.ts` — мухардмал холбоос үүсгэхгүй). */
  expect(await toggle.getAttribute('aria-controls'),
    `${where}: хумигдсан атал `+'`aria-controls` заасан байна').toBeNull();
}

/** Задаргааг нээж, самбарыг нь буцаана. */
export async function openFinance(page: Page, where: string): Promise<Locator> {
  const toggle = financeToggle(page);
  await expect(toggle, `${where}: задаргааны товч алга`).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const id = await toggle.getAttribute('aria-controls');
  expect(id, `${where}: нээлттэй атал `+'`aria-controls` алга').toBeTruthy();
  const panel = page.locator(`#${id}`);
  await expect(panel, `${where}: самбар нээгдсэнгүй`).toBeVisible();
  return panel;
}

/**
 * §4 — даргын ПЛАНШЕТ дээрх зогсоол. Задаргаа нь түүний мөнгөний ганц хаалга
 * тул `--target-lg` (52px) шатанд явна; шалгалт нь §4-ийн доод шатаар (36px).
 */
export async function expectFingerSized(page: Page, where: string, min = 36): Promise<void> {
  const box = await financeToggle(page).boundingBox();
  expect(box, `${where}: задаргааны товч хэмжигдсэнгүй`).toBeTruthy();
  expect(box!.height,
    `${where}: задаргааны товч ${Math.round(box!.height)}px — §4-ийн ${min}px-ээс намхан`)
    .toBeGreaterThanOrEqual(min);
}

/** Задаргаа нь ЗААСАН ажлын агуулгын ХОЙНО зогсож байгаа эсэх (DOM дараалал). */
export async function expectFinanceAfter(
  page: Page, work: Locator, where: string,
): Promise<void> {
  await expect(work, `${where}: ажлын агуулга алга — дараалал шалгах юмгүй`).toBeVisible();
  const workHandle = await work.first().elementHandle();
  const toggleHandle = await financeToggle(page).elementHandle();
  const workFirst = await page.evaluate(
    ([w, t]) => !!(t!.compareDocumentPosition(w!) & Node.DOCUMENT_POSITION_PRECEDING),
    [workHandle, toggleHandle]);
  expect(workFirst,
    `${where}: «Санхүү» задаргаа ажлын агуулгын ӨМНӨ зогсож байна`).toBe(true);
}
