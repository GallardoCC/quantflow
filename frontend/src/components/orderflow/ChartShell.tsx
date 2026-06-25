import type { ReactNode } from "react";

/** Contenedor integrado al tema del terminal: título, badges a la derecha,
 *  cuerpo del gráfico y nota al pie. Evita "charts genéricos sobre el fondo". */
export function ChartShell({
  title, sub, right, footer, loading, error, children,
}: {
  title: string; sub?: string; right?: ReactNode; footer?: ReactNode;
  loading?: boolean; error?: string | null; children: ReactNode;
}) {
  return (
    <section className="ofx-panel">
      <header className="ofx-panel-h">
        <div className="ofx-panel-tt">
          <span className="ofx-panel-title">{title}</span>
          {sub && <span className="ofx-panel-sub">{sub}</span>}
        </div>
        <div className="ofx-panel-right">{right}</div>
      </header>
      <div className="ofx-panel-body">
        {error ? <div className="ofx-state error">⚠ {error}</div>
          : loading ? <div className="ofx-state">Analizando flujo…</div>
            : children}
      </div>
      {footer && <footer className="ofx-panel-foot">{footer}</footer>}
    </section>
  );
}
