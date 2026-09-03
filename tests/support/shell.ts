import { expect, type Locator, type Page } from '@playwright/test';
import { clickToExpand } from './interact';

/**
 * Аппын бүрхүүл (`App.tsx` `Shell`) — цэс, гарах товч.
 *
 * 840px-ээс доош (даргын iPad!) цэс нь ХАВТАС болж хажуу тийш гарна
 * (`transform: translateX(-102%)`) — DOM-д байгаа ч ДЭЛГЭЦНЭЭС ГАДНА.
 * Тиймээс товч дарахын өмнө ☰-г дарж нээх ёстой; десктоп дээр ☰ нь
 * `display:none` тул алхам өөрөө алгасагдана.
 */
export async function openNavigation(page: Page): Promise<Locator> {
  const nav = page.getByRole('complementary', { name: 'Үндсэн навигаци' });
  /* `exact: true` — эс бөгөөс «Цэс» нь дэд мөр болж «Цэсийг хураах»
     (десктопын хумих товч) дээр ч тохирч, тест цэсээ нээхийн оронд ХУМИНА. */
  const burger = page.getByRole('button', { name: 'Цэс', exact: true });
  if (await burger.isVisible()) {
    await clickToExpand(burger, 'Цэс');
  }
  await expect(nav).toBeVisible();
  return nav;
}
