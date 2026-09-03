import { expect, type Locator, type Page } from '@playwright/test';

/**
 * ДАРАЛТ БА ТҮҮНИЙ ҮР ДҮНГ ХАМТАД НЬ БАРИХ.
 *
 * ================== ЯАГААД ЭНЭ ФАЙЛ БАЙДАГ ВЭ ==================
 *
 * 468 тест × 4 проектын БҮТЭН гүйлт бүрт ойролцоогоор НЭГ тест унадаг байв —
 * тест бүр өөр, хөтөч бүр өөр. Барьсан хоёр жишээ:
 *   · `flows/penalty.spec.ts` «нэхсэн алдангийг ХҮЧИНГҮЙ болгоход…» · chromium
 *   · `flows/close-out.spec.ts` «ХУДАЛДАА БОЛГОХ…»                  · webkit
 *
 * `error-context.md` нь ШИЙДВЭРЛЭХ баримт өгсөн: `getByRole('dialog', …)` нь
 * 10 секундэд ОЛДООГҮЙ атал тэр агшны хуудасны зураг нь аппыг БҮРЭН зурагдсан
 * (навигаци, алгасах холбоос, агуулга бүгд байрандаа) харуулж байв. Өөрөөр
 * хэлбэл хуудас эрүүл байсан — ДАРАЛТ нь ҮЙЛЧЛЭЭГҮЙ.
 *
 * Механизм нь React-ийн сонгодог уралдаан: Playwright-ийн «үйлдэлд бэлэн эсэх»
 * шалгуур нь DOM дээр БАЙГАА товч дээр давдаг ч тэр товчны React `onClick` нь
 * хараахан холбогдоогүй байж болно (эсвэл шалгуур ба даралтын ХООРОНД React
 * дахин зурж, зангилааг нь СОЛЬЖ орхино). Энэ хуудас нь зангилаагаа дахин
 * ашигладаг нь ӨМНӨ НЬ баригдсан: «Цааш →» ба «Гэрээ хаах» хоёр нь JSX-ийн
 * ижил байрлалд солигддог тул React НЭГ л `<button>`-ыг дахин ашигладаг
 * (`her/irreversible.spec.ts`-ийн тайлбарыг үз).
 *
 * `ContractDetailPage.goto()` нь API-ийн ХАРИУГ (`waitForResponse`) + буцах
 * холбоос + гарчгийг хүлээдэг. Гэвч ХАРИУ ИРСЭН нь React тэр датагаар ДАХИН
 * ЗУРСАН гэсэн үг БИШ — тэр хоорондох цонхонд буусан даралт ЮУН ДЭЭР Ч
 * буудаггүй.
 *
 * ================== ЯАГААД ЭНЭ НЬ НУУЛТ БИШ ==================
 *
 * Энэ нь Playwright-ийн БАРИМТЖУУЛСАН эмчилгээ (`expect(…).toPass()`) бөгөөд
 * даралт ба түүний ҮР ДҮНГ салгаж болдоггүй хосоор нь барина:
 *   · товч ҮНЭХЭЭР эвдэрсэн бол блок нь төсвөө барсны дараа ЯГ адилхан унана —
 *     баталгаа нь СУЛРААГҮЙ, зүгээр л нэг удаа дахин оролддог;
 *   · `retries` (бүтэн тестийг дахин гүйлгэх) нь ЖИНХЭНЭ алдааг нуудаг —
 *     ганц үйлдлийг үр дүн нь гартал нь дахин дарах нь юуг ч нуухгүй;
 *   · `waitForTimeout` (сохор хүлээлт) нь уралдааныг нуудаг — энэ нь харин
 *     уралдааныг ИЛРҮҮЛЖ, шууд засдаг.
 *
 * ⚠ ЭНЭ ФАЙЛЫГ «хялбарчилж» энгийн `.click()` болгож БУЦААХГҮЙ. Тэр даралт
 *   468-аас нэг удаа хоосонд буудаг нь ХЭМЖИГДСЭН.
 *
 * ================== ХААНА ХЭРЭГЛЭХГҮЙ ВЭ ==================
 *
 * ЗӨВХӨН НЭЭХ / ИЛРҮҮЛЭХ даралтууд — цонх нээх, самбар задлах, алхам солих,
 * сонголт тэмдэглэх. Эдгээр нь UI-ийн төлөв солих ГАГЦХҮҮ үйлдэл тул дахин
 * дарахад хор хөнөөлгүй.
 *
 * ЦОНХ ХААХ («Болих», «×») нь мөн энд орно: `ConfirmModal`-ийн `onClose` нь
 * төлөв солихоос өөр юу ч хийдэггүй тул дахин дарахад аюулгүй (`clickToClose`).
 *
 * ХАДГАЛАХ / ГҮЙЦЭТГЭХ товчийг (₮ хөдөлгөдөг `submit`, «Хүчингүй болгох»,
 * «Тийм, …», «Бүртгэх», «Ачсан ✓») ЭНД ОРУУЛАХГҮЙ: тэдгээр нь POST илгээдэг
 * тул «үр дүн нь гараагүй» гэдэг нь «хүсэлт очоогүй» гэсэн үг БИШ — дахин
 * дарвал төлбөр ДАВХАРДАЖ бүртгэгдэж мэднэ. Тэднийг ганц удаа дарж, үр дүнг
 * нь хатуу баталсаар үлдэнэ.
 */

/** Нэг ОРОЛДЛОГЫН дотоод цонхнууд ба бүхэл хосын ТӨСӨВ. */
const CLICK_TIMEOUT = 5_000;
const SETTLE_TIMEOUT = 2_500;
const BUDGET = 15_000;

export type InteractOptions = {
  /** Ганц даралтад өгөх хугацаа (мс). */
  click?: number;
  /** Даралтын дараа үр дүнг хүлээх хугацаа (мс). */
  settle?: number;
  /** Бүхэл хосын төсөв — үүнээс хойш ҮНЭХЭЭР унана (мс). */
  budget?: number;
};

/**
 * Даралт ба үр дүнг нь хосоор нь дахин оролдоно.
 *
 * `landed()` нь ДАРАХААС ӨМНӨ шалгагдана: үр дүн нь аль хэдийн буусан бол
 * ДАХИН ДАРАХГҮЙ. Энэ хамгаалалт байхгүй бол давталт нь «Цааш →»-г хоёр
 * алхам үсрүүлж, эсвэл нээгдсэн цонхны бүрхүүл дээр буудна.
 */
async function pressUntil(
  trigger: Locator,
  what: string,
  landed: () => Promise<boolean>,
  settle: () => Promise<void>,
  opts: InteractOptions,
): Promise<void> {
  const click = opts.click ?? CLICK_TIMEOUT;
  await expect(async () => {
    if (await landed()) return;
    /* Даралтын алдааг ШУУД шидэхгүй. Хоёр дахь оролдлого дээр товч нь
       нээгдсэн цонхны бүрхүүлийн ард үлддэг тул «locator.click: Timeout»
       гэсэн хариу гарч, ЖИНХЭНЭ шалтгааныг («тэр цонх огт нээгдээгүй»)
       дарж орхино. Тиймээс эхлээд ҮР ДҮНГЭЭС асууна. */
    const clickFailure = await trigger.click({ timeout: click })
      .then(() => null, (e: Error) => e);
    try {
      await settle();
    } catch (effectFailure) {
      if (clickFailure) {
        throw new Error(`«${what}»: даралт ч, үр дүн ч бүтсэнгүй.\n`
          + `— даралт: ${clickFailure.message}\n`
          + `— үр дүн: ${(effectFailure as Error).message}`);
      }
      throw effectFailure;
    }
  }).toPass({ timeout: opts.budget ?? BUDGET, intervals: [120, 250, 500, 1_000] });
}

/**
 * Дарж, ЗААСАН зүйл гартал нь барина — цонх, самбар, дараагийн алхам.
 *
 * @param trigger дарагдах удирдлага
 * @param effect  гарч ирэх ЁСТОЙ зүйл (цонх, самбар, товч)
 * @param what    унасан үед хүн уншихаар: юу нээгдээгүй вэ
 */
export async function clickToOpen(
  trigger: Locator, effect: Locator, what: string, opts: InteractOptions = {},
): Promise<Locator> {
  const settle = opts.settle ?? SETTLE_TIMEOUT;
  await pressUntil(trigger, what,
    () => effect.isVisible(),
    () => expect(effect, `«${what}» нээгдсэнгүй`).toBeVisible({ timeout: settle }),
    opts);
  return effect;
}

/**
 * Хумигдсан самбарыг задална — товч ӨӨРӨӨ `aria-expanded="true"` болтол.
 *
 * Аль хэдийн нээлттэй бол ДАРАХГҮЙ (эс бөгөөс хумиад орхино).
 */
export async function clickToExpand(
  toggle: Locator, what: string, opts: InteractOptions = {},
): Promise<void> {
  const settle = opts.settle ?? SETTLE_TIMEOUT;
  await pressUntil(toggle, what,
    async () => (await toggle.getAttribute('aria-expanded')) === 'true',
    () => expect(toggle, `«${what}» задрахгүй байна`)
      .toHaveAttribute('aria-expanded', 'true', { timeout: settle }),
    opts);
}

/**
 * Сонголтын товчийг тэмдэглэнэ — `aria-pressed="true"` болтол.
 *
 * (Хаалтын wizard-ийн «N хоног — тохирсон / хаалтын цонх / Өөр тоо» гурвал.)
 */
export async function clickToPick(
  chip: Locator, what: string, opts: InteractOptions = {},
): Promise<void> {
  const settle = opts.settle ?? SETTLE_TIMEOUT;
  await pressUntil(chip, what,
    async () => (await chip.getAttribute('aria-pressed')) === 'true',
    () => expect(chip, `«${what}» сонголт тэмдэглэгдсэнгүй`)
      .toHaveAttribute('aria-pressed', 'true', { timeout: settle }),
    opts);
}

/**
 * Мөр/холбоос дээр дарж, ЗААСАН хаяг руу ҮНЭХЭЭР очтол нь барина.
 *
 * Жагсаалтын мөр нь дөнгөж зурагдсан `<tr>` — тэр дээрх даралт хоосонд буувал
 * `waitForURL` нь 45 секунд чимээгүй хүлээгээд бүхэл тестийг унагадаг. Дахин
 * дарах нь аюулгүй: очсон бол хаягаараа таарч, дахин ДАРАХГҮЙ.
 */
export async function clickToReach(
  trigger: Locator, page: Page, url: RegExp, what: string, opts: InteractOptions = {},
): Promise<void> {
  const settle = opts.settle ?? SETTLE_TIMEOUT;
  await pressUntil(trigger, what,
    async () => url.test(page.url()),
    async () => {
      await page.waitForURL(url, { timeout: settle });
    },
    opts);
}

/**
 * Цонхыг ХААНА — «Болих» / «×» дарж, цонх ҮНЭХЭЭР алга болтол нь.
 *
 * ⚠ ЗӨВХӨН ЦЭВЭР ХААЛТАД: `ConfirmModal`-ийн `onClose` нь төлөв солихоос
 *   өөр юу ч хийхгүй. Хадгалаад хаагддаг товчийг (`Бүртгэх`, `✓ Буцаалт
 *   бүртгэх`, `Хүчингүй болгох` …) ЭНД оруулж БОЛОХГҮЙ.
 *
 * Хаагдсаны дараа ДАХИН ДАРАХГҮЙ (`landed()` эхэлж шалгана) — эс бөгөөс
 * ард нь байсан хуудсан дээр буудна.
 */
export async function clickToClose(
  trigger: Locator, effect: Locator, what: string, opts: InteractOptions = {},
): Promise<void> {
  const settle = opts.settle ?? SETTLE_TIMEOUT;
  await pressUntil(trigger, what,
    () => effect.isHidden(),
    () => expect(effect, `«${what}» хаагдсангүй`).toBeHidden({ timeout: settle }),
    opts);
}
