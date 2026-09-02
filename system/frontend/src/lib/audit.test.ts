import { describe, it, expect } from "vitest";
import {
  ACTIONS, ENTITIES, BACKEND_ACTIONS, BACKEND_ENTITIES,
  actionLabel, entityLabel,
} from "./audit";

/* Үйлдлийн бүртгэл нь Отгоо эгчийн ГАНЦ «хэн юу хийв» гэсэн хариу — тэнд
 * англи үг гарвал мөр нь бүхэлдээ уншигдахаа болино. Толь дутуу байх нь
 * АЛДАА ӨГДӨГГҮЙ: `ACTIONS[a] || a` нь backend-ийн түүхий түлхүүрийг шууд
 * зурчихдаг. Тиймээс дүрмийг ЭНД, машинаар барина.
 *
 * Бодит уналт (2026-09): `void`, `close`, `book_penalty`, `cron` үйлдэл ба
 * `akt`, `rate_change`, `penalty_charge`, `machine*` биетүүд толинд байгаагүй
 * тул /audit хуудас «void», «rate_change» гэсэн товч, пил зурж байв. */

const CYRILLIC_ONLY = /^[Ѐ-ӿ\s().,·—-]+$/;

describe("үйлдлийн толь", () => {
  it("backend-ийн БҮХ үйлдэл монгол нэртэй", () => {
    const missing = BACKEND_ACTIONS.filter((a) => !(a in ACTIONS));
    expect(missing,
      `эдгээр үйлдэл /audit дээр ТҮҮХИЙ АНГЛИ болж гарна: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("нэр бүр зөвхөн кирилл — латин үсэг нэг ч алга", () => {
    for (const key of BACKEND_ACTIONS) {
      const [label] = ACTIONS[key];
      expect(label, `«${key}» → «${label}»`).toMatch(CYRILLIC_ONLY);
    }
  });

  it("өнгө нь UI-ЗАРЧИМ §4-ийн шатнаас гарна", () => {
    const SCALE = new Set(["pill-green", "pill-blue", "pill-red", "pill-amber",
                           "pill-violet", "pill-grey"]);
    for (const [key, [, pill]] of Object.entries(ACTIONS)) {
      expect(SCALE.has(pill), `«${key}» → танихгүй пил «${pill}»`).toBe(true);
    }
  });

  it("«Хүчингүй болгосон» нь «Устгасан» БИШ — H1-ийн сөрөг бичилт үлддэг", () => {
    expect(actionLabel("void")[0]).toBe("Хүчингүй болгосон");
    expect(actionLabel("void")[0]).not.toBe(actionLabel("delete")[0]);
    /* Хоёулаа улаан: аль аль нь «энэ мөр цаашид тоологдохгүй» гэсэн шат. */
    expect(actionLabel("void")[1]).toBe("pill-red");
  });

  it("cron нь хүний шийдвэр биш тул саарал", () => {
    expect(actionLabel("cron")).toEqual(["Автоматаар үүсгэсэн", "pill-grey"]);
  });
});

describe("биетийн толь", () => {
  it("backend-ийн БҮХ биет монгол нэртэй", () => {
    const missing = BACKEND_ENTITIES.filter((e) => !(e in ENTITIES));
    expect(missing,
      `шүүлтүүрийн товч дээр ТҮҮХИЙ АНГЛИ гарна: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("нэр бүр зөвхөн кирилл", () => {
    for (const key of BACKEND_ENTITIES) {
      expect(ENTITIES[key], `«${key}»`).toMatch(CYRILLIC_ONLY);
    }
  });

  it("§3-ын толь бичгийн үгс — нэг ойлголт, нэг үг", () => {
    /* Гэрээний дэлгэрэнгүй дээрх картуудын нэртэй ИЖИЛ байх ёстой:
       нэг зүйлийг хоёр хуудас өөр нэрлэвэл тэр хоёр өөр зүйл болж уншигдана. */
    expect(entityLabel("akt")).toBe("Акт");
    expect(entityLabel("rate_change")).toBe("Тарифын өөрчлөлт");
    expect(entityLabel("movement")).toBe("Хөдөлгөөн");
  });
});

describe("танихгүй түлхүүр", () => {
  it("унахгүй — өөрийгөө хэлээд саарал болно", () => {
    /* Ирээдүйд backend шинэ үйлдэл нэмвэл дэлгэц ХООСОРЧ болохгүй.
       Түүхий түлхүүр нь МУУ, гэхдээ хоосон нүд бүр МУУ. Дээрх «бүх түлхүүр
       толинд байна» гэсэн шалгалт нь тэр байдалд хүрэхээс сэргийлнэ. */
    expect(actionLabel("шинэ_үйлдэл")).toEqual(["шинэ_үйлдэл", "pill-grey"]);
    expect(entityLabel("шинэ_биет")).toBe("шинэ_биет");
  });
});
