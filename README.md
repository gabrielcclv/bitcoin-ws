# Unit 10 · Bitcoin WebSocket Streamfield & Python-Backed Interface

Aplicación React construida siguiendo la lección **[Unit 10: IoT/Robotics Control-Panel & Python-Backed Interface](https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/)** de **WEB ATELIER (UDIT)** para pintar y monitorizar la cotización de **Bitcoin (BTC/USDT)** en tiempo real mediante **WebSockets**.

## Mapa de archivos (Arquitectura Streamfield de la Unidad 10)

| Archivo | Responsabilidad |
| --- | --- |
| `src/streamfield/contract.js` | Define `STREAM_URL`, `DELTA_URL`, `BINANCE_WS_URL`, `COMMANDS_URL` y el constructor de frames `snapshot(sequence)`. |
| `src/streamfield/useDeviceStream.js` | Ciclo de vida completo del WebSocket (`onopen`, `onmessage`, reconexión con *exponential backoff*, y `socket.close()` en el cleanup de `useEffect`) + anillo de historial de 48 lecturas (`HISTORY = 48`). |
| `src/streamfield/reduce.js` | Función pura `applyFrame(prev, message)`: reemplaza en `snapshot`, pliega parches en `delta` solo cuando `sequence === prev.sequence + 1` (rechaza huecos para no inventar datos) y normaliza el ticker en vivo de Binance (`24hrTicker`). |
| `src/streamfield/handlers.js` | Mock WebSocket con MSW (`ws.link(STREAM_URL)`) que emite un snapshot cada segundo en el navegador + mocks REST (`GET` y `POST /commands`). |
| `src/streamfield/browser.js` | Arranca y detiene el Service Worker de MSW al alternar entre fuentes mock y conexiones reales. |
| `src/streamfield/StreamContinuum.jsx` | Gráfica SVG en dominio temporal (curva suave Catmull–Rom con flujo CSS `stroke-dashoffset` cuando el canal está `live` y línea discontinua cuando está `reconnecting`), incluyendo la línea de umbral de alerta de precio. |
| `src/streamfield/RisField.jsx` | Vista polar (Radial Interference Spectrogram) del mismo anillo de 48 lecturas: precio BTC → radio polar, variación 24h / humedad → opacidad de anillos, secuencia → onda ripple. |
| `src/streamfield/StreamReadout.jsx` | Membrana de decisión humana: estado (`Live`, `Reconnecting…`, `Waiting for keyframe`, `Offline`), frescura en ms (`fresh` vs `stale risk`), panel de control REST (`move` / `stop`), mensaje crudo del cable (`wire`) y último frame JSON plegado. |
| `server/delta-stream.mjs` | Servidor Node WebSocket (`ws://127.0.0.1:8001/v1/devices/lab-01/delta`) con reloj compartido, *snapshot* al conectar, parches *delta* cada segundo y *keyframe snapshot* cada 8 ticks. |
| `backend/main.py` | Contrato FastAPI Template v1 (`GET /v1/devices/lab-01`, `POST /v1/devices/lab-01/commands`, `WS /v1/devices/lab-01/stream` y `WS /v1/devices/lab-01/delta`). |

## Cómo ejecutar el proyecto

### 1. Frontend React + MSW Mock + Binance Live WS
```bash
npm install
npm run dev
```
Abre `http://localhost:5173`. Por defecto arranca con **MSW Mock** en el navegador y puedes cambiar en cualquier momento al **WebSocket público en vivo de Binance (`wss://stream.binance.com:9443/ws/btcusdt@ticker`)**.

### 2. Servidor de Delta Streaming (`server/delta-stream.mjs`)
En una segunda terminal:
```bash
npm run delta-server
```
Selecciona el radio **Delta Server (ws://127.0.0.1:8001/…/delta)** en la interfaz para ver cómo por el cable viajan únicamente los campos que cambian (`kind: "delta"`, `patch: { priceUsd, temperatureC }`) mientras `applyFrame` mantiene los campos retenidos.

### 3. Backend Python FastAPI (`backend/main.py`)
```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install "fastapi" "uvicorn[standard]"
.venv/bin/uvicorn main:app --reload --port 8000
```
Selecciona el radio **FastAPI Template v1 (ws://localhost:8000/…/stream)** en la interfaz.

### 4. Tests unitarios del Fold (`reduce.test.mjs`)
```bash
npm test
```
