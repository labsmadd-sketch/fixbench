import { useEffect, useRef, useState } from 'react';
import { formatAmount, formatLKR, type Cents } from '../../lib/money';

/**
 * Money taken per day: one series, so no legend (the panel title names it).
 * Bars use --brand-text, which the theme keeps at 4.5:1 or better on white.
 * Thin bars, 4px rounded tops anchored to the baseline, 2px gaps, faint grid,
 * few labels, and a per-bar tooltip with a full-height hit area.
 */
export function DailyBars({ days }: { days: { day: string; date: Date; total: Cents }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real width so labels stay 11px instead of scaling with the chart.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220;
  const pad = { l: 56, r: 8, t: 12, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = Math.max(...days.map((d) => d.total), 0);
  const top = niceMax(max);
  const step = plotW / Math.max(days.length, 1);
  const barW = Math.max(2, Math.min(28, step - 2)); // 2px gap between bars
  const y = (v: number) => pad.t + plotH - (top ? (v / top) * plotH : 0);
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(days.length / Math.max(2, Math.floor(plotW / 70)));
  const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="chart" ref={box} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Money taken per day, ${days.length} days. Highest ${formatLKR(max)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart__label">
              {compact(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * step + (step - barW) / 2;
          const bh = top ? (d.total / top) * plotH : 0;
          return (
            <g key={d.day}>
              {bh > 0 && <path d={roundedTop(x, y(d.total), barW, bh, Math.min(4, barW / 2))} className={`chart__bar${hover === i ? ' is-hover' : ''}`} />}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="chart__label">
                  {fmtDay(d.date)}
                </text>
              )}
              {/* Hit target: the full column, bigger than the bar. */}
              <rect
                x={pad.l + i * step}
                y={pad.t}
                width={step}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${fmtDay(d.date)}: ${formatLKR(d.total)}`}
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} className="chart__axis" />
      </svg>
      {h && (
        <div className="chart__tip" style={{ left: `${((pad.l + hover! * step + step / 2) / W) * 100}%` }} role="status">
          <span>{h.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <strong className="num">{formatLKR(h.total)}</strong>
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** A round axis maximum: 1, 2, 2.5 or 5 × 10^n rupees (in cents). */
function niceMax(cents: number) {
  if (cents <= 0) return 0;
  const v = cents / 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = [1, 2, 2.5, 5, 10].find((k) => k * p >= v)!;
  return m * p * 100;
}

/** 125000000 cents → "1.25M", 2500000 → "25k". */
function compact(cents: number) {
  const v = cents / 100;
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${+(v / 1000).toFixed(2)}k`;
  return formatAmount(cents).replace(/\.00$/, '');
}
