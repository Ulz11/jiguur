import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner, useToast, Empty } from "../ui";

const ACTIONS: Record<string, [string, string]> = {
  create: ["Үүсгэсэн", "pill-green"],
  update: ["Зассан", "pill-blue"],
  delete: ["Устгасан", "pill-red"],
  confirm: ["Баталгаажуулсан", "pill-green"],
  stocktake: ["Тооллого", "pill-amber"],
  settle_deposit: ["Барьцаа тооцсон", "pill-violet"],
};
const ENTITIES: Record<string, string> = {
  contract: "Гэрээ", contract_item: "Гэрээний мөр", payment: "Төлбөр", stock: "Агуулах",
  collection_note: "Тэмдэглэл", loan: "Зээл", barter: "Бартер", salary: "Цалин",
  material: "Материал", grade: "Зэрэглэл", settings: "Тохиргоо", client: "Харилцагч",
};

export default function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const toast = useToast();

  useEffect(() => {
    setRows(null);
    api(`/api/audit?limit=300${entity ? `&entity=${entity}` : ""}`)
      .then(setRows).catch((e) => toast(e.message, "err"));
  }, [entity]);
  if (!rows) return <Spinner />;

  const shown = rows.filter((r) => !q ||
    (r.detail + r.user_name + (ENTITIES[r.entity] || r.entity)).toLowerCase().includes(q.toLowerCase()));
  const entities = [...new Set(rows.map((r) => r.entity))];

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">AUDIT TRAIL <span>•</span> {rows.length} БИЧИЛТ</div>
          <h1 className="dashboard-title">Үйлдлийн бүртгэл</h1>
          <p className="dashboard-subtitle">Хэн, юуг, хэзээ өөрчилсөн — устгах боломжгүй бүртгэл.</p>
        </div>
      </div>

      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <div className="segment flex-wrap">
          <button className={entity === "" ? "on" : ""} onClick={() => setEntity("")}>Бүгд</button>
          {entities.map((e) => (
            <button key={e} className={entity === e ? "on" : ""} onClick={() => setEntity(e)}>
              {ENTITIES[e] || e}
            </button>
          ))}
        </div>
        <input className="inp max-w-[240px] !min-h-10 !py-2 ml-auto" placeholder="Хайх…"
               value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr>
            <th className="th">Хэзээ</th><th className="th">Хэн</th>
            <th className="th">Юу</th><th className="th">Хаана</th><th className="th">Дэлгэрэнгүй</th>
          </tr></thead>
          <tbody>
            {shown.map((r) => {
              const [label, cls] = ACTIONS[r.action] || [r.action, "pill-grey"];
              return (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap text-t2 tabular-nums text-[12.5px]">{r.at}</td>
                  <td className="td font-semibold text-ink">{r.user_name || "—"}</td>
                  <td className="td"><span className={cls}>{label}</span></td>
                  <td className="td text-t2">
                    {ENTITIES[r.entity] || r.entity}{r.entity_id ? ` #${r.entity_id}` : ""}
                  </td>
                  <td className="td text-t2 text-[13px]">{r.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty title="Бичилт алга" sub="Энэ шүүлтүүрт тохирох үйлдэл байхгүй." />}
      </div>
    </div>
  );
}
