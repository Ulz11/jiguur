/**
 * Огнооны зөрүү — тестийн ӨӨРИЙН арифметик.
 *
 * ЯАГААД дахин бичив: тест нь аппын томьёог ДУУДВАЛ (frontend-ийн
 * `daysBetween`) хоёр тал нэг л алдаатай хамт унана. Отгоо эгч тоог өөрөө
 * дахин боддог шиг тест ч мөн адил — хоногийг ӨӨРӨӨ тоолж байж «дэлгэц 20
 * хоног гэж бичсэн нь үнэн үү» гэж хэлж чадна.
 *
 * UTC-ээр бодно: зуны цагийн шилжилтэд ч 24 цагийн алхам тогтвортой (огноо
 * нь ISO мөр тул цагийн бүс огт оролцохгүй).
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(toIso) - at(fromIso)) / 86_400_000);
}

/** ISO огноо + n хоног (тестийн хүлээлтийг бодоход). */
export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
