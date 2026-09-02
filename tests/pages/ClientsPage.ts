import { expect, type Locator, type Page } from '@playwright/test';
import { parseTugrik } from '../support/money';

/**
 * Харилцагч (`/clients`) — жагсаалт.
 *
 * «Авлагын үлдэгдэл» багана нь дугуйлсан («24.3 сая₮») харагдац, бүтэн ₮ нь
 * `title`-д сууна. Дэлгэц хоорондын тулгалт бүтэн дүнгээр явна.
 */
export class ClientsPage {
  readonly page: Page;
  readonly title: Locator;
  readonly search: Locator;
  readonly newClientButton: Locator;
  readonly exportButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1, name: 'Харилцагч' });
    this.search = page.getByLabel('Харилцагч хайх');
    this.newClientButton = page.getByRole('button', { name: '+ Шинэ харилцагч' });
    this.exportButton = page.getByRole('button', { name: '⇩ Авлага Excel-ээр' });
  }

  /** Нээж, хүснэгт суусныг хүлээнэ (h1 = `<Spinner />` дууссаны дохио). */
  async goto(): Promise<void> {
    await this.page.goto('/clients');
    await expect(this.title).toBeVisible();
  }

  row(client: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page.getByText(client, { exact: true }),
    });
  }

  /** Тухайн харилцагчийн авлагын НАРИЙН дүн (₮). */
  async receivableExact(client: string): Promise<number> {
    const row = this.row(client);
    await expect(row, `«${client}» жагсаалтад алга`).toBeVisible();
    const value = row.getByRole('cell').nth(2).locator('span[title]').first();
    return parseTugrik(await value.getAttribute('title'), `харилцагчийн жагсаалт · ${client}`);
  }

  /**
   * «Авлагын үлдэгдэл» багана БҮХЭЛДЭЭ — дашбоардын KPI-тай тулгахад.
   * Мөр бүрийн ЭХНИЙ `span[title]` нь нийт дүн; араас нь «нэхэмжлэгдээгүй»,
   * «алданги» дэд мөрүүд бас `title`-тай зогсдог тул `:first-child`.
   */
  async allReceivablesExact(): Promise<{ client: string; receivable: number }[]> {
    await expect(this.title).toBeVisible();
    const raw = await this.page.locator('tbody tr').evaluateAll((rows) =>
      rows.map((tr) => ({
        client: tr.querySelector('td:nth-child(1) span')?.textContent?.trim() ?? '',
        title: tr.querySelector('td:nth-child(3) > span[title]')?.getAttribute('title') ?? '',
      })));
    return raw.map((r) => ({ client: r.client, receivable: parseTugrik(r.title, r.client) }));
  }

  /** Мөр дээр дарж профайл руу — жагсаалтын мөр бүхэлдээ холбоос. */
  async openProfile(client: string): Promise<void> {
    await this.row(client).click();
    await this.page.waitForURL(/\/clients\/\d+/);
  }
}
