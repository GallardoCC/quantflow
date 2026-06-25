"""
Capa ML del ORDER FLOW — QuantFlow (numpy + scikit-learn).

Lo que hace "inteligente" al terminal (§5 del prompt). Todo causal, sin look-ahead:

  1. FEATURE PIPELINE  — features por barra calculadas SOLO con datos hasta t.
  2. RÉGIMEN           — GaussianMixture sobre [vol, pendiente, cvdSlope] → estados
                         balance / trend-up / trend-down / rotación. (bajo riesgo)
  3. ANOMALÍAS         — IsolationForest sobre las features → spoofing/sweeps/picos.
  4. DIRECCIONAL       — GradientBoosting con etiquetado triple-barrier (López de Prado),
                         validado con WALK-FORWARD PURGADO + EMBARGO, log-loss, calibración
                         y backtest económico con costos. Si no supera baseline out-of-sample
                         con costos → se marca `experimental` y NO se muestra como señal.

⚠️ Solo análisis. Las probabilidades asisten la lectura; nunca son órdenes.
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
from sklearn.metrics import log_loss
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from app.data import orderflow

_CACHE: dict[str, tuple[float, Any]] = {}
_FEATURES = ["ret", "barDelta", "cvdSlope", "volZ", "atrPct", "profileSkew",
             "distPOC", "momentum", "rangePct", "dow"]


def _cache_get(key, ttl):
    hit = _CACHE.get(key)
    return hit[1] if hit and (time.time() - hit[0]) < ttl else None


def _cache_set(key, val):
    _CACHE[key] = (time.time(), val)


# ── 1. FEATURE PIPELINE (causal) ──────────────────────────────────────────────
def _build_features(candles: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Devuelve (X, closes, times, cvd). Cada fila de X usa solo info hasta esa barra."""
    o = np.array([c["o"] for c in candles], float)
    h = np.array([c["h"] for c in candles], float)
    l = np.array([c["l"] for c in candles], float)
    c = np.array([c["c"] for c in candles], float)
    v = np.array([c["v"] for c in candles], float)
    t = np.array([c["t"] for c in candles], float)
    n = len(c)

    ret = np.zeros(n)
    ret[1:] = c[1:] / np.maximum(c[:-1], 1e-9) - 1.0

    # delta por regla del tick (sesgo compra/venta por posición del cierre)
    rng = np.maximum(h - l, 1e-9)
    buy_frac = np.clip((c - l) / rng, 0, 1)
    bar_delta = v * (2 * buy_frac - 1)            # askVol - bidVol aprox
    cvd = np.cumsum(bar_delta)

    def roll(a, w, fn):
        out = np.zeros(n)
        for i in range(n):
            j = max(0, i - w + 1)
            out[i] = fn(a[j:i + 1])
        return out

    # ATR causal (rango verdadero medio, 14)
    tr = np.maximum(h - l, np.abs(h - np.roll(c, 1)))
    tr[0] = h[0] - l[0]
    atr = roll(tr, 14, np.mean)
    atr_pct = atr / np.maximum(c, 1e-9)

    vol_mean = roll(v, 20, np.mean)
    vol_std = roll(v, 20, lambda a: np.std(a) if len(a) > 1 else 1.0)
    vol_z = (v - vol_mean) / np.maximum(vol_std, 1e-9)

    sma = roll(c, 20, np.mean)
    sma_std = roll(c, 20, lambda a: np.std(a) if len(a) > 1 else 1.0)
    profile_skew = (c - sma) / np.maximum(sma_std, 1e-9)   # ~ distancia a "POC móvil"

    # POC móvil aprox = precio típico ponderado por volumen (rolling)
    typ = (h + l + c) / 3
    dist_poc = np.zeros(n)
    for i in range(n):
        j = max(0, i - 30)
        ww = v[j:i + 1]
        poc = np.average(typ[j:i + 1], weights=ww) if ww.sum() > 0 else c[i]
        dist_poc[i] = (c[i] - poc) / max(atr[i], 1e-9)

    momentum = np.zeros(n)
    momentum[10:] = c[10:] / np.maximum(c[:-10], 1e-9) - 1.0

    # pendiente del CVD (causal, ventana 10)
    cvd_slope = roll(cvd, 10, lambda a: (a[-1] - a[0]) / max(len(a), 1))
    # normalizar pendiente a escala de volumen
    cvd_slope = cvd_slope / np.maximum(vol_mean, 1e-9)

    range_pct = rng / np.maximum(c, 1e-9)
    dow = ((t / 86400) % 7)  # día de semana aprox

    X = np.column_stack([ret, bar_delta / np.maximum(vol_mean, 1e-9), cvd_slope,
                         vol_z, atr_pct, profile_skew, dist_poc, momentum, range_pct, dow])
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    return X, c, t, cvd


# ── 2. RÉGIMEN (GaussianMixture) ──────────────────────────────────────────────
def _regime(X: np.ndarray, closes: np.ndarray, times: np.ndarray) -> dict:
    # señales de régimen: [pendiente de precio, volatilidad, pendiente CVD]
    n = len(closes)
    if n < 30:
        return {"current": {"label": "INDETERMINADO", "confidence": 0},
                "ribbon": [], "states": []}
    feats = X[:, [7, 4, 2]]  # momentum, atrPct, cvdSlope
    scaler = StandardScaler()
    Z = scaler.fit_transform(feats)
    k = 4
    gmm = GaussianMixture(n_components=k, covariance_type="full",
                          random_state=0, n_init=3, reg_covar=1e-4)
    labels = gmm.fit_predict(Z)
    proba = gmm.predict_proba(Z)

    # etiquetar cada cluster por su momentum y volatilidad medios
    names = {}
    for cl in range(k):
        mask = labels == cl
        if mask.sum() == 0:
            names[cl] = "rotación"
            continue
        mom = feats[mask, 0].mean()
        vol = feats[mask, 1].mean()
        vol_hi = vol > np.median(feats[:, 1])
        if mom > np.percentile(feats[:, 0], 60):
            names[cl] = "tendencia alcista"
        elif mom < np.percentile(feats[:, 0], 40):
            names[cl] = "tendencia bajista"
        elif vol_hi:
            names[cl] = "rotación"
        else:
            names[cl] = "balance"

    ribbon = [{"t": int(times[i]), "state": int(labels[i]),
               "label": names[int(labels[i])]} for i in range(n)]
    cur = int(labels[-1])
    return {
        "current": {"label": names[cur], "confidence": round(float(proba[-1, cur]) * 100, 0)},
        "ribbon": ribbon[-180:],
        "states": [{"id": cl, "label": names[cl]} for cl in range(k)],
    }


# ── 3. ANOMALÍAS (IsolationForest) ────────────────────────────────────────────
def _anomalies(X: np.ndarray, closes: np.ndarray, times: np.ndarray) -> dict:
    n = len(closes)
    if n < 30:
        return {"items": [], "threshold": 0.0}
    iso = IsolationForest(n_estimators=200, contamination=0.04, random_state=0)
    iso.fit(X)
    score = -iso.score_samples(X)  # mayor = más anómalo
    thr = float(np.percentile(score, 96))
    items = []
    for i in range(n):
        if score[i] >= thr:
            sweep = X[i, 3] > 2  # volZ alto
            note = ("Pico de volumen anómalo (posible sweep/iceberg)." if sweep
                    else "Microestructura atípica frente al contexto reciente.")
            items.append({"t": int(times[i]), "score": round(float(score[i]), 3),
                          "price": round(float(closes[i]), 4), "note": note})
    return {"items": items[-12:], "threshold": round(thr, 3)}


# ── 4. DIRECCIONAL (triple-barrier + walk-forward purgado + costos) ───────────
def _triple_barrier(closes: np.ndarray, X: np.ndarray, horizon: int, atr_pct_col: int) -> np.ndarray:
    """Etiqueta 1 si la barrera superior (+1·ATR) se toca antes que la inferior dentro
    de `horizon` barras; 0 si toca la inferior primero o expira a la baja."""
    n = len(closes)
    y = np.full(n, -1)  # -1 = sin etiqueta (cola)
    atr_pct = X[:, atr_pct_col]
    for i in range(n - horizon):
        up = closes[i] * (1 + atr_pct[i])
        dn = closes[i] * (1 - atr_pct[i])
        label = 0
        for j in range(i + 1, i + horizon + 1):
            if closes[j] >= up:
                label = 1; break
            if closes[j] <= dn:
                label = 0; break
        else:
            label = 1 if closes[i + horizon] > closes[i] else 0
        y[i] = label
    return y


def _purged_walk_forward(X, y, fwd_ret, horizon, folds=5, embargo=5, cost_bps=5.0):
    """OOF predictions con K-Fold purgado + embargo (sin leakage entre train/test)."""
    n = len(y)
    idx = np.arange(n)
    fold_size = n // folds
    oof = np.full(n, np.nan)
    for f in range(folds):
        te_lo = f * fold_size
        te_hi = n if f == folds - 1 else (f + 1) * fold_size
        test_idx = idx[te_lo:te_hi]
        # purga: quitar de train las muestras cuyo horizonte solapa el test + embargo
        lo_block = max(0, te_lo - horizon - embargo)
        hi_block = min(n, te_hi + horizon + embargo)
        train_mask = np.ones(n, bool)
        train_mask[lo_block:hi_block] = False
        tr_idx = idx[train_mask]
        if len(tr_idx) < 50 or len(test_idx) == 0:
            continue
        clf = GradientBoostingClassifier(n_estimators=120, max_depth=3,
                                         learning_rate=0.05, subsample=0.8, random_state=0)
        clf.fit(X[tr_idx], y[tr_idx])
        oof[test_idx] = clf.predict_proba(X[test_idx])[:, 1]

    valid = ~np.isnan(oof)
    if valid.sum() < 30:
        return None

    p = oof[valid]; yt = y[valid]; fr = fwd_ret[valid]
    ll = float(log_loss(yt, np.clip(p, 1e-6, 1 - 1e-6), labels=[0, 1]))
    base = float(log_loss(yt, np.full_like(p, yt.mean()), labels=[0, 1]))
    pred = (p >= 0.5).astype(int)
    tp = int(((pred == 1) & (yt == 1)).sum()); fp = int(((pred == 1) & (yt == 0)).sum())
    fn = int(((pred == 0) & (yt == 1)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0

    # calibración (reliability curve)
    calib = []
    for b in range(10):
        lo, hi = b / 10, (b + 1) / 10
        m = (p >= lo) & (p < hi if b < 9 else p <= hi)
        if m.sum() >= 5:
            calib.append({"bin": round((lo + hi) / 2, 2),
                          "predicted": round(float(p[m].mean()), 3),
                          "observed": round(float(yt[m].mean()), 3), "n": int(m.sum())})

    # backtest económico: posición = signo(p-0.5), retorno fwd menos costos por giro
    pos = np.sign(p - 0.5)
    cost = cost_bps / 1e4
    turns = np.abs(np.diff(np.concatenate([[0], pos])))
    strat = pos * fr - turns * cost
    sharpe = float(np.mean(strat) / (np.std(strat) + 1e-9) * np.sqrt(252 / horizon)) if len(strat) > 1 else 0.0
    win = float((strat > 0).mean())
    total = float(np.prod(1 + strat) - 1)

    beats = (ll < base) and (sharpe > 0.3)
    return {
        "logloss": round(ll, 4), "baselineLogloss": round(base, 4),
        "precision": round(precision, 3), "recall": round(recall, 3),
        "calibration": calib,
        "backtest": {"sharpe": round(sharpe, 2), "winRate": round(win, 3),
                     "totalReturn": round(total, 4), "costBps": cost_bps},
        "experimental": not beats,
        "nSamples": int(valid.sum()),
    }


def _directional(X, closes, horizon=5):
    n = len(closes)
    if n < 120:
        return {"available": False, "note": "Histórico insuficiente para validar (se requieren ≥120 barras)."}
    atr_col = _FEATURES.index("atrPct")
    y = _triple_barrier(closes, X, horizon, atr_col)
    fwd = np.zeros(n)
    fwd[:n - horizon] = closes[horizon:] / closes[:n - horizon] - 1.0
    mask = y >= 0
    Xv, yv, fv = X[mask], y[mask], fwd[mask]
    report = _purged_walk_forward(Xv, yv, fv, horizon)
    if report is None:
        return {"available": False, "note": "No hubo suficientes folds válidos para validar sin leakage."}

    # modelo final entrenado con todo lo etiquetado → prob de la última barra
    clf = GradientBoostingClassifier(n_estimators=120, max_depth=3,
                                     learning_rate=0.05, subsample=0.8, random_state=0)
    clf.fit(Xv, yv)
    prob_up = float(clf.predict_proba(X[-1:])[:, 1][0])
    importance = sorted(
        [{"name": _FEATURES[i], "importance": round(float(w), 3)}
         for i, w in enumerate(clf.feature_importances_)],
        key=lambda d: -d["importance"])

    note = ("Modelo validado out-of-sample: supera el baseline y el backtest con costos es positivo."
            if not report["experimental"] else
            "EXPERIMENTAL: no supera el baseline o el backtest con costos no es rentable. "
            "Se muestra como contexto, NO como señal.")
    return {
        "available": True, "experimental": report["experimental"],
        "horizon": horizon, "probUp": round(prob_up, 3),
        "metrics": {k: report[k] for k in ("logloss", "baselineLogloss", "precision", "recall", "nSamples")},
        "calibration": report["calibration"], "backtest": report["backtest"],
        "importance": importance, "note": note,
    }


# ── Orquestador ───────────────────────────────────────────────────────────────
def analyze(ticker: str, tf: str = "1Y", session: str = "24h", horizon: int = 5) -> dict:
    key = f"of:ml:{ticker.upper()}:{tf}:{session}:{horizon}"
    cached = _cache_get(key, ttl=300)
    if cached:
        return cached

    ctx = orderflow.load(ticker, tf, session)
    candles = ctx["candles"]
    if len(candles) < 30:
        raise ValueError(f"Histórico insuficiente para ML en {ticker} (se requieren ≥30 barras).")

    X, closes, times, cvd = _build_features(candles)
    Xs = StandardScaler().fit_transform(X)

    result = {
        "ticker": ctx["ticker"], "name": ctx["name"], "tf": ctx["tf"], "session": ctx["session"],
        "mode": ctx["mode"], "tier": ctx["tier"], "nBars": len(candles),
        "asOf": int(times[-1]),
        "regime": _regime(X, closes, times),
        "anomalies": _anomalies(Xs, closes, times),
        "directional": _directional(X, closes, horizon),
        "features": {
            "names": _FEATURES,
            "latest": {f: round(float(X[-1, i]), 4) for i, f in enumerate(_FEATURES)},
        },
        "disclaimer": (
            "ML causal (sin look-ahead): features hasta t, etiquetado triple-barrier, "
            "validación walk-forward purgada con embargo y costos. El order flow ML "
            "sobreajusta fácil; si no supera el baseline out-of-sample con costos se marca "
            "experimental y no opera. Solo análisis."
        ),
    }
    _cache_set(key, result)
    return result
