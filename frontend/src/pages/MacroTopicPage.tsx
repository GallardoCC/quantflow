import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type MacroTopic, type MacroSeriesPoint } from "../api";
import { MacroChart } from "../components/MacroChart";

/**
 * Macro deep page (topic: inflation, rates).
 * Routed at /macro/:topic. Time-range selector, one chart+stat card per FRED
 * series, plus the economic interpretation and related markets. Analysis only.
 */

// Rangos en MESES (datos macro mensuales). null = histórico completo.
const RANGES: { label: string; months: number | null }[] = [
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "5Y", months: 60 },
  { label: "Max", months: null },
];

const ACCENTS = ["#5b82f0", "#22c39e", "#e8b94a", "#e0556f"];

function cutoffISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function sliceByRange(points: MacroSeriesPoint[], months: number | null): MacroSeriesPoint[] {
  if (months === null) return points;
  const cut = cutoffISO(months);
  return points.filter((p) => p.date >= cut);
}

function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function MacroTopicPage() {
  const { topic } = useParams<{ topic: string }>();
  const [data, setData] = useState<MacroTopic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(RANGES[1]); // 1Y por defecto

  useEffect(() => {
    if (!topic) return;
    setData(null);
    setError(null);
    api
      .macroSeries(topic)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [topic]);

  const sliced = useMemo(() => {
    if (!data) return [];
    return data.series.map((s) => ({ ...s, view: sliceByRange(s.points, range.months) }));
  }, [data, range]);

  if (error) {
    return (
      <div className="mx mx-topic">
        <Link to="/macro" className="mx-back">← Volver a Macro</Link>
        <div className="banner error">⚠ {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx mx-topic">
        <Link to="/macro" className="mx-back">← Volver a Macro</Link>
        <div className="mx-topic-skel">
          <div className="mx-skel-line w40" />
          <div className="mx-skel-line w70" />
          <div className="mx-skel-block" />
          <div className="mx-skel-block" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx mx-topic">
      <Link to="/macro" className="mx-back">← Volver a Macro</Link>

      <header className="mx-topic-head">
        <div>
          <h2 className="mx-topic-title">{data.title}</h2>
          <p className="mx-topic-sub">{data.subtitle}</p>
        </div>
        <div className="mx-seg mx-topic-range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              className={r.label === range.label ? "on" : ""}
              onClick={() => setRange(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <p className="mx-topic-summary">{data.summary}</p>

      <div className="mx-topic-grid">
        <div className="mx-topic-series">
          {sliced.map((s, i) => {
            const up = (s.change ?? 0) >= 0;
            const accent = ACCENTS[i % ACCENTS.length];
            return (
              <section className="mx-card mx-series-card" key={s.id}>
                <header className="mx-series-head">
                  <div>
                    <span className="mx-t">{s.label}</span>
                    {s.date && <span className="mx-sub">al {s.date}</span>}
                  </div>
                  <div className="mx-series-now">
                    <span className="kpi-value" style={{ color: accent }}>
                      {fmtNum(s.current)}
                      <i>{s.unit}</i>
                    </span>
                    {s.change !== null && (
                      <span className={`mx-kpi-delta ${up ? "pos" : "neg"}`}>
                        {up ? "▲" : "▼"} {fmtNum(Math.abs(s.change))} {s.unit} vs ant.
                      </span>
                    )}
                  </div>
                </header>
                {s.view.length > 1 ? (
                  <MacroChart points={s.view} color={accent} />
                ) : (
                  <div className="mx-empty">Datos insuficientes para este rango.</div>
                )}
              </section>
            );
          })}
        </div>

        <aside className="mx-topic-aside">
          <section className="mx-card mx-interp">
            <span className="mx-section-label">Qué significa para los mercados</span>
            <p>{data.interpretation}</p>
          </section>
          <section className="mx-card mx-related">
            <span className="mx-section-label">Mercados relacionados</span>
            <div className="mx-related-tags">
              {data.relatedMarkets.map((m) => (
                <span className="mx-tag" key={m}>{m}</span>
              ))}
            </div>
            <p className="mx-related-note">
              Solo contexto entre activos — QuantFlow es una terminal de análisis, no un
              lugar de ejecución.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
