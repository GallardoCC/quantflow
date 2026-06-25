import { of } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { ChartShell } from "../../components/orderflow/ChartShell";
import { TierBadge, ApproxBadge } from "../../components/orderflow/Badges";
import { VolumeProfileView } from "../../components/orderflow/VolumeProfileView";

export default function VolumeProfilePage() {
  const { data, loading, error } = useOFData(of.volumeProfile);
  return (
    <ChartShell
      title="Volume Profile"
      sub={data ? `${data.tf} · ${data.session} · ${data.mode === "composite" ? "composite" : "VPVR"} · POC ${data.poc ?? "—"} · VA ${data.val ?? "—"}–${data.vah ?? "—"}` : undefined}
      right={data && <><TierBadge tier={data.tier} /> <ApproxBadge approx={data.approx} /></>}
      loading={loading} error={error}
      footer={
        <p className="ofx-note">
          El <strong>POC</strong> es el precio más negociado (imán de liquidez). El <strong>Value Area</strong> (70%)
          marca dónde el mercado acepta precio. <strong>HVN</strong> = soporte/resistencia; <strong>LVN</strong> = zonas
          de paso rápido. Los <strong>naked POCs</strong> (●) son POCs históricos no revisitados.
        </p>
      }
    >
      {data && <VolumeProfileView vp={data} />}
    </ChartShell>
  );
}
