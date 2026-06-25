import { of } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { ChartShell } from "../../components/orderflow/ChartShell";
import { TierBadge, ApproxBadge } from "../../components/orderflow/Badges";
import { OrderBookView } from "../../components/orderflow/OrderBookView";

export default function OrderBookPage() {
  const { data, loading, error } = useOFData(of.orderbook);
  return (
    <ChartShell
      title="Order Book / DOM"
      sub={data ? `mid ${data.midPrice} · spread ${data.spread ?? "—"}` : undefined}
      right={data && <><TierBadge tier={data.tier} /> <ApproxBadge approx={data.approx} /></>}
      loading={loading} error={error}
      footer={
        <p className="ofx-note">
          Escalera de profundidad: <span style={{ color: "var(--neg)" }}>asks</span> arriba,
          <span style={{ color: "var(--pos)" }}> bids</span> abajo, con barras proporcionales al tamaño. Real en cripto
          (orderbook de Alpaca); en acciones IEX no expone L2, así que se aproxima con liquidez-por-precio (badge approx).
        </p>
      }
    >
      {data && <OrderBookView ob={data} />}
    </ChartShell>
  );
}
