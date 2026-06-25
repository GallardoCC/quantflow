# QuantFlow

Terminal de datos de mercado en localhost para análisis cuantitativo. Proyecto nuevo,
construido **pedestal por pedestal**. Este es el **pedestal 1: meter datos a la app**.

Mete cualquier ticker —acción (`AAPL`), ETF (`SPY`), cripto (`BTC-USD`) o futuro
(`ES=F`, `CL=F`)— y trae cotización en vivo, histórico OHLCV y un gráfico de velas
profesional. Sin API keys.

## Arranque (un clic)

```
start.bat
```

Levanta backend (`localhost:8000`) + frontend (`localhost:5173`) y abre el navegador.

## Arranque manual

```bash
# Terminal 1 — backend
cd backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install   # solo la primera vez
npm run dev
```

## Arquitectura

```
backend/                 FastAPI
  app/main.py            endpoints: /api/quote /api/history /api/search
  app/data/market.py     capa de datos (yfinance) + caché TTL + clasificación de activo
frontend/                React + Vite + TypeScript
  src/api.ts             cliente de la API + tipos
  src/components/CandleChart.tsx   velas (lightweight-charts v5, TradingView)
  src/App.tsx            UI: buscador, cabecera de activo, gráfico, stats
```

## Fuente de datos

**yfinance (Yahoo)** — único proveedor gratis que cubre las 4 clases de activo a la vez,
sin key. Próximo pedestal: añadir **Finnhub (free)** para tiempo real por WebSocket y
noticias (requiere key gratuita).

## Endpoints

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/quote/{ticker}` | Snapshot: precio, cambio, stats |
| GET | `/api/history/{ticker}?range=1y` | OHLCV (rangos: 1d 5d 1mo 3mo 6mo 1y 5y max) |
| GET | `/api/search/{query}` | Búsqueda de símbolos |

Docs interactivas: `http://localhost:8000/docs`
