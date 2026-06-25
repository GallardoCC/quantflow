import type { OFRibbonPoint } from "../../api";

const COLOR: Record<string, string> = {
  "tendencia alcista": "var(--pos)",
  "tendencia bajista": "var(--neg)",
  "balance": "var(--accent)",
  "rotación": "#caa24a",
};

/** Cinta de régimen de mercado (salida del GMM) bajo el chart: cada segmento
 *  coloreado por el estado detectado en esa barra. */
export function RegimeRibbon({ ribbon }: { ribbon: OFRibbonPoint[] }) {
  if (!ribbon.length) return null;
  const n = ribbon.length;
  return (
    <div className="ofx-ribbon-wrap">
      <div className="ofx-ribbon">
        {ribbon.map((p, i) => (
          <span key={i} title={p.label}
            style={{ width: `${100 / n}%`, background: COLOR[p.label] || "var(--surface-3)" }} />
        ))}
      </div>
      <div className="ofx-ribbon-legend">
        {Object.entries(COLOR).map(([label, c]) => (
          <span key={label}><i style={{ background: c }} /> {label}</span>
        ))}
      </div>
    </div>
  );
}
