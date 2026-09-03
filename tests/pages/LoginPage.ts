import { expect, type Locator, type Page } from '@playwright/test';
import { READY_MS } from '../support/routes';

/**
 * Нэвтрэх хуудас (`/login`).
 *
 * Сонгогч бүр нь ХҮНИЙ уншдаг нэрээр (`getByLabel`, `getByRole`) — тестийн
 * далд дэгээ (`data-testid`) байхгүй. Ингэснээр сонгогч ажиллаж байгаа нь
 * дэлгэц дээр хүн ойлгох нэртэй байгаагийн БАТАЛГАА болно.
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  /** `role="alert"` — нууц үг буруу үед талбарын доор гарна. */
  readonly errorMessage: Locator;
  /** `role="status"` — «Нэвтрэлтийн хугацаа дууссан» тайлбар (алдаа БИШ). */
  readonly expiredNotice: Locator;
  readonly tagline: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByLabel('Нэвтрэх нэр');
    this.passwordInput = page.getByLabel('Нууц үг');
    this.submitButton = page.getByRole('button', { name: 'Нэвтрэх' });
    this.errorMessage = page.getByRole('alert');
    this.expiredNotice = page.getByRole('status');
    this.tagline = page.getByText('Түрээс · Худалдаа · Тооцоо');
  }

  /** Хуудсыг нээж, БОДИТ бэлэн болсон дохиог хүлээнэ: нэвтрэх товч. */
  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * Нэвтэрнэ — ба ҮНЭХЭЭР нэвтэрсэнийг хүлээнэ.
   *
   * Товч алга болохыг хүлээх нь ХАНГАЛТГҮЙ: токен нь `localStorage`-д
   * бичигдэх хүртэл дараагийн `goto()` нь програмыг нэвтрээгүй байдлаар
   * ачаалж `/login` руу буцаана — тэр үед «₮ алга» гэх мэт баталгаа нь
   * ХУДАЛ НОГООН болно. Тиймээс: (1) серверийн хариу, (2) токен бичигдсэн,
   * (3) shell-ийн навигаци гарч ирсэн — гурвуулаа.
   */
  async signIn(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    /* Нэвтрэлтийн ДАРАА нүүр хуудас өөрийн датаг татна (`/api/dashboard` —
       гурван рол ЧУ бүгд `/` дээр буудаг, дарга ч мөн адил). Токен ба хажуугийн
       самбар гарсан нь тэр дата ИРСЭН гэсэн үг БИШ: `<h1>` нь зөвхөн дата
       ирсний дараа зурагдана. Урьд нь энэ хүлээлт байхгүй тул дараагийн
       баталгаа (`toHaveText`) 10 секундын төсвөөр дата хөөж, машин ачаалалтай
       үед WebKit проектууд дээр улаан болдог байв — аппын алдаа биш, уралдаан.
       Хүлээлтийг ДАРАЛТТАЙ хамт бүртгэнэ: дараа нь бүртгэвэл хариу аль хэдийн
       ирчихсэн байж мөнхөд хүлээнэ. */
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
      this.page.waitForResponse(
        (r) => r.url().includes('/api/dashboard') && r.ok(), { timeout: READY_MS }),
      this.submitButton.click(),
    ]);
    expect(response.status(), 'нэвтрэх хүсэлт амжилтгүй').toBe(200);
    await this.page.waitForFunction(() => !!window.localStorage.getItem('jz_token'));
    await expect(this.page.getByRole('complementary', { name: 'Үндсэн навигаци' })).toBeVisible();
  }

  /** Буруу нэвтрэлт — товч дарж, серверийн ТАТГАЛЗАХ хариуг хүлээнэ. */
  async signInExpectingFailure(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
      this.submitButton.click(),
    ]);
    expect(response.status(), 'буруу нууц үгийг сервер зөвшөөрчихлөө').toBe(401);
  }
}
