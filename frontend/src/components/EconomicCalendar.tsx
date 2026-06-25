import { useEffect, useMemo, useState } from "react";
import { api, type CalendarEvent, type ImpactLevel, type MacroCalendar } from "../api";

/**
 * Calendario económico — releases de alto impacto de EE.UU. con cifras reales
 * (Anterior / Actual / Δ) tomadas de FRED y unidas a su serie de datos. El
 * consenso de mercado no lo provee FRED, así que esa columna no se muestra (no
 * se inventan cifras). Filtros por importancia y categoría; filas expandibles
 * con la lectura beat/miss y por qué importa.
 */

const IMPACTS: { v: ImpactLevel | "All"; label: string }[] = [
  { v: "All", label: "Todos" },
  { v: "High", label: "Alto" },
  { v: "Medium", label: "Medio" },
  { v: "Low", label: "Bajo" },
];

const IMPACT_ES: Record<string, string> = { High: "Alto", Medium: "Medio", Low: "Bajo" };

function fmtVal(v: number | string | null | undefined, unit: string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  return unit ? `${v}${unit === "%" ? "%" : " " + unit}` : `${v}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

// Lectura del dato: dirección del cambio frente al periodo anterior.
function reading(e: CalendarEvent): { tone: "pos" | "neg" | "flat"; text: string } | null {
  if (e.status === "estimado" || e.change == null) return null;
  if (e.change > 0) return { tone: "pos", text: `Subió ${e.change > 0 ? "+" : ""}${e.change} vs. anterior — acelerando.` };
  if (e.change < 0) return { tone: "neg", text: `Bajó ${e.change} vs. anterior — desacelerando.` };
  return { tone: "flat", text: "Sin cambio frente al periodo anterior." };
}

export function EconomicCalendar() {
  const [cal, setCal] = useState<MacroCalendar | null>(null);
  const [impact, setImpact] = useState<ImpactLevel | "All">("All");
  const [cat, setCat] = useState("Todas");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.macroCalendar().then((c) => alive && setCal(c)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const cats = useMemo(() => {
    const set = new Set<string>();
    (cal?.events ?? []).forEach((e) => e.category && set.add(e.category));
    return ["Todas", ...Array.from(set).sort()];
  }, [cal]);

  const events = useMemo(() => {
    let ev = cal?.events ?? [];
    if (impact !== "All") ev = ev.filter((e) => e.impact === impact);
    if (cat !== "Todas") ev = ev.filter((e) => e.category === cat);
    return ev.slice(0, 40);
  }, [cal, impact, cat]);

  return (
    <section className="mx-card mx-cal">
      <header className="mx-h">
        <div>
          <span className="mx-t">Calendario económico</span>
          <span className="mx-sub">
            Releases de alto impacto de EE.UU. · Anterior · Actual · Δ (FRED)
          </span>
        </div>
        <div className="mx-cal-filters">
          <div className="mx-seg mx-seg-sm">
            {IMPACTS.map((i) => (
              <button key={i.v} className={i.v === impact ? "on" : ""}
                onClick={() => setImpact(i.v)}>
                {i.label}
                {i.v !== "All" && <span className={`mx-imp-dot imp-${i.v}`} />}
              </button>
            ))}
          </div>
          {cats.length > 2 && (
            <select className="mx-select" value={cat} onChange={(e) => setCat(e.target.value)}>
              {cats.map((c) => (
                <option key={c} value={c}>{c === "Todas" ? "Todas las categorías" : c}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {cal && !cal.available ? (
        <div className="mx-empty">{cal.note ?? "Sin datos de calendario."}</div>
      ) : (
        <div className="mx-cal-wrap">
          <div className="mx-cal-head rich">
            <span>Fecha</span>
            <span>País</span>
            <span>Evento</span>
            <span className="ta-r">Actual</span>
            <span className="ta-r">Δ</span>
            <span className="ta-r">Anterior</span>
            <span className="ta-r">Impacto</span>
          </div>
          <ul className="mx-cal-list">
            {events.length === 0 && <li className="mx-empty">Ningún evento coincide.</li>}
            {events.map((e, i) => {
              const isOpen = open === i;
              const rd = reading(e);
              const est = e.status === "estimado";
              return (
                <li key={i} className={`mx-cal-row ${isOpen ? "open" : ""}`}>
                  <button className="mx-cal-line rich" onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}>
                    <span className="c-date">
                      {fmtDate(e.date)}
                      {est && <span className="c-est">est.</span>}
                    </span>
                    <span className="c-ctry">{e.country}</span>
                    <span className="c-evt">{e.event}</span>
                    <span className={`c-num ta-r ${rd ? rd.tone : ""}`}>
                      {est ? "—" : fmtVal(e.actual, e.unit)}
                    </span>
                    <span className={`c-num ta-r ${e.change != null ? (e.change > 0 ? "pos" : e.change < 0 ? "neg" : "") : "dim"}`}>
                      {e.change != null ? `${e.change > 0 ? "+" : ""}${e.change}` : "—"}
                    </span>
                    <span className="c-num ta-r dim">{fmtVal(e.previous, e.unit)}</span>
                    <span className="ta-r">
                      <span className={`mx-imp imp-${e.impact}`}>{IMPACT_ES[e.impact] ?? e.impact}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mx-cal-detail">
                      {e.why && <p className="mx-cal-detail-why">{e.why}</p>}
                      {rd && (
                        <p className={`mx-cal-surprise ${rd.tone}`}>
                          {fmtVal(e.actual, e.unit)} actual — {rd.text}
                        </p>
                      )}
                      {est && (
                        <p className="mx-cal-detail-dim">
                          Próxima publicación (fecha estimada). Anterior {fmtVal(e.previous, e.unit)};
                          el consenso de mercado no está disponible en esta fuente.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mx-cal-foot">
            Calendario curado sobre FRED: cifras reales de Anterior/Actual. El consenso
            (estimación) requiere un feed premium y no se muestra para no inventar datos.
          </p>
        </div>
      )}
    </section>
  );
}
