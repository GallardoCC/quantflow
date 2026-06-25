"""
Modelos de volatilidad GARCH — análisis cuantitativo de varianza condicional.

Implementa, en Python puro (sin numpy), tres modelos ajustados por máxima
verosimilitud (MLE) con un optimizador Nelder-Mead propio:

  - GARCH(1,1):  σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
  - EGARCH(1,1): ln σ²_t = ω + β·ln σ²_{t-1} + α·(|z_{t-1}|−√(2/π)) + γ·z_{t-1}
  - GJR/TGARCH:  σ²_t = ω + (α + γ·I_{t-1})·ε²_{t-1} + β·σ²_{t-1}   (I=1 si ε<0)

Devuelve volatilidad histórica (realizada móvil), volatilidad condicional del
mejor modelo, pronóstico multi-paso, métricas de riesgo (VaR), comparación de
modelos (log-verosimilitud, AIC, BIC, persistencia) y datos para los gráficos.

Solo análisis — nunca ejecución. Resultados cacheados en memoria.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

from app.data import market

_CACHE: dict[tuple, dict] = {}

_SQRT_2_OVER_PI = math.sqrt(2.0 / math.pi)
_ANNUAL = math.sqrt(252.0)          # factor de anualización (datos diarios)
_BIG = 1e12                         # penalización para parámetros inválidos


# --------------------------------------------------------------------------- #
#  Optimizador Nelder-Mead (simplex) — minimiza f en R^n, sin dependencias.
# --------------------------------------------------------------------------- #
def _nelder_mead(f, x0: list[float], steps: list[float],
                 iters: int = 400, tol: float = 1e-8) -> list[float]:
    n = len(x0)
    # Construir simplex inicial
    simplex = [list(x0)]
    for i in range(n):
        p = list(x0)
        p[i] += steps[i] if x0[i] == 0 else steps[i]
        simplex.append(p)
    fvals = [f(p) for p in simplex]

    a, g, r, s = 1.0, 2.0, 0.5, 0.5   # reflexión, expansión, contracción, encogimiento
    for _ in range(iters):
        # Ordenar por valor de función
        order = sorted(range(n + 1), key=lambda k: fvals[k])
        simplex = [simplex[k] for k in order]
        fvals = [fvals[k] for k in order]

        if abs(fvals[-1] - fvals[0]) < tol:
            break

        # Centroide de todos menos el peor
        cen = [sum(simplex[k][j] for k in range(n)) / n for j in range(n)]

        # Reflexión
        xr = [cen[j] + a * (cen[j] - simplex[-1][j]) for j in range(n)]
        fr = f(xr)
        if fvals[0] <= fr < fvals[-2]:
            simplex[-1], fvals[-1] = xr, fr
            continue
        # Expansión
        if fr < fvals[0]:
            xe = [cen[j] + g * (xr[j] - cen[j]) for j in range(n)]
            fe = f(xe)
            if fe < fr:
                simplex[-1], fvals[-1] = xe, fe
            else:
                simplex[-1], fvals[-1] = xr, fr
            continue
        # Contracción
        xc = [cen[j] + r * (simplex[-1][j] - cen[j]) for j in range(n)]
        fc = f(xc)
        if fc < fvals[-1]:
            simplex[-1], fvals[-1] = xc, fc
            continue
        # Encogimiento hacia el mejor
        best = simplex[0]
        for k in range(1, n + 1):
            simplex[k] = [best[j] + s * (simplex[k][j] - best[j]) for j in range(n)]
            fvals[k] = f(simplex[k])

    order = sorted(range(n + 1), key=lambda k: fvals[k])
    return simplex[order[0]]


def _best_fit(obj, starts: list[list[float]], steps: list[float]) -> list[float]:
    """Multi-start Nelder-Mead: prueba varios puntos iniciales y se queda con el
    de menor valor (evita óptimos locales del MLE, frecuentes en EGARCH)."""
    best_x, best_f = None, float("inf")
    for x0 in starts:
        x = _nelder_mead(obj, x0, steps)
        fx = obj(x)
        if fx < best_f:
            best_x, best_f = x, fx
    return best_x


# --------------------------------------------------------------------------- #
#  Verosimilitudes (negativas) — todas reciben ε (residuos demeaneados, en %).
# --------------------------------------------------------------------------- #
def _garch_filter(eps: list[float], w: float, al: float, be: float,
                  v0: float) -> list[float]:
    """Filtra la varianza condicional GARCH(1,1)."""
    var = [v0]
    for t in range(1, len(eps)):
        var.append(w + al * eps[t - 1] ** 2 + be * var[t - 1])
    return var


def _gjr_filter(eps, w, al, ga, be, v0) -> list[float]:
    var = [v0]
    for t in range(1, len(eps)):
        ind = 1.0 if eps[t - 1] < 0 else 0.0
        var.append(w + (al + ga * ind) * eps[t - 1] ** 2 + be * var[t - 1])
    return var


def _egarch_filter(eps, w, al, ga, be, lv0) -> list[float]:
    """Filtra ln σ² del EGARCH(1,1). Devuelve la varianza (no el log)."""
    lnv = [lv0]
    var = [math.exp(lv0)]
    for t in range(1, len(eps)):
        sig_prev = math.sqrt(var[t - 1])
        z = eps[t - 1] / sig_prev if sig_prev > 1e-12 else 0.0
        nxt = w + be * lnv[t - 1] + al * (abs(z) - _SQRT_2_OVER_PI) + ga * z
        nxt = max(-30.0, min(30.0, nxt))   # estabilidad numérica
        lnv.append(nxt)
        var.append(math.exp(nxt))
    return var


def _neg_ll(eps: list[float], var: list[float]) -> float:
    """−log-verosimilitud gaussiana dadas las varianzas condicionales."""
    ll = 0.0
    for t in range(len(eps)):
        v = var[t]
        if v <= 1e-12 or math.isnan(v) or math.isinf(v):
            return _BIG
        ll += math.log(v) + eps[t] ** 2 / v
    return 0.5 * ll  # constante 0.5·N·ln(2π) omitida (no afecta el argmin)


# --------------------------------------------------------------------------- #
#  Ajuste de cada modelo. Devuelve dict con params, varianza, LL, AIC, BIC.
# --------------------------------------------------------------------------- #
def _fit_garch(eps, uvar):
    def obj(p):
        w, al, be = p
        if w <= 0 or al < 0 or be < 0 or al + be >= 0.9999:
            return _BIG
        return _neg_ll(eps, _garch_filter(eps, w, al, be, uvar))

    x = _best_fit(obj,
                  [[0.1 * uvar, 0.08, 0.90], [0.05 * uvar, 0.15, 0.80],
                   [0.2 * uvar, 0.05, 0.60]],
                  [0.05 * uvar, 0.04, 0.04])
    w, al, be = x
    var = _garch_filter(eps, w, al, be, uvar)
    nll = _neg_ll(eps, var)
    return {
        "name": "GARCH(1,1)", "k": 3, "var": var, "nll": nll,
        "params": {"omega": w, "alpha": al, "beta": be},
        "persistence": al + be,
        "longrun_var": w / (1 - al - be) if al + be < 1 else None,
        "leverage": None,
    }


def _fit_gjr(eps, uvar):
    def obj(p):
        w, al, ga, be = p
        if w <= 0 or al < 0 or be < 0 or al + ga < 0 or al + be + 0.5 * ga >= 0.9999:
            return _BIG
        return _neg_ll(eps, _gjr_filter(eps, w, al, ga, be, uvar))

    x = _best_fit(obj,
                  [[0.1 * uvar, 0.04, 0.06, 0.88], [0.05 * uvar, 0.02, 0.12, 0.82],
                   [0.2 * uvar, 0.06, 0.04, 0.65]],
                  [0.05 * uvar, 0.03, 0.03, 0.04])
    w, al, ga, be = x
    var = _gjr_filter(eps, w, al, ga, be, uvar)
    nll = _neg_ll(eps, var)
    pers = al + be + 0.5 * ga
    return {
        "name": "GJR-GARCH(1,1)", "k": 4, "var": var, "nll": nll,
        "params": {"omega": w, "alpha": al, "gamma": ga, "beta": be},
        "persistence": pers,
        "longrun_var": w / (1 - pers) if pers < 1 else None,
        "leverage": ga,   # γ>0 ⇒ choques negativos elevan más la vol
    }


def _fit_egarch(eps, uvar):
    lv0 = math.log(uvar)

    def obj(p):
        w, al, ga, be = p
        if abs(be) >= 0.9999:
            return _BIG
        return _neg_ll(eps, _egarch_filter(eps, w, al, ga, be, lv0))

    x = _best_fit(obj,
                  [[lv0 * 0.05, 0.12, -0.05, 0.95], [lv0 * 0.1, 0.20, -0.10, 0.90],
                   [lv0 * 0.02, 0.08, -0.03, 0.98]],
                  [0.05, 0.05, 0.04, 0.03])
    w, al, ga, be = x
    var = _egarch_filter(eps, w, al, ga, be, lv0)
    nll = _neg_ll(eps, var)
    lr_lnv = w / (1 - be) if abs(be) < 1 else None
    return {
        "name": "EGARCH(1,1)", "k": 4, "var": var, "nll": nll,
        "params": {"omega": w, "alpha": al, "gamma": ga, "beta": be},
        "persistence": abs(be),
        "longrun_var": math.exp(lr_lnv) if lr_lnv is not None else None,
        "leverage": ga,   # γ<0 ⇒ apalancamiento (choques negativos suben la vol)
    }


# --------------------------------------------------------------------------- #
#  Pronóstico multi-paso de la volatilidad (anualizada, en %).
# --------------------------------------------------------------------------- #
def _forecast(model: dict, eps: list[float], horizon: int) -> list[float]:
    p = model["params"]
    last_var = model["var"][-1]
    last_eps = eps[-1]
    out = []

    if model["name"].startswith("GARCH"):
        w, al, be = p["omega"], p["alpha"], p["beta"]
        v = w + al * last_eps ** 2 + be * last_var      # 1 paso
        for h in range(horizon):
            out.append(v)
            v = w + (al + be) * v                        # h≥2 (E[ε²]=σ²); → ω/(1−α−β)
    elif model["name"].startswith("GJR"):
        w, al, ga, be = p["omega"], p["alpha"], p["gamma"], p["beta"]
        ind = 1.0 if last_eps < 0 else 0.0
        v = w + (al + ga * ind) * last_eps ** 2 + be * last_var
        pers = al + be + 0.5 * ga
        for h in range(horizon):
            out.append(v)
            v = w + pers * v                             # E[I]=0.5
    else:  # EGARCH — pronóstico por simulación corta (ln-recursión)
        import random
        w, al, ga, be = p["omega"], p["alpha"], p["gamma"], p["beta"]
        rng = random.Random(7)
        SIMS = 300
        acc = [0.0] * horizon
        for _ in range(SIMS):
            sig = math.sqrt(model["var"][-1])
            z = last_eps / sig if sig > 1e-12 else 0.0
            lnv = math.log(model["var"][-1])
            for h in range(horizon):
                lnv = w + be * lnv + al * (abs(z) - _SQRT_2_OVER_PI) + ga * z
                lnv = max(-30.0, min(30.0, lnv))
                acc[h] += math.exp(lnv)
                z = rng.gauss(0, 1)
        out = [a / SIMS for a in acc]

    # Convertir varianza diaria (en %²) → vol anualizada (%)
    return [round(math.sqrt(max(v, 0.0)) * _ANNUAL, 2) for v in out]


def _biz_dates(start: date, n: int) -> list[str]:
    out, d = [], start
    while len(out) < n:
        d += timedelta(1)
        if d.weekday() < 5:
            out.append(d.isoformat())
    return out


def _acf_sq(x: list[float], lags: int) -> list[float]:
    """Autocorrelación de x² — evidencia de clustering de volatilidad."""
    sq = [v * v for v in x]
    m = sum(sq) / len(sq)
    den = sum((v - m) ** 2 for v in sq) or 1e-12
    out = []
    for k in range(1, lags + 1):
        num = sum((sq[t] - m) * (sq[t - k] - m) for t in range(k, len(sq)))
        out.append(round(num / den, 4))
    return out


# --------------------------------------------------------------------------- #
#  API pública.
# --------------------------------------------------------------------------- #
def analyze(ticker: str, range_: str = "2y", horizon: int = 21) -> dict:
    """Ajusta los 3 modelos GARCH a `ticker` y devuelve el análisis completo."""
    key = (ticker.upper(), range_, horizon)
    if key in _CACHE:
        return _CACHE[key]

    hist = market.get_history(ticker, range_)
    candles = [c for c in hist["candles"] if c.get("close")]
    prices = [c["close"] for c in candles]
    times = [c["time"] for c in candles]
    if len(prices) < 120:
        raise ValueError(f"Historial insuficiente para {ticker} (≥120 días)")

    try:
        name = market.get_quote(ticker).get("name") or ticker.upper()
    except Exception:
        name = ticker.upper()

    # Retornos log en % (escala estándar para estabilidad numérica del MLE)
    rets = [100.0 * math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    rtimes = times[1:]
    mu = sum(rets) / len(rets)
    eps = [r - mu for r in rets]
    N = len(eps)
    uvar = sum(e * e for e in eps) / N           # varianza incondicional

    # --- Ajustar los tres modelos ---
    models = [_fit_garch(eps, uvar), _fit_egarch(eps, uvar), _fit_gjr(eps, uvar)]
    for m in models:
        ll = -m["nll"] - 0.5 * N * math.log(2 * math.pi)   # LL completa
        m["loglik"] = round(ll, 1)
        m["aic"] = round(2 * m["k"] - 2 * ll, 1)
        m["bic"] = round(m["k"] * math.log(N) - 2 * ll, 1)

    best = min(models, key=lambda m: m["aic"])

    # --- Series para gráficos ---
    # Volatilidad condicional (anualizada %) del mejor modelo.
    cond_vol = [round(math.sqrt(max(v, 0.0)) * _ANNUAL, 2) for v in best["var"]]
    # Volatilidad realizada móvil (ventana 21) anualizada %.
    WIN = 21
    realized = []
    for t in range(N):
        lo = max(0, t - WIN + 1)
        window = eps[lo:t + 1]
        if len(window) < 5:
            realized.append(None)
            continue
        mw = sum(window) / len(window)
        vw = sum((e - mw) ** 2 for e in window) / (len(window) - 1)
        realized.append(round(math.sqrt(vw) * _ANNUAL, 2))

    timeline = [
        {"time": rtimes[t], "cond": cond_vol[t], "realized": realized[t],
         "ret": round(rets[t], 3), "vol": candles[t + 1].get("volume")}
        for t in range(N)
    ]

    # --- Pronóstico ---
    fc_vals = _forecast(best, eps, horizon)
    today = date.today()
    forecast = {
        "dates": _biz_dates(today, horizon),
        "values": fc_vals,
        "horizon": horizon,
    }

    # --- Residuos estandarizados (z) del mejor modelo: distribución/diagnóstico ---
    std_resid = [round(eps[t] / math.sqrt(best["var"][t]), 3)
                 if best["var"][t] > 1e-12 else 0.0 for t in range(N)]

    # Histograma de retornos diarios (%) — 41 bins simétricos.
    lo_b, hi_b = min(rets), max(rets)
    bw = (hi_b - lo_b) / 41 or 1.0
    hist_bins = []
    for i in range(41):
        blo = lo_b + i * bw
        cnt = sum(1 for r in rets if blo <= r < blo + bw)
        hist_bins.append({"mid": round(blo + bw / 2, 3),
                          "count": cnt, "pct": round(cnt / N * 100, 2)})

    # --- Métricas de riesgo (basadas en la vol condicional actual) ---
    cur_sigma_daily = math.sqrt(best["var"][-1])         # % diario
    cur_vol = round(cur_sigma_daily * _ANNUAL, 2)        # % anual
    lr_var = best["longrun_var"]
    lr_vol = round(math.sqrt(lr_var) * _ANNUAL, 2) if lr_var else None
    fc_vol = fc_vals[-1] if fc_vals else None

    # VaR/ES 1 día (normal), en % de pérdida, desde σ condicional actual.
    var95 = round(1.6449 * cur_sigma_daily, 2)
    var99 = round(2.3263 * cur_sigma_daily, 2)
    es95 = round(2.0628 * cur_sigma_daily, 2)            # ES normal 95%

    # Régimen: vol actual vs largo plazo.
    if lr_vol:
        ratio = cur_vol / lr_vol
        if ratio >= 1.35:
            regime, regime_score = "VOLATILIDAD ELEVADA", 2
        elif ratio >= 1.12:
            regime, regime_score = "VOLATILIDAD ALTA", 1
        elif ratio <= 0.74:
            regime, regime_score = "VOLATILIDAD BAJA", -2
        elif ratio <= 0.89:
            regime, regime_score = "VOLATILIDAD MODERADA-BAJA", -1
        else:
            regime, regime_score = "VOLATILIDAD NORMAL", 0
    else:
        ratio, regime, regime_score = None, "INDETERMINADO", 0

    trend = "subiendo" if (fc_vol and fc_vol > cur_vol * 1.02) else \
            "bajando" if (fc_vol and fc_vol < cur_vol * 0.98) else "estable"

    result = {
        "ticker": ticker.upper(),
        "name": name,
        "range": range_,
        "interval": hist.get("interval", "1d"),
        "n_obs": N,
        "current_price": round(prices[-1], 2),
        "best_model": best["name"],
        "timeline": timeline,
        "forecast": forecast,
        "clustering_acf": _acf_sq(eps, 20),
        "histogram": hist_bins,
        "std_resid": std_resid,
        "models": [
            {"name": m["name"], "params": {k: round(v, 5) for k, v in m["params"].items()},
             "loglik": m["loglik"], "aic": m["aic"], "bic": m["bic"],
             "persistence": round(m["persistence"], 4),
             "longrun_vol": round(math.sqrt(m["longrun_var"]) * _ANNUAL, 2)
                            if m["longrun_var"] else None,
             "leverage": round(m["leverage"], 4) if m["leverage"] is not None else None,
             "is_best": m["name"] == best["name"]}
            for m in models
        ],
        "risk": {
            "current_vol": cur_vol,
            "longrun_vol": lr_vol,
            "forecast_vol": fc_vol,
            "persistence": round(best["persistence"], 4),
            "vol_ratio": round(ratio, 2) if ratio else None,
            "var_95": var95, "var_99": var99, "es_95": es95,
            "annual_return": round(mu * 252, 2),
            "regime": regime,
            "regime_score": regime_score,
            "trend": trend,
        },
    }
    _CACHE[key] = result
    return result
