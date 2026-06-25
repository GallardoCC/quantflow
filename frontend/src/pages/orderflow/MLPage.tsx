import { useCallback } from "react";
import { of, type OFTimeframe, type OFSession } from "../../api";
import { useOFData } from "../../components/orderflow/useOFData";
import { ChartShell } from "../../components/orderflow/ChartShell";
import { TierBadge } from "../../components/orderflow/Badges";
import { MLView } from "../../components/orderflow/MLView";

export default function MLPage() {
  // El ML necesita histórico amplio: si el toolbar está en intradía (1D/1W),
  // entrenamos sobre composite diario (1Y) para validar sin leakage.
  const fetcher = useCallback(
    (t: string, tf: OFTimeframe, s: OFSession) =>
      of.ml(t, tf === "1D" || tf === "1W" ? "1Y" : tf, s),
    [],
  );
  const { data, loading, error } = useOFData(fetcher, 60000);

  return (
    <ChartShell
      title="Capa de Machine Learning"
      sub={data ? `${data.mode} · ${data.nBars} barras · entrenado sobre OHLCV diario` : undefined}
      right={data && <TierBadge tier={data.tier} />}
      loading={loading} error={error}
    >
      {data && <MLView ml={data} />}
    </ChartShell>
  );
}
