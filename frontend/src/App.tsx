import { useEffect, useState, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { SearchBox } from "./components/SearchBox";
import { TickerTape } from "./components/TickerTape";
import { useTicker } from "./TickerContext";
import { TecnicosPage } from "./pages/TecnicosPage";
import { MeanReversionPage } from "./pages/MeanReversionPage";
import "./App.css";

// Páginas pesadas (globe three.js, Monte Carlo) cargadas bajo demanda
const MacroPage       = lazy(() => import("./pages/MacroPage"));
const MacroTopicPage  = lazy(() => import("./pages/MacroTopicPage"));
const MonteCarloPage  = lazy(() => import("./pages/MonteCarloPage"));
const MonteCarloDistributionPage = lazy(() => import("./pages/MonteCarloDistributionPage"));
const GarchPage       = lazy(() => import("./pages/GarchPage"));
const OptionsPage     = lazy(() => import("./pages/OptionsPage"));
const AnomaliesPage   = lazy(() => import("./pages/AnomaliesPage"));
const FundamentalPage = lazy(() => import("./pages/FundamentalPage"));
const OrderFlowLayout = lazy(() => import("./pages/orderflow/OrderFlowLayout"));
const OFOverviewPage  = lazy(() => import("./pages/orderflow/OverviewPage"));
const OFVolumeProfile = lazy(() => import("./pages/orderflow/VolumeProfilePage"));
const OFHeatmap       = lazy(() => import("./pages/orderflow/HeatmapPage"));
const OFFootprint     = lazy(() => import("./pages/orderflow/FootprintPage"));
const OFDelta         = lazy(() => import("./pages/orderflow/DeltaPage"));
const OFOrderBook     = lazy(() => import("./pages/orderflow/OrderBookPage"));
const OFMl            = lazy(() => import("./pages/orderflow/MLPage"));
const CalendarioPage  = lazy(() => import("./pages/CalendarioPage"));
const RiskPage              = lazy(() => import("./pages/RiskPage"));
const RiskVolatilityPage    = lazy(() => import("./pages/RiskVolatilityPage"));
const RiskVarPage           = lazy(() => import("./pages/RiskVarPage"));
const RiskSizingPage        = lazy(() => import("./pages/RiskSizingPage"));
const RiskPortfolioPage     = lazy(() => import("./pages/RiskPortfolioPage"));
const RiskStressPage        = lazy(() => import("./pages/RiskStressPage"));
const RiskRegimePage        = lazy(() => import("./pages/RiskRegimePage"));
const RiskPerformancePage   = lazy(() => import("./pages/RiskPerformancePage"));

const NAV: { label: string; to: string; end?: boolean }[] = [
  { label: "TÉCNICOS",       to: "/tecnicos",        end: true },
  { label: "FUNDAMENTAL",    to: "/fundamental"               },
  { label: "REV. MEDIA",     to: "/mean-reversion"            },
  { label: "GARCH",          to: "/garch"                     },
  { label: "GRIEGAS",        to: "/opciones"                  },
  { label: "ANOMALÍAS",      to: "/anomalias"                 },
  { label: "ORDERFLOW",      to: "/orderflow"                 },
  { label: "MACRO",          to: "/macro"                     },
  { label: "CALENDARIO",     to: "/calendario"                },
  { label: "MONTE CARLO",    to: "/monte-carlo"               },
  { label: "RIESGO IA",      to: "/riesgo"                    },
];

// ── Reloj ─────────────────────────────────────────────────────────────────────

interface ClockState {
  localTime: string;
  localDate: string;
  etTime: string;
  marketOpen: boolean;
  marketLabel: string;
}

function computeClock(): ClockState {
  const now = new Date();

  const localTime = now.toLocaleTimeString("es-PE", {
    timeZone: "America/Lima", hourCycle: "h23",
  });
  const localDate = now.toLocaleDateString("es-PE", {
    timeZone: "America/Lima", weekday: "short", day: "2-digit", month: "short",
  });
  const etTime = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hourCycle: "h23",
  });

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const hh = parseInt(get("hour"), 10);
  const mm = parseInt(get("minute"), 10);
  const minutes = hh * 60 + mm;

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const marketOpen = isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60;

  return {
    localTime, localDate, etTime,
    marketOpen,
    marketLabel: marketOpen ? "ABIERTO" : "CERRADO",
  };
}

function useClock(): ClockState {
  const [clock, setClock] = useState<ClockState>(() => computeClock());
  useEffect(() => {
    const id = setInterval(() => setClock(computeClock()), 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

// ── Scroll-aware navbar hook ─────────────────────────────────────────────────

function useNavHide() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = 0;
    const handle = () => {
      const y = window.scrollY;
      if (y > lastY + 12 && y > 90) setHidden(true);
      else if (y < lastY - 8) setHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);
  return hidden;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { setTicker } = useTicker();
  const clock = useClock();
  const navHidden = useNavHide();

  return (
    <div className="app">
      <header className={`topbar${navHidden ? " nav-hidden" : ""}`}>
        <div className="brand">
          <span className="logo">◆</span> QUANTFLOW
          <span className="tag">terminal</span>
        </div>
        <SearchBox onSelect={setTicker} />
        <div className="topbar-status">
          <span className={`status-mkt ${clock.marketOpen ? "open" : "closed"}`}>
            <span className="status-dot" /> {clock.marketLabel}
          </span>
          <span className="status-clock">
            NY <time>{clock.etTime}</time> ET
          </span>
          <span className="status-clock">
            LIM <time>{clock.localTime}</time>
          </span>
          <span className="status-date">{clock.localDate}</span>
        </div>
      </header>

      <TickerTape navHidden={navHidden} />

      <nav className="tabbar" role="tablist" aria-label="Secciones">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <Suspense fallback={<div className="banner">Cargando…</div>}>
        <Routes>
          <Route path="/tecnicos"      element={<TecnicosPage />} />
          <Route path="/fundamental"   element={<FundamentalPage />} />
          <Route path="/mean-reversion" element={<MeanReversionPage />} />
          <Route path="/garch"         element={<GarchPage />} />
          <Route path="/opciones"      element={<OptionsPage />} />
          <Route path="/anomalias"     element={<AnomaliesPage />} />
          <Route path="/orderflow" element={<OrderFlowLayout />}>
            <Route index element={<OFOverviewPage />} />
            <Route path="volume-profile" element={<OFVolumeProfile />} />
            <Route path="heatmap" element={<OFHeatmap />} />
            <Route path="footprint" element={<OFFootprint />} />
            <Route path="delta" element={<OFDelta />} />
            <Route path="orderbook" element={<OFOrderBook />} />
            <Route path="ai" element={<OFMl />} />
          </Route>
          <Route path="/macro"         element={<MacroPage />} />
          <Route path="/macro/:topic"  element={<MacroTopicPage />} />
          <Route path="/calendario"    element={<CalendarioPage />} />
          <Route path="/monte-carlo"   element={<MonteCarloPage />} />
          <Route path="/monte-carlo/:ticker" element={<MonteCarloDistributionPage />} />
          <Route path="/riesgo"              element={<RiskPage />} />
          <Route path="/riesgo/volatilidad"  element={<RiskVolatilityPage />} />
          <Route path="/riesgo/var"          element={<RiskVarPage />} />
          <Route path="/riesgo/sizing"       element={<RiskSizingPage />} />
          <Route path="/riesgo/portfolio"    element={<RiskPortfolioPage />} />
          <Route path="/riesgo/stress"       element={<RiskStressPage />} />
          <Route path="/riesgo/regimen"      element={<RiskRegimePage />} />
          <Route path="/riesgo/performance"  element={<RiskPerformancePage />} />
          {/* Redirigir raíz y rutas desconocidas a Técnicos */}
          <Route path="/"  element={<Navigate to="/tecnicos" replace />} />
          <Route path="*"  element={<Navigate to="/tecnicos" replace />} />
        </Routes>
      </Suspense>

      <footer className="foot">
        Fuentes: FMP · yfinance · Finnhub · FRED · World Bank · Alpha Vantage · Alpaca ·
        Modelos: GARCH · Black-Scholes · Monte Carlo · HME · Order Flow ·
        Solo análisis, sin ejecución
      </footer>
    </div>
  );
}
