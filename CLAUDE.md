# QuantFlow — CLAUDE.md

Web app de análisis cuantitativo en localhost. React + Vite + FastAPI. Solo análisis; sin entrada de órdenes ni conexión con broker.

## Arranque
```
start.bat   # desde la raíz — libera el puerto 8000, luego arranca backend y frontend
```
- Backend: `localhost:8000` | Frontend: `localhost:5173`
- **NUNCA** usar `uvicorn --reload` — deja procesos zombie en el puerto 8000

## Estructura

```
backend/
  app/
    main.py              # todos los endpoints FastAPI
    data/
      market.py          # get_history() + cache TTL; RANGOS: "1y","2y","3y" (claves exactas)
      fmp.py             # quote rico + búsqueda + calendario económico (principal)
      finnhub.py         # tiempo real + noticias
      alphavantage.py    # indicadores técnicos (25 req/día, caché 30 min)
      fred.py            # macro EE.UU. + calendario curado (11 releases alto impacto)
      worldbank.py       # datos globales 258 países (sin key); filtra agregados _WB_AGGREGATES
      macro.py           # orquesta fred + worldbank; MACRO_TOPICS (inflation/rates/gdp/employment)
      meanreversion.py   # regresión log-lineal, z-score, half-life AR(1)
      garch.py           # GARCH/EGARCH/GJR por MLE Nelder-Mead propio (sin numpy)
      montecarlo.py      # GBM Box-Muller, percentiles p5-p95, VaR/CVaR
      blackscholes.py    # griegas (Δ/Γ/Θ/Vega/Ρ), escenarios, superficie vega (sin numpy)
      anomalies.py       # razón de varianzas Lo-MacKinlay, ACF, runs test, Ljung-Box
      fundamentals.py    # Piotroski, Altman Z, Buffett, DCF, peers, sentimiento NLP
      alpaca.py          # cliente Alpaca: trades/barras intradía + orderbook cripto real (feed IEX en acciones)
      orderflow.py       # ORDER FLOW v2: loader unificado (tier T1/T2/T3 + sesión + modo intraday/composite),
                         #   módulos volume-profile/footprint/delta/heatmap/orderbook/overview con contratos §3
      orderflow_ml.py    # capa ML (numpy + scikit-learn): features causales, régimen (GaussianMixture),
                         #   anomalías (IsolationForest), direccional triple-barrier + walk-forward purgado + costos
  backend/.env           # FMP_API_KEY, FINNHUB_API_KEY, ALPHAVANTAGE_API_KEY, FRED_API_KEY, ALPACA_API_KEY/SECRET/BASE_URL

frontend/src/
  TickerContext.tsx      # ticker global — TODAS las páginas usan useTicker(), no useState local
  api.ts                 # tipos TS + fetch helpers para todos los endpoints
  App.tsx                # shell: topbar + TickerTape + nav NavLink + <Routes>
  App.css                # design tokens en :root (única fuente de verdad — no hardcodear colores)
  pages/                 # una por ruta, todas lazy (React.lazy) excepto OverviewPage
  components/            # charts SVG puros + lightweight-charts v5
```

## Rutas del frontend
| Ruta | Página |
|------|--------|
| `/` | OverviewPage |
| `/tecnicos` | TecnicosPage |
| `/reversion-media` | MeanReversionPage |
| `/garch` | GarchPage |
| `/opciones` | OptionsPage |
| `/anomalias` | AnomaliesPage |
| `/orderflow` | OrderFlowLayout → Overview (cards + KPIs + sparkline) |
| `/orderflow/volume-profile` | Volume Profile (SVG, split buy/sell, POC/VA/HVN/LVN/naked) |
| `/orderflow/heatmap` | Heatmap liquidez (canvas, inferno, escala log) |
| `/orderflow/footprint` | Footprint (canvas, bid×ask, imbalances, VPOC) |
| `/orderflow/delta` | Delta / CVD (SVG, divergencias, acumulación) |
| `/orderflow/orderbook` | Order Book / DOM (escalera profundidad) |
| `/orderflow/ai` | Capa IA / ML (régimen, anomalías, direccional validado) |
| `/fundamental` | FundamentalPage |
| `/macro` | MacroPage |
| `/macro/:topic` | MacroTopicPage |
| `/monte-carlo` | MonteCarloPage |
| `/monte-carlo/:ticker` | MonteCarloDistributionPage |

## Reglas de diseño
- Design tokens en `App.css :root` — usar `var(--nombre)`, nunca valores hardcodeados
- Acento: `--accent #5b82f0` (azul-índigo). Paleta: superficies `--bg/--surface/--surface-2/--surface-3`
- Páginas nuevas: archivo en `src/pages/`, lazy en `App.tsx`, ruta en `<Routes>`
- Copy en **español** (términos técnicos GARCH/Delta/Black-Scholes se conservan en inglés)
- Charts: `lightweight-charts v5` para series temporales; SVG puro para histogramas/perfiles;
  **canvas 2D** para heatmap y footprint de Order Flow (densidad alta, ver `components/orderflow/`)
- `BarSeries.tsx` es reutilizable para ACF, día-de-la-semana, mes

## Convenciones backend
- Módulos de datos en `app/data/` — cada uno es independiente, degrada si falla su API
- Caché en memoria (sin base de datos); TTL 30-60 min según módulo
- Errores: `404` ticker inválido / sin datos; `502` si falla cálculo interno
- Python puro — sin numpy/scipy (todo hecho a mano). **Excepción:** `orderflow_ml.py` usa
  numpy + scikit-learn (ML real: GMM, IsolationForest, GradientBoosting con validación
  walk-forward). Es el único módulo con esa dependencia; el resto sigue en Python puro.

## Pendientes activos
- Traducir al español: `MonteCarloPage`, `MeanReversionPanel`, `NewsPanel`, `MacroPage`
- Deep pages Macro: GDP/Employment/Liquidity ya habilitadas pero poco profundas
- Tiempo real: polling `/api/realtime` cada N segundos o Finnhub WebSocket
- Indicadores overlay en el gráfico de velas (Alpha Vantage ya conectado)
- Multi-ticker / watchlist
