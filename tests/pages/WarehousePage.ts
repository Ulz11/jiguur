import { expect, type Locator, type Page } from '@playwright/test';
import { exactLabel } from '../support/text';

/**
 * Агуулах (`/warehouse`) — ҮЙЛДВЭРИЙН ДАРГЫН талбай.
 *
 * Энэ хуудас нь мөнгөний ханын НӨГӨӨ ТАЛ: дарга мөнгө хардаггүй ч ажлаа
 * хийхэд хэрэгтэй БҮХ тоо (агуулахад, түрээсэнд, засварт) түүнд харагдана.
 * «Хана» гэдэг нь хараа хаах биш — харилцагчийн мөнгийг хаах.
 */
export class WarehousePage {
  readonly page: Page;
  readonly title: Locator;
  readonly search: Locator;
  readonly stocktakeLink: Locator;
  readonly onHandKpi: Locator;
  readonly onRentKpi: Locator;
  readonly inRepairKpi: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1, name: 'Агуулах' });
    this.search = page.getByLabel('Материал, ангиллаар хайх');
    this.stocktakeLink = page.getByRole('link', { name: /Тооллого хийх/ });
    this.onHandKpi = this.kpi('Агуулахад');
    this.onRentKpi = this.kpi('Түрээсэнд гарсан');
    this.inRepairKpi = this.kpi('Засварт');
  }

  private kpi(label: string): Locator {
    return this.page.getByText(exactLabel(label)).locator('xpath=parent::div');
  }

  async goto(): Promise<void> {
    await this.page.goto('/warehouse');
    await expect(this.title).toBeVisible();
  }

  /** KPI-ийн тоо («12,345 ш» → 12345). */
  async kpiQuantity(label: string): Promise<number> {
    const block = this.kpi(label);
    await expect(block, `«${label}» KPI алга`).toBeVisible();
    const line = (await block.innerText()).split('\n')[1] ?? '';
    const n = Number(line.replace(/[^\d.-]/g, ''));
    expect(Number.isFinite(n), `«${label}» KPI тоо болж уншигдсангүй: «${line}»`).toBeTruthy();
    return n;
  }

  row(material: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByText(material, { exact: true }) });
  }
}
