import type { Locator, Page } from '@playwright/test';

/**
 * ДЭЛГЭЦИЙН ХЭМЖИЛТ — Отгоо эгчийн 1366×768 ба даргын планшет хоёрын хэмжүүр.
 *
 * Гурван зүйлийг хэмжинэ, гуравуулаа НЭГ шалтгаантай: тэр хоёр дэлгэц дээр
 * байхгүй зүйлийг ХАЙХГҮЙ. Хажуу тийш гүйлгэх, картын дотор гүйлгэх, жижиг
 * товч оноох гурав нь Excel-ийн 20 жилийн дадалд огт байхгүй хөдөлгөөнүүд.
 */

/** Дарагддаг бүх зүйлийн сонгогч — §4-ийн «дарагддаг юм» гэдгийн тодорхойлолт. */
export const PRESSABLE =
  'button,a[href],input:not([type="hidden"]),select,textarea,' +
  '[role="button"],[role="switch"],[role="tab"],[tabindex]:not([tabindex="-1"])';

/** Хуудас БҮХЭЛДЭЭ хажуу тийш гүйж байна уу. */
export async function pageWidths(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

export type ClippedBox = {
  /** Гүйлгэдэг хайрцгийн тодорхойлолт (tag + эхний хоёр анги) */
  box: string;
  scrollWidth: number;
  clientWidth: number;
  /** Хайрцгийн БАРУУН ирмэгээс ГАДНА үлдсэн дарагддаг зүйлс */
  controls: string[];
  /** Хайрцгийн баруун ирмэгээс гадна үлдсэн баганын ТОЛГОЙ */
  headers: string[];
};

/**
 * КАРТЫН ДОТОРХ хэвтээ таслалт.
 *
 * `.card.overflow-x-auto` дотор хүснэгт багтахгүй бол дэлгэц дээр ЮУ Ч
 * болохгүй — зүгээр л баруун талын багана байхгүй болно. Хулгантай хүн
 * хүрээд гүйлгэж болно; Отгоо эгч тэр хөдөлгөөнийг ХЭЗЭЭ Ч олдоггүй
 * (Excel-д хүснэгт өөрөө гүйдэг, «нүдний дотор» гүйдэггүй). Тиймээс тэнд
 * нуугдсан УСТГАХ товч, НДШ багана нь оршин байдаггүйтэй адил.
 */
export async function clippedInsideCards(page: Page): Promise<ClippedBox[]> {
  return page.evaluate((SEL) => {
    const out: ClippedBox[] = [];
    const name = (el: Element) =>
      (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);

    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.clientWidth === 0) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (!/auto|scroll/.test(getComputedStyle(el).overflowX)) continue;

      const edge = el.getBoundingClientRect().right;
      const controls: string[] = [];
      for (const c of Array.from(el.querySelectorAll(SEL))) {
        const r = c.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > edge + 1) controls.push(name(c));
      }
      const headers: string[] = [];
      for (const th of Array.from(el.querySelectorAll('th'))) {
        const t = (th.textContent || '').trim();
        if (!t) continue;                                  // чимэглэлийн хоосон багана
        if (th.getBoundingClientRect().right > edge + 1) headers.push(t.slice(0, 40));
      }
      out.push({
        box: el.tagName.toLowerCase() +
             (typeof el.className === 'string' && el.className.trim()
               ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, controls, headers,
      });
    }
    return out;
  }, PRESSABLE);
}

export type SmallTarget = {
  /** Дуудагдах нэр — алдааны мессежид ЯГ тэр товчийг нэрлэнэ */
  name: string;
  tag: string;
  cls: string;
  width: number;
  height: number;
};

/**
 * §4: «36px-ээс намхан дарагддаг юм БАЙХГҮЙ».
 *
 * ЖИЖИГ ТАЛ нь хэмжүүр: 200×26 товч нь өргөн ч гэсэн хуруунд НАРИЙН —
 * даргын эрхий хуруу хажуугийн мөрийг оносоор өөр материалын тоог засна.
 *
 * `scope` өгвөл зөвхөн тэр дотор хэмжинэ (модал шалгахад).
 */
export async function undersizedTargets(scope: Locator, min = 36): Promise<SmallTarget[]> {
  return scope.evaluate((root: Element, args: { SEL: string; min: number }) => {
    const out: SmallTarget[] = [];
    for (const el of Array.from(root.querySelectorAll(args.SEL))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;       // зурагдаагүй
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (Math.min(r.width, r.height) >= args.min - 0.5) continue;
      out.push({
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName)
                .trim().replace(/\s+/g, ' ').slice(0, 70),
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === 'string' ? el.className.trim().slice(0, 60) : '',
        width: Math.round(r.width), height: Math.round(r.height),
      });
    }
    return out;
  }, { SEL: PRESSABLE, min });
}

/** Бүхэл хуудсыг хэмжих хамрах хүрээ (модалыг `page.getByRole('dialog')`-оор өг). */
export const wholePage = (page: Page): Locator => page.locator('body');

export type DeadControl = { name: string; tag: string; cls: string; covered: string };

/**
 * ҮХСЭН ТОВЧ — харагдаж байгаа хэрнээ дарагдахгүй.
 *
 * Отгоо эгчийн хамгийн муу туршлага нь алдааны цонх БИШ: дарахад ЮУ Ч
 * болохгүй байх явдал. Тэр удаа дараа дараад, эцэст нь «энэ систем ажиллахгүй
 * байна» гэж дүгнээд Excel рүүгээ буцна — алдааны мөр ч үлдэхгүй.
 *
 * Бодит уналт (2026-09): `.command-hero` нь `position: static` байсан тул
 * түүний `::after` чимэглэл (absolute, өндөр 100%, баруун 53%) хуудас
 * БҮХЭЛДЭЭ дүүрч, /collections ба /analytics-ийн баруун талын БҮХ товч
 * үл үзэгдэх давхаргын ард үхсэн байв.
 *
 * Арга: хуудсыг дэлгэцийн өндрөөр алхаж, тухайн агшинд БҮТНЭЭР харагдаж буй
 * товч бүрийн ТӨВД `elementFromPoint` тавина. Хамгийн дээр нь өөрөө (эсвэл
 * өөрийн үр хүүхэд, эсвэл түүнийг идэвхжүүлдэг `<label>`) байх ёстой.
 */
export async function deadControls(page: Page): Promise<DeadControl[]> {
  return page.evaluate((SEL) => {
    const seen = new Set<Element>();
    const dead: DeadControl[] = [];
    const label = (el: Element) =>
      (el.getAttribute('aria-label') || el.textContent || el.tagName).trim()
        .replace(/\s+/g, ' ').slice(0, 60);
    const describe = (el: Element | null) =>
      el ? el.tagName.toLowerCase() +
           (typeof el.className === 'string' && el.className.trim()
             ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') +
           ` «${label(el)}»`
         : '(юу ч алга)';

    const main = document.querySelector('#jz-main') || document.body;
    const before = window.scrollY;
    const step = Math.max(200, Math.floor(window.innerHeight * 0.85));
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      for (const el of Array.from(main.querySelectorAll(SEL))) {
        if (seen.has(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top < 0 || r.bottom > window.innerHeight) continue;   // энэ алхамд бүтэн харагдахгүй
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (cs.pointerEvents === 'none') continue;                  // зориудаар «уншигдах» зүйл
        seen.add(el);
        /* ⚠ МӨР БҮРЭЭР нь шалгана, нийлбэр тэгш өнцөгтөөр нь БИШ. Хоёр мөр
           болж эвхэгдсэн inline холбоос («Алтан Гадас / Констракшн») нь
           нийлбэрийн ТӨВД ХООСОН зайтай: тэнд `elementFromPoint` нь
           `<td>`-г буцаана. Тэр нь «үхсэн товч» БИШ — мөрөн дээр нь дарахад
           төгс ажиллана. */
        let hit: Element | null = null, alive = false;
        for (const line of Array.from(el.getClientRects())) {
          if (line.width === 0 || line.height === 0) continue;
          if (line.top < 0 || line.bottom > window.innerHeight) continue;
          const top = document.elementFromPoint(line.x + line.width / 2,
                                                line.y + line.height / 2);
          hit = hit ?? top;
          /* `<label>` нь өөрийн талбарыг идэвхжүүлдэг — энэ нь ХЭВИЙН. */
          if (top && (top === el || el.contains(top) ||
                      (top.tagName === 'LABEL' && top.contains(el)))) { alive = true; break; }
        }
        if (alive) continue;
        dead.push({ name: label(el), tag: el.tagName.toLowerCase(),
                    cls: typeof el.className === 'string' ? el.className.trim().slice(0, 50) : '',
                    covered: describe(hit) });
      }
    }
    window.scrollTo(0, before);
    return dead;
  }, PRESSABLE);
}

/** Алдааны мессеж — зөрчил БҮРИЙГ нэрлэнэ (эхнийх дээр зогсохгүй). */
export function describeTargets(bad: SmallTarget[]): string {
  return bad.map((b) => `${b.width}×${b.height}px  <${b.tag} class="${b.cls}">  «${b.name}»`)
            .join('\n      ');
}
