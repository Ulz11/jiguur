import { useId, useState } from "react";
import { api, money } from "../api";
import { ConfirmModal, useToast } from "../ui";
import { releaseRows, releasedTotal, type Allocation } from "../lib/void";

/* Төлбөр ХҮЧИНГҮЙ болгох — гэрээний хуудас, харилцагчийн хуудас ХОЁУЛАА
   ЭНЭ цонхыг дуудна. Хоёр газарт хоёр өөр асуулт байвал Отгоо аль нэгэнд нь
   итгэхээ болино.

   Цонхны бүтэц UI-ЗАРЧИМ §4-ийн «мөнгө хөдөлгөх» дүрмээр: болох гэж буйгаа
   navy Receipt дээр ЭХЛЭЭД харуулаад л асууна, фокус нь `danger` тул «Болих»
   дээр очно (санамсаргүй Enter мөнгө хөдөлгөхгүй). */
export function VoidPaymentModal({ payment, onClose, onDone }: {
  payment: {
    id: number; amount: number; date: string; method: string;
    barter_desc?: string; allocations?: Allocation[];
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const toast = useToast();
  const rid = useId();
  const rows = releaseRows(payment.allocations);
  const freed = releasedTotal(payment.allocations);
  const barter = payment.method === "BARTER";

  return (
    <ConfirmModal
      title="Төлбөр хүчингүй болгох"
      intro={<>
        <b className="text-ink">{money(payment.amount)}</b> · {payment.date} — энэ бичилт
        УСТАХГҮЙ: жагсаалтад «ХҮЧИНГҮЙ» тэмдэгтэй, шалтгаантайгаа хамт үлдэнэ.
        Доорх хуваарилалт суларч, нэхэмжлэлүүд буцаж нээгдэнэ. Энэ үйлдлийг
        буцаах боломжгүй.
      </>}
      rows={rows.length
        ? rows.map((r) => ({ label: r.label, sub: r.sub, value: money(r.amount),
                             accent: "danger" as const }))
        : [{ label: "Хуваарилагдсан нэхэмжлэл алга", value: "—", accent: "dim" as const }]}
      total={{ label: "Нэхэмжлэлээс суларах дүн", value: money(freed),
               accent: freed > 0 ? "danger" : "dim" }}
      note={barter
        ? "Бартер: автоматаар үүссэн хөрөнгө нь ЗАРАГДААГҮЙ бол хамт хүчингүй "
          + "болно. Зарагдсан/нөөцөд орсон бол цуцлалт татгалзана."
        : undefined}
      confirmLabel="Хүчингүй болгох"
      confirmDisabled={!reason.trim()}
      danger
      onClose={onClose}
      onConfirm={async () => {
        try {
          await api(`/api/payments/${payment.id}/void`, {
            method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
          toast("Төлбөр хүчингүй болов");
          onDone();
        } catch (e: any) { toast(e.message, "err"); }
      }}>
      {/* Шалтгаан нь ЗААВАЛ: цуцлалт бүр яагаад болсныг хожим уншиж чадах
          ёстой — audit-д ч, мөрийн tooltip дээр ч энэ текст очно. */}
      <label className="block text-[13px] font-semibold text-t2 mb-1.5" htmlFor={rid}>
        Цуцлах шалтгаан <span className="text-danger">*</span>
      </label>
      <input id={rid} className="inp w-full" value={reason} autoFocus
             placeholder="ж: дүнг буруу бичсэн"
             onChange={(e) => setReason(e.target.value)} />
    </ConfirmModal>
  );
}

/** Мөрөн дэх цуцлах товч — хүснэгтийн нягт үйлдэл, 36px хүрэх талбайтай
 *  (`btn-row`, UI-ЗАРЧИМ §4). Нэр нь ЮУГ цуцлахыг хэлнэ: жагсаалт дундуур
 *  уншигчаар явахад «цуцлах, цуцлах, цуцлах» гэсэн гурван ижил зогсоол
 *  гарахгүй. */
export function VoidButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn-row text-danger" onClick={(e) => {
      e.stopPropagation(); onClick();
    }} title="Хүчингүй болгох">
      Хүчингүй<span className="sr-only"> болгох — {label}</span>
    </button>
  );
}
