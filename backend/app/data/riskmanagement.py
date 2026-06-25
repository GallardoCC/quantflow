"""
Gestión de Riesgo IA — QuantFlow.

Siete funciones de análisis de riesgo cuantitativo:
  - risk_score            Score global 0-100 (multi-factor)
  - volatility_intelligence  Análisis de volatilidad + modelo heurístico
  - var_engine            VaR histórico, Monte Carlo, CVaR y distribución
  - position_sizing       Tamaño óptimo de posición (ATR + Kelly + vol)
  - portfolio_analysis    Correlación, beta, diversificación y Sharpe
  - stress_test           Escenarios de stress aplicados con beta
  - market_regime         Detección de régimen (alcista/bajista/lateral/vol)

Pure Python — sin numpy, scipy ni sklearn. Caché con TTL de 5 minutos.
Solo análisis; nunca ejecución de órdenes.
"""
from __future__ import annotations

import datetime
import math
import time

from app.data import market

# ---------------------------------------------------------------------------
# Caché en memoria con TTL
# ---------------------------------------------------------------------------
_CACHE: dict[tuple, dict] = {}
_CACHE_TS: dict[tuple, float] = {}
_TTL = 300  # 5 minutos


def _cache_get(key: tuple) -> dict | None:
    ts = _CACHE_TS.get(key)
    if ts is not None and (time.time() - ts) < _TTL:
        return _CACHE.get(key)
    return None


def _cache_set(key: tuple, value: dict) -> None:
    _CACHE[key] = value
    _CACHE_TS[key] = time.time()


# ---------------------------------------------------------------------------
# Helpers matemáticos (sin numpy)
# ---------------------------------------------------------------------------

def _mean(lst: list[float]) -> float:
    if not lst:
        return 0.0
    return sum(lst) / len(lst)


def _variance(lst: list[float], ddof: int = 1) -> float:
    n = len(lst)
    if n <= ddof:
        return 0.0
    m = _mean(lst)
    return sum((x - m) ** 2 for x in lst) / (n - ddof)


def _std(lst: list[float], ddof: int = 1) -> float:
    v = _variance(lst, ddof=ddof)
    return math.sqrt(v) if v > 0 else 0.0


def _percentile(sorted_lst: list[float], p: float) -> float:
    """Interpolación lineal; p en [0, 1]."""
    n = len(sorted_lst)
    if n == 0:
        return 0.0
    if n == 1:
        return sorted_lst[0]
    idx = (n - 1) * p
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    return sorted_lst[lo] + (sorted_lst[hi] - sorted_lst[lo]) * (idx - lo)


def _pearson(a: list[float], b: list[float]) -> float:
    """Coeficiente de correlación de Pearson."""
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    a, b = a[:n], b[:n]
    ma, mb = _mean(a), _mean(b)
    cov = sum((a[i] - ma) * (b[i] - mb) for i in range(n)) / (n - 1)
    sa, sb = _std(a), _std(b)
    if sa == 0 or sb == 0:
        return 0.0
    return cov / (sa * sb)


def _log_returns(closes: list[float]) -> list[float]:
    """Retornos logarítmicos diarios."""
    return [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))
            if closes[i - 1] > 0 and closes[i] > 0]


def _max_drawdown(closes: list[float]) -> float:
    """Máximo drawdown (fracción, positiva = pérdida)."""
    peak = closes[0]
    max_dd = 0.0
    for c in closes:
        if c > peak:
            peak = c
        dd = (peak - c) / peak if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return max_dd


def _atr14(candles: list[dict]) -> float:
    """Average True Range de 14 períodos."""
    true_ranges = []
    for i in range(1, len(candles)):
        h = candles[i]["high"]
        l = candles[i]["low"]
        pc = candles[i - 1]["close"]
        tr = max(h - l, abs(h - pc), abs(l - pc))
        true_ranges.append(tr)
    if not true_ranges:
        return 0.0
    return _mean(true_ranges[-14:])


def _hist_vol_series(returns: list[float], window: int = 21) -> list[float]:
    """Serie de volatilidad histórica anualizada (%, rolling window)."""
    out = []
    for i in range(window, len(returns) + 1):
        out.append(_std(returns[i - window:i]) * math.sqrt(252) * 100)
    return out


def _ts_to_iso(ts: int) -> str:
    return datetime.date.fromtimestamp(ts).isoformat()


def _normalize_features(data: list[list[float]]) -> list[list[float]]:
    if not data: return data
    n_cols = len(data[0])
    means = [_mean([row[j] for row in data]) for j in range(n_cols)]
    stds  = [max(_std([row[j] for row in data]), 1e-8) for j in range(n_cols)]
    return [[(row[j] - means[j]) / stds[j] for j in range(n_cols)] for row in data]


def _kmeans(data, k, n_init=5, max_iter=150):
    import random as _rng
    _rng.seed(42)
    n = len(data)
    dim = len(data[0])

    def _assign(centers):
        labels = []
        for x in data:
            dists = [sum((x[j]-c[j])**2 for j in range(dim)) for c in centers]
            labels.append(min(range(k), key=lambda i: dists[i]))
        return labels

    def _update(labels):
        centers = [[0.0]*dim for _ in range(k)]
        counts  = [0]*k
        for i, lb in enumerate(labels):
            for j in range(dim): centers[lb][j] += data[i][j]
            counts[lb] += 1
        for i in range(k):
            if counts[i] > 0:
                centers[i] = [centers[i][j]/counts[i] for j in range(dim)]
        return centers

    best_labels, best_inertia = None, float("inf")
    for _ in range(n_init):
        idxs = _rng.sample(range(n), k)
        centers = [list(data[i]) for i in idxs]
        prev_labels = None
        for _ in range(max_iter):
            labels = _assign(centers)
            if labels == prev_labels: break
            prev_labels = labels
            centers = _update(labels)
        inertia = sum(sum((data[i][j]-centers[labels[i]][j])**2 for j in range(dim)) for i in range(n))
        if inertia < best_inertia:
            best_inertia = inertia
            best_labels, best_centers = labels[:], [c[:] for c in centers]
    return best_labels, best_centers


def _viterbi(obs, n_states, trans, emit, pi):
    T = len(obs)
    EPS = 1e-300
    vit  = [[0.0]*n_states for _ in range(T)]
    psi  = [[0]*n_states   for _ in range(T)]
    for s in range(n_states):
        vit[0][s] = pi[s] * emit[s][obs[0]]
    for t in range(1, T):
        for s in range(n_states):
            probs = [vit[t-1][s2] * trans[s2][s] + EPS for s2 in range(n_states)]
            best  = max(range(n_states), key=lambda x: probs[x])
            psi[t][s]  = best
            vit[t][s]  = probs[best] * emit[s][obs[t]]
    path = [0]*T
    path[T-1] = max(range(n_states), key=lambda x: vit[T-1][x])
    for t in range(T-2, -1, -1):
        path[t] = psi[t+1][path[t+1]]
    return path


# ---------------------------------------------------------------------------
# 1. risk_score
# ---------------------------------------------------------------------------

def risk_score(ticker: str, range_: str = "1y") -> dict:
    """Score global de riesgo IA (0-100) con 6 componentes ponderados."""
    key = (ticker.upper(), range_, "risk_score")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = market.get_history(ticker, range_)
    candles = data["candles"]
    if len(candles) < 30:
        raise ValueError(f"Datos insuficientes para calcular riesgo: {ticker}")

    closes = [c["close"] for c in candles]
    volumes = [c["volume"] for c in candles]
    returns = _log_returns(closes)

    if len(returns) < 20:
        raise ValueError(f"Retornos insuficientes para {ticker}")

    # --- 1. Volatilidad (25%) ---
    hist_vol = _std(returns) * math.sqrt(252) * 100
    vol_score = min(100.0, hist_vol / 0.40 * 100)

    # --- 2. Drawdown (20%) ---
    max_dd = _max_drawdown(closes)
    drawdown_score = min(100.0, max_dd / 0.40 * 100)

    # --- 3. Momentum (15%) ---
    ret_20d = (closes[-1] - closes[-20]) / closes[-20] if len(closes) >= 20 else 0.0
    momentum_score = min(100.0, max(0.0, (-ret_20d) / 0.15 * 100 + 50))

    # --- 4. Liquidez (15%) ---
    vol_20 = volumes[-20:] if len(volumes) >= 20 else volumes
    vol_5 = volumes[-5:] if len(volumes) >= 5 else volumes
    avg_vol = _mean(vol_20) if vol_20 else 1.0
    recent_vol = _mean(vol_5) if vol_5 else avg_vol
    vol_ratio = recent_vol / avg_vol if avg_vol > 0 else 1.0
    # ratio=0 → 100 (sin volumen = alta incertidumbre), ratio=2 → 0 (volumen doble = muy líquido)
    liquidity_score = min(100.0, max(0.0, (2.0 - vol_ratio) / 2.0 * 100))

    # --- 5. Correlación con SPY (15%) ---
    corr = 0.5  # valor por defecto si SPY falla
    try:
        spy_data = market.get_history("SPY", range_)
        spy_closes = [c["close"] for c in spy_data["candles"]]
        spy_returns = _log_returns(spy_closes)
        n_common = min(len(returns), len(spy_returns))
        if n_common >= 10:
            corr = _pearson(returns[-n_common:], spy_returns[-n_common:])
            corr = max(-1.0, min(1.0, corr))
    except Exception:
        corr = 0.5
    corr_score = min(100.0, max(0.0, corr * 100))

    # --- 6. Régimen (10%) ---
    sma_50 = _mean(closes[-50:]) if len(closes) >= 50 else _mean(closes)
    sma_200 = _mean(closes[-200:]) if len(closes) >= 200 else _mean(closes)
    price = closes[-1]
    if price < sma_200:
        regime_score = 75.0
    elif price < sma_50:
        regime_score = 50.0
    else:
        regime_score = 25.0

    # --- Total ponderado ---
    total = (0.25 * vol_score + 0.20 * drawdown_score + 0.15 * momentum_score
             + 0.15 * liquidity_score + 0.15 * corr_score + 0.10 * regime_score)

    # --- Nivel y color ---
    if total < 30:
        level, color = "bajo", "verde"
    elif total < 70:
        level, color = "moderado", "amarillo"
    else:
        level, color = "alto", "rojo"

    # --- Recomendación: top 2 componentes ---
    component_scores = {
        "volatilidad": (vol_score, "volatilidad elevada"),
        "drawdown": (drawdown_score, "caída histórica significativa"),
        "momentum": (momentum_score, "momentum negativo"),
        "liquidez": (liquidity_score, "baja liquidez reciente"),
        "correlacion": (corr_score, "alta correlación con el mercado"),
        "regimen": (regime_score, "precio bajo medias móviles"),
    }
    sorted_comps = sorted(component_scores.items(), key=lambda x: x[1][0], reverse=True)
    top2 = [v[1] for _, v in sorted_comps[:2]]
    if total >= 70:
        recommendation = f"Riesgo elevado por {top2[0]} y {top2[1]}. Considera reducir exposición."
    elif total >= 30:
        recommendation = f"Riesgo moderado: monitorear {top2[0]} y {top2[1]}."
    else:
        recommendation = f"Riesgo bajo. Condiciones favorables. Atención a {top2[0]}."

    result = {
        "score": int(round(total)),
        "level": level,
        "color": color,
        "recommendation": recommendation,
        "components": {
            "volatilidad": {
                "score": round(vol_score, 1),
                "valor": round(hist_vol, 2),
                "unidad": "%",
                "label": "Volatilidad Histórica",
            },
            "drawdown": {
                "score": round(drawdown_score, 1),
                "valor": round(max_dd * 100, 2),
                "unidad": "%",
                "label": "Máx. Drawdown",
            },
            "momentum": {
                "score": round(momentum_score, 1),
                "valor": round(ret_20d * 100, 2),
                "unidad": "%",
                "label": "Retorno 20 días",
            },
            "liquidez": {
                "score": round(liquidity_score, 1),
                "valor": round(vol_ratio, 2),
                "unidad": "x",
                "label": "Relación de Volumen",
            },
            "correlacion": {
                "score": round(corr_score, 1),
                "valor": round(corr, 3),
                "unidad": "",
                "label": "Correlación con SPY",
            },
            "regimen": {
                "score": round(regime_score, 1),
                "valor": round(price / sma_200 - 1, 3) if sma_200 > 0 else 0,
                "unidad": "",
                "label": "Precio vs SMA200",
            },
        },
        "ticker": ticker.upper(),
        "range": range_,
        "n_obs": len(closes),
        "updated": str(datetime.date.today()),
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 2. volatility_intelligence
# ---------------------------------------------------------------------------

def volatility_intelligence(ticker: str, range_: str = "1y") -> dict:
    """Análisis avanzado de volatilidad: histórica, EWMA RiskMetrics y modelo heurístico."""
    key = (ticker.upper(), range_, "vol_intel")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = market.get_history(ticker, range_)
    candles = data["candles"]
    if len(candles) < 30:
        raise ValueError(f"Datos insuficientes para volatility_intelligence: {ticker}")

    closes = [c["close"] for c in candles]
    volumes = [c["volume"] for c in candles]
    returns = _log_returns(closes)

    if len(returns) < 22:
        raise ValueError(f"Retornos insuficientes para {ticker}")

    # --- Volatilidad histórica rolling 21d ---
    hist_vols = _hist_vol_series(returns, window=21)  # len = len(returns) - 20
    current_vol = hist_vols[-1] if hist_vols else 0.0
    avg_vol = _mean(hist_vols) if hist_vols else current_vol

    # --- EWMA vol (RiskMetrics λ=0.94) ---
    lam = 0.94
    init_window = min(30, len(returns))
    ewma_var = _variance(returns[:init_window], ddof=1) if init_window > 1 else returns[0] ** 2
    ewma_vols: list[float] = []
    for t in range(len(returns)):
        if t > 0:
            ewma_var = lam * ewma_var + (1 - lam) * returns[t] ** 2
        ewma_vols.append(math.sqrt(max(0.0, ewma_var)) * math.sqrt(252) * 100)

    # --- Percentil de volatilidad ---
    if hist_vols:
        sorted_hv = sorted(hist_vols)
        vol_percentile = _percentile(sorted_hv, 0.5)  # placeholder; recompute properly
        below = sum(1 for v in hist_vols if v < current_vol)
        vol_percentile = below / len(hist_vols) * 100
    else:
        vol_percentile = 50.0

    # --- Régimen de volatilidad ---
    if current_vol < avg_vol * 0.75:
        vol_regime = "BAJA"
    elif current_vol < avg_vol * 1.25:
        vol_regime = "NORMAL"
    elif current_vol < avg_vol * 1.75:
        vol_regime = "ALTA"
    else:
        vol_regime = "MUY ALTA"

    # --- Dirección de tendencia de vol ---
    if len(hist_vols) >= 15:
        last5_vol = _mean(hist_vols[-5:])
        prev10_vol = _mean(hist_vols[-15:-5])
    elif len(hist_vols) >= 6:
        last5_vol = _mean(hist_vols[-3:])
        prev10_vol = _mean(hist_vols[:-3])
    else:
        last5_vol = current_vol
        prev10_vol = avg_vol

    if prev10_vol > 0:
        if last5_vol > prev10_vol * 1.1:
            trend_direction = "CRECIENTE"
        elif last5_vol < prev10_vol * 0.9:
            trend_direction = "DECRECIENTE"
        else:
            trend_direction = "ESTABLE"
    else:
        trend_direction = "ESTABLE"

    # --- Modelo heurístico (ML proxy) ---
    # Feature 1: vol momentum
    vol_momentum = (last5_vol / prev10_vol - 1) if prev10_vol > 0 else 0.0

    # Feature 2: volume trend
    avg_vol_20 = _mean(volumes[-20:]) if len(volumes) >= 20 else _mean(volumes)
    avg_vol_5 = _mean(volumes[-5:]) if len(volumes) >= 5 else _mean(volumes)
    volume_trend = (avg_vol_5 / avg_vol_20 - 1) if avg_vol_20 > 0 else 0.0

    # Feature 3: ATR ratio
    atr14 = _atr14(candles)
    current_price = closes[-1]
    atr_ratio = atr14 / current_price if current_price > 0 else 0.0

    # Feature 4: MA ratio (price vs 20d MA)
    ma_20 = _mean(closes[-20:]) if len(closes) >= 20 else _mean(closes)
    ma_ratio = (closes[-1] / ma_20 - 1) if ma_20 > 0 else 0.0

    def _norm(x: float) -> float:
        return min(1.0, max(0.0, 0.5 + x * 2))

    ml_prob = (0.35 * _norm(vol_momentum) + 0.25 * _norm(volume_trend)
               + 0.20 * _norm(atr_ratio) + 0.20 * (1 - _norm(ma_ratio)))
    ml_prob = min(1.0, max(0.0, ml_prob))

    if ml_prob > 0.6:
        ml_signal = "EXPANSIÓN"
    elif ml_prob < 0.4:
        ml_signal = "CONTRACCIÓN"
    else:
        ml_signal = "ESTABLE"

    # --- Chart data: últimos 60 días (hist_vol + ewma_vol alineados) ---
    # hist_vols[i] corresponde al retorno en índice (i+20) dentro de returns
    # ewma_vols[i] corresponde al retorno en índice i dentro de returns
    # El retorno i está entre candle[i] y candle[i+1]; usamos candle[i+1] como fecha
    chart_data = []
    n_chart = min(60, len(hist_vols))
    for j in range(n_chart - 1, -1, -1):
        idx_in_returns = len(returns) - 1 - j          # posición en returns
        idx_in_hist = len(hist_vols) - 1 - j           # posición en hist_vols
        # candle index = idx_in_returns + 1  (returns[i] = log(close[i+1]/close[i]))
        candle_idx = idx_in_returns + 1
        if candle_idx >= len(candles) or idx_in_hist < 0:
            continue
        chart_data.append({
            "time": _ts_to_iso(candles[candle_idx]["time"]),
            "hist_vol": round(hist_vols[idx_in_hist], 2),
            "ewma_vol": round(ewma_vols[idx_in_returns], 2),
        })

    result = {
        "hist_vol": round(current_vol, 2),
        "ewma_vol": round(ewma_vols[-1], 2),
        "long_term_avg_vol": round(avg_vol, 2),
        "vol_percentile": round(vol_percentile, 1),
        "vol_regime": vol_regime,
        "trend_direction": trend_direction,
        "ml_prob": round(ml_prob, 3),
        "ml_signal": ml_signal,
        "chart_data": chart_data,
        "feature_values": {
            "vol_momentum": round(vol_momentum * 100, 2),
            "volume_trend": round(volume_trend * 100, 2),
            "atr_ratio": round(atr_ratio * 100, 2),
            "ma_ratio": round(ma_ratio * 100, 2),
        },
        "ticker": ticker.upper(),
        "disclaimer": "Modelo heurístico basado en indicadores técnicos, no en ML entrenado",
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 3. var_engine
# ---------------------------------------------------------------------------

def var_engine(ticker: str, confidence: float = 0.95, horizon: int = 1,
               range_: str = "1y") -> dict:
    """VaR histórico, Monte Carlo paramétrico, CVaR y distribución de retornos."""
    key = (ticker.upper(), confidence, horizon, range_, "var_engine")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = market.get_history(ticker, range_)
    candles = data["candles"]
    closes = [c["close"] for c in candles]
    returns = _log_returns(closes)

    if len(returns) < 30:
        raise ValueError(f"Datos insuficientes para VaR: {ticker}")

    sorted_returns = sorted(returns)

    # --- VaR Histórico ---
    alpha = 1 - confidence  # e.g. 0.05 para 95%
    var_1d_raw = -_percentile(sorted_returns, alpha)  # positivo = pérdida %
    var_1d = var_1d_raw * 100
    var_Td = var_1d * math.sqrt(horizon)

    # --- CVaR (Expected Shortfall) ---
    threshold = _percentile(sorted_returns, alpha)
    tail = [r for r in returns if r <= threshold]
    cvar = (-_mean(tail) * 100) if tail else var_1d

    # --- Monte Carlo paramétrico (Box-Muller) ---
    mu = _mean(returns)
    sigma = _std(returns)
    seed = 42
    sims: list[float] = []
    for _ in range(2000):
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
        u1 = seed / 2 ** 32 + 1e-10
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
        u2 = seed / 2 ** 32 + 1e-10
        z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
        sims.append(mu + sigma * z)

    sorted_sims = sorted(sims)
    mc_var_1d = -_percentile(sorted_sims, alpha) * 100

    best = _percentile(sorted_sims, 0.95) * 100
    avg_sim = _mean(sims) * 100
    worst = _percentile(sorted_sims, 0.05) * 100

    # --- Distribución histórica (30 bins) ---
    r_min, r_max = sorted_returns[0], sorted_returns[-1]
    bw = (r_max - r_min) / 30 if r_max > r_min else 0.001
    distribucion = []
    for i in range(30):
        blo = r_min + i * bw
        bhi = blo + bw
        cnt = sum(1 for r in returns if blo <= r < bhi)
        mid = (blo + bhi) / 2
        distribucion.append({
            "bucket_mid": round(mid * 100, 3),
            "count": cnt,
            "is_loss": mid < 0,
        })

    max_perdida_1d = -sorted_returns[0] * 100

    result = {
        "hist_var_1d": round(var_1d, 3),
        "hist_var_Td": round(var_Td, 3),
        "cvar": round(cvar, 3),
        "mc_var_1d": round(mc_var_1d, 3),
        "confidence": confidence,
        "horizon": horizon,
        "scenarios": {
            "mejor": {
                "retorno_pct": round(best, 3),
                "descripcion": "Escenario optimista (percentil 95)",
            },
            "promedio": {
                "retorno_pct": round(avg_sim, 3),
                "descripcion": "Escenario esperado (media)",
            },
            "peor": {
                "retorno_pct": round(worst, 3),
                "descripcion": "Escenario adverso (percentil 5)",
            },
        },
        "distribucion": distribucion,
        "max_perdida_1d": round(max_perdida_1d, 3),
        "n_obs": len(returns),
        "ticker": ticker.upper(),
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 4. position_sizing
# ---------------------------------------------------------------------------

def position_sizing(ticker: str, capital: float = 10000.0, risk_pct: float = 0.02,
                    range_: str = "1y") -> dict:
    """Tamaño óptimo de posición usando ATR, Kelly y ajuste de volatilidad."""
    key = (ticker.upper(), capital, risk_pct, range_, "sizing")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = market.get_history(ticker, range_)
    candles = data["candles"]
    if len(candles) < 20:
        raise ValueError(f"Datos insuficientes para position_sizing: {ticker}")

    closes = [c["close"] for c in candles]
    returns = _log_returns(closes)
    current_price = closes[-1]

    # --- ATR 14 ---
    atr14 = _atr14(candles)

    # --- Volatilidad histórica anualizada ---
    hist_vol = _std(returns) * math.sqrt(252) * 100  # en %

    # --- Kelly continuo ---
    mu_ann = _mean(returns) * 252
    var_ann = _variance(returns) * 252
    kelly_f = mu_ann / var_ann if var_ann > 0 else 0.0
    kelly_f = min(0.25, max(0.0, kelly_f))

    # --- Riesgo por operación ---
    risk_per_trade = capital * risk_pct

    # --- Stop loss (2 × ATR) ---
    stop_loss_distance = 2.0 * atr14
    if stop_loss_distance <= 0:
        stop_loss_distance = current_price * 0.02  # fallback: 2% del precio

    # --- ATR size ---
    atr_size = risk_per_trade / stop_loss_distance
    max_units = (capital / current_price * 0.5) if current_price > 0 else atr_size
    atr_size = min(atr_size, max_units)

    # --- Ajuste de volatilidad (target 20%) ---
    vol_adj = min(1.5, max(0.25, 0.20 / (hist_vol / 100))) if hist_vol > 0 else 1.0

    # --- Tamaño recomendado ---
    recommended_size = atr_size * vol_adj

    # --- Régimen ---
    sma_200 = _mean(closes[-200:]) if len(closes) >= 200 else _mean(closes)
    if current_price < sma_200:
        regime_adj = "REDUCIR"
    else:
        ret_20d = (closes[-1] - closes[-20]) / closes[-20] if len(closes) >= 20 else 0.0
        if ret_20d > 0.05:
            regime_adj = "NORMAL"
        else:
            regime_adj = "AUMENTAR"

    result = {
        "current_price": round(current_price, 2),
        "atr_14": round(atr14, 3),
        "hist_vol_pct": round(hist_vol, 2),
        "kelly_fraction": round(kelly_f, 4),
        "risk_per_trade": round(risk_per_trade, 2),
        "stop_loss_distance": round(stop_loss_distance, 2),
        "stop_loss_price": round(current_price - stop_loss_distance, 2),
        "stop_loss_pct": round(stop_loss_distance / current_price * 100, 2) if current_price > 0 else 0.0,
        "atr_size_units": round(atr_size, 4),
        "vol_adjustment": round(vol_adj, 3),
        "recommended_units": round(recommended_size, 4),
        "recommended_pct_capital": round(recommended_size * current_price / capital * 100, 2) if capital > 0 else 0.0,
        "max_exposure_pct": round(min(50.0, recommended_size * current_price / capital * 100 * 2), 2) if capital > 0 else 0.0,
        "regime_adjustment": regime_adj,
        "capital": capital,
        "risk_pct_input": risk_pct * 100,
        "ticker": ticker.upper(),
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 5. portfolio_analysis
# ---------------------------------------------------------------------------

def portfolio_analysis(tickers_str: str, range_: str = "1y") -> dict:
    """Correlación, beta, diversificación y Sharpe para un portafolio de tickers."""
    tickers = [t.strip().upper() for t in tickers_str.split(",") if t.strip()]
    key = (tuple(sorted(tickers)), range_, "portfolio")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    # --- Descargar datos y calcular retornos por ticker ---
    returns_by_ticker: dict[str, dict[int, float]] = {}
    for t in tickers:
        try:
            data = market.get_history(t, range_)
            candles = data["candles"]
            closes = [c["close"] for c in candles]
            rets = _log_returns(closes)
            # Indexar por timestamp del candle i+1 (retorno entre i e i+1)
            ts_map: dict[int, float] = {}
            for i, r in enumerate(rets):
                ts_map[candles[i + 1]["time"]] = r
            returns_by_ticker[t] = ts_map
        except Exception:
            pass

    valid_tickers = list(returns_by_ticker.keys())
    if not valid_tickers:
        return {
            "tickers": [],
            "n_tickers": 0,
            "correlation_matrix": [],
            "avg_correlation": 0.0,
            "diversification_score": 50.0,
            "metrics": [],
            "warnings": ["No se pudieron obtener datos para ningún ticker."],
            "n_obs": 0,
        }

    # --- Alinear retornos por timestamps comunes ---
    common_ts = set(returns_by_ticker[valid_tickers[0]].keys())
    for t in valid_tickers[1:]:
        common_ts &= set(returns_by_ticker[t].keys())
    common_ts_sorted = sorted(common_ts)

    aligned: dict[str, list[float]] = {
        t: [returns_by_ticker[t][ts] for ts in common_ts_sorted]
        for t in valid_tickers
    }

    min_obs = len(common_ts_sorted)

    # --- Correlación entre pares ---
    n = len(valid_tickers)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i][j] = 1.0
            elif j > i:
                c = _pearson(aligned[valid_tickers[i]], aligned[valid_tickers[j]])
                matrix[i][j] = c
                matrix[j][i] = c

    # --- Beta vs SPY ---
    spy_returns: list[float] | None = None
    if "SPY" in aligned:
        spy_returns = aligned["SPY"]
    else:
        try:
            spy_data = market.get_history("SPY", range_)
            spy_candles = spy_data["candles"]
            spy_closes = [c["close"] for c in spy_candles]
            spy_rets_raw = _log_returns(spy_closes)
            spy_ts_map: dict[int, float] = {}
            for i, r in enumerate(spy_rets_raw):
                spy_ts_map[spy_candles[i + 1]["time"]] = r
            # Alinear con los timestamps comunes
            spy_returns = [spy_ts_map[ts] for ts in common_ts_sorted if ts in spy_ts_map]
            # Si la longitud no coincide, cortar
            if len(spy_returns) != min_obs:
                spy_returns = None
        except Exception:
            spy_returns = None

    betas: dict[str, float | None] = {}
    if spy_returns and len(spy_returns) >= 10:
        spy_var = _variance(spy_returns)
        for t in valid_tickers:
            if spy_var > 0:
                a, b = aligned[t], spy_returns
                n_c = min(len(a), len(b))
                ma, mb = _mean(a[:n_c]), _mean(b[:n_c])
                cov = sum((a[i] - ma) * (b[i] - mb) for i in range(n_c)) / max(1, n_c - 1)
                betas[t] = cov / spy_var
            else:
                betas[t] = None
    else:
        for t in valid_tickers:
            betas[t] = None

    # --- Sharpe por ticker ---
    def _sharpe(rets: list[float]) -> float:
        mu_ann = _mean(rets) * 252
        std_ann = _std(rets) * math.sqrt(252)
        return mu_ann / std_ann if std_ann > 0 else 0.0

    # --- Correlación promedio (off-diagonal) ---
    off_diag = []
    for i in range(n):
        for j in range(i + 1, n):
            off_diag.append(matrix[i][j])
    avg_corr = _mean(off_diag) if off_diag else 0.0

    div_score = max(0.0, min(100.0, (1 - avg_corr) * 100))

    # --- Warnings ---
    warnings: list[str] = []
    for i in range(n):
        for j in range(i + 1, n):
            if matrix[i][j] > 0.80:
                warnings.append(
                    f"Alta correlación entre {valid_tickers[i]} y {valid_tickers[j]} "
                    f"({matrix[i][j]:.2f})"
                )
    if avg_corr > 0.70:
        warnings.append("Correlación promedio alta. Portafolio con bajo nivel de diversificación.")

    metrics = [
        {
            "ticker": t,
            "vol_anual": round(_std(aligned[t]) * math.sqrt(252) * 100, 2),
            "beta": round(betas[t], 3) if betas.get(t) is not None else None,
            "sharpe": round(_sharpe(aligned[t]), 3),
        }
        for t in valid_tickers
    ]

    result = {
        "tickers": valid_tickers,
        "n_tickers": len(valid_tickers),
        "correlation_matrix": [[round(c, 3) for c in row] for row in matrix],
        "avg_correlation": round(avg_corr, 3),
        "diversification_score": round(div_score, 1),
        "metrics": metrics,
        "warnings": warnings,
        "n_obs": min_obs,
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 6. stress_test
# ---------------------------------------------------------------------------

def stress_test(ticker: str, range_: str = "1y") -> dict:
    """Stress testing: escenarios de shock de mercado aplicados con beta del activo."""
    key = (ticker.upper(), range_, "stress_test")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = market.get_history(ticker, range_)
    candles = data["candles"]
    closes = [c["close"] for c in candles]
    current_price = closes[-1]
    returns = _log_returns(closes)
    max_dd = _max_drawdown(closes)

    # --- Beta vs SPY ---
    beta = 1.0
    try:
        spy_data = market.get_history("SPY", range_)
        spy_closes = [c["close"] for c in spy_data["candles"]]
        spy_returns = _log_returns(spy_closes)
        n_c = min(len(returns), len(spy_returns))
        if n_c >= 10:
            spy_var = _variance(spy_returns[-n_c:])
            ma = _mean(returns[-n_c:])
            mb = _mean(spy_returns[-n_c:])
            cov = sum((returns[-n_c + i] - ma) * (spy_returns[-n_c + i] - mb)
                      for i in range(n_c)) / max(1, n_c - 1)
            beta = cov / spy_var if spy_var > 0 else 1.0
    except Exception:
        beta = 1.0

    SCENARIOS = [
        {
            "name": "Corrección de mercado (-10%)",
            "market_shock": -0.10,
            "prob": "MODERADO",
            "description": "Correcciones del 10% ocurren varias veces por año en promedio.",
        },
        {
            "name": "Crash de mercado (-20%)",
            "market_shock": -0.20,
            "prob": "BAJO",
            "description": "Mercado bajista técnico. Ocurrió en 2020, 2018, 2015.",
        },
        {
            "name": "Crisis severa (-35%)",
            "market_shock": -0.35,
            "prob": "MUY BAJO",
            "description": "Crisis financiera mayor. Similar a 2008-2009 o dotcom bust.",
        },
        {
            "name": "Recesión económica (-15%)",
            "market_shock": -0.15,
            "prob": "BAJO",
            "description": "Contracción del PIB por 2+ trimestres. Afecta earnings corporativos.",
        },
        {
            "name": "Alza agresiva de tasas (+2%)",
            "market_shock": -0.12,
            "prob": "MODERADO",
            "description": "Ciclo de alzas de la Fed. Comprime valuaciones (P/E ratio).",
        },
        {
            "name": "Shock inflacionario",
            "market_shock": -0.08,
            "prob": "MODERADO",
            "description": "Inflación por encima del 6%. Erosiona márgenes y poder adquisitivo.",
        },
        {
            "name": "Rally alcista (+20%)",
            "market_shock": 0.20,
            "prob": "MODERADO",
            "description": "Escenario positivo: expansión económica + política monetaria laxa.",
        },
    ]

    escenarios = []
    for sc in SCENARIOS:
        asset_impact = beta * sc["market_shock"]
        expected_price = current_price * (1 + asset_impact)
        escenarios.append({
            "nombre": sc["name"],
            "shock_mercado_pct": round(sc["market_shock"] * 100, 1),
            "impacto_activo_pct": round(asset_impact * 100, 2),
            "precio_esperado": round(expected_price, 2),
            "probabilidad": sc["prob"],
            "descripcion": sc["description"],
        })

    result = {
        "ticker": ticker.upper(),
        "current_price": round(current_price, 2),
        "beta": round(beta, 3),
        "escenarios": escenarios,
        "drawdown_historico_max": round(max_dd * 100, 2),
        "nota": (
            "El impacto estimado asume que el activo mantiene su relación histórica "
            "con el mercado (beta). Solo análisis."
        ),
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 7. market_regime
# ---------------------------------------------------------------------------

def market_regime(ticker: str, range_: str = "1y") -> dict:
    """Detección de régimen de mercado usando K-Means (4 clústeres) + HMM (4 estados).

    Regímenes: ALCISTA · BAJISTA · ALTA_VOLATILIDAD · LATERAL
    """
    key = ("regime", ticker.upper(), range_)
    cached = _cache_get(key)
    if cached:
        return cached

    data_raw = market.get_history(ticker.upper(), range_)
    candles  = data_raw.get("candles", [])
    if len(candles) < 30:
        raise ValueError(f"Datos insuficientes para {ticker}")

    closes  = [c["close"]  for c in candles]
    volumes = [c["volume"] for c in candles]
    highs   = [c["high"]   for c in candles]
    lows    = [c["low"]    for c in candles]

    # ── Log returns ──────────────────────────────────────────────────────────
    rets = [math.log(closes[i] / closes[i-1]) for i in range(1, len(closes))]
    n    = len(rets)
    N    = n  # alias

    # ── Rolling features (window=21) ────────────────────────────────────────
    W = 21
    FEAT = []   # one row per day (from day W onward)
    TIMES = []
    for i in range(W, N):
        window_r  = rets[i-W:i]
        # feat 1: rolling vol (annualized %)
        vol_i = _std(window_r) * math.sqrt(252) * 100
        # feat 2: rolling momentum (cumulative return over W days)
        mom_i = sum(window_r) * 100
        # feat 3: volume ratio (recent 5d vs window)
        vols_w  = volumes[i-W+1:i+1]
        vol5    = _mean(vols_w[-5:])
        vol_avg = _mean(vols_w)
        vol_rat = vol5 / vol_avg if vol_avg > 0 else 1.0
        # feat 4: price vs 50d SMA (if enough data)
        sma50_start = max(0, i - 49)
        sma50 = _mean(closes[sma50_start:i+1])
        sma_dev = (closes[i] / sma50 - 1.0) * 100 if sma50 > 0 else 0.0
        FEAT.append([vol_i, mom_i, vol_rat, sma_dev])
        TIMES.append(candles[i+1]["time"])  # +1 because FEAT starts from rets[W]

    if len(FEAT) < 4:
        raise ValueError("Datos insuficientes para clusterización")

    # ── K-Means (k=4) ────────────────────────────────────────────────────────
    feat_norm = _normalize_features(FEAT)
    km_labels, km_centers = _kmeans(feat_norm, 4)

    # Label clusters by centroid characteristics (raw features):
    # centroid[0]=vol, centroid[1]=momentum, centroid[2]=vol_ratio, centroid[3]=sma_dev
    raw_centers = [[0.0]*4 for _ in range(4)]
    counts_c    = [0]*4
    for i, lb in enumerate(km_labels):
        for j in range(4): raw_centers[lb][j] += FEAT[i][j]
        counts_c[lb] += 1
    for i in range(4):
        if counts_c[i] > 0:
            raw_centers[i] = [raw_centers[i][j]/counts_c[i] for j in range(4)]

    def _label_cluster(c_vol, c_mom, c_sma):
        if c_vol > 30:                       return "ALTA_VOLATILIDAD"
        if c_mom > 2 and c_sma > 1:         return "ALCISTA"
        if c_mom < -2 and c_sma < -1:       return "BAJISTA"
        return "LATERAL"

    cluster_regime = [
        _label_cluster(raw_centers[i][0], raw_centers[i][1], raw_centers[i][3])
        for i in range(4)
    ]
    # Resolve duplicates: if two clusters get same label, break ties by volatility rank
    seen = {}
    for i, lbl in enumerate(cluster_regime):
        if lbl in seen:
            # Assign the lower-vol one a different label
            existing_i = seen[lbl]
            if raw_centers[i][0] > raw_centers[existing_i][0]:
                cluster_regime[i] = "ALTA_VOLATILIDAD"
            else:
                cluster_regime[existing_i] = "ALTA_VOLATILIDAD"
                seen[lbl] = i
        else:
            seen[lbl] = i

    km_regime_seq = [cluster_regime[lb] for lb in km_labels]

    # ── HMM (4 states, domain-driven params) ────────────────────────────────
    # States: 0=ALCISTA, 1=BAJISTA, 2=ALTA_VOLATILIDAD, 3=LATERAL
    STATE_NAMES = ["ALCISTA", "BAJISTA", "ALTA_VOLATILIDAD", "LATERAL"]

    # Transition matrix (sum of each row ≈ 1)
    trans = [
        [0.85, 0.05, 0.05, 0.05],   # from ALCISTA
        [0.10, 0.75, 0.10, 0.05],   # from BAJISTA
        [0.15, 0.15, 0.60, 0.10],   # from ALTA_VOL
        [0.20, 0.10, 0.05, 0.65],   # from LATERAL
    ]
    # Initial probs
    pi = [0.30, 0.20, 0.20, 0.30]

    # Discretize returns into 5 bins: VN, N, Z, P, VP  (very-neg → very-pos)
    ret_perc = sorted(rets)
    q20 = ret_perc[int(0.20*len(ret_perc))]
    q40 = ret_perc[int(0.40*len(ret_perc))]
    q60 = ret_perc[int(0.60*len(ret_perc))]
    q80 = ret_perc[int(0.80*len(ret_perc))]

    def _disc_ret(r):
        if r < q20: return 0
        if r < q40: return 1
        if r < q60: return 2
        if r < q80: return 3
        return 4

    # Discretize vol into 3 bins: L, M, H
    all_vols = [f[0] for f in FEAT]
    v33 = sorted(all_vols)[int(0.33*len(all_vols))]
    v66 = sorted(all_vols)[int(0.66*len(all_vols))]

    def _disc_vol(v):
        if v < v33: return 0
        if v < v66: return 1
        return 2

    # Combined observation: 5 ret classes × 3 vol classes = 15 symbols
    obs_seq = [
        _disc_ret(rets[i]) * 3 + _disc_vol(FEAT[i-W][0])
        for i in range(W, N)
    ]
    n_obs_sym = 15

    # Emission matrix: P(obs | state) — domain-driven
    # ALCISTA:         pos returns likely, low vol
    # BAJISTA:         neg returns likely, mixed vol
    # ALTA_VOL:        any return, high vol
    # LATERAL:         near-zero returns, low-med vol
    def _base_emit():
        return [[1/n_obs_sym]*n_obs_sym for _ in range(4)]

    emit = _base_emit()
    for ret_cls in range(5):
        for vol_cls in range(3):
            sym = ret_cls*3 + vol_cls
            # ALCISTA: high weight on positive returns + low vol
            emit[0][sym] = (0.05 + 0.20*(ret_cls/4)) * (0.1 + 0.30*(1 - vol_cls/2))
            # BAJISTA: high weight on negative returns
            emit[1][sym] = (0.05 + 0.20*((4-ret_cls)/4)) * (0.05 + 0.25*(vol_cls/2+0.3))
            # ALTA_VOL: high weight on high vol
            emit[2][sym] = 0.05 + 0.50*(vol_cls/2)
            # LATERAL: near-zero returns, low vol
            mid_ret = 1 - abs(ret_cls - 2)/2
            emit[3][sym] = (0.05 + 0.30*mid_ret) * (0.1 + 0.30*(1 - vol_cls/2))

    # Normalize rows
    for s in range(4):
        row_sum = sum(emit[s])
        if row_sum > 0:
            emit[s] = [v/row_sum for v in emit[s]]

    hmm_path = _viterbi(obs_seq, 4, trans, emit, pi)
    hmm_regime_seq = [STATE_NAMES[s] for s in hmm_path]

    # ── Ensemble: agree → confident, disagree → take HMM ───────────────────
    final_seq = []
    for km, hmm in zip(km_regime_seq, hmm_regime_seq):
        final_seq.append(hmm if km != hmm else km)

    current_regime = final_seq[-1]
    km_current     = km_regime_seq[-1]
    hmm_current    = hmm_regime_seq[-1]
    agree          = (km_current == hmm_current)
    confidence     = 0.85 if agree else 0.65

    # ── Price-level indicators ───────────────────────────────────────────────
    sma50  = _mean(closes[-50:])  if len(closes) >= 50  else _mean(closes)
    sma200 = _mean(closes[-200:]) if len(closes) >= 200 else _mean(closes)
    sma20  = _mean(closes[-20:])  if len(closes) >= 20  else _mean(closes)
    price  = closes[-1]
    hist_vol   = _std(rets[-W:]) * math.sqrt(252) * 100
    lt_avg_vol = _std(rets) * math.sqrt(252) * 100
    mom_20d    = (closes[-1]/closes[-20]-1)*100 if len(closes) >= 20 else 0.0
    mom_60d    = (closes[-1]/closes[-60]-1)*100 if len(closes) >= 60 else 0.0
    trend_str  = min(100.0, abs(mom_20d) / 10.0)  # mom_20d ya en %; 10% = 100% de fuerza

    # ── Trading implication ──────────────────────────────────────────────────
    IMPLICATIONS = {
        "ALCISTA":          "Tendencia alcista confirmada por ambos modelos. Estrategias de seguimiento de tendencia son favorables.",
        "BAJISTA":          "Régimen bajista detectado. Exposición reducida y estrategias defensivas recomendadas.",
        "ALTA_VOLATILIDAD": "Alta volatilidad detectada. Reducir tamaño de posiciones y ampliar niveles de stop.",
        "LATERAL":          "Mercado en rango lateral. Estrategias de reversión a la media con gestión de riesgo ajustada.",
    }
    implication = IMPLICATIONS.get(current_regime, "Régimen no determinado.")

    # ── Regime history (last 60 points of the sequence, every 3) ─────────────
    regime_history = []
    step = max(1, len(final_seq)//60)
    for i in range(0, len(final_seq), step):
        price_i = closes[W + i + 1] if (W + i + 1) < len(closes) else closes[-1]
        sma50_i = (_mean(closes[max(0, W+i+1-49):W+i+2])
                   if (W + i + 2) <= len(closes) else None)
        regime_history.append({
            "time":         _ts_to_iso(TIMES[i]),
            "price":        round(price_i, 2),
            "sma50":        round(sma50_i, 2) if sma50_i is not None else None,
            "regime_label": final_seq[i],
        })

    # ── Cluster summary ──────────────────────────────────────────────────────
    cluster_summary = []
    for i in range(4):
        cluster_summary.append({
            "id":            i,
            "regime":        cluster_regime[i],
            "count":         counts_c[i],
            "avg_vol":       round(raw_centers[i][0], 2),
            "avg_momentum":  round(raw_centers[i][1], 2),
            "avg_sma_dev":   round(raw_centers[i][3], 2),
        })

    # Regime transition counts from HMM path
    transitions = {}
    for t in range(1, len(hmm_path)):
        key_t = (STATE_NAMES[hmm_path[t-1]], STATE_NAMES[hmm_path[t]])
        transitions[str(key_t)] = transitions.get(str(key_t), 0) + 1

    result = {
        "ticker":             ticker.upper(),
        "regime":             current_regime,
        "confidence":         round(confidence, 3),
        "kmeans_regime":      km_current,
        "hmm_regime":         hmm_current,
        "models_agree":       agree,
        "trend_strength":     round(trend_str, 1),
        "momentum_20d":       round(mom_20d, 2),
        "momentum_60d":       round(mom_60d, 2),
        "current_price":      round(price, 2),
        "sma_20":             round(sma20, 2),
        "sma_50":             round(sma50, 2),
        "sma_200":            round(sma200, 2),
        "above_sma50":        price > sma50,
        "above_sma200":       price > sma200,
        "hist_vol":           round(hist_vol, 2),
        "long_term_avg_vol":  round(lt_avg_vol, 2),
        "vol_vs_avg":         round(hist_vol / lt_avg_vol, 2) if lt_avg_vol > 0 else 1.0,
        "trading_implication": implication,
        "regime_history":     regime_history,
        "cluster_summary":    cluster_summary,
        "n_obs":              N,
        "method":             "K-Means (k=4) + HMM (4 estados, Viterbi) — Python puro",
    }
    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# 8. trading_performance
# ---------------------------------------------------------------------------

def trading_performance(ticker: str, range_: str = "1y") -> dict:
    """Performance Intelligence: Sharpe, Sortino, Calmar, Win Rate, Profit Factor y análisis IA."""
    key = (ticker.upper(), range_, "performance")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = market.get_history(ticker, range_)
    candles = data["candles"]
    if len(candles) < 30:
        raise ValueError(f"Datos insuficientes para performance: {ticker}")

    closes = [c["close"] for c in candles]
    returns = _log_returns(closes)

    if len(returns) < 20:
        raise ValueError(f"Retornos insuficientes para {ticker}")

    n = len(returns)
    mu = _mean(returns)
    sigma = _std(returns)

    # --- Sharpe Ratio (anualizado, risk-free=0) ---
    sharpe = (mu * 252) / (sigma * math.sqrt(252)) if sigma > 0 else 0.0

    # --- Sortino Ratio (desviación a la baja) ---
    neg_returns = [r for r in returns if r < 0]
    downside_std = _std(neg_returns, ddof=1) if len(neg_returns) > 1 else sigma
    sortino = (mu * 252) / (downside_std * math.sqrt(252)) if downside_std > 0 else 0.0

    # --- Max Drawdown ---
    max_dd = _max_drawdown(closes)

    # --- Calmar Ratio ---
    ann_return = mu * 252
    calmar = ann_return / max_dd if max_dd > 0 else 0.0

    # --- Win Rate ---
    wins = sum(1 for r in returns if r > 0)
    win_rate = wins / n * 100

    # --- Profit Factor ---
    total_profit = sum(r for r in returns if r > 0)
    total_loss = abs(sum(r for r in returns if r < 0))
    profit_factor = min(10.0, total_profit / total_loss if total_loss > 0 else 10.0)

    # --- Promedio de ganancias y pérdidas ---
    avg_win = _mean([r for r in returns if r > 0]) * 100 if wins > 0 else 0.0
    losses = [r for r in returns if r < 0]
    avg_loss = _mean(losses) * 100 if losses else 0.0

    # --- Expectativa diaria (%) ---
    expectancy = mu * 100

    # --- Rachas consecutivas ---
    max_consec_wins = max_consec_losses = 0
    curr_w = curr_l = 0
    for r in returns:
        if r > 0:
            curr_w += 1; curr_l = 0
            if curr_w > max_consec_wins: max_consec_wins = curr_w
        elif r < 0:
            curr_l += 1; curr_w = 0
            if curr_l > max_consec_losses: max_consec_losses = curr_l
        else:
            curr_w = curr_l = 0

    # --- Sharpe rolling 90 días ---
    if n >= 90:
        r90 = returns[-90:]
        mu90, s90 = _mean(r90), _std(r90)
        sharpe_90d = (mu90 * 252) / (s90 * math.sqrt(252)) if s90 > 0 else 0.0
    else:
        sharpe_90d = sharpe

    # --- Ulcer Index (profundidad + duración del drawdown) ---
    peak = closes[0]
    sq_sum = 0.0
    for c in closes:
        if c > peak: peak = c
        dd_pct = (peak - c) / peak * 100 if peak > 0 else 0.0
        sq_sum += dd_pct ** 2
    ulcer_index = math.sqrt(sq_sum / len(closes))

    # --- Análisis IA ---
    insights = []

    if sharpe > 2.0:
        insights.append({"tipo": "POSITIVO", "mensaje": f"Sharpe Ratio excepcional ({sharpe:.2f}). Rendimiento ajustado por riesgo muy superior al promedio de mercado."})
    elif sharpe > 1.0:
        insights.append({"tipo": "POSITIVO", "mensaje": f"Sharpe Ratio sólido ({sharpe:.2f}). Buena compensación de riesgo en el período analizado."})
    elif sharpe > 0:
        insights.append({"tipo": "NEUTRAL", "mensaje": f"Sharpe Ratio positivo pero bajo ({sharpe:.2f}). El retorno supera el riesgo por un margen estrecho."})
    else:
        insights.append({"tipo": "ALERTA", "mensaje": f"Sharpe Ratio negativo ({sharpe:.2f}). El activo no está compensando el riesgo asumido."})

    if sharpe > 0.3 and sortino < sharpe * 0.65:
        insights.append({"tipo": "ALERTA", "mensaje": f"Pérdidas asimétricas detectadas: Sortino ({sortino:.2f}) << Sharpe ({sharpe:.2f}). Las caídas son desproporcionadamente severas."})

    if win_rate < 40:
        insights.append({"tipo": "ALERTA", "mensaje": f"Win Rate bajo ({win_rate:.1f}%). Más del 60% de los días son negativos. Revisar tendencia estructural del activo."})
    elif win_rate > 58:
        insights.append({"tipo": "POSITIVO", "mensaje": f"Win Rate alto ({win_rate:.1f}%). Alta frecuencia de días positivos — consistencia histórica sólida."})

    if profit_factor < 1.0:
        insights.append({"tipo": "ALERTA", "mensaje": f"Profit Factor menor a 1.0 ({profit_factor:.2f}). Las pérdidas brutas acumuladas superan las ganancias brutas."})
    elif profit_factor > 1.8:
        insights.append({"tipo": "POSITIVO", "mensaje": f"Profit Factor favorable ({profit_factor:.2f}). Las ganancias brutas superan en {profit_factor:.1f}x a las pérdidas."})

    if max_dd > 0.40:
        insights.append({"tipo": "ALERTA", "mensaje": f"Drawdown máximo extremo ({max_dd*100:.1f}%). Alta exposición a pérdidas históricas severas. Gestión de riesgo crítica."})
    elif max_dd < 0.12:
        insights.append({"tipo": "POSITIVO", "mensaje": f"Drawdown máximo controlado ({max_dd*100:.1f}%). Historial de preservación de capital robusto."})

    if sharpe_90d < sharpe - 0.5 and sharpe > 0.2:
        insights.append({"tipo": "ALERTA", "mensaje": f"Deterioro reciente: Sharpe 90d ({sharpe_90d:.2f}) vs histórico ({sharpe:.2f}). El rendimiento ajustado por riesgo está empeorando."})
    elif sharpe_90d > sharpe + 0.3:
        insights.append({"tipo": "POSITIVO", "mensaje": f"Mejora reciente: Sharpe 90d ({sharpe_90d:.2f}) supera al histórico ({sharpe:.2f}). Momentum de calidad positivo."})

    if max_consec_losses >= 8:
        insights.append({"tipo": "ALERTA", "mensaje": f"Racha bajista máxima de {max_consec_losses} días consecutivos. Evaluar resistencia psicológica y stop-loss sistémico."})

    result = {
        "ticker": ticker.upper(),
        "n_obs": n,
        "range": range_,
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "calmar_ratio": round(calmar, 3),
        "sharpe_90d": round(sharpe_90d, 3),
        "ann_return_pct": round(ann_return * 100, 2),
        "expectancy_daily_pct": round(expectancy, 4),
        "win_rate_pct": round(win_rate, 1),
        "profit_factor": round(profit_factor, 3),
        "avg_win_pct": round(avg_win, 4),
        "avg_loss_pct": round(avg_loss, 4),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "ulcer_index": round(ulcer_index, 2),
        "ann_vol_pct": round(sigma * math.sqrt(252) * 100, 2),
        "max_consec_wins": max_consec_wins,
        "max_consec_losses": max_consec_losses,
        "insights": insights,
    }

    _cache_set(key, result)
    return result
