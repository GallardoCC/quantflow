import { of } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { ChartShell } from "../../components/orderflow/ChartShell";
import { TierBadge, ApproxBadge } from "../../components/orderflow/Badges";
import { HeatmapCanvas } from "../../components/orderflow/HeatmapCanvas";

export default function HeatmapPage() {
  const { data, loading, error } = useOFData(of.heatmap);
  return (
    <ChartShell
      title="Heatmap de liquidez / volumen"
      sub={data ? `${data.tf} · ${data.session} · ${data.priceBins.length}×${data.tBins.length} celdas` : undefined}
      right={data && <><TierBadge tier={data.tier} /> <ApproxBadge approx={data.approx} /></>}
      loading={loading} error={error}
      footer={
        <p className="ofx-note">
          Eje X = tiempo, Y = precio, color = intensidad. Con L2 (cripto) muestra liquidez en reposo del libro;
          sin L2, volumen ejecutado por precio×tiempo (approx). Los círculos blancos son trades/barras grandes
          (posibles sweeps o icebergs).
        </p>
      }
    >
      {data && <HeatmapCanvas hm={data} />}
    </ChartShell>
  );
}
