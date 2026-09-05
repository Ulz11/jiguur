import { ReactNode } from "react";

/* ═══ ХАЖУУГИЙН ХУУДСУУДЫН ХОЁР ЖИЖИГ БИЕТ ═══
 *
 * 1. `SideStrip` — ҮР ДҮНГИЙН ЗУРВАС. Гэрээ ба харилцагчийн хуудсанд энэ
 *    аль хэдийн бий; Зээл, Цалин, Бартер, Механизм, Тохиргоо дээр БАЙГААГҮЙ.
 *    Тэдгээр дээр амжилт нь 3.2 секундын мэдэгдлээр л ярьдаг байсан
 *    (`ui.tsx`) — Отгоо «Бүртгэх» дараад цаас руугаа хараад буцаж ирэхэд
 *    дэлгэц юу ч болоогүй мэт зогсоно. Зурвас нь «Хаах» дартал үлдэнэ.
 *
 * 2. `ErrorCard` — ЭРГЭЛДЭГЧИЙН ОРОН ЗАЙД. `Spinner` нь «ачаалж байна…»
 *    гэж хэлдэг ч хүсэлт УНАСАН үед мөнхөд эргэлдэнэ: Отгоо хуудсыг
 *    «удаан байна» гэж уншиж, F5-аа дардаг (эсвэл орхино). Алдаа нь
 *    ӨӨРИЙГӨӨ нэрлэж, ГАРЦАА санал болгоно.
 *
 * ЯАГААД `ui.tsx`-д БИШ: тэр файлыг зэрэгцээ өөр ажил эзэмшиж байна.
 * Хэлбэр нь `pages/ClientProfile.tsx`-ийн зурвастай ЯГ ижил (нэг өнгө, нэг
 * дүрс, нэг «Хаах») — хоёр биет байх нь хоёр ХЭЛБЭР гэсэн үг биш.
 */

export function SideStrip({ text, onClose, action }: {
  text: string;
  onClose: () => void;
  /** Зурвас дээр зогсох ГАНЦ буцах зам («Идэвхжүүлэх» — андуурч хассан хүн). */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div role="status"
         className="mt-4 rounded-2xl border border-money bg-money-50 px-4 py-3
                    flex items-start gap-3 flex-wrap">
      <span aria-hidden="true" className="text-money font-bold leading-6">✓</span>
      <span className="flex-1 min-w-[200px] text-[13.5px] font-semibold text-ink
                       leading-6 tabular-nums break-words">{text}</span>
      {action && (
        <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]"
                onClick={action.onClick}>{action.label}</button>
      )}
      <button className="btn-secondary !min-h-9 !py-1.5 !px-3 text-[13px]"
              onClick={onClose}>Хаах</button>
    </div>
  );
}

/** Ачаалалт унасан үе — ЭРГЭЛДЭГЧ БИШ, шалтгаан ба гарц. */
export function ErrorCard({ message, onRetry, title = "Мэдээлэл ачаалагдсангүй", children }: {
  message: string;
  onRetry: () => void;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className="card p-6 text-center">
      <div className="w-14 h-14 mx-auto mb-3 rounded-[18px] bg-danger-50 grid place-items-center
                      text-danger text-2xl" aria-hidden="true">⚠</div>
      <h3 className="font-bold text-ink text-[15px] mb-1">{title}</h3>
      <p className="text-t2 text-[13px] max-w-md mx-auto break-words">{message}</p>
      {children}
      <button className="btn-primary mt-4" onClick={onRetry}>Дахин оролдох</button>
    </div>
  );
}
