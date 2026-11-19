/**
 * Device & Bitcoin Ticker Contract — FE II Unit 10 Entrega 2 lab.
 *
 * Lesson — Unit 10, Flagship sandbox — Streamfield & Entrega 2 lab contract:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#flagship-sandbox--streamfield
 *
 * Vocabulary: a telemetry *frame* is one JSON message on the wire.
 * `snapshot(sequence)` is the builder name shared with the Python Template —
 * not a Rive AnimaScript Snapshot.
 */
export const DEVICE_ID = 'btc-ticker-01';
export const BASE_PRICE_USD = 92450;

export const REST_BASE_URL = 'http://localhost:8000/v1/devices/lab-01';
export const COMMANDS_URL = 'http://localhost:8000/v1/devices/lab-01/commands';
export const STREAM_URL = 'ws://localhost:8000/v1/devices/lab-01/stream';
export const DELTA_URL = 'ws://127.0.0.1:8001/v1/devices/lab-01/delta';
export const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@ticker';

/**
 * Build one telemetry frame for Bitcoin & device contract v1.
 * Includes both Bitcoin metrics (`priceUsd`, `change24hPct`, `volumeBtc`) and
 * the canonical Unit 10 contract fields (`temperatureC`, `humidityPct`).
 *
 * @param {number} sequence
 */
export function snapshot(sequence) {
  const phase = sequence / 4;
  const wave = Math.sin(phase) * 380 + Math.cos(sequence * 0.85) * 110;
  const priceUsd = Math.round((BASE_PRICE_USD + wave) * 100) / 100;
  const change24hPct = Math.round((2.4 + Math.cos(phase) * 1.6) * 100) / 100;
  const volumeBtc = Math.round((18420 + Math.sin(phase * 0.5) * 650) * 10) / 10;

  // Canonical Unit 10 v1 fields mapped alongside Bitcoin quote
  const temperatureC = Math.round((21 + Math.sin(phase) * 2) * 10) / 10;
  const humidityPct = Math.round((45 + Math.cos(phase) * 5) * 10) / 10;

  return {
    kind: 'snapshot',
    deviceId: DEVICE_ID,
    symbol: 'BTC/USDT',
    online: true,
    readings: {
      priceUsd,
      change24hPct,
      volumeBtc,
      temperatureC,
      humidityPct,
    },
    sequence,
    timestamp: Date.now(),
  };
}
