/**
 * Gráficos SVG ligeros para el módulo de Análisis Fundamental.
 * Sin dependencias externas; usan los design tokens del tema.
 */

interface SeriesPoint {
  label: string | number;
  value: number | null;
}

// ── Barras anuales (ingresos, BPA, FCF…) ────────────────────────────────────
export function MiniBars({
  data, height = 150, unit = "",
}: {
  data: SeriesPoint[];
  height?: number;
  unit?: string;
}) {
  const pts = data.filter((d) => d.value != null) as { label: string | number; value: number }[];
  if (pts.length === 0) return <div className="fa-chart-empty">Sin datos</div>;

  const vals = pts.map((p) => p.value);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const W = 100;
  const zeroY = (max / range) * 100;

  const bw = W / pts.length;
  return (
    <div className="fa-chart">
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none"
           style={{ width: "100%", height }}>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="0.3" />
        {pts.map((p, i) => {
          const h = (Math.abs(p.value) / range) * 100;
          const x = i * bw + bw * 0.18;
          const w = bw * 0.64;
          const y = p.value >= 0 ? zeroY - h : zeroY;
          const pos = p.value >= 0;
          return (
            <rect key={i} x={x} y={y} width={w} height={Math.max(h, 0.5)}
              rx="0.6" fill={pos ? "var(--accent)" : "var(--neg)"} opacity={0.85} />
          );
        })}
      </svg>
      <div className="fa-chart-labels">
        {pts.map((p, i) => (
          <span key={i} className="fa-chart-lbl">{p.label}</span>
        ))}
      </div>
      <div className="fa-chart-axis">{unit}</div>
    </div>
  );
}

// ── Líneas de evolución de márgenes ─────────────────────────────────────────
export function MiniLines({
  series, height = 160,
}: {
  series: { name: string; color: string; data: SeriesPoint[] }[];
  height?: number;
}) {
  const allVals = series.flatMap((s) =>
    s.data.map((d) => d.value).filter((v): v is number => v != null)
  );
  if (allVals.length === 0) return <div className="fa-chart-empty">Sin datos</div>;

  const max = Math.max(...allVals);
  const min = Math.min(...allVals, 0);
  const range = max - min || 1;
  const W = 100;
  const labels = series[0]?.data.map((d) => d.label) ?? [];
  const n = labels.length;

  const toPath = (data: SeriesPoint[]) => {
    const pts = data
      .map((d, i) => {
        if (d.value == null) return null;
        const x = n > 1 ? (i / (n - 1)) * W : W / 2;
        const y = 100 - ((d.value - min) / range) * 100;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter(Boolean);
    return pts.length ? "M" + pts.join(" L") : "";
  };

  return (
    <div className="fa-chart">
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none"
           style={{ width: "100%", height }}>
        {series.map((s, si) => (
          <path key={si} d={toPath(s.data)} fill="none"
                stroke={s.color} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="fa-chart-labels">
        {labels.map((l, i) => <span key={i} className="fa-chart-lbl">{l}</span>)}
      </div>
      <div className="fa-legend">
        {series.map((s, i) => (
          <span key={i} className="fa-legend-item">
            <span className="fa-legend-dot" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Barra de valoración: precio actual vs valor justo ───────────────────────
export function ValuationBar({
  price, fair, rangeMin, rangeMax,
}: {
  price: number | null;
  fair: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
}) {
  if (price == null || fair == null) return null;
  const lo = Math.min(price, fair, rangeMin ?? fair) * 0.9;
  const hi = Math.max(price, fair, rangeMax ?? fair) * 1.1;
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="fa-valbar">
      <div className="fa-valbar-track">
        {rangeMin != null && rangeMax != null && (
          <span className="fa-valbar-range"
            style={{ left: `${pct(rangeMin)}%`, width: `${pct(rangeMax) - pct(rangeMin)}%` }} />
        )}
        <span className="fa-valbar-marker fa-valbar-fair" style={{ left: `${pct(fair)}%` }}>
          <span className="fa-valbar-tip">Valor justo ${fair.toFixed(2)}</span>
        </span>
        <span className="fa-valbar-marker fa-valbar-price" style={{ left: `${pct(price)}%` }}>
          <span className="fa-valbar-tip fa-valbar-tip-down">Precio ${price.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}
