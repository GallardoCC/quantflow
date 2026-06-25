import { Link } from "react-router-dom";
import { of } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { MetricBadge, TierBadge } from "../../components/orderflow/Badges";

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 240, H = 44;
  const min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / r) * H}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ofx-spark" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? "var(--pos)" : "var(--neg)"} strokeWidth={1.6} />
    </svg>
  );
}

const CARDS = [
  { to: "/orderflow/volume-profile", title: "Volume Profile", desc: "POC, Value Area, HVN/LVN, naked POCs y composite del activo." },
  { to: "/orderflow/heatmap", title: "Heatmap de liquidez", desc: "Intensidad precio×tiempo en canvas, escala log y trades grandes." },
  { to: "/orderflow/footprint", title: "Footprint", desc: "Bid×ask por nivel, delta, imbalances diagonales y VPOC." },
  { to: "/orderflow/delta", title: "Delta / CVD", desc: "Delta por barra, CVD acumulado, divergencias y absorción." },
  { to: "/orderflow/orderbook", title: "Order Book / DOM", desc: "Escalera de profundidad, spread y órdenes grandes." },
  { to: "/orderflow/ai", title: "IA / Machine Learning", desc: "Régimen (GMM), anomalías (IsoForest) y direccional validado." },
];

export default function OverviewPage() {
  const { data, loading, error, refresh } = useOFData(of.overview);

  return (
    <div className="ofx-overview">
      {error && <div className="ofx-state error">⚠ {error} <button onClick={refresh}>reintentar</button></div>}

      {data && (
        <section className="ofx-panel">
          <header className="ofx-panel-h">
            <div className="ofx-panel-tt">
              <span className="ofx-panel-title">{data.ticker} · {data.name}</span>
              <span className="ofx-panel-sub">{data.tf} · {data.session} · {data.mode} · {data.nBars} barras · {data.nTrades} trades</span>
            </div>
            <TierBadge tier={data.tier} />
          </header>
          <div className="ofx-kpis">
            <MetricBadge k="Precio" v={String(data.price)} />
            <MetricBadge k="CVD" v={Math.round(data.kpis.cvd).toLocaleString()} tone={data.kpis.cvd >= 0 ? "pos" : "neg"} />
            <MetricBadge k="POC" v={data.kpis.poc != null ? String(data.kpis.poc) : "—"} />
            <MetricBadge k="Value Area" v={`${data.kpis.val ?? "—"}–${data.kpis.vah ?? "—"}`} />
            <MetricBadge k="Presión compra" v={`${data.kpis.buyPressurePct}%`} tone={data.kpis.buyPressurePct >= 50 ? "pos" : "neg"} />
            <MetricBadge k="Divergencias" v={String(data.kpis.divergences)} />
            <MetricBadge k="Naked POCs" v={String(data.kpis.nakedPocs)} />
          </div>
          <div className="ofx-spark-wrap">
            <span className="ofx-sub">CVD reciente</span>
            <Spark data={data.sparkline} />
          </div>
        </section>
      )}

      {loading && !data && <div className="ofx-state">Cargando overview…</div>}

      <div className="ofx-cards">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="ofx-card">
            <span className="ofx-card-title">{c.title} →</span>
            <span className="ofx-card-desc">{c.desc}</span>
          </Link>
        ))}
      </div>

      {data && <p className="ofx-disclaimer">{data.disclaimer}</p>}
    </div>
  );
}
