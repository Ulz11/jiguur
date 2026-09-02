import { expect, type Locator, type Page } from '@playwright/test';
import { parseTugrik } from '../support/money';
import { exactLabel } from '../support/text';

export type MoneyScan = {
  /** Дэлгэц дээр ХАРАГДАХ ₮ бүхий мөрүүд. */
  text: string[];
  /** Ямар нэг атрибутын УТГАН дотор нуугдсан ₮ («tag[attr]=утга» хэлбэрээр). */
  attributes: string[];
};

/**
 * Гэрээний дэлгэрэнгүй (`/contracts/:id`) — мөнгөний ханын гол дэлгэц.
 *
 * Даргад сервер өөрөө талбаруудыг ХАСДАГ (`serializers.factory_contract_detail`)
 * тул энэ хуудас нь ханын харагдах тал. Тест хоёуланг нь барина: DOM ба хариу.
 */
export class ContractDetailPage {
  readonly page: Page;
  readonly title: Locator;
  readonly backLink: Locator;
  readonly materialsHeading: Locator;
  readonly historyHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1 });
    this.backLink = page.getByRole('link', { name: '← Гэрээнүүд рүү буцах' });
    this.materialsHeading = page.getByRole('heading', { name: 'Материал' });
    this.historyHeading = page.getByRole('heading', { name: 'Хөдөлгөөний түүх' });
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

  /** «Нийт үлдэгдэл» — менежерийн хувьд бүтэн ₮-өөр ил зогсоно. */
  async balanceExact(): Promise<number> {
    const block = this.metric('Нийт үлдэгдэл');
    await expect(block, '«Нийт үлдэгдэл» үзүүлэлт алга').toBeVisible();
    return parseTugrik((await block.innerText()).split('\n')[1], 'гэрээний нийт үлдэгдэл');
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
