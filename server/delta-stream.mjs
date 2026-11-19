#!/usr/bin/env node
/**
 * Continuous-flow Bitcoin delta server for Unit 10 Streamfield.
 *
 * Lesson — Unit 10, Continuous flow — delta streaming:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#continuous-flow--delta-streaming
 *
 * The "Delta server" radio opens ws://127.0.0.1:8001/v1/devices/lab-01/delta.
 * Do not point it at port 8000 — that port is the snapshot FastAPI contract.
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const HOST = '127.0.0.1';
const PORT = 8001;
const SOCKET_PATH = '/v1/devices/lab-01/delta';
const DEVICE_ID = 'btc-ticker-01';
const BASE_PRICE_USD = 92450;
const TICK_MS = 1000;
const KEYFRAME_EVERY = 8;

/**
 * Price & temperature move every tick.
 * 24h change, volume, and humidity are held for four ticks so most deltas carry
 * only `priceUsd` and `temperatureC` — proving how `applyFrame` folds partial patches.
 *
 * @param {number} sequence
 */
function readingsAt(sequence) {
  const phase = sequence / 4;
  const heldStep = Math.floor(sequence / 4);
  const wave = Math.sin(phase) * 380 + Math.cos(sequence * 0.85) * 110;

  return {
    priceUsd: Math.round((BASE_PRICE_USD + wave) * 100) / 100,
    change24hPct: Math.round((2.4 + Math.cos(heldStep) * 1.6) * 100) / 100,
    volumeBtc: Math.round((18420 + Math.sin(heldStep * 0.5) * 650) * 10) / 10,
    temperatureC: Math.round((21 + Math.sin(phase) * 2) * 10) / 10,
    humidityPct: Math.round((45 + Math.cos(heldStep) * 5) * 10) / 10,
  };
}

function snapshotMessage(sequence, readings) {
  return {
    kind: 'snapshot',
    deviceId: DEVICE_ID,
    symbol: 'BTC/USDT',
    online: true,
    readings,
    sequence,
    timestamp: Date.now(),
  };
}

function deltaMessage(sequence, previous, next) {
  const patch = {};
  for (const key of Object.keys(next)) {
    if (next[key] !== previous[key]) {
      patch[key] = next[key];
    }
  }
  return {
    kind: 'delta',
    deviceId: DEVICE_ID,
    sequence,
    timestamp: Date.now(),
    patch,
  };
}

function log(record) {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), service: 'btc-delta-stream', ...record })}\n`,
  );
}

let sequence = 0;
let readings = readingsAt(0);

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`Bitcoin Delta stream WebSocket is at ${SOCKET_PATH}\n`);
});

const wss = new WebSocketServer({ server: httpServer, path: SOCKET_PATH });

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

wss.on('connection', (socket) => {
  log({ event: 'connection', sequence, clients: wss.clients.size });
  send(socket, snapshotMessage(sequence, readings));
  socket.on('close', () => {
    log({ event: 'close', clients: wss.clients.size });
  });
});

const timer = setInterval(() => {
  const previous = readings;
  sequence += 1;
  readings = readingsAt(sequence);
  const message =
    sequence % KEYFRAME_EVERY === 0
      ? snapshotMessage(sequence, readings)
      : deltaMessage(sequence, previous, readings);

  for (const socket of wss.clients) {
    send(socket, message);
  }
}, TICK_MS);

httpServer.on('error', (err) => {
  log({ event: 'error', message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
  log({ event: 'listen', host: HOST, port: PORT, path: SOCKET_PATH });
});

function shutdown() {
  clearInterval(timer);
  wss.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
