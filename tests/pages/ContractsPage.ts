import { expect, type Locator, type Page } from '@playwright/test';
import { clickToReach } from '../support/interact';
import { READY_MS } from '../support/routes';

/**
 * Гэрээнүүд (`/contracts`).
 *
 * Түрээс/Худалдааны хүрээ нь ХАЯГНААС уншигддаг (`?scope=`) тул шүүлтүүр
 * дарсны дараа хаяг өөрчлөгдөхийг хүлээх нь бодит дохио болно.
 */
export class ContractsPage {
  readonly page: Page;
  readonly title: Locator;
  readonly search: Locator;
  readonly scopeSwitch: Locator;
  readonly stateFilters: Locator;
  readonly newContractLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1, name: 'Гэрээнүүд' });
    this.search = page.getByLabel('Харилцагч, гэрээний дугаараар хайх');
    this.scopeSwitch = page.getByRole('group', { name: 'Түрээс / Худалдаагаар шүүх' });
    this.stateFilters = page.getByRole('group', { name: 'Гэрээг төлөвөөр шүүх' });
    this.newContractLink = page.getByRole('link', { name: '+ Шинэ гэрээ' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/contracts');
    await expect(this.title).toBeVisible();
  }

  /** Гэрээний дугаараар мөр («№26/07 · 2026-03-27-с» гэсэн дэд мөрөөр). */
  row(contractNo: string): Locator {
    return this.page.getByRole('row').filter({ hasText: `№${contractNo}` });
  }

  /**
   * Мөр дээр дарж дэлгэрэнгүй рүү — ЯГ тэр гэрээний хариу ирэхийг хүлээнэ.
   * (Хаяг солигдох нь хангалтгүй: дата ирээгүй байхад `<Spinner />` зогсоно.)
   */
  async openContract(contractNo: string, contractId: number): Promise<void> {
    const loaded = this.page.waitForResponse(
      (r) => r.url().includes(`/api/contracts/${contractId}`) && r.ok(),
      { timeout: READY_MS });
    /* Даралт нь дахин оролдогдож болзошгүй тул хариуны амлалтыг ТУСДАА барина;
       `catch` нь баригдаагүй татгалзал болж хаяхаас сэргийлнэ — жинхэнэ
       шалтгааныг доорх `await` өөрөө хэлнэ. */
    loaded.catch(() => undefined);
    await clickToReach(this.row(contractNo), this.page,
                       new RegExp(`/contracts/${contractId}$`), `гэрээ ${contractNo}`);
    await loaded;
  }

  /** Хайлт — жагсаалт нь клиент талд шүүгддэг тул мөрийн тоогоор хүлээнэ. */
  async searchFor(text: string): Promise<void> {
    await this.search.fill(text);
  }
}
