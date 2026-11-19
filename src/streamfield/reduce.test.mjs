import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFrame } from './reduce.js';
import { snapshot } from './contract.js';

test('applyFrame accepts a valid initial snapshot', () => {
  const frame0 = snapshot(0);
  const res = applyFrame(null, frame0);
  assert.equal(res.accepted, true);
  assert.deepEqual(res.frame, frame0);
});

test('applyFrame folds a sequential delta patch onto previous readings', () => {
  const frame4 = snapshot(4);
  const prevHumidity = frame4.readings.humidityPct;
  const delta5 = {
    kind: 'delta',
    deviceId: 'btc-ticker-01',
    sequence: 5,
    timestamp: 2000,
    patch: {
      priceUsd: 93100.5,
      temperatureC: 21.8,
    },
  };

  const res = applyFrame(frame4, delta5);
  assert.equal(res.accepted, true);
  assert.equal(res.frame.sequence, 5);
  assert.equal(res.frame.readings.priceUsd, 93100.5);
  assert.equal(res.frame.readings.temperatureC, 21.8);
  // Humidity was not in the patch, so it must stay held from sequence 4
  assert.equal(res.frame.readings.humidityPct, prevHumidity);
});

test('applyFrame refuses a delta with a sequence gap and keeps previous frame', () => {
  const frame10 = snapshot(10);
  const delta12 = {
    kind: 'delta',
    deviceId: 'btc-ticker-01',
    sequence: 12,
    timestamp: 3000,
    patch: {
      priceUsd: 94000,
    },
  };

  const res = applyFrame(frame10, delta12);
  assert.equal(res.accepted, false);
  assert.deepEqual(res.frame, frame10);
});

test('applyFrame normalizes a public Binance 24hrTicker payload', () => {
  const binanceMsg = {
    e: '24hrTicker',
    E: 1700000000000,
    s: 'BTCUSDT',
    c: '92580.45000000',
    P: '3.150',
    v: '24150.80000000',
  };

  const res = applyFrame(null, binanceMsg);
  assert.equal(res.accepted, true);
  assert.equal(res.frame.readings.priceUsd, 92580.45);
  assert.equal(res.frame.readings.change24hPct, 3.15);
  assert.equal(res.frame.sequence, 0);
});
