import { expect, type Locator, type Page } from '@playwright/test';
import { parseTugrik } from '../support/money';
import { signedTugrik } from '../support/receipt';
import { exactLabel } from '../support/text';

export type MoneyScan = {
  /** Дэлгэц дээр ХАРАГДАХ ₮ бүхий мөрүүд. */
  text: string[];
  /** Ямар нэг атрибутын УТГАН дотор нуугдсан ₮ («tag[attr]=утга» хэлбэрээр). */
  attributes: string[];
};

/** Нэхэмжлэлийн мөрийн УНШИГДСАН тоонууд — дэлгэц дээр зурагдсан хэвээр. */
export type InvoiceLine = {
  id: number;
  /** «2026-07-20 – 2026-08-18» */
  title: string;
  /** «№R-E2E-…-1» */
  no: string;
  total: number;
  paid: number;
  /** «—» бол 0 (хаагдсан нэхэмжлэл) */
  outstanding: number;
  status: string;
};

/**
 * Гэрээний дэлгэрэнгүй (`/contracts/:id`) — мөнгөний ханын гол дэлгэц.
 *
 * Даргад сервер өөрөө талбаруудыг ХАСДАГ (`serializers.factory_contract_detail`)
 * тул энэ хуудас нь ханын харагдах тал. Тест хоёуланг нь барина: DOM ба хариу.
 *
 * ЭНЭ ХУУДАС нь МУТАЦИЙН урсгалуудын (цуцлалт, алданги, акт, буцаалт, хаалт,
 * тариф) бүх хаалга: цонх бүр эндээс нээгддэг тул сонгогчид нь ЭНД, нэг
 * газар амьдарна.
 */
export class ContractDetailPage {
  readonly page: Page;
  readonly title: Locator;
  readonly backLink: Locator;
  readonly materialsHeading: Locator;
  readonly historyHeading: Locator;
  /* --- гол үйлдлийн товчнууд (толгойн баруун тал) --- */
  readonly payButton: Locator;
  readonly chargePenaltyButton: Locator;
  readonly returnButton: Locator;
  readonly saleButton: Locator;
  readonly addIssueButton: Locator;
  readonly closeButton: Locator;
  readonly newAktButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1 });
    this.backLink = page.getByRole('link', { name: '← Гэрээнүүд рүү буцах' });
    this.materialsHeading = page.getByRole('heading', { name: 'Материал' });
    this.historyHeading = page.getByRole('heading', { name: 'Хөдөлгөөний түүх' });
    this.payButton = page.getByRole('button', { name: 'Төлбөр бүртгэх', exact: true });
    this.chargePenaltyButton = page.getByRole('button', { name: 'Алданги нэхэх', exact: true });
    this.returnButton = page.getByRole('button', { name: 'Буцаалт бүртгэх', exact: true });
    this.saleButton = page.getByRole('button', { name: 'Худалдаа болгох', exact: true });
    this.addIssueButton = page.getByRole('button', { name: '+ Нэмэлт олголт' });
    this.closeButton = page.getByRole('button', { name: 'Гэрээ хаах', exact: true });
    this.newAktButton = page.getByRole('button', { name: '+ Акт бичих' });
  }

  /**
   * Нээж, дата суусныг хүлээнэ. Хоёр дохиог ХАМТ барина:
   *   1. серверийн хариу ирсэн (`/api/contracts/:id`) — эс бөгөөс `<Spinner />`;
   *   2. буцах холбоос + h1 гарсан — эс бөгөөс нэвтрэх дэлгэц.
   */
  async goto(contractId: number): Promise<void> {
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes(`/api/contracts/${contractId}`) && r.ok()),
      this.page.goto(`/contracts/${contractId}`),
    ]);
    await expect(this.backLink).toBeVisible();
    await expect(this.title).toBeVisible();
    expect(this.page.url(), 'гэрээний хуудсан дээр биш байна').toContain(`/contracts/${contractId}`);
  }

  /** Хуудсыг дахин уншуулж, СЕРВЕРИЙН шинэ хариуг хүлээнэ. */
  async reload(contractId: number): Promise<void> {
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes(`/api/contracts/${contractId}`) && r.ok()),
      this.page.reload(),
    ]);
    await expect(this.backLink).toBeVisible();
  }

  /**
   * Толгойн үзүүлэлт («Нийт үлдэгдэл», «Өдрийн дүн» …) — нэрээрээ.
   *
   * `parent::div` — учир нь ЯГ ижил үг доорх материалын хүснэгтийн баганын
   * толгой (`<th>Өдрийн дүн</th>`) дээр бас зогсдог. Үзүүлэлтийн шошго нь
   * `<div>`-ийн дотор, баганын толгой нь `<tr>`-ийн дотор.
   */
  metric(label: string): Locator {
    return this.page.getByText(exactLabel(label)).locator('xpath=parent::div');
  }

  /** Үзүүлэлт зурагдсан уу — байхгүй нь ч БАТАЛГАА (нэхэгдээгүй алданги алга). */
  async hasMetric(label: string): Promise<boolean> {
    return (await this.metric(label).count()) > 0;
  }

  /** Үзүүлэлтийн ЗУРАГДСАН мөр («≈1,234₮», «12,000₮»). */
  async metricText(label: string): Promise<string> {
    const block = this.metric(label);
    await expect(block, `«${label}» үзүүлэлт алга`).toBeVisible();
    return (await block.innerText()).split('\n')[1] ?? '';
  }

  /** Үзүүлэлтийн ТОО. «≈» угтвар нь тооцоолол гэдгийг хэлдэг — тоог нь хөндөхгүй. */
  async metricMoney(label: string): Promise<number> {
    return signedTugrik(await this.metricText(label), `гэрээний «${label}»`);
  }

  /** Үзүүлэлтийн ТООН мөр өөрөө — өнгө нь утга зөөж байгаа эсэхийг шалгахад. */
  metricValueBox(label: string): Locator {
    return this.metric(label).locator('> div').nth(1);
  }

  /** «Нийт үлдэгдэл» — менежерийн хувьд бүтэн ₮-өөр ил зогсоно. */
  async balanceExact(): Promise<number> {
    const block = this.metric('Нийт үлдэгдэл');
    await expect(block, '«Нийт үлдэгдэл» үзүүлэлт алга').toBeVisible();
    return parseTugrik((await block.innerText()).split('\n')[1], 'гэрээний нийт үлдэгдэл');
  }

  /* ---------------- Нэхэмжлэлүүд ---------------- */

  /** Мөр нь өөрийн хаягтай (`#inv-{id}`) — дашбоард, мэдэгдэл тийш буудна. */
  invoiceRow(invoiceId: number): Locator {
    return this.page.locator(`#inv-${invoiceId}`);
  }

  /** Нэхэмжлэлийн хүснэгт БҮХЭЛДЭЭ — зурагдсан тоогоор. */
  async invoiceLines(): Promise<InvoiceLine[]> {
    await expect(this.page.getByRole('heading', { name: 'Нэхэмжлэлүүд' })).toBeVisible();
    const raw = await this.page.locator('tr[id^="inv-"]').evaluateAll((rows) =>
      rows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        const first = (cells[0]?.innerText || '').split('\n');
        return {
          id: Number((tr.id || '').replace('inv-', '')),
          title: (first[0] || '').trim(),
          no: (first[1] || '').trim(),
          /* Дүнгийн нүдэнд «+ алданги …», «≈… нэхэгдээгүй» дэд мөрүүд орж
             болно — ҮНДСЭН дүн нь ҮРГЭЛЖ эхний мөр. */
          total: (cells[1]?.innerText || '').split('\n')[0].trim(),
          paid: (cells[2]?.innerText || '').trim(),
          outstanding: (cells[3]?.innerText || '').trim(),
          status: (cells[4]?.innerText || '').trim(),
        };
      }));
    return raw.map((r) => ({
      id: r.id, title: r.title, no: r.no, status: r.status,
      total: signedTugrik(r.total, `нэхэмжлэл ${r.no} · дүн`),
      paid: signedTugrik(r.paid, `нэхэмжлэл ${r.no} · төлсөн`),
      outstanding: r.outstanding.trim() === '—'
        ? 0 : signedTugrik(r.outstanding, `нэхэмжлэл ${r.no} · үлдэгдэл`),
    }));
  }

  async invoiceById(invoiceId: number): Promise<InvoiceLine> {
    const rows = await this.invoiceLines();
    const hit = rows.find((r) => r.id === invoiceId);
    expect(hit, `#inv-${invoiceId} нэхэмжлэлийн мөр дэлгэц дээр алга`).toBeTruthy();
    return hit!;
  }

  /* ---------------- Төлбөрүүд ---------------- */

  paymentsCard(): Locator {
    return this.page.locator('.card').filter({
      has: this.page.getByRole('heading', { name: 'Төлбөрүүд' }),
    });
  }

  /** Тухайн дүнтэй төлбөрийн мөр — «6,000,000₮» гэсэн бичээсээр. */
  paymentRow(amountText: string): Locator {
    return this.paymentsCard().locator('> div').filter({ hasText: amountText });
  }

  /* ---------------- Акт бичилтүүд ---------------- */

  aktCard(): Locator {
    return this.page.locator('.card').filter({
      has: this.page.getByRole('heading', { name: 'Акт бичилтүүд' }),
    });
  }

  /** Актын мөр — тэмдэглэлээрээ (тэмдэглэл ЗААВАЛ бөглөгддөг тул давхцахгүй). */
  aktRow(note: string): Locator {
    return this.aktCard().getByRole('row').filter({ hasText: note });
  }

  /** Σ мөрийн дүн — «нийт актнаас 15% хасч тооцлоо» гэдгийн СУУРЬ тоо. */
  async aktSum(): Promise<number> {
    const cell = this.aktCard().locator('tfoot td').nth(1);
    await expect(cell, '«Нийт акт» мөр алга').toBeVisible();
    return signedTugrik((await cell.innerText()).trim(), 'актын Σ');
  }

  /* ---------------- Тарифын өөрчлөлт (R3 / H6) ---------------- */

  /**
   * Тарифын түүхийн жагсаалт.
   *
   * ⚠ ЯАГААД хамрах хүрээгээ нарийсгав: мөрийн текст («330₮ → 500₮ ·
   * 2026-07-20-ээс») нь ЯГ тэр мөрийн «Хүчингүй болгох» товчны дуудагдах
   * нэрэнд ч ордог. Хуудсаас шууд хайвал хоёр таарч, тест «хоёрдмол» гэж
   * унана — жагсаалтаас нь хайвал ганц.
   */
  rateChangeList(): Locator {
    return this.page.getByRole('heading', { name: 'Тарифын өөрчлөлт' })
      .locator('xpath=following-sibling::ul');
  }

  /* ---------------- Алдангийн нэхэлт ---------------- */

  penaltyCard(): Locator {
    return this.page.locator('.card').filter({
      has: this.page.getByRole('heading', { name: 'Алдангийн нэхэлт' }),
    });
  }

  /** Нэхэлтийн мөр — «YYYY-MM-DD өдрөөр». */
  penaltyChargeRow(asOf: string): Locator {
    return this.penaltyCard().locator('li').filter({ hasText: asOf });
  }

  /* ---------------- Хөдөлгөөний түүх ---------------- */

  /** Түүхийн самбарыг нээнэ (хумигдсан байвал). */
  async openHistory(): Promise<void> {
    const toggle = this.page.getByRole('button', { name: /^Хөдөлгөөний түүх/ });
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  /** Хөдөлгөөний мөр — `rowClickProps`-ийн дуудагдах нэрээр. */
  movementToggle(date: string, name: string): Locator {
    return this.page.getByRole('button', { name: `${date} · ${name} — дэлгэрэнгүйг нээх` });
  }

  /** Хөдөлгөөнийг задалж, дэлгэрэнгүй самбарыг буцаана. */
  async openMovement(movementId: number, date: string, name: string): Promise<Locator> {
    await this.openHistory();
    const toggle = this.movementToggle(date, name);
    await expect(toggle, `«${date} · ${name}» хөдөлгөөн олдсонгүй`).toBeVisible();
    await toggle.click();
    const panel = this.page.locator(`#mv-panel-${movementId}`);
    await expect(panel).toBeVisible();
    return panel;
  }

  /** Материалын мөрийг задалж, доорх ПАДАНГИЙН дэвтрийг буцаана. */
  async openLedger(material: string, grade: string, key: string): Promise<Locator> {
    const row = this.page.getByRole('row', {
      name: new RegExp(`^${material} \\(${grade}\\)`),
    }).first();
    await expect(row, `«${material} (${grade})» материалын мөр алга`).toBeVisible();
    await row.click();
    const panel = this.page.locator(`#mat-panel-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
    await expect(panel).toBeVisible();
    return panel;
  }

  /* ---------------- Цонхнууд ---------------- */

  /** Гарчгаараа нэрлэгдсэн модал (`Modal` нь `aria-labelledby`-тай). */
  dialog(title: string | RegExp): Locator {
    return this.page.getByRole('dialog', { name: title });
  }

  /** Мэдэгдэл: алдаа = `role="alert"` (өөрөө арилдаггүй), OK = `role="status"`. */
  get errorToast(): Locator {
    return this.page.getByRole('alert');
  }
  get okToast(): Locator {
    return this.page.getByRole('status');
  }

  /**
   * ₮-ийн БҮРЭН эрэл: харагдах текст МӨН атрибут бүрийн утга.
   *
   * Атрибутыг ч шалгах шалтгаан бий: нэг удаа `title="24,276,060₮"` дотор
   * мөнгө нуугдаж, «дэлгэц цэвэр» гэсэн тест ногоон болж байсан. Хулгана
   * хүрэхэд гарч ирдэг зүйл нь НУУСАН БИШ.
   */
  async scanForTugrik(): Promise<MoneyScan> {
    return this.page.evaluate(() => {
      const text: string[] = [];
      const attributes: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const v = (n.nodeValue || '').trim();
        if (v.includes('₮')) text.push(v);
      }
      for (const el of Array.from(document.querySelectorAll('*'))) {
        for (const a of Array.from(el.attributes)) {
          if (a.value.includes('₮')) attributes.push(`${el.tagName.toLowerCase()}[${a.name}]=${a.value}`);
        }
      }
      return { text, attributes };
    });
  }
}
