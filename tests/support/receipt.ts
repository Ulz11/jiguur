import { expect, type Locator } from '@playwright/test';
import { parseTugrik } from './money';

/**
 * NAVY БАРИМТ (`Receipt`) — энэ suite-ийн ГОЛ хэмжүүр.
 *
 * UI-ЗАРЧИМ §4: «Мөнгө хөдөлгөх, устгах — ConfirmModal. Болох гэж буйгаа
 * navy Receipt дээр ЭХЛЭЭД харуулаад л асууна.» Тэгвэл энэ системийн хамгийн
 * аюултай алдаа нь «товч ажиллахгүй байна» БИШ — **баримт худал хэлэх**:
 * Отгоо эгч дэлгэц дээрх мөрүүдийг нүдээрээ нэмж шалгаад зөвшөөрөөд,
 * гарсан үр дүн нь ӨӨР байх. Тэр үед машин түүний арга барилыг (бүх
 * арифметикээ дахин бодох) хууран мэхэлж байна.
 *
 * Тиймээс тестүүд баримтыг ЗУРАГДСАН ХЭВЭЭР нь уншиж авч, батламжийн ДАРАА
 * гарсан төлөвтэй тулгана. Энэ файл нь тэр уншилтын ганц зам.
 */

export type ReceiptLine = {
  label: string;
  /** Нэрийн доорх жижиг мөр (нэхэмжлэлийн №, «алданги», «энэ циклээс гарна») */
  sub: string;
  value: string;
  /** Тасархай зураасны доорх НИЙТ мөр */
  total: boolean;
};

function matches(line: ReceiptLine, label: string | RegExp): boolean {
  return typeof label === 'string' ? line.label.includes(label) : label.test(line.label);
}

export class ReceiptSnapshot {
  constructor(readonly lines: ReceiptLine[], readonly where: string) {}

  /** Бүх мөрийн нэр — алдааны мессежид байрлалыг хэлэхэд. */
  labels(): string[] {
    return this.lines.map((l) => l.label);
  }

  row(label: string | RegExp): ReceiptLine {
    const hit = this.lines.filter((l) => matches(l, label));
    expect(hit.length,
      `${this.where}: «${label}» мөр олдсонгүй — байгаа мөрүүд: ${this.labels().join(' | ')}`)
      .toBeGreaterThan(0);
    return hit[0];
  }

  has(label: string | RegExp): boolean {
    return this.lines.some((l) => matches(l, label));
  }

  value(label: string | RegExp): string {
    return this.row(label).value;
  }

  /** Мөрийн ₮ дүн (тэмдэгтэйгээ: «−1,200,000₮» → −1200000). */
  money(label: string | RegExp): number {
    const r = this.row(label);
    return signedTugrik(r.value, `${this.where} · ${r.label}`);
  }

  totalLine(): ReceiptLine {
    const t = this.lines.find((l) => l.total);
    expect(t, `${this.where}: НИЙТ мөр алга — ${this.labels().join(' | ')}`).toBeTruthy();
    return t!;
  }

  totalMoney(): number {
    const t = this.totalLine();
    return signedTugrik(t.value, `${this.where} · НИЙТ «${t.label}»`);
  }
}

/**
 * ₮-ийн тэмдэгтэй уншилт. `parseTugrik` нь «−» (U+2212) угтварыг МЭДЭХГҮЙ:
 * `aktAmountText` ба буцаалтын баримт хоёул жинхэнэ хасах тэмдэг бичдэг тул
 * тэмдгийг энд барина — эс бөгөөс «хөнгөлөлт» нэмэгдэл болж уншигдана.
 */
export function signedTugrik(raw: string, where: string): number {
  const n = parseTugrik(raw, where);
  return /[−-]\s*[\d,]/.test(raw) && n > 0 ? -n : n;
}

/**
 * Модал/хуудсан дээрх баримтыг уншина.
 *
 * `index` — нэг цонхонд ХОЁР баримт зогсож болно (хаалтын wizard-ийн эцсийн
 * алхам: эцсийн нэхэмжлэл + үлдэх өр). Тэр үед аль нь болохыг дуудагч
 * ЗААНА — «сүүлийнх» гэсэн далд дүрэм нь чимээгүй буруу мөр уншина.
 */
export async function readReceipt(scope: Locator, where = 'баримт',
                                  index = 0): Promise<ReceiptSnapshot> {
  const receipt = scope.locator('.receipt').nth(index);
  await expect(receipt, `${where}: navy баримт зурагдсангүй`).toBeVisible();
  const lines = await receipt.evaluate((el) =>
    Array.from(el.querySelectorAll('.receipt-row')).map((row) => {
      const span = row.querySelector(':scope > span');
      const subEl = span?.querySelector('.rc-sub');
      const sub = (subEl?.textContent || '').trim();
      const full = (span?.textContent || '').trim();
      const label = (sub ? full.slice(0, full.length - sub.length) : full).trim();
      return {
        label,
        sub,
        value: (row.querySelector(':scope > b')?.textContent || '').trim(),
        total: row.classList.contains('receipt-total'),
      };
    }));
  expect(lines.length, `${where}: баримт хоосон байна`).toBeGreaterThan(0);
  return new ReceiptSnapshot(lines, where);
}
