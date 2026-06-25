# Desplegar QuantFlow en la nube (gratis)

Backend → **Render** (free) · Frontend → **Cloudflare Pages** (free).
El código ya está preparado: CORS configurable, puerto dinámico (`$PORT`),
URL de API por variable de entorno y `render.yaml`.

---

## Paso 0 — Subir el repo a GitHub (obligatorio)
Render y Cloudflare despliegan desde GitHub. Desde la raíz del proyecto:

```
git push -u origin main
```

(Si pide login: usuario `GallardoCC` + un Personal Access Token con scope `repo`.)

---

## Paso 1 — Backend en Render
1. Entra a https://render.com y crea cuenta (gratis, puedes usar "Sign in with GitHub").
2. **New → Blueprint** y selecciona el repo `quantflow`. Render detecta `render.yaml`.
3. Cuando pida las variables de entorno, pega tus keys (las de tu `backend/.env`):
   `FMP_API_KEY`, `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY`, `FRED_API_KEY`,
   `ALPACA_API_KEY`, `ALPACA_SECRET`, `ALPACA_BASE_URL`.
   (Deja `FRONTEND_ORIGIN` vacío por ahora; se rellena en el paso 3.)
4. Deploy. Te dará una URL tipo `https://quantflow-api.onrender.com`.
5. Prueba `https://quantflow-api.onrender.com/api/health` → debe responder `{"status":"ok"...}`.

> ⚠️ El plan free se duerme tras ~15 min de inactividad: la primera visita tarda ~30-50s.
> ⚠️ Si yfinance no trae datos (Yahoo bloquea IPs de datacenter), avísame y vemos alternativas.

---

## Paso 2 — Frontend en Cloudflare Pages
1. Entra a https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Selecciona el repo `quantflow`. Configura el build:
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. En **Environment variables** agrega:
   - `VITE_API_BASE` = `https://quantflow-api.onrender.com/api`  (la URL de tu backend + `/api`)
4. Deploy. Te dará una URL fija tipo `https://quantflow.pages.dev`.

---

## Paso 3 — Conectar los dos (CORS)
1. Vuelve a Render → tu servicio → Environment → pon:
   `FRONTEND_ORIGIN` = `https://quantflow.pages.dev`  (tu URL de Pages)
2. Render reinicia solo. Listo: abre `https://quantflow.pages.dev` desde cualquier PC.

---

## Resumen de URLs
- App (lo que compartes): `https://quantflow.pages.dev`
- API: `https://quantflow-api.onrender.com`

Cada `git push` vuelve a desplegar las dos automáticamente.
