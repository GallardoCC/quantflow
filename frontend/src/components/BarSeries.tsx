// Gráfico de barras etiquetado y reutilizable (ACF, día de la semana, mes).
// Soporta línea cero, banda de significancia simétrica y barras resaltadas.
interface Bar { label: string; value: number; highlight?: boolean; }
interface Props {
  bars: Bar[];
  band?: number;            // banda de significancia ±band (en unidades de y)
  unit?: string;            // sufijo en etiquetas del eje
  height?: number;
  colorPos?: string;
  colorNeg?: string;
}

export function BarSeries({
  bars, band, unit = "", height = 200, colorPos = "var(--accent)", colorNeg = "var(--neg)",
}: Props) {
  const W = 760, H = height;
  const P = { t: 14, r: 14, b: 30, l: 44 };
  const pw = W - P.l - P.r, ph = H - P.t - P.b;

  let yMax = Math.max(...bars.map((b) => Math.abs(b.value)), band ?? 0);
  yMax = yMax * 1.15 || 1;
  const yMin = -yMax;
  const yR = yMax - yMin;
  const ys = (v: number) => P.t + ph - ((v - yMin) / yR) * ph;
  const zeroY = ys(0);
  const bw = pw / bars.length;
  const yTicks = [yMax, yMax / 2, 0, -yMax / 2, -yMax].map((v) => +v.toFixed(3));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Barras">
      {band != null && (
        <rect x={P.l} y={ys(band)} width={pw} height={ys(-band) - ys(band)}
              fill="rgba(124,155,255,0.10)" />
      )}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={P.l} y1={ys(v)} x2={W - P.r} y2={ys(v)} stroke="rgba(255,255,255,0.04)" />
          <text x={P.l - 6} y={ys(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)" fontFamily="var(--mono)">
            {v}{unit}
          </text>
        </g>
      ))}
      <line x1={P.l} y1={zeroY} x2={W - P.r} y2={zeroY} stroke="rgba(255,255,255,0.22)" />
      {bars.map((b, i) => {
        const x = P.l + i * bw + bw * 0.16;
        const w = bw * 0.68;
        const y = b.value >= 0 ? ys(b.value) : zeroY;
        const h = Math.abs(ys(b.value) - zeroY);
        const sig = band != null && Math.abs(b.value) > band;
        const col = b.value >= 0 ? colorPos : colorNeg;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={Math.max(h, 0.5)} rx="2"
                  fill={col} opacity={b.highlight || sig ? 1 : 0.5} />
            <text x={P.l + i * bw + bw / 2} y={H - 9} textAnchor="middle"
                  fontSize="10" fill={b.highlight || sig ? "var(--text)" : "var(--muted)"}
                  fontFamily="var(--mono)">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
