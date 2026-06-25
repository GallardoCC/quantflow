import { of } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { ChartShell } from "../../components/orderflow/ChartShell";
import { TierBadge, ApproxBadge } from "../../components/orderflow/Badges";
import { DeltaCVDView } from "../../components/orderflow/DeltaCVDView";

export default function DeltaPage() {
  const { data, loading, error } = useOFData(of.delta);
  return (
    <ChartShell
      title="Delta / CVD"
      sub={data ? `${data.tf} · ${data.session} · ${data.bars.length} barras` : undefined}
      right={data && <><TierBadge tier={data.tier} /> <ApproxBadge approx={data.approx} /></>}
      loading={loading} error={error}
      footer={
        <p className="ofx-note">
          La delta es (volumen comprador agresivo − vendedor agresivo) por barra; su acumulado (CVD) debería acompañar
          al precio. Cuando <strong>divergen</strong> (precio HH + CVD LH = bajista; precio LL + CVD HL = alcista), el
          movimiento carece de respaldo del flujo. Las zonas sombreadas son <strong>acumulación/absorción</strong>
          (precio comprimido con CVD lateral).
        </p>
      }
    >
      {data && <DeltaCVDView d={data} />}
    </ChartShell>
  );
}
