import { expect, type Locator, type Page } from '@playwright/test';
import { parseTugrik } from '../support/money';

/**
 * Авлага цуглуулах (`/collections`) — «хэнд эхэлж залгах вэ».
 *
 * Хоёр мөнгөн багана зэрэгцэнэ: «Хэтэрсэн» (нэхэгдсэн, хугацаа нь өнгөрсөн)
 * ба «Авлага» (НИЙТ — дашбоард, жагсаалт, профайлтай ижил байх ЁСТОЙ тоо).
 * Тулгалт нь хоёр дахийг нь барина.
 */
export class CollectionsPage {
  readonly page: Page;
  readonly title: Locator;
  readonly totalOverdueLabel: Locator;
  readonly noContactFilter: Locator;
  readonly allFilter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1, name: 'Авлага цуглуулах' });
    this.totalOverdueLabel = page.getByText('Хугацаа хэтэрсэн нийт', { exact: true });
    this.noContactFilter = page.getByRole('button', { name: /^Холбогдоогүй/ });
    this.allFilter = page.getByRole('button', { name: /^Бүгд/ });
  }

  async goto(): Promise<void> {
    await this.page.goto('/collections');
    await expect(this.title).toBeVisible();
  }

  row(client: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page.getByRole('link', { name: client, exact: true }),
    });
  }

  /** Тухайн харилцагчийн «Авлага» баганын НАРИЙН дүн (₮). */
  async receivableExact(client: string): Promise<number> {
    const row = this.row(client);
    await expect(row, `«${client}» авлага цуглуулах жагсаалтад алга`).toBeVisible();
    const cell = row.getByRole('cell').nth(2);
    return parseTugrik(await cell.getAttribute('title'), `авлага цуглуулах · ${client}`);
  }

  /** «Хэтэрсэн» багана — авлагын ДОТОРХ хэсэг, тэнцүү эсвэл бага байх ёстой. */
  async overdueExact(client: string): Promise<number> {
    const cell = this.row(client).getByRole('cell').nth(1);
    return parseTugrik(await cell.getAttribute('title'), `хэтэрсэн · ${client}`);
  }
}
