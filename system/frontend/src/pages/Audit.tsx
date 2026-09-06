import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Empty, Refreshing, Spinner } from "../ui";
import { ErrorCard } from "../components/SideStrip";
import { auditHref } from "../lib/links";
import { ACTIONS, BACKEND_ACTIONS, BACKEND_ENTITIES, actionLabel, entityLabel } from "../lib/audit";
import { AuditFilter, PAGE, auditQuery, defaultFilter, emptyText, filterTouched,
         localStamp, paging, pagingLabel } from "../lib/auditView";
import { todayIso } from "../lib/schedule";

/* ҮЙЛДЛИЙН БҮРТГЭЛ — ХУВААГДСАН БҮРТГЭЛ, ХУУДАСЛАГДСАН ХАРАГДАЦ.
 *
 * Гурван зүйл эвдэрсэн байв (`lib/auditView.ts`-ийн тайлбарыг үз):
 *   · сервер `{rows, total}` буцаадаг болсныг хуудас нь МАССИВ гэж уншиж
 *     байсан — `rows.filter` нь `undefined` дээр унаж, хуудас БҮХЭЛДЭЭ
 *     хоосорно (`her/mongolian.spec.ts`);
 *   · шүүлтүүр нь ачаалагдсан 300 мөрөөс төрдөг тул толинд байгаа биет
 *     мөрөнд байхгүй бол товч нь ОГТ гарахгүй;
 *   · огнооны цонх байхгүй, `offset` ашиглагдаагүй — 300 дахь мөрөөс цааш
 *     бүртгэл нь БАЙГАА боловч ХҮРЭХГҮЙ.
 *
 * Одоо шүүлт бүхэлдээ СЕРВЕР дээр (`from,to,action,entity,user,q,offset`),
 * шүүлтүүр нь ТОЛИНООС (`BACKEND_ACTIONS` / `BACKEND_ENTITIES`) төрнө.
 */
export default function Audit({ mine = false }: { mine?: boolean } = {}) {
  const today = todayIso();
  const [f, setF] = useState<AuditFilter>(() => defaultFilter(today));
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const uid = useId();
  /* Хуудас нэмэх (offset > 0) нь мөрүүдийг СОЛИХГҮЙ, НЭМНЭ. Аль горимд
     явааг тоолуураар барина: шүүлт солигдоход `offset` 0 болж дахин эхэлнэ. */
  const runId = useRef(0);

  const fetchPage = useCallback((next: AuditFilter) => {
    const id = ++runId.current;
    setBusy(true);
    setErr("");
    api(auditQuery(next, mine))
      .then((d) => {
        if (id !== runId.current) return;      // хожуу ирсэн хуучин хариу
        const got = Array.isArray(d?.rows) ? d.rows : [];
        setRows((prev) => (next.offset > 0 ? [...prev, ...got] : got));
        setTotal(Number(d?.total ?? got.length));
      })
      .catch((e) => { if (id === runId.current) setErr(e.message); })
      .finally(() => { if (id === runId.current) setBusy(false); });
  }, [mine]);

  useEffect(() => { fetchPage(f); }, [f, fetchPage]);

  /** Шүүлт солих — үргэлж ЭХНИЙ хуудаснаас (хуучин мөр наалдаж үлдэхгүй). */
  const setFilter = (patch: Partial<AuditFilter>) =>
    setF((prev) => ({ ...prev, ...patch, offset: 0 }));

  const p = paging(rows.length, total);
  const touched = filterTouched(f, today);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          {/* ХОЁР ХУУДАС, НЭГ БИЕ. «Миний бүртгэл» нь бүх рольд нээлттэй
              (`/api/audit/mine`): дарга тооллого хийгээд үр дүнгээ хардаггүй,
              «суусан уу?» гэж Отгоо руу залгадаг байв. Бүтэн бүртгэл нь
              (бусдын үйлдэл, мөнгөний мөрүүд) эзний хэвээр. */}
          <div className="dashboard-kicker">{mine ? "МИНИЙ БҮРТГЭЛ" : "ҮЙЛДЛИЙН БҮРТГЭЛ"}
            <span>•</span> {pagingLabel(p).toUpperCase()}</div>
          <h1 className="dashboard-title">{mine ? "Миний бүртгэл" : "Үйлдлийн бүртгэл"}</h1>
          <p className="dashboard-subtitle">
            {mine ? "Таны өөрийн үлдээсэн мөрүүд — юуг, хэзээ бүртгэсэн бэ."
                  : "Хэн, юуг, хэзээ өөрчилсөн — устгах боломжгүй бүртгэл."}</p>
        </div>
      </div>

      {/* ---- ХУГАЦАА · ХЭН · ЮУ · ХАЙЛТ ----
          Огноо нь ЭХЭНД: «өнгөрсөн долоо хоногт юу болсон бэ» гэдэг нь энэ
          хуудсанд ирэх ГОЛ асуулт. Анхдагч нь сүүлийн 30 хоног — бүх түүхийг
          нэг дор буулгавал эхний дэлгэц утгагүй урт болно. */}
      <div className="card p-4 mb-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="lbl" htmlFor={`${uid}-from`}>Эхлэх огноо</label>
          <input id={`${uid}-from`} type="date" className="inp !min-h-10 !py-2 w-[160px]"
                 value={f.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </div>
        <div>
          <label className="lbl" htmlFor={`${uid}-to`}>Дуусах огноо</label>
          <input id={`${uid}-to`} type="date" className="inp !min-h-10 !py-2 w-[160px]"
                 value={f.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </div>
        {/* Үйлдэл нь ТОЛИНООС бүтнээрээ — ачаалагдсан мөрөөс биш. */}
        <div>
          <label className="lbl" htmlFor={`${uid}-action`}>Юу хийсэн</label>
          <select id={`${uid}-action`} className="inp !min-h-10 !py-2 w-[190px]"
                  value={f.action} onChange={(e) => setFilter({ action: e.target.value })}>
            <option value="">Бүх үйлдэл</option>
            {BACKEND_ACTIONS.map((a) => (
              <option key={a} value={a}>{(ACTIONS[a] ?? [a])[0]}</option>
            ))}
          </select>
        </div>
        {/* «Хэн» нь ЗӨВХӨН бүтэн бүртгэл дээр: миний хуудсанд бүх мөр НАДАЛХ
            тул тэр талбар зөвхөн хоосон үр дүн төрүүлнэ. */}
        {!mine && (
        <div>
          <label className="lbl" htmlFor={`${uid}-who`}>Хэн хийсэн</label>
          <input id={`${uid}-who`} className="inp !min-h-10 !py-2 w-[170px]" list={`${uid}-whos`}
                 placeholder="Бүх хүн" value={f.who}
                 onChange={(e) => setFilter({ who: e.target.value })} />
          {/* Серверт хэрэглэгчийн ЖАГСААЛТЫН хаалга байхгүй тул энэ нь
              САНАЛ — ирсэн мөрүүд дээрх нэрс. Шүүлт нь СЕРВЕР дээр,
              хэсэгчилсэн тулгалтаар явна. */}
          <datalist id={`${uid}-whos`}>
            {[...new Set(rows.map((r) => r.user_name).filter(Boolean))]
              .map((n: string) => <option key={n} value={n} />)}
          </datalist>
        </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <label className="lbl" htmlFor={`${uid}-q`}>Хайх</label>
          <input id={`${uid}-q`} className="inp !min-h-10 !py-2 w-full"
                 placeholder="Дэлгэрэнгүй, хүний нэрээр…"
                 aria-label="Үйлдлийн бүртгэлээс хайх" value={f.q}
                 onChange={(e) => setFilter({ q: e.target.value })} />
        </div>
        {touched && (
          <button className="btn-secondary !min-h-10 !py-2"
                  onClick={() => setF(defaultFilter(today))}>Шүүлт арилгах</button>
        )}
      </div>

      {/* Биетийн шүүлтүүр нь ТОВЧ хэвээр: Отгоо «Бартер» гэдгийг НЭГ товшилтоор
          олдог (жагсаалт нээж, гүйлгэж, сонгохгүй). Товчнууд толиос төрдөг тул
          сүүлийн 30 хоногт тэр биет ГАРААГҮЙ ч зам нь нээлттэй үлдэнэ. */}
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <div className="segment flex-wrap">
          <button className={f.entity === "" ? "on" : ""}
                  onClick={() => setFilter({ entity: "" })}>Бүгд</button>
          {BACKEND_ENTITIES.map((e) => (
            <button key={e} className={f.entity === e ? "on" : ""}
                    onClick={() => setFilter({ entity: e })}>
              {entityLabel(e)}
            </button>
          ))}
        </div>
      </div>

      {err ? (
        <ErrorCard message={err} onRetry={() => fetchPage(f)} />
      ) : busy && rows.length === 0 ? (
        /* ЭХНИЙ ачаалалт — хоосон хүснэгт ширтүүлэхгүй. Дараагийн шүүлтүүд
           нь `Refreshing`-ээр явна: хуучин мөр байрандаа үлдэж, зөвхөн
           бүдгэрнэ (Отгоо хаана байснаа алдахгүй). */
        <Spinner />
      ) : (
        <Refreshing busy={busy}>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr>
                <th className="th">Хэзээ</th>{!mine && <th className="th">Хэн</th>}
                <th className="th">Юу</th><th className="th">Хаана</th><th className="th">Дэлгэрэнгүй</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [label, cls] = actionLabel(r.action);
                  const to = auditHref(r.entity, r.entity_id);
                  return (
                    <tr key={r.id}>
                      {/* Цаг нь ОРОН НУТГИЙНХ (сервер +08:00-оор өгнө) ба
                          ӨДРӨӨ үүрнэ: «14:03» дангаараа «хэзээ билээ» гэсэн
                          асуулт үлдээнэ. Түүхий ISO мөр (T, +08:00) нь ЛАТИН
                          тул дэлгэц дээр хэзээ ч гарахгүй. */}
                      <td className="td whitespace-nowrap text-t2 tabular-nums">
                        {localStamp(r.local_at, r.at)}
                      </td>
                      {!mine && <td className="td font-semibold text-ink">{r.user_name || "—"}</td>}
                      <td className="td"><span className={cls}>{label}</span></td>
                      {/* «Гэрээ #26» гэдэг нь мухардмал текст байв — хуудастай
                          объект бол тэр хуудас руугаа нээгдэнэ. Хуудасгүй объект
                          (төлбөр, хөдөлгөөн, нэхэмжлэл) нь текст хэвээр: тэдгээрийн
                          id гэрээнийх БИШ тул худал холбоос үүсгэхгүй. */}
                      <td className="td text-t2">
                        {to
                          ? <Link to={to} className="text-ink hover:underline">
                              {entityLabel(r.entity)} #{r.entity_id}
                            </Link>
                          : <>{entityLabel(r.entity)}{r.entity_id ? ` #${r.entity_id}` : ""}</>}
                      </td>
                      <td className="td text-t2">{r.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ХООСОН нь ХУГАЦААГАА нэрлэнэ — «алга» гэдэг дангаараа
                мухардмал хана. Гарц нь НЭГ товч: цонхоо сунгах. */}
            {rows.length === 0 && !busy && (
              <Empty title="Энэ хугацаанд бичилт алга — хугацааг сунгах"
                     sub={`Харсан хугацаа: ${emptyText(f)}. Огноог урагшлуулах, эсвэл шүүлтээ арилгана уу.`}
                     action={touched
                       ? { label: "Шүүлт арилгах", onClick: () => setF(defaultFilter(today)) }
                       : undefined} />
            )}
          </div>

          {p.hasMore && (
            <div className="mt-3 text-center">
              <button className="btn-secondary" disabled={busy}
                      onClick={() => setF((prev) => ({ ...prev, offset: p.nextOffset }))}>
                Дараагийн {PAGE}
              </button>
              <span className="block text-[12.5px] text-t3 mt-1.5 tabular-nums">
                {pagingLabel(p)}
              </span>
            </div>
          )}
        </Refreshing>
      )}
    </div>
  );
}
