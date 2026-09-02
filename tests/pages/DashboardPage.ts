import { expect, type Locator, type Page } from '@playwright/test';
import { parseTugrik } from '../support/money';

/**
 * Удирдлагын төв (`/`).
 *
 * Хоёр НҮҮРТЭЙ хуудас: менежер/санхүүч «Удирдлагын төв»-ийг, үйлдвэрийн
 * дарга «Өнөөдрийн ажил»-ыг хардаг (Dashboard.tsx `if (isFactory) return`).
 * Бэлэн болсон дохио нь хоёуланд ЯГ нэг: `<h1>` — өгөгдөл ирэх хүртэл
 * `<Spinner />` л байдаг тул h1 гарч ирсэн нь «дата суусан» гэсэн үг.
 */
export class DashboardPage {
  readonly page: Page;
  readonly title: Locator;
  /** Авлагын KPI карт (зөвхөн менежер/санхүүч). */
  readonly receivableCard: Locator;
  /** Тэр картын дүн — бүтэн ₮ нь `title`-д (дэлгэц дээр «сая»-гаар). */
  readonly receivableValue: Locator;
  readonly paymentScheduleHeading: Locator;
  readonly pendingShipmentsHeading: Locator;
  readonly newContractLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByRole('heading', { level: 1 });
    this.receivableCard = page.getByText('Авлагын нийт үлдэгдэл', { exact: true }).locator('xpath=..');
    this.receivableValue = this.receivableCard.locator('div[title]').first();
    this.paymentScheduleHeading = page.getByRole('heading', { name: 'Хүлээгдэж буй төлбөр' });
    this.pendingShipmentsHeading = page.getByRole('heading', { name: 'Ачилт хүлээгдэж буй' });
    this.newContractLink = page.getByRole('link', { name: '+ Шинэ гэрээ' });
  }

  /** Нээж, дата суусныг хүлээнэ (h1 = Spinner дууссаны дохио). */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.title).toBeVisible();
  }

  /** KPI-ийн НАРИЙН дүн (₮). «сая»-гаар дугуйлсан тоог тулгалтад хэрэглэхгүй. */
  async receivableExact(): Promise<number> {
    await expect(this.receivableCard).toBeVisible();
    return parseTugrik(await this.receivableValue.getAttribute('title'), 'дашбоардын авлагын KPI');
  }

  /** «Хүлээгдэж буй төлбөр» хүснэгтийн тухайн харилцагчийн мөр. */
  scheduleRow(client: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page.getByRole('link', { name: client, exact: true }),
    });
  }

  /**
   * Тэр мөрийн «Авлагын үлдэгдэл» багана — бүтэн ₮-өөр ИЛ бичигдсэн.
   * Нүдэн дотор «үүнээс нэхэмжлэгдээгүй…» дэд мөр байж болох тул ЭХНИЙ
   * мөрийг л уншина (нийт дүн нь эхний мөр).
   */
  async scheduleReceivable(client: string): Promise<number> {
    const row = this.scheduleRow(client);
    await expect(row, `«${client}» хүлээгдэж буй төлбөрийн хүснэгтэд алга`).toBeVisible();
    const cell = row.getByRole('cell').nth(4);
    const text = (await cell.innerText()).split('\n')[0];
    return parseTugrik(text, `хүлээгдэж буй төлбөр · ${client}`);
  }
}
