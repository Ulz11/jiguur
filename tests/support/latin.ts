import type { Page } from '@playwright/test';

/**
 * ЛАТИН ҮСГИЙН ШҮҮЛТ — «Отгоо эгчийн нүдэнд англи үг хүрэхгүй».
 *
 * Тэр англи МЭДЭХГҮЙ. Дэлгэц дээр гарсан `void`, `rate_change`, `book_penalty`
 * гэсэн үг нь түүний хувьд алдаа биш, ХООСОН НҮД: тэр мөрөнд юу болсныг тааж
 * чадахгүй тул бүхэл хуудсыг нь уншихаа болино. Тиймээс энэ шүүлт нь
 * «гоо сайхан» биш — уншигдах эсэхийн хил.
 *
 * АРГА: хуудасны ХАРАГДАХ текстээс доорх зөвшөөрөгдсөн хэвүүдийг ЭХЛЭЭД
 * бүтнээр нь хасаад, үлдсэн латин үсгийг ЗӨРЧИЛ гэж тоолно. «Хасаад дараа нь
 * хайх» дараалал нь чухал: `R-26/07-4` гэсэн дугаарыг үсэг-үсгээр нь задалж
 * үзвэл «R» гэсэн хог төрж, жинхэнэ уналт тэр хогийн дунд алга болно.
 */

export type Allowance = { re: RegExp; why: string };

/**
 * ЗӨВШӨӨРӨГДСӨН ЛАТИН — бүрэн жагсаалт, тайлбартайгаа.
 *
 * Энэ жагсаалтад мөр нэмэх нь ШИЙДВЭР: «энэ англи үг Отгоод ойлгомжтой»
 * гэсэн батламж. Тиймээс шалтгаангүй мөр байж болохгүй.
 */
export const ALLOWED: Allowance[] = [
  /* ---------- 0. Мөрд ХЭРЭГГҮЙ зүйлс (тайлбарын төлөө) ----------
     Брэнд «ЖИГҮҮР ЗАМ ХХК», хэмжих нэгж («ш», «м», «хоног»), тоо ба ₮
     тэмдэг — эдгээр нь ЛАТИН БИШ (кирилл ба цифр) тул шүүлтэд огт орохгүй.
     Тусгай мөр шаардахгүй; жагсаалт нь ЗӨВХӨН жинхэнэ латин үсгийг хамарна. */

  /* ---------- 1. Баримтын ДУГААР (үг биш, дугаар) ----------
     Түрээсийн нэхэмжлэл `R-26/07-4`, худалдаа `S-…`, механизм `M-26/08-1`.
     Угтвар нь Отгоогийн ӨӨРИЙН дэвтэрт байсан тэмдэглэгээ (Rent / Sale /
     Mashin) — тэр эдгээрийг үсэг гэж биш, дугаарын хэсэг гэж уншдаг. */
  { re: /\b[RSM]-[0-9A-Za-z/-]*[0-9]/g, why: 'баримтын дугаар: R- түрээс · S- худалдаа · M- механизм' },
  /* Үлдэгдэл шилжүүлэлтийн гэрээ — `OB-5` (opening balance). Хуучин дэвтрээс
     шилжсэн үлдэгдэл бүр өөрийн «гэрээтэй» болдог, дугаар нь энэ хэвтэй. */
  { re: /\bOB-\d+/g, why: 'үлдэгдэл шилжүүлэлтийн гэрээний дугаар: OB-5' },

  /* ---------- 2. Файлын ФОРМАТЫН нэр ----------
     Эдгээрт монгол үг БАЙХГҮЙ бөгөөд Отгоо өөрөө ингэж нэрлэдэг: тэр
     «Excel-ээ нээе» гэж ярьдаг, «PDF-ээр явуулъя» гэдэг. Орчуулбал л
     ойлгохоо болино. */
  { re: /\bExcel\b/g, why: 'файлын формат — Отгоогийн ӨӨРИЙН үг («Excel-ээр»)' },
  { re: /\bPDF\b/g, why: 'файлын формат — хэвлэх/явуулах баримт' },

  /* ---------- 3. ТЕСТИЙН өөрийн дата ----------
     `fixtures/data.ts` нь зэрэгцээ гүйж буй тест бүрд ӨӨРИЙН харилцагч,
     материал, гэрээ үүсгэдэг: «E2E 3f2a1b9c», «E2E-мат 9c4d…», гэрээ
     «E2E-3f2a1b9c». Эдгээр нь АППЫН текст БИШ — тестийн бэлтгэлийн нэр.
     Хэв нь маш нарийн (E2E угтвар ба 8 оронтой 16-тын мөр) тул жинхэнэ
     англи үг үүний ард нуугдаж чадахгүй. */
  { re: /\bE2E\b/g, why: 'тестийн үүсгэсэн дата — зэрэгцээ гүйж буй өөр тестийнх' },
  { re: /\b[0-9a-f]{8}\b/g, why: 'тестийн дата дахь uuid-ийн хэсэг (E2E нэрийн сүүл)' },
];

export type LatinHit = {
  /** Олдсон латин үг */
  word: string;
  /** Ямар мөрөнд байсан — алдааг НҮДЭЭР олоход */
  context: string;
  /** Ямар элемент дээр (tag + анги) */
  where: string;
};

/**
 * Хуудасны ХАРАГДАХ текстээс латин үгсийг цуглуулна.
 *
 * Хамрах хүрээ: текстийн зангилаа (`display:none`/`visibility:hidden` дотор
 * байгааг алгасана) БА оролтын `placeholder` (тэр ч бас нүдэнд харагдана).
 * `title`/`aria-label` нь ЭНД ОРОХГҮЙ — тэдгээр нь хулгана хүрэхэд эсвэл
 * уншигчид зориулагдсан, «нүдэнд хүрэх» текст биш. (Түүнийг `irreversible`
 * тест өөр өнцгөөс барина: чухал шалтгаан ЗӨВХӨН `title`-д байж болохгүй.)
 */
export async function scanLatin(page: Page, allowed: Allowance[] = ALLOWED): Promise<LatinHit[]> {
  const patterns = allowed.map((a) => a.re.source);
  return page.evaluate(({ patterns }) => {
    const strip = new RegExp(patterns.join('|'), 'g');
    const LATIN = /[A-Za-z]+/g;
    const hits: { word: string; context: string; where: string }[] = [];

    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;

    const take = (raw: string, el: Element) => {
      const cleaned = raw.replace(strip, ' ');
      const found = cleaned.match(LATIN);
      if (!found) return;
      for (const word of new Set(found)) {
        hits.push({ word, context: raw.trim().slice(0, 120), where: describe(el) });
      }
    };

    const hidden = (el: Element) => {
      const cs = getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || el.closest('script,style,noscript,template')) continue;
      /* Ганц эцгээ шалгах нь хангалтгүй: нуугдсан САМБАР дотор харагдах
         хүүхэд байж болно. `offsetParent` нь `position:fixed`-д null тул
         түүнд найдахгүй — гинжээр өгсөж шалгана (гүн нь бага). */
      let up: Element | null = el, invisible = false;
      while (up && up !== document.body) {
        if (hidden(up)) { invisible = true; break; }
        up = up.parentElement;
      }
      if (invisible) continue;
      take(node.nodeValue || '', el);
    }

    for (const el of document.querySelectorAll<HTMLInputElement>('input[placeholder],textarea[placeholder]')) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      take(el.placeholder, el);
    }
    return hits;
  }, { patterns });
}

/** Алдааны мессеж — уншаад ШУУД засах хаяг болно. */
export function describeHits(hits: LatinHit[]): string {
  return hits
    .map((h) => `«${h.word}» → ${h.where} : “${h.context}”`)
    .join('\n      ');
}
