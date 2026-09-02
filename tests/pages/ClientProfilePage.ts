import { expect, type Locator, type Page } from '@playwright/test';
import { parseTugrik } from '../support/money';
import { exactLabel } from '../support/text';

/**
 * Харилцагчийн профайл (`/clients/:id`).
 *
 * `ClientsPage`-ээс ТУСДАА класс: хоёр өөр route, өөр DOM, өөр бэлэн болох
 * дохио. Нэг класс болгож нийлүүлбэл метод бүр «аль хуудсан дээр байгаа
 * бол?» гэсэн далд нөхцөлтэй болно.
 */
export class ClientProfilePage {
  readonly page: Page;
  readonly title: Locator;
  readonly backLink: Locator;
  readonly overviewTab: Locator;
  readonly contractsTab: Locator;
  readonly invoicesTab: Locator;
  readonly paymentsTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1 });
    this.backLink = page.getByRole('link', { name: '← Харилцагчид руу буцах' });
    this.overviewTab = page.getByRole('button', { name: 'Тойм' });
    this.contractsTab = page.getByRole('button', { name: /^Гэрээ/ });
    this.invoicesTab = page.getByRole('button', { name: /^Нэхэмжлэл/ });
    this.paymentsTab = page.getByRole('button', { name: /^Төлбөр/ });
  }

  async goto(clientId: number): Promise<void> {
    await this.page.goto(`/clients/${clientId}`);
    await this.expectLoaded();
  }

  /** Профайл суусны дохио — толгойн нэр + буцах холбоос. */
  async expectLoaded(): Promise<void> {
    await expect(this.backLink).toBeVisible();
    await expect(this.title).toBeVisible();
  }

  /** Толгойн үзүүлэлт («Авлага», «Барьцаа», «Гэрээ» …) — нэрээрээ. */
  stat(label: string): Locator {
    return this.page.getByText(exactLabel(label)).locator('xpath=parent::div');
  }

  /** Авлагын НАРИЙН дүн (₮) — үзүүлэлтийн `title` дээр бүтнээрээ. */
  async receivableExact(): Promise<number> {
    const value = this.stat('Авлага').locator('div[title]').first();
    await expect(value, 'профайл дээр «Авлага» үзүүлэлт алга').toBeVisible();
    return parseTugrik(await value.getAttribute('title'), 'харилцагчийн профайл');
  }

  /** Хуудасны нэр (h1) — харилцагчийн нэр. */
  async clientName(): Promise<string> {
    return (await this.title.innerText()).split('\n')[0].trim();
  }
}
