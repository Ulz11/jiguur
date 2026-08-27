import { Component, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Хуудас алдаа өгвөл цагаан дэлгэц гарахаас сэргийлж, ойлгомжтой мэдээлэл харуулна. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[Жигүүр] Хуудасны алдаа:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-10 text-center max-w-lg mx-auto mt-8">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="font-bold text-ink text-[16px] mb-1.5">Энэ хуудсыг харуулахад алдаа гарлаа</h3>
        <p className="text-t2 text-[13px] mb-4">
          Таны дата аюулгүй хэвээр. Хуудсаа сэргээгээд дахин оролдоно уу.
        </p>
        {/* Техникийн мессеж англиар гардаг — Отгоод хэрэггүй, харин програмист
            руу залгахад хэрэгтэй. Тиймээс нуугдана, гэхдээ алга болохгүй. */}
        <details className="tech-details mb-5">
          <summary className="text-[12.5px] text-t2 font-semibold inline-flex items-center gap-1.5 hover:text-ink transition">
            <span className="chev">›</span> Дэлгэрэнгүй (техникийн)
          </summary>
          <code className="block text-[12px] text-t2 bg-sunken rounded-lg px-3 py-2 mt-2.5 text-left overflow-x-auto">
            {this.state.error.message}
          </code>
        </details>
        <div className="flex gap-2.5 justify-center">
          <button className="btn-secondary" onClick={() => this.setState({ error: null })}>Дахин оролдох</button>
          <button className="btn-primary" onClick={() => location.reload()}>Хуудсыг сэргээх</button>
        </div>
      </div>
    );
  }
}
