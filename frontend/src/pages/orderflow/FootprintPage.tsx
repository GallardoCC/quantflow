import { of } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { ChartShell } from "../../components/orderflow/ChartShell";
import { TierBadge, ApproxBadge } from "../../components/orderflow/Badges";
import { FootprintCanvas } from "../../components/orderflow/FootprintCanvas";

export default function FootprintPage() {
  const { data, loading, error } = useOFData(of.footprint);
  return (
    <ChartShell
      title="Footprint"
      sub={data ? `${data.tf} · ${data.session} · paso ${data.step} · ${data.buckets.length} velas` : undefined}
      right={data && <><TierBadge tier={data.tier} /> <ApproxBadge approx={data.approx} /></>}
      loading={loading} error={error}
      footer={
        <p className="ofx-note">
          Cada celda: <span style={{ color: "var(--neg)" }}>bid</span> (vendedores agresivos) ×
          <span style={{ color: "var(--pos)" }}> ask</span> (compradores agresivos) a ese precio. El borde de color
          marca <strong>imbalances diagonales apilados</strong> (un lado ≥3× el otro en la diagonal); el marco azul es el
          <strong> VPOC</strong> de la vela. El footer muestra delta, volumen y máx. delta por vela.
        </p>
      }
    >
      {data && <FootprintCanvas fp={data} />}
    </ChartShell>
  );
}
