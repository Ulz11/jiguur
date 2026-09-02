import { expect, type Locator, type Page } from '@playwright/test';

/**
 * НЭГ ЧИГИЙН ХААЛГА — буцах зам байхгүй үйлдлүүдийн хэмжүүр.
 *
 * Отгоо эгч дэлгэц дээр болж буйг АНЗААРДАГГҮЙ (toast, pill, hover — бүгд
 * түүнийг өнгөрдөг) бөгөөд жагсаалт дундуур **Enter дардаг** зуршилтай.
 * Тиймээс буцаах боломжгүй үйлдэл дээр хоёр зүйл заавал:
 *   1. ҮР ДАГАВРАА ҮГЭЭР хэлсэн байх («Энэ үйлдлийг буцаах боломжгүй»);
 *   2. санамсаргүй Enter нь ГҮЙЦЭТГЭХГҮЙ байх — фокус «Болих» дээр.
 *
 * (2) нь `ui.tsx`-ийн `danger` тугийн ажил. Тэр туг нь улаан ТОВЧ гэсэн
 * чимэг биш — ФОКУС ЗӨӨДӨГ хамгаалалт.
 */

/** «Буцаагдахгүй» гэж ИЛ хэлсэн эсэх — хүчтэй хэлбэрүүд бүгд. */
export const IRREVERSIBLE =
  /(буцаах боломжгүй|буцаагдахгүй|сэргэхгүй|НЭГ л удаа хийгдэнэ)/;

export type DoorState = {
  /** Модалын бүх текст (алдааны мессежид) */
  text: string;
  /** Буцаагдахгүйг хэлсэн ӨГҮҮЛБЭР (олдоогүй бол null) */
  sentence: string | null;
  /** Гүйцэтгэх товч нь УСТГАХ улаанаар будагдсан уу (--color-danger) */
  dangerStyled: boolean;
  /** Одоо фокустай зүйлийн нэр (модалын гадна бол null) */
  focused: string | null;
  /** Фокус нь УСТГАХ улаанаар будагдсан товч дээр байна уу — АЮУЛ */
  destructiveFocused: boolean;
  /** Модал доторх товчнуудын нэрс */
  buttons: string[];
};

/**
 * Нээлттэй цонхны төлөвийг НЭГ уншилтаар авна.
 *
 * `dangerStyled`-ыг АНГИЙН НЭРЭЭР биш, ЗУРАГДСАН ӨНГӨӨР тогтооно: дүрэм нь
 * UI-ЗАРЧИМ §4-ийн «улаан = хэтэрсэн · акт · устгах» гэсэн ӨНГӨНИЙ ШАТ,
 * тодорхой CSS ангийн нэр биш. Ангийг сольсон ч дүрэм хэвээр барина.
 */
export async function readDoor(dialog: Locator): Promise<DoorState> {
  return dialog.evaluate((panel: HTMLElement) => {
    const nameOf = (el: Element | null) =>
      el ? (el.getAttribute('aria-label') || el.textContent || el.tagName)
             .trim().replace(/\s+/g, ' ').slice(0, 60)
        : null;

    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-danger').trim();
    /* Токеныг нэг л удаа RGB болгож хөрвүүлнэ — `#b3272d` ба
       `rgb(179, 39, 45)` хоёрыг тэнцүү гэж үзэхийн тулд. */
    const probe = document.createElement('span');
    probe.style.color = raw;
    document.body.appendChild(probe);
    const dangerRgb = getComputedStyle(probe).color;
    probe.remove();

    const asRgb = (color: string) => {
      const p = document.createElement('span');
      p.style.color = color;
      document.body.appendChild(p);
      const norm = getComputedStyle(p).color;
      p.remove();
      return norm;
    };
    const buttons = Array.from(panel.querySelectorAll('button'));
    const isDestructive = (b: Element) =>
      asRgb(getComputedStyle(b).backgroundColor) === dangerRgb;
    const dangerStyled = buttons.some(isDestructive);

    const text = (panel.innerText || '').replace(/\s+/g, ' ').trim();
    const re = /[^.!?]*(?:буцаах боломжгүй|буцаагдахгүй|сэргэхгүй|НЭГ л удаа хийгдэнэ)[^.!?]*[.!?]?/;
    const hit = text.match(re);

    const active = document.activeElement;
    const inside = !!(active && panel.contains(active));
    return {
      text,
      sentence: hit ? hit[0].trim() : null,
      dangerStyled,
      focused: inside ? nameOf(active) : null,
      destructiveFocused: inside && active!.tagName === 'BUTTON' && isDestructive(active!),
      buttons: buttons.map((b) => nameOf(b) || ''),
    };
  });
}

/**
 * ХААЛГЫГ БҮТНЭЭР нь шалгана.
 *
 * `expectDanger` — тухайн хаалга нь УСТГАХ улаантай байх ЁСТОЙ юу. Улаан
 * бол фокус «Болих» дээр байхыг ШААРДАНА; улаан биш бол (ж: даргын өдөр
 * тутмын «Ачсан ✓») зөвхөн үг нь шаардагдана.
 */
export async function expectOneWayDoor(dialog: Locator, where: string, opts: {
  expectDanger: boolean;
  /**
   * `ConfirmModal` нь `danger` тугтай үедээ фокусыг ЯГ «Болих» дээр тавина —
   * тэдгээрт `'cancel'`. Гараар угсарсан цонхнууд (хаалтын wizard, барьцааны
   * тооцоо) нь `ConfirmModal` дээр суудаггүй тул фокус нь өөр АЮУЛГҮЙ
   * зогсоол дээр (× хаах) байж болно — тэдгээрт `'not-destructive'`. Аль ч
   * тохиолдолд УСТГАХ товч дээр фокус БАЙЖ БОЛОХГҮЙ.
   */
  focus?: 'cancel' | 'not-destructive';
  cancelLabel?: string;
}): Promise<DoorState> {
  const cancel = opts.cancelLabel ?? 'Болих';
  const focusRule = opts.focus ?? 'cancel';

  /* ЦОНХ ТОГТТОЛ хүлээнэ — хугацаа тоолохгүй, ТӨЛӨВӨӨР нь.
     Хоёр зүйл рендерийн дараа л тогтдог:
       · ФОКУС — React-ийн `autoFocus` ба `Modal`-ийн effect хоёрын дараа;
       · ӨНГӨ — `.btn-primary` дээр `transition` бий. Хаалтын wizard-ийн
         «Цааш →» ба «Гэрээ хаах» нь ЯГ НЭГ DOM зангилаа тул улбар шараас
         улаан руу ~150мс ШИЛЖИНЭ: тэр завсарт уншсан өнгө нь аль нь ч биш.
     `waitForTimeout` тавивал удаан машин дээр флейк болно.

     Хүлээлт нь ЗӨВХӨН хурдасгагч: тогтохгүй бол доорх баталгаанууд ЯГ юу
     болсныг нэрлэнэ (poll-ийн ерөнхий алдаанаас хамаагүй дээр). */
  await expect.poll(async () => {
    const d = await readDoor(dialog);
    return d.focused !== null && d.dangerStyled === opts.expectDanger;
  }, { timeout: 5_000 }).toBe(true).catch(() => { /* доорх мөрүүд тайлбарлана */ });

  const door = await readDoor(dialog);

  expect(door.sentence,
    `${where}: «энэ үйлдлийг буцаах боломжгүй» гэсэн ӨГҮҮЛБЭР алга.\n` +
    `      Цонхны текст: ${door.text.slice(0, 300)}`).not.toBeNull();

  expect(door.dangerStyled,
    `${where}: улаан (устгах) жин ${opts.expectDanger ? 'БАЙХГҮЙ' : 'БАЙНА'} — ` +
    'UI-ЗАРЧИМ §4-ийн өнгөний шат зөрчигдлөө').toBe(opts.expectDanger);

  if (opts.expectDanger) {
    /* ХАМГИЙН ЧУХАЛ мөр: фокус УСТГАХ товч дээр байвал ганц Enter хаалгыг
       нээнэ. Отгоо эгч жагсаалт дундуур Enter дардаг — энэ бол онолын биш. */
    expect(door.destructiveFocused,
      `${where}: фокус УСТГАХ товч «${door.focused}» дээр зогсжээ — ` +
      'санамсаргүй нэг Enter буцаагдахгүй үйлдлийг ГҮЙЦЭТГЭНЭ').toBe(false);

    if (focusRule === 'cancel') {
      expect(door.focused,
        `${where}: аюултай цонх нээгдэхэд фокус «${door.focused}» дээр байна — ` +
        `«${cancel}» дээр байх ёстой (товчнууд: ${door.buttons.join(' | ')})`).toBe(cancel);
    }
  }
  return door;
}

export type TooltipOnly = { name: string; title: string };

/**
 * ЗӨВХӨН `title`-д нуугдсан ТАЙЛБАР — Отгоо эгч хулгана хүргэж хүлээдэггүй.
 *
 * «Яагаад энэ товч дарагдахгүй байна вэ» гэдэг хариулт нь hover-оор гарч
 * ирдэг бол тэр хариулт БАЙХГҮЙ. Тиймээс идэвхгүй болсон бүх удирдлагын
 * `title` нь хуудасны ХАРАГДАХ текст дотор мөн байх ёстой.
 */
export async function tooltipOnlyReasons(page: Page): Promise<TooltipOnly[]> {
  return page.evaluate(() => {
    const out: TooltipOnly[] = [];
    const visible = (document.body.innerText || '').replace(/\s+/g, ' ');
    for (const el of Array.from(document.querySelectorAll('[title]'))) {
      const title = (el.getAttribute('title') || '').trim();
      if (!title) continue;
      const off = (el as HTMLButtonElement).disabled ||
                  el.getAttribute('aria-disabled') === 'true';
      if (!off) continue;
      /* Зөвхөн ТООН тайлбар (нарийн ₮ дүн) нь энэ дүрмээс гадна: тэр нь
         «яагаад болохгүй байна» гэсэн ШАЛТГААН биш, нягтралын хос. */
      if (/^[\d\s,.₮+−-]+$/.test(title)) continue;
      if (visible.includes(title.replace(/\s+/g, ' '))) continue;
      out.push({
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName)
                .trim().replace(/\s+/g, ' ').slice(0, 50),
        title,
      });
    }
    return out;
  });
}
