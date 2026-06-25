import { NavLink, Outlet } from "react-router-dom";
import { OFParamsProvider } from "../../components/orderflow/context";
import { OFToolbar } from "../../components/orderflow/Toolbar";
import "../../components/orderflow/orderflow2.css";

const SUBNAV = [
  { to: "/orderflow", label: "Overview", end: true },
  { to: "/orderflow/volume-profile", label: "Volume Profile" },
  { to: "/orderflow/heatmap", label: "Heatmap" },
  { to: "/orderflow/footprint", label: "Footprint" },
  { to: "/orderflow/delta", label: "Delta / CVD" },
  { to: "/orderflow/orderbook", label: "Order Book" },
  { to: "/orderflow/ai", label: "IA / ML" },
];

/** Shell de la sección Order Flow: toolbar global + sub-navegación + ruta activa.
 *  Todos los módulos comparten ticker (global) y tf/sesión/live (OFParamsProvider). */
export default function OrderFlowLayout() {
  return (
    <OFParamsProvider>
      <div className="ofx">
        <header className="ofx-intro">
          <h2>ORDER FLOW</h2>
          <p>
            Microestructura de mercado estilo ATAS/Bookmap: perfil de volumen, heatmap de
            liquidez, footprint, delta/CVD, profundidad (DOM) y una capa de machine learning
            (régimen, anomalías y modelo direccional validado walk-forward).
            Datos reales de Alpaca donde existen; reconstruidos y etiquetados <em>approx</em> donde no.
            <strong> Solo análisis — sin órdenes ni ejecución.</strong>
          </p>
        </header>

        <OFToolbar />

        <nav className="ofx-subnav">
          {SUBNAV.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end}
              className={({ isActive }) => `ofx-subtab${isActive ? " on" : ""}`}>
              {s.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </OFParamsProvider>
  );
}
