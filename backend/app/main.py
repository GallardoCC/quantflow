"""
QuantFlow API — pedestal 1: meter datos de mercado a la app.

Backend FastAPI que expone la capa de datos (market.py) al frontend React.
Arranque:  uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.data import (
    anomalies, blackscholes, fundamentals, garch, macro, market, meanreversion,
    montecarlo, orderflow, orderflow_ml, riskmanagement,
)

app = FastAPI(title="QuantFlow API", version="0.1.0")

# El frontend Vite corre en :5173 — permitimos su origen.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "quantflow",
        "sources": market.sources_status(),
    }


@app.get("/api/quote/{ticker}")
def quote(ticker: str):
    try:
        return market.get_quote(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/history/{ticker}")
def history(ticker: str, range: str = "1y"):
    try:
        return market.get_history(ticker, range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/meanreversion/{ticker}")
def mean_reversion(ticker: str, range: str = "1y"):
    """Análisis de regresión a la media (mean reversion): tendencia log-lineal,
    bandas ±1σ/±2σ, z-score, half-life (AR1) y veredicto. Solo análisis."""
    try:
        return meanreversion.mean_reversion(ticker, range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/search/{query}")
def search_path(query: str):
    return {"results": market.search(query)}


@app.get("/api/search")
def search(q: str = ""):
    # Versión con query string: robusta para '=', '^', espacios, etc.
    return {"results": market.search(q)}


@app.get("/api/realtime/{ticker}")
def realtime(ticker: str):
    """Snapshot en vivo (Finnhub) para polling frecuente."""
    try:
        return market.get_realtime(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/news/{ticker}")
def company_news(ticker: str, days: int = 7, limit: int = 20):
    """Noticias de un ticker (Finnhub)."""
    try:
        return market.get_news(ticker, days=days, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/news")
def market_news(limit: int = 25):
    """Titulares generales del mercado en vivo (Finnhub)."""
    try:
        return market.get_news(None, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/macro/news")
def macro_news(category: str = "general", limit: int = 30):
    """Noticias macro en vivo (Finnhub): general, forex, crypto, merger."""
    try:
        return macro.news(category=category, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/macro/indicators")
def macro_indicators():
    """Indicadores macro: EE.UU. (FRED) + global (World Bank)."""
    try:
        return macro.indicators()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/macro/map")
def macro_map(metric: str = "gdp"):
    """Datos por país para el globo 3D: gdp, inflation, unemployment, gdp_per_capita."""
    try:
        return macro.world_map(metric)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/macro/calendar")
def macro_calendar(days_back: int = 45, days_ahead: int = 30, countries: str = ""):
    """Calendario económico con impacto/consenso (FMP) + respaldo FRED.
    countries: lista separada por comas de códigos ISO2 (ej. 'US,EU,GB').
    Sin filtro → todos los disponibles (FRED solo provee US).
    """
    country_list = [c.strip().upper() for c in countries.split(",") if c.strip()] if countries else []
    try:
        return macro.calendar(days_back=days_back, days_ahead=days_ahead, countries=country_list)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/macro/series/{key}")
def macro_series(key: str, points: int = 240):
    """Deep page de un topic macro (inflation, rates): series + historial + texto."""
    try:
        detail = macro.topic_detail(key, points=points)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Topic macro desconocido: {key}")
    return detail


@app.get("/api/montecarlo/{ticker}")
def monte_carlo(ticker: str, days: int = 252, sims: int = 1000):
    """Monte Carlo GBM simulation: fan chart paths + risk metrics."""
    days = max(5, min(days, 756))    # clamp: 1 week – 3 years
    sims = max(200, min(sims, 2000))
    try:
        return montecarlo.simulate(ticker, days=days, sims=sims)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Simulation failed: {e}")


@app.get("/api/garch/{ticker}")
def garch_analysis(ticker: str, range: str = "2y", horizon: int = 21):
    """Análisis de volatilidad GARCH/EGARCH/GJR: vol condicional, pronóstico,
    clustering, comparación de modelos (AIC/BIC) y métricas de riesgo (VaR).
    Solo análisis."""
    horizon = max(5, min(horizon, 63))   # clamp: 1 semana – 3 meses
    if range not in ("1y", "2y", "3y", "5y"):
        range = "2y"
    try:
        return garch.analyze(ticker, range_=range, horizon=horizon)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo GARCH falló: {e}")


@app.get("/api/anomalies/{ticker}")
def anomalies_analysis(ticker: str, range: str = "3y"):
    """Test de la Hipótesis de Mercados Eficientes: razón de varianzas, ACF,
    rachas, Ljung-Box y anomalías de calendario. Solo análisis."""
    if range not in ("1y", "2y", "3y", "5y"):
        range = "3y"
    try:
        return anomalies.analyze(ticker, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de anomalías falló: {e}")


@app.get("/api/options/{ticker}")
def options_analysis(
    ticker: str, strike: float | None = None, expiry_days: int = 30,
    iv: float | None = None, r: float = 0.04, q: float = 0.0, kind: str = "call",
):
    """Análisis de opciones Black-Scholes: valor teórico, griegas (Δ/Γ/Θ/Vega/Ρ),
    prob. ITM, simulador de escenarios y mallas para gráficos. Solo análisis."""
    expiry_days = max(1, min(expiry_days, 1095))   # 1 día – 3 años
    try:
        return blackscholes.analyze(ticker, strike=strike, expiry_days=expiry_days,
                                    iv=iv, r=r, q=q, kind=kind)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de opciones falló: {e}")


@app.get("/api/fundamentals/{ticker}")
def fundamental_analysis(ticker: str):
    """Análisis fundamental completo: perfil, estados financieros, ratios por
    categoría, score de calidad, valoración (DCF + relativa + IA), Piotroski,
    Altman Z, análisis Buffett, sentimiento de noticias, inteligencia de
    competidores, motor de decisión y horizontes de inversión. Solo análisis."""
    try:
        result = fundamentals.fetch_fundamentals(ticker)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo fundamental falló: {e}")
    prof = result.get("profile", {})
    has_data = bool(result.get("income")) or prof.get("price") is not None or prof.get("marketCap") is not None
    if not has_data:
        raise HTTPException(status_code=404, detail=f"Sin datos fundamentales para {ticker}")
    return result


# ── ORDER FLOW v2 — un endpoint por módulo (contratos §3) ─────────────────────
def _of(fn, *args, what="order flow"):
    try:
        return fn(*args)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de {what} falló: {e}")


@app.get("/api/orderflow/{ticker}")
def order_flow_overview(ticker: str, tf: str = "1D", session: str = "24h"):
    """Overview del dashboard: KPIs (CVD, POC/VAH/VAL, presión), tier y sparkline."""
    return _of(orderflow.overview, ticker, tf, session, what="overview")


@app.get("/api/orderflow/{ticker}/volume-profile")
def order_flow_vp(ticker: str, tf: str = "1D", session: str = "24h"):
    """Volume Profile: bins por nivel (split buy/sell), POC, VAH/VAL, HVN/LVN, naked POCs."""
    return _of(orderflow.volume_profile, ticker, tf, session, what="volume profile")


@app.get("/api/orderflow/{ticker}/footprint")
def order_flow_fp(ticker: str, tf: str = "1D", session: str = "24h", buckets: int = 24):
    """Footprint: celdas bid×ask por nivel, delta, imbalances diagonales, VPOC."""
    return _of(lambda t, f, s: orderflow.footprint(t, f, s, buckets), ticker, tf, session, what="footprint")


@app.get("/api/orderflow/{ticker}/delta")
def order_flow_delta(ticker: str, tf: str = "1D", session: str = "24h", buckets: int = 48):
    """Delta / CVD: barras de delta, CVD acumulado, divergencias y zonas de acumulación."""
    return _of(lambda t, f, s: orderflow.delta(t, f, s, buckets), ticker, tf, session, what="delta/CVD")


@app.get("/api/orderflow/{ticker}/heatmap")
def order_flow_heatmap(ticker: str, tf: str = "1D", session: str = "24h"):
    """Heatmap de liquidez/volumen: matriz precio×tiempo + trades grandes."""
    return _of(orderflow.heatmap, ticker, tf, session, what="heatmap")


@app.get("/api/orderflow/{ticker}/orderbook")
def order_flow_orderbook(ticker: str, tf: str = "1D", session: str = "24h"):
    """Order Book / DOM: escalera bid/ask, spread, órdenes grandes (real en cripto)."""
    return _of(orderflow.orderbook, ticker, tf, session, what="order book")


@app.get("/api/orderflow/{ticker}/ml")
def order_flow_ml(ticker: str, tf: str = "1Y", session: str = "24h", horizon: int = 5):
    """Capa ML: régimen (GMM), anomalías (IsolationForest), modelo direccional
    validado walk-forward con costos. Solo análisis."""
    return _of(lambda t, f, s: orderflow_ml.analyze(t, f, s, horizon), ticker, tf, session, what="ML order flow")


@app.get("/api/indicator/{ticker}/{name}")
def indicator(
    ticker: str,
    name: str,
    interval: str = "daily",
    time_period: int = 14,
    series_type: str = "close",
):
    """Indicador técnico (Alpha Vantage): rsi, sma, ema, macd, bbands, adx, stoch."""
    try:
        return market.get_indicator(
            ticker, name, interval=interval, time_period=time_period, series_type=series_type
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Fuente de datos falló: {e}")


@app.get("/api/risk/score/{ticker}")
def risk_score(ticker: str, range: str = "1y"):
    """Score global de riesgo IA (0-100): volatilidad, drawdown, liquidez,
    correlación, régimen y momentum. Solo análisis."""
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.risk_score(ticker, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de riesgo falló: {e}")


@app.get("/api/risk/volatility/{ticker}")
def risk_volatility(ticker: str, range: str = "1y"):
    """Análisis de Volatilidad IA: histórica, EWMA, régimen y modelo heurístico."""
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.volatility_intelligence(ticker, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de volatilidad falló: {e}")


@app.get("/api/risk/var/{ticker}")
def risk_var(ticker: str, confidence: float = 0.95, horizon: int = 1, range: str = "1y"):
    """Motor de VaR: histórico, Monte Carlo, distribución y escenarios."""
    confidence = max(0.90, min(0.99, confidence))
    horizon = max(1, min(30, horizon))
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.var_engine(ticker, confidence=confidence, horizon=horizon, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de VaR falló: {e}")


@app.get("/api/risk/sizing/{ticker}")
def risk_sizing(ticker: str, capital: float = 10000.0, risk_pct: float = 0.02, range: str = "1y"):
    """Tamaño Óptimo de Posición: Kelly, ATR, ajuste de volatilidad."""
    capital = max(100.0, min(10_000_000.0, capital))
    risk_pct = max(0.005, min(0.10, risk_pct))
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.position_sizing(ticker, capital=capital, risk_pct=risk_pct, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de sizing falló: {e}")


@app.get("/api/risk/portfolio")
def risk_portfolio(tickers: str = "AAPL,MSFT,SPY", range: str = "1y"):
    """Portfolio Intelligence: correlación, beta, diversificación."""
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.portfolio_analysis(tickers, range_=range)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de portfolio falló: {e}")


@app.get("/api/risk/stress/{ticker}")
def risk_stress(ticker: str, range: str = "1y"):
    """Stress Testing: simulación de escenarios extremos de mercado."""
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.stress_test(ticker, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de stress test falló: {e}")


@app.get("/api/risk/regime/{ticker}")
def risk_regime(ticker: str, range: str = "1y"):
    """Detección de Régimen de Mercado: alcista, bajista, lateral, alta volatilidad."""
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.market_regime(ticker, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de régimen falló: {e}")


@app.get("/api/risk/performance/{ticker}")
def risk_performance(ticker: str, range: str = "1y"):
    """Performance Intelligence: Sharpe, Sortino, Calmar, Win Rate, Profit Factor y análisis IA."""
    if range not in ("1y", "2y", "3y"):
        range = "1y"
    try:
        return riskmanagement.trading_performance(ticker, range_=range)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Cálculo de performance falló: {e}")
