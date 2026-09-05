import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, user } from "../api";
import { Spinner, useToast, Receipt, PageError, OutcomeStrip } from "../ui";
import { parseMoney } from "../lib/num";
import { canOpen } from "../lib/guard";
import { conflictMaterial, stocktakeOutcome } from "../lib/stock";
import { todayIso } from "../lib/schedule";

// Огноо ЛОКАЛ хуанлигаар — `toISOString()` нь UTC тул UTC+8-д орой 8 цагаас
// хойш маргаашийн огноог анхны утга болгож санал болгодог байв.
const today = () => todayIso();

type Row = { material_id: number; grade_id: number; material: string; category: string;
             grade: string; system: number; counted: string };

/* ---------- Ноорог ----------
   Агуулах тоолох нь 20-30 минут үргэлжилнэ. Утас түгжигдэх, таб хаагдах,
   санамсаргүй "буцах" — тоолсон бүхэн алга болно. Оруулсан тоог тухай бүрд нь
   тухайн хэрэглэгчийн ноорогт хадгалж, буцаж ирэхэд нь сэргээнэ. */
type Draft = { savedAt: string; note: string; counts: Record<string, string> };
const rowKey = (r: { material_id: number; grade_id: number }) => `${r.material_id}-${r.grade_id}`;

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === "object" && d.counts && typeof d.counts === "object" ? (d as Draft) : null;
  } catch { return null; }   // эвдэрсэн / уншигдахгүй ноорог ажлыг зогсоох ёсгүй
}

const whenLabel = (iso: string) => {
  const t = new Date(iso);
  return isNaN(+t) ? "" : t.toLocaleString();
};

/** Утсаар агуулах тоолоход зориулсан горим — том товч, нэг мөр = нэг зэрэглэл. */
export default function Stocktake() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState<string | null>(null); // сэргээсэн ноорогийн огноо
  const [draftKey] = useState(() => `jz_stocktake_draft:${user()?.id ?? 0}`);
  /* Хуудас АЧААЛАГДСАНГҮЙ — урьд нь `.catch` нь зөвхөн toast харуулаад
     `rows` нь null хэвээр үлдэж, «Ачаалж байна…» ҮҮРД зогсдог байв. */
  const [err, setErr] = useState<string | null>(null);
  /* 409 — тооллого явж байх зуур агуулахын тоо ӨӨРЧЛӨГДСӨН. Серверийн ЯГ
     өгүүлбэр нь МАТЕРИАЛААРАА эхэлдэг тул зурвасыг мөрөн дээр нь буулгана. */
  const [conflict, setConflict] = useState<string>("");
  const [done, setDone] = useState<string | null>(null);   // үр дүнгийн зурвас
  const toast = useToast();
  const nav = useNavigate();
  const u = user();

  const loadStock = () => {
    setErr(null);
    api("/api/stock").then((d) => {
      const out: Row[] = [];
      for (const m of d.rows)
        for (const s of m.stock || [])
          out.push({ material_id: m.id, grade_id: s.grade_id, material: m.name,
                     category: m.category, grade: s.grade, system: s.on_hand, counted: "" });
      // Ноорогоо сэргээнэ — устсан материалын мөр байвал зүгээр л алгасна
      const draft = readDraft(draftKey);
      const counts = draft?.counts || {};
      let hits = 0;
      for (const r of out) {
        const v = counts[rowKey(r)];
        if (v !== undefined && v !== "") { r.counted = v; hits++; }
      }
      if (hits) {
        if (draft?.note) setNote(draft.note);
        setRestored(draft?.savedAt || "");
      }
      setRows(out);
    }).catch((e) => { toast(e.message, "err"); setErr(e.message); });
  };
  useEffect(() => { loadStock(); }, []);

  /* Оруулсан тоо бүрийг тэр дороо ноорогт бичнэ */
  useEffect(() => {
    if (!rows) return;
    const counts: Record<string, string> = {};
    for (const r of rows) if (r.counted !== "") counts[rowKey(r)] = r.counted;
    try {
      if (Object.keys(counts).length === 0) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey,
        JSON.stringify({ savedAt: new Date().toISOString(), note, counts } satisfies Draft));
    } catch { /* хувийн горим / зай дүүрсэн — ноорог алдагдана ч тооллого үргэлжилнэ */ }
  }, [rows, note, draftKey]);

  /* Хадгалаагүй байхад таб хаах гэвэл хөтөч өөрөө асууна */
  const filledCount = rows ? rows.filter((r) => r.counted !== "").length : 0;
  useEffect(() => {
    if (!filledCount) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [filledCount]);

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* үл ойшоох */ }
    setRows((rs) => (rs ? rs.map((r) => ({ ...r, counted: "" })) : rs));
    setNote("");
    setRestored(null);
  }

  if (err && !rows) return <PageError error={err} onRetry={loadStock} />;
  if (!rows) return <Spinner />;

  /** 409-ийн зурвас нь ЭНЭ материалын тухай юу. */
  const clashName = conflictMaterial(conflict);

  const diffOf = (r: Row) => (r.counted === "" ? 0 : parseMoney(r.counted) - r.system);
  const filled = rows.filter((r) => r.counted !== "");
  const diffs = filled.filter((r) => diffOf(r) !== 0);
  const shown = rows.filter((r) =>
    (!q || r.material.toLowerCase().includes(q.toLowerCase()) || r.grade.toLowerCase().includes(q.toLowerCase()))
    && (!onlyDiff || diffOf(r) !== 0));
  /* Зөрчсөн мөр ХАРАГДАЖ байгаа бол зурвас нь тэр мөрөн дээрээ; хайлт/шүүлтээс
     болж нуугдсан бол хуудасны дээд талд (эс бөгөөс алдаа огт харагдахгүй). */
  const clashShown = !!clashName && shown.some((r) => r.material === clashName);

  async function submit() {
    if (!filled.length) { toast("Ядаж нэг мөр тоолно уу", "err"); return; }
    setBusy(true);
    setConflict("");
    try {
      const r = await api("/api/stock/stocktake", { method: "POST", body: JSON.stringify({
        date: today(), note,
        /* ⚠ `system` — ХУУДАС ХАРУУЛСАН үлдэгдэл. Тооллого утсан дээр цагаар
           үргэлжилдэг; тэр хооронд ачилт/буцаалт бүртгэгдвэл серверийн тоо
           өөр болно. Энэ талбаргүйгээр тооллого нь ХООРОНДОХ бүх хөдөлгөөнийг
           ЧИМЭЭГҮЙ арчина — 450ш ачилт «дутсан бараа» болж алга болно. */
        lines: filled.map((x) => ({ material_id: x.material_id, grade_id: x.grade_id,
                                    counted: parseMoney(x.counted), system: x.system })) }) });
      try { localStorage.removeItem(draftKey); } catch { /* үл ойшоох */ }
      /* Дуусмагц /warehouse руу ҮСРЭХГҮЙ: 40 минутын ажлын ҮР ДҮН нь
         3.2 секундын toast болж өнгөрдөг байв. Зурвас нь тоонуудтайгаа
         үлдэж, дараагийн алхмаа өөрөө нэрлэнэ. */
      setDone(stocktakeOutcome(filled.length, r.adjusted, r.diff_total ?? 0));
      setRows((rs) => (rs ? rs.map((x) => ({ ...x, counted: "" })) : rs));
      setNote("");
      setRestored(null);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      /* 409 = үлдэгдэл зөрсөн. Серверийн өгүүлбэр нь АЛЬ материал болохыг
         хэлдэг тул түүнийг ЯГ ТЭР мөрөн дээр буулгана — хуудасны дээд
         талын улаан тууз нь «аль мөр вэ?» гэсэн асуулт үлдээдэг. */
      if (e?.status === 409) setConflict(e.message);
      toast(e.message, "err");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-6">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">ТООЛЛОГО <span>•</span> {today()}</div>
          <h1 className="dashboard-title">Тооллого</h1>
          <p className="dashboard-subtitle">
            Агуулахад байгаа бодит тоог бичнэ. Зөрүү шууд харагдана.
          </p>
        </div>
      </div>

      {/* ҮР ДҮНГИЙН ЗУРВАС — 40 минутын ажлын хариу нь 3.2 секундын toast
          болж өнгөрөх ёсгүй. Бүртгэлийн мөр рүү нь холбоос дагалдана
          (менежерт — бусдад тэр хуудас хаалттай, худал холбоос гаргахгүй). */}
      {done && (
        <OutcomeStrip text={done} onClose={() => setDone(null)} />
      )}
      {done && canOpen("/audit", u?.role) && (
        <p className="-mt-2 mb-4 text-[12.5px] text-t2">
          <Link to="/audit?action=stocktake&entity=stock" className="text-brand-ink font-semibold hover:underline">
            Үйлдлийн бүртгэлээс энэ тооллогыг харах →
          </Link>
        </p>
      )}

      {/* ЗӨРЧИЛ (409) — тооллого явж байх зуур агуулахын тоо өөрчлөгдсөн.
          Сервер ЮУ Ч БИЧЭЭГҮЙ: хагас хийгдсэн тооллого гэж байхгүй. */}
      {conflict && !clashShown && (
        <div role="alert"
             className="mb-3.5 rounded-xl bg-danger-50 border border-danger px-4 py-3
                        flex items-start gap-2.5 flex-wrap">
          <span className="text-[13px] font-semibold text-danger flex-1 min-w-[220px] leading-relaxed">
            {conflict}
            <span className="block font-normal text-t2 mt-0.5">
              Тооллого ХАДГАЛАГДААГҮЙ — бичсэн тоо чинь хэвээр байна. Дахин
              ачаалахад системийн үлдэгдэл шинэчлэгдэж, тоолсон тоо чинь үлдэнэ.
            </span>
          </span>
          <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]"
                  onClick={() => { setConflict(""); loadStock(); }}>Дахин ачаалах</button>
        </div>
      )}

      {restored !== null && (
        <div className="mb-3.5 rounded-xl bg-brand-50 px-4 py-3 flex items-center gap-2.5 flex-wrap">
          <span className="text-[13px] font-medium text-t1 flex-1 min-w-[200px]">
            Хадгалагдаагүй тооллого сэргээгдлээ{restored ? ` · ${whenLabel(restored)}` : ""} — үргэлжлүүлэн тоолж болно.
          </span>
          <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]" onClick={clearDraft}>
            Цэвэрлэж шинээр эхлэх
          </button>
          <button className="btn-ghost !min-h-9 !py-1.5 !px-2 text-[13px]" aria-label="Мэдэгдлийг хаах"
                  onClick={() => setRestored(null)}>✕</button>
        </div>
      )}

      <div className="flex gap-2.5 mb-3.5 flex-wrap">
        <input className="inp flex-1 min-w-[180px]" placeholder="Материал хайх…"
               aria-label="Материал хайх" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`btn-secondary ${onlyDiff ? "!border-brand !text-brand-ink" : ""}`}
                onClick={() => setOnlyDiff(!onlyDiff)}>
          Зөрүүтэй ({diffs.length})
        </button>
      </div>

      <div className="card divide-y divide-line">
        {shown.map((r) => {
          const idx = rows.indexOf(r);
          const diff = diffOf(r);
          const clashed = !!clashName && r.material === clashName;
          return (
            <div key={`${r.material_id}-${r.grade_id}`}
                 className={`flex items-center gap-3 p-3.5 flex-wrap ${clashed ? "bg-danger-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <b className="text-[14.5px] text-ink block leading-tight">{r.material}</b>
                <span className="text-[12px] text-t3">
                  <span className="pill-grey !py-0 mr-1.5">{r.grade}</span>
                  системд <b className="tabular-nums">{fmt(r.system)}</b>
                </span>
              </div>
              <input type="number" inputMode="numeric" placeholder="тоо"
                     aria-label={`${r.material} · ${r.grade} — тоолсон тоо (системд ${fmt(r.system)})`}
                     className={`inp !w-28 !min-h-[52px] text-center !text-[17px] font-bold
                       ${diff > 0 ? "!border-money" : diff < 0 ? "!border-danger" : ""}`}
                     value={r.counted}
                     onChange={(e) => {
                       const next = [...rows];
                       next[idx] = { ...r, counted: e.target.value };
                       setRows(next);
                     }} />
              <div className="w-20 text-right shrink-0">
                {r.counted !== "" && (
                  <b className={`tabular-nums text-[14px] ${
                    diff > 0 ? "text-money" : diff < 0 ? "text-danger" : "text-t3"}`}>
                    {diff > 0 ? "+" : ""}{diff === 0 ? "таарав" : fmt(diff)}
                  </b>
                )}
              </div>
              {/* ЗӨРЧИЛ ЯГ ЭНЭ МӨРӨН ДЭЭР. Хуудасны дээд талын улаан тууз нь
                  «аль мөр вэ?» гэсэн асуулт үлдээдэг — 215 мөрийн дундаас
                  хайх ажил Отгоод үлдэнэ. Серверийн ЯГ өгүүлбэр (хуучин тоо →
                  шинэ тоо) нь юу болсныг өөрөө хэлнэ. */}
              {clashed && (
                <div role="alert" className="w-full flex items-start gap-2.5 flex-wrap pt-1">
                  <span className="text-[12.5px] font-semibold text-danger flex-1 min-w-[200px] leading-relaxed">
                    {conflict}
                    <span className="block font-normal text-t2">
                      Тооллого ХАДГАЛАГДААГҮЙ — тоолсон тоо чинь хэвээр байна.
                    </span>
                  </span>
                  <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[12.5px]"
                          onClick={() => { setConflict(""); loadStock(); }}>Дахин ачаалах</button>
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-8 text-center text-t3 text-sm">Илэрц алга</div>}
      </div>

      {filled.length > 0 && (
        /* ⚠ `fixed bottom-0 left-0 right-0` байв — тэр нь дэлгэцийн БҮХ өргөнийг
           эзэлж, ЗҮҮН ТАЛЫН ЦЭСИЙГ (262px navy) доод талаас нь таслан хучиж
           байсан: «Агуулах» мөр, «Гарах» товч 52px-ийн цагаан туузан доор
           үлдэнэ. Одоо `sticky` — тууз нь агуулгын БАГАНАД харьяалагдана
           (`.jz-main` дотор), цэс рүү хэзээ ч гарахгүй, цэс хураагдсан үед ч
           өөрөө тохирно. Дэлгэцийн доод ирмэгт наалдах зан ХЭВЭЭР. */
        <div className="stocktake-bar sticky bottom-0 z-30 border-t border-line p-3.5 backdrop-blur">
          <div className="max-w-3xl mx-auto flex gap-3 items-center flex-wrap">
            <Receipt className="flex-1 min-w-[240px] !py-2.5"
              rows={[{ label: "Тоолсон мөр", value: `${filled.length} / ${rows.length}` }]}
              total={{ label: "Зөрүүтэй мөр",
                       value: `${diffs.length} мөр · ${fmt(diffs.reduce((s, r) => s + diffOf(r), 0))}ш`,
                       accent: diffs.length ? "danger" : "money" }} />
            <input className="inp max-w-[200px]" placeholder="Тэмдэглэл (заавал биш)"
                   aria-label="Тооллогын тэмдэглэл (заавал биш)"
                   value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary !min-h-[52px] px-6" disabled={busy} onClick={submit}>
              {busy ? "Хадгалж байна…" : "✓ Тооллого дуусгах"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
