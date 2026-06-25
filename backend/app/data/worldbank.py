"""
Cliente World Bank — indicadores macro globales (sin key, 100% gratis).

Rol en QuantFlow: la fuente de "estado de la economía" de cada país para la
sección MACRO. Trae el valor más reciente de indicadores fundamentales
(crecimiento PIB, inflación, desempleo) para un conjunto de economías clave.

Sin API key, sin límite estricto. Datos anuales (no minuto a minuto): sirven
para el panorama macro, no para el tick. Degrada a [] si la API falla.
"""
from __future__ import annotations

import requests

_BASE = "https://api.worldbank.org/v2"

# Economías que mueven el mercado global. Código ISO-2 de World Bank.
_COUNTRIES: dict[str, str] = {
    "US": "EE.UU.",
    "CN": "China",
    "XC": "Eurozona",      # Euro area
    "JP": "Japón",
    "GB": "Reino Unido",
    "DE": "Alemania",
    "IN": "India",
    "BR": "Brasil",
    "PE": "Perú",
}

# Indicadores fundamentales: id -> (etiqueta corta, sufijo/unidad).
_INDICATORS: dict[str, tuple[str, str]] = {
    "NY.GDP.MKTP.KD.ZG": ("Crecimiento PIB", "%"),
    "FP.CPI.TOTL.ZG": ("Inflación", "%"),
    "SL.UEM.TOTL.ZS": ("Desempleo", "%"),
}


def available() -> bool:
    return True  # no requiere key


def _latest(country: str, indicator: str) -> dict | None:
    """Valor más reciente no nulo (mrnev=1) de un indicador para un país."""
    url = f"{_BASE}/country/{country}/indicator/{indicator}"
    try:
        r = requests.get(url, params={"format": "json", "mrnev": "1"}, timeout=12)
        r.raise_for_status()
        payload = r.json()
    except Exception:
        return None
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return None
    row = payload[1][0]
    if row.get("value") is None:
        return None
    return {"value": row["value"], "year": row.get("date")}


# Agregados regionales / grupos de ingreso del World Bank. El endpoint
# `country/all` los devuelve mezclados con países reales y, ojo, SÍ traen un
# iso3 (countryiso3code), por lo que `if not iso3` no los descarta. Sus valores
# (World, regiones, grupos de ingreso) sesgan el min/max de la rampa de color del
# globo, así que hay que excluirlos explícitamente por código.
# El indicador `country/all` no incluye el objeto `region` (solo indicator,
# country, countryiso3code, date, value, obs_status, decimal), por lo que no se
# puede filtrar por region.value == "Aggregates"; usamos este set conocido.
_WB_AGGREGATES: frozenset[str] = frozenset({
    "WLD", "EUU", "ECS", "ECA", "EMU", "FCS", "HIC", "HPC", "IBD", "IBT",
    "IDA", "IDB", "IDX", "LCN", "LAC", "LCR", "LDC", "LIC", "LMC", "LMY",
    "LTE", "MIC", "MNA", "MEA", "NAC", "OED", "OSS", "PSS", "PST", "PRE",
    "SAS", "SSA", "SSF", "SST", "UMC", "AFE", "AFW", "ARB", "CEB", "CSS",
    "EAP", "EAR", "EAS", "TEA", "TEC", "TLA", "TMN", "TSA", "TSS", "INX",
})


# Métricas expuestas al mapa mundial: alias -> id de World Bank.
MAP_METRICS: dict[str, tuple[str, str, str]] = {
    # alias: (indicator_id, etiqueta, unidad)
    "gdp": ("NY.GDP.MKTP.KD.ZG", "Crecimiento PIB", "%"),
    "inflation": ("FP.CPI.TOTL.ZG", "Inflación", "%"),
    "unemployment": ("SL.UEM.TOTL.ZS", "Desempleo", "%"),
    "gdp_per_capita": ("NY.GDP.PCAP.CD", "PIB per cápita", "US$"),
}


def world_map(metric: str = "gdp") -> dict:
    """Valor más reciente de un indicador para TODOS los países (para el globo).

    Devuelve {metric, label, unit, values:[{iso3,name,value,year}]}. Una sola
    llamada al World Bank (country/all). Degrada a values=[] si falla.
    """
    metric = metric if metric in MAP_METRICS else "gdp"
    ind_id, label, unit = MAP_METRICS[metric]
    url = f"{_BASE}/country/all/indicator/{ind_id}"
    try:
        r = requests.get(
            url,
            params={"format": "json", "mrnev": "1", "per_page": "400"},
            timeout=20,
        )
        r.raise_for_status()
        payload = r.json()
    except Exception:
        return {"metric": metric, "label": label, "unit": unit, "values": []}
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return {"metric": metric, "label": label, "unit": unit, "values": []}

    values: list[dict] = []
    for row in payload[1]:
        iso3 = row.get("countryiso3code")
        val = row.get("value")
        # Saltar nulos, filas sin iso3 y agregados regionales/grupos de ingreso
        # (que SÍ traen iso3, p. ej. WLD/AFE/EUU/OED/HIC y contaminan el globo).
        if not iso3 or val is None or iso3 in _WB_AGGREGATES:
            continue
        values.append(
            {
                "iso3": iso3,
                "name": (row.get("country") or {}).get("value"),
                "value": round(val, 2),
                "year": row.get("date"),
            }
        )
    return {"metric": metric, "label": label, "unit": unit, "values": values}


def indicators() -> list[dict]:
    """Matriz macro: una fila por país con sus indicadores fundamentales."""
    out: list[dict] = []
    for code, name in _COUNTRIES.items():
        metrics: list[dict] = []
        for ind_id, (label, unit) in _INDICATORS.items():
            data = _latest(code, ind_id)
            metrics.append(
                {
                    "label": label,
                    "unit": unit,
                    "value": round(data["value"], 2) if data else None,
                    "year": data["year"] if data else None,
                }
            )
        out.append({"country": code, "name": name, "metrics": metrics})
    return out
