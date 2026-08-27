import { useState } from "react";
import { sayaFmt } from "../api";

type Props = { months: string[]; rent: number[]; sale: number[]; barter: number[] };
const SERIES = [
  { key: "rent", name: "Түрээс", color: "#F88712" },
  { key: "sale", name: "Худалдаа", color: "#253886" },
  { key: "barter", name: "Бартер", color: "#6756A4" },
] as const;

export default function RevChart(data: Props) {
  const [on, setOn] = useState<Record<string, boolean>>({ rent: true, sale: true, barter: true });
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 240, P = { l: 50, r: 16, t: 16, b: 30 };
  const active = SERIES.filter((s) => on[s.key]);
  const vals = (k: string) => (data as any)[k] as number[];
  const allVals = active.length ? active.flatMap((s) => vals(s.key)) : [1];
  const max = Math.max(...allVals, 1) * 1.18;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(data.months.length - 1, 1);
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {[0, 1, 2, 3, 4].map((g) => {
          const gy = P.t + (g * (H - P.t - P.b)) / 4;
          return (
            <g key={g}>
              <line x1={P.l} x2={W - P.r} y1={gy} y2={gy} stroke="var(--color-line)" strokeDasharray="3 4" />
              <text x={P.l - 8} y={gy + 4} textAnchor="end" fontSize="10" fill="var(--color-t3)">
                {sayaFmt(max - (g * max) / 4)}
              </text>
            </g>
          );
        })}
        {data.months.map((m, i) => (
          <text key={m + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-t3)">{m}</text>
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b}
                stroke="var(--color-line-strong)" strokeDasharray="3 4" />
        )}
        {active.map((s) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      points={vals(s.key).map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {vals(s.key).map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill="#fff"
                      stroke={s.color} strokeWidth="2" />
            ))}
          </g>
        ))}
        {data.months.map((_, i) => {
          const w = (W - P.l - P.r) / Math.max(data.months.length - 1, 1);
          return (
            <rect key={i} x={x(i) - w / 2} y={P.t} width={w} height={H - P.t - P.b} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onTouchStart={() => setHover(i)} />
          );
        })}
      </svg>
      {hover !== null && (
        <div className="absolute top-2 rounded-xl px-3.5 py-2.5 text-xs pointer-events-none shadow-2xl min-w-[160px] z-10 text-white"
             style={{ background: "#19296B",
                      left: `min(max(${(x(hover) / W) * 100}% - 80px, 4px), calc(100% - 170px))` }}>
          <div className="text-[10px] uppercase tracking-wider text-white/60 font-semibold mb-1.5">
            {data.months[hover]} сар · нийт {sayaFmt(active.reduce((s, sr) => s + vals(sr.key)[hover], 0))}₮
          </div>
          {active.map((s) => (
            <div key={s.key} className="flex items-center gap-2 mt-1">
              <i className="w-2 h-2 rounded-[3px] inline-block" style={{ background: s.color }} />
              <span className="text-white/70">{s.name}</span>
              <b className="ml-auto tabular-nums">{sayaFmt(vals(s.key)[hover])}₮</b>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap mt-3.5">
        {SERIES.map((s) => (
          <button key={s.key}
            onClick={() => {
              const cnt = Object.values(on).filter(Boolean).length;
              if (on[s.key] && cnt === 1) return;
              setOn({ ...on, [s.key]: !on[s.key] });
            }}
            className={`inline-flex items-center gap-2 text-[12.5px] font-semibold border border-line rounded-full px-3.5 py-1.5 min-h-9 transition ${
              on[s.key] ? "text-t1" : "text-t3 bg-sunken"}`}>
            <i className="w-2 h-2 rounded-[3px]" style={{ background: s.color, opacity: on[s.key] ? 1 : 0.25 }} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
