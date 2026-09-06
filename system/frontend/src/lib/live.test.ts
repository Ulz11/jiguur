import { describe, it, expect } from "vitest";
import { Poller, dialogOpen, live, liveText, liveShort, liveTitle, liveTone,
         clockLabel, minutesSince, DOWN_AFTER } from "./live";

// Тайлангууд өөрсдөө шинэчлэгдэнэ (X3). Poller нь ХЭЗЭЭ дахин татахыг шийддэг
// цэвэр логик: интервал бүрэн өнгөрсөн үед, эсвэл цонх руу буцаж ирэхэд —
// гэхдээ 5 сек дотор дахин татахгүй (лаптоп сэрэхэд шуурга болохоос сэргийлнэ).

describe("Poller", () => {
  it("интервал өнгөрсөн, цонх нээлттэй үед татна", () => {
    const p = new Poller(60_000);
    p.markFetched(1_000);
    expect(p.shouldFetch("interval", 61_000, false)).toBe(true);
  });

  it("сүүлийн татлагаас хойш 5 сек болоогүй бол focus-ыг үл тоомсорлоно", () => {
    const p = new Poller(60_000);
    p.markFetched(10_000);
    expect(p.shouldFetch("focus", 12_000, false)).toBe(false); // 2 сек — эрт
    expect(p.shouldFetch("focus", 15_000, false)).toBe(true); // 5 сек — болно
  });

  it("нуугдсан таб дээр интервал татахгүй", () => {
    const p = new Poller(60_000);
    p.markFetched(1_000);
    expect(p.shouldFetch("interval", 61_000, true)).toBe(false);
  });

  it("focus нь цонх харагдаж байгааг өөрөө хэлж байгаа тул hidden-д саатахгүй", () => {
    const p = new Poller(60_000);
    p.markFetched(1_000);
    expect(p.shouldFetch("focus", 61_000, true)).toBe(true);
  });

  it("markFetched-ийн дараа интервал дуустал татахгүй", () => {
    const p = new Poller(60_000);
    p.markFetched(100_000);
    expect(p.shouldFetch("interval", 100_100, false)).toBe(false); // тэр дороо
    expect(p.shouldFetch("interval", 130_000, false)).toBe(false); // хагас интервал
    expect(p.shouldFetch("interval", 160_000, false)).toBe(true); // бүтэн интервал
  });

  it("анхны татлага хийгдээгүй бол интервал шууд татна", () => {
    const p = new Poller(60_000);
    expect(p.shouldFetch("interval", 0, false)).toBe(true);
  });

  it("минимум завсрыг тохируулж болно", () => {
    const p = new Poller(60_000, 1_000);
    p.markFetched(10_000);
    expect(p.shouldFetch("focus", 10_500, false)).toBe(false);
    expect(p.shouldFetch("focus", 11_000, false)).toBe(true);
  });
});

/* ЦОНХ НЭЭЛТТЭЙ БАЙХАД чимээгүй шинэчлэлт ХИЙХГҮЙ. Хуудас өөрийн
   цонхнуудаа мэддэг ч ХҮҮХЭД бүрэлдэхүүнийхийг (холбоо барих хүн нэмэх,
   тэмдэглэл) мэдэхгүй — `role="dialog"` нь бүгдийн нийтлэг тэмдэг. */
describe("dialogOpen", () => {
  it("DOM байхгүй орчинд УНАХГҮЙ, зүгээр л худал", () => {
    expect(dialogOpen()).toBe(false);
  });
});

/* ══ ТОПБАРЫН ТӨЛӨВ ══
   Ногоон цэг нь HTML-д ХАТУУ бичигдсэн байв: сүлжээ тасарсан ч, тоо гурван
   цагийн өмнөх байсан ч яг ижилхэн гэрэлтэнэ. Одоо үг нь төлөвөөс гарна. */
describe("амьд төлөвийн үг", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 6, h, m).getTime();

  it("амжилттай татсан бол ЦАГАА хэлнэ", () => {
    const s = { okAt: at(14, 3), fails: 0 };
    expect(liveTone(s)).toBe("ok");
    expect(liveText(s, at(14, 5))).toBe("Шинэчилсэн: 14:03");
  });

  it("нэг удаа унавал ШАР — хэдэн минут хуучирснаа хэлнэ", () => {
    const s = { okAt: at(14, 3), fails: 1 };
    expect(liveTone(s)).toBe("warn");
    expect(liveText(s, at(14, 7))).toBe("Шинэчлэгдээгүй — 4 мин");
  });

  it("гурав дараалан унавал УЛААН — цаг биш, холболтын тухай", () => {
    const s = { okAt: at(14, 3), fails: DOWN_AFTER };
    expect(liveTone(s)).toBe("down");
    expect(liveText(s, at(15, 0))).toBe("Холболт тасарсан");
  });

  it("хараахан юу ч татаагүй үед «0 мин» гэж ХУДАЛ хэлэхгүй", () => {
    expect(liveText({ okAt: null, fails: 0 }, at(14, 0))).toBe("Шинэчилж байна…");
    expect(liveText({ okAt: null, fails: 1 }, at(14, 0))).toBe("Шинэчлэгдээгүй");
  });

  it("цаг нь хоёр оронтой — «9:5» гэж бичихгүй", () => {
    expect(clockLabel(at(9, 5))).toBe("09:05");
  });

  it("минутын тоо доош бүхэлчилнэ, ирээдүйн цаг сөрөг болохгүй", () => {
    expect(minutesSince(at(14, 0), at(14, 59))).toBe(59);
    expect(minutesSince(at(14, 0), at(13, 0))).toBe(0);
  });

  it("тайлбар нь ДАРВАЛ ЮУ БОЛОХЫГ хэлнэ — заагч бол товч", () => {
    expect(liveTitle({ okAt: at(14, 3), fails: 0 }, at(14, 5))).toMatch(/Дарж дахин/);
    expect(liveTitle({ okAt: at(14, 3), fails: 3 }, at(14, 5))).toMatch(/хуучирсан байж магадгүй/);
  });
});

describe("амьд төлөвийн дэлгүүр", () => {
  it("уналт нь СҮҮЛИЙН амжилтын цагийг УСТГАХГҮЙ — тэр нь хэмжих цэг", () => {
    live.reset();
    live.ok(1_000);
    live.fail();
    expect(live.get()).toEqual({ okAt: 1_000, fails: 1 });
    live.fail();
    expect(liveTone(live.get())).toBe("warn");
    live.fail();
    expect(liveTone(live.get())).toBe("down");
    live.ok(9_000);
    expect(live.get()).toEqual({ okAt: 9_000, fails: 0 });
    live.reset();
  });

  it("хуудас солиход тэглэгдэнэ — шинэ хуудасны тухай шинээр ярина", () => {
    live.ok(5_000);
    live.reset();
    expect(live.get()).toEqual({ okAt: null, fails: 0 });
  });

  it("«дахин татах» бүртгэгдээгүй бол ХУДАЛ амжилт мэдээлэхгүй", () => {
    live.setRetry(null);
    expect(live.retry()).toBe(false);
    let called = 0;
    live.setRetry(() => { called++; });
    expect(live.retry()).toBe(true);
    expect(called).toBe(1);
    live.setRetry(null);
  });
});

/* УТСАН ДЭЭРХ ХУРААНГУЙ (≤480px). Бүтэн өгүүлбэр нь тэр өргөнд ороогүй тул
   НУУГДАЖ, заагч нь 26px өргөн ЦЭГ болж хоцордог байв — цэг дангаараа ЮУ Ч
   хэлэхгүй. Одоо ЦАГ нь үлдэнэ; унасан төлөв ҮГЭЭ авч явна (өнгө дангаараа
   утга зөөхгүй, §4). */
describe("liveShort — утсан дээрх хураангуй", () => {
  const T = new Date(2026, 8, 6, 14, 3).getTime();

  it("хэвийн үед ЗӨВХӨН цаг", () => {
    expect(liveShort({ okAt: T, fails: 0 }, T)).toBe(clockLabel(T));
    expect(liveShort({ okAt: T, fails: 0 }, T)).toBe("14:03");
  });

  it("унасан төлөв нь ҮГТЭЙ хэвээр — өнгө дангаараа утга зөөхгүй", () => {
    expect(liveShort({ okAt: T, fails: DOWN_AFTER }, T)).toBe("тасарсан");
    expect(liveShort({ okAt: T, fails: 1 }, T + 4 * 60_000)).toBe("4 мин");
    expect(liveShort({ okAt: null, fails: 1 }, T)).toBe("хоцорсон");
    expect(liveShort({ okAt: null, fails: 0 }, T)).toBe("…");
  });
});
