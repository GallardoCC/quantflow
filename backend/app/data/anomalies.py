"""
Anomalías de mercado y test de la Hipótesis de Mercados Eficientes (HME/EMH).

¿Siguen los precios un paseo aleatorio (mercado eficiente en forma débil) o hay
estructura explotable? Batería de contrastes estadísticos clásicos, en Python
puro (math.erf para la normal):

  - Test de razón de varianzas (Lo-MacKinlay 1988), robusto a heterocedasticidad.
  - Autocorrelación de retornos (ACF) con bandas de significancia.
  - Test de rachas (runs test) sobre el signo de los retornos.
  - Estadístico Q de Ljung-Box (autocorrelación conjunta).
  - Anomalías de calendario: efecto día-de-la-semana, efecto mes (enero/“sell in
    May”) y efecto cambio-de-mes (turn-of-month).

Cada test entrega su estadístico, p-valor/veredicto y una lectura en español.
Solo análisis. Sin numpy.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from app.data import market

_CACHE: dict[tuple, dict] = {}
_WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
           "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _ncdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _two_sided_p(z: float) -> float:
    return round(2.0 * (1.0 - _ncdf(abs(z))), 4)


def _variance_ratio(r: list[float], q: int) -> tuple[float, float, float]:
    """VR(q), z robusto a heterocedasticidad y p-valor (Lo-MacKinlay)."""
    n = len(r)
    mu = sum(r) / n
    dev2 = [(x - mu) ** 2 for x in r]
    var1 = sum(dev2) / (n - 1)
    if var1 == 0:
        return 1.0, 0.0, 1.0

    # Varianza de sumas q-periódicas solapadas (estimador insesgado).
    m = q * (n - q + 1) * (1 - q / n)
    s = 0.0
    for t in range(q - 1, n):
        ssum = sum(r[t - j] for j in range(q)) - q * mu
        s += ssum * ssum
    # m ya incluye el factor q ⇒ varq es varianza POR PERIODO (comparable a var1).
    varq = s / m
    vr = varq / var1

    # Estimador robusto de la varianza de VR (heterocedasticidad-consistente).
    denom = sum(dev2) ** 2
    theta = 0.0
    for j in range(1, q):
        num = sum(dev2[t] * dev2[t - j] for t in range(j, n))
        delta = num / denom if denom > 0 else 0.0   # δ_j ~ O(1/T), sin factor extra
        w = 2.0 * (q - j) / q
        theta += w * w * delta
    z = (vr - 1.0) / math.sqrt(theta) if theta > 0 else 0.0
    return round(vr, 3), round(z, 2), _two_sided_p(z)


def _acf(r: list[float], lags: int) -> list[dict]:
    n = len(r)
    mu = sum(r) / n
    dev = [x - mu for x in r]
    den = sum(d * d for d in dev) or 1e-12
    band = 1.96 / math.sqrt(n)
    out = []
    for k in range(1, lags + 1):
        num = sum(dev[t] * dev[t - k] for t in range(k, n))
        rho = num / den
        out.append({"lag": k, "rho": round(rho, 4),
                    "significant": abs(rho) > band})
    return out, round(band, 4)


def _ljung_box(acf: list[dict], n: int, h: int) -> tuple[float, float, bool]:
    q = 0.0
    for a in acf[:h]:
        k = a["lag"]
        q += a["rho"] ** 2 / (n - k)
    q *= n * (n + 2)
    # Crítico chi² al 5% para df=h (tabla; h≈10).
    crit = {5: 11.07, 8: 15.51, 10: 18.31, 12: 21.03}.get(h, 18.31)
    return round(q, 2), crit, q > crit


def _runs_test(r: list[float]) -> dict:
    signs = [1 if x > 0 else -1 for x in r if x != 0]
    n1 = sum(1 for s in signs if s > 0)
    n2 = sum(1 for s in signs if s < 0)
    n = n1 + n2
    if n1 == 0 or n2 == 0:
        return {"runs": 0, "expected": 0, "z": 0.0, "p": 1.0, "random": True}
    runs = 1 + sum(1 for i in range(1, len(signs)) if signs[i] != signs[i - 1])
    mu = 2 * n1 * n2 / n + 1
    var = 2 * n1 * n2 * (2 * n1 * n2 - n) / (n * n * (n - 1))
    z = (runs - mu) / math.sqrt(var) if var > 0 else 0.0
    return {"runs": runs, "expected": round(mu, 1), "z": round(z, 2),
            "p": _two_sided_p(z), "random": abs(z) < 1.96}


def _t_stat(vals: list[float]) -> tuple[float, float, float]:
    """media (%), t-stat vs 0, p-valor."""
    n = len(vals)
    if n < 3:
        return (sum(vals) / n * 100 if n else 0.0), 0.0, 1.0
    m = sum(vals) / n
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / (n - 1))
    se = sd / math.sqrt(n) if sd > 0 else 1e-12
    t = m / se
    return round(m * 100, 4), round(t, 2), _two_sided_p(t)


def analyze(ticker: str, range_: str = "3y") -> dict:
    key = (ticker.upper(), range_)
    if key in _CACHE:
        return _CACHE[key]

    hist = market.get_history(ticker, range_)
    candles = [c for c in hist["candles"] if c.get("close")]
    prices = [c["close"] for c in candles]
    times = [c["time"] for c in candles]
    if len(prices) < 200:
        raise ValueError(f"Historial insuficiente para {ticker} (≥200 días)")

    try:
        name = market.get_quote(ticker).get("name") or ticker.upper()
    except Exception:
        name = ticker.upper()

    r = [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    rdates = [datetime.fromtimestamp(t, tz=timezone.utc) for t in times[1:]]
    n = len(r)

    # 1) Razón de varianzas
    vr_rows = []
    for q in (2, 4, 8, 16):
        vr, z, p = _variance_ratio(r, q)
        vr_rows.append({"q": q, "vr": vr, "z": z, "p": p, "reject": p < 0.05})
    vr_reject = any(x["reject"] for x in vr_rows)

    # 2) ACF
    acf, band = _acf(r, 10)
    acf_sig = sum(1 for a in acf if a["significant"])

    # 3) Ljung-Box
    lb_q, lb_crit, lb_reject = _ljung_box(acf, n, 10)

    # 4) Runs
    runs = _runs_test(r)

    # 5) Día de la semana
    by_wd: dict[int, list[float]] = {i: [] for i in range(5)}
    for ri, d in zip(r, rdates):
        wd = d.weekday()
        if wd < 5:
            by_wd[wd].append(ri)
    dow = []
    for i in range(5):
        mean, t, p = _t_stat(by_wd[i]) if by_wd[i] else (0.0, 0.0, 1.0)
        dow.append({"label": _WEEKDAYS[i], "mean": mean, "t": t, "p": p,
                    "n": len(by_wd[i]), "significant": p < 0.05})
    dow_sig = any(x["significant"] for x in dow)

    # 6) Mes del año
    by_mo: dict[int, list[float]] = {i: [] for i in range(1, 13)}
    for ri, d in zip(r, rdates):
        by_mo[d.month].append(ri)
    moy = []
    for i in range(1, 13):
        mean, t, p = _t_stat(by_mo[i]) if by_mo[i] else (0.0, 0.0, 1.0)
        moy.append({"label": _MONTHS[i - 1], "mean": mean, "t": t, "p": p,
                    "n": len(by_mo[i]), "significant": p < 0.05})
    jan = moy[0]["mean"]
    rest_mo = sum(m["mean"] for m in moy[1:]) / 11

    # 7) Cambio de mes (turn-of-month): últimos 1 + primeros 3 días hábiles del mes.
    tom_ret, rest_ret = [], []
    for idx in range(len(rdates)):
        d = rdates[idx]
        # primeros 3 días del mes
        is_first = d.day <= 4
        # último día hábil: el siguiente registro es de otro mes
        is_last = idx + 1 < len(rdates) and rdates[idx + 1].month != d.month
        (tom_ret if (is_first or is_last) else rest_ret).append(r[idx])
    tom_mean, tom_t, tom_p = _t_stat(tom_ret) if tom_ret else (0.0, 0.0, 1.0)
    rest_mean, _, _ = _t_stat(rest_ret) if rest_ret else (0.0, 0.0, 1.0)

    # --- Puntaje de eficiencia: nº de contrastes que rechazan el paseo aleatorio ---
    rejections = sum([vr_reject, acf_sig > 0, lb_reject, not runs["random"],
                      dow_sig])
    total_tests = 5
    if rejections == 0:
        verdict, score = "MERCADO EFICIENTE", 0
    elif rejections <= 1:
        verdict, score = "MAYORMENTE EFICIENTE", 1
    elif rejections <= 3:
        verdict, score = "DÉBILMENTE INEFICIENTE", 2
    else:
        verdict, score = "INEFICIENTE (ANOMALÍAS DETECTADAS)", 3

    # Sesgo momentum vs reversión por la ACF de corto plazo (lag 1).
    rho1 = acf[0]["rho"]
    bias = ("Momentum (persistencia)" if rho1 > band else
            "Reversión (anti-persistencia)" if rho1 < -band else
            "Sin sesgo claro (compatible con paseo aleatorio)")

    result = {
        "ticker": ticker.upper(), "name": name, "range": range_,
        "n_obs": n, "verdict": verdict, "score": score,
        "rejections": rejections, "total_tests": total_tests,
        "bias": bias,
        "variance_ratio": {"rows": vr_rows, "reject": vr_reject},
        "acf": {"rows": acf, "band": band, "n_significant": acf_sig},
        "ljung_box": {"q": lb_q, "crit": lb_crit, "reject": lb_reject, "h": 10},
        "runs": runs,
        "day_of_week": {"rows": dow, "significant": dow_sig},
        "month_of_year": {"rows": moy, "january": jan, "rest_avg": round(rest_mo, 4),
                          "january_effect": jan > rest_mo * 1.5 and jan > 0},
        "turn_of_month": {"tom_mean": tom_mean, "rest_mean": rest_mean,
                          "t": tom_t, "p": tom_p, "n_tom": len(tom_ret),
                          "effect": tom_mean > rest_mean and tom_p < 0.10},
    }
    _CACHE[key] = result
    return result
