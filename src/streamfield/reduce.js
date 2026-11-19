/**
 * Fold a WebSocket message into the last full telemetry frame.
 *
 * Lesson — Unit 10, Continuous flow — delta streaming:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#continuous-flow--delta-streaming
 *
 * Rules:
 * 1. A snapshot replaces the frame.
 * 2. A delta is only the fields that changed, so it is meaningful only when we
 *    still hold the previous frame and `sequence === prev.sequence + 1`.
 *    A gap means a patch was lost; inventing missing readings would draw a lie,
 *    so the previous frame stays put (`accepted: false`).
 * 3. External public WebSocket tickers (e.g. Binance `24hrTicker` or `trade`)
 *    are normalized into a valid telemetry snapshot frame.
 */

/**
 * @param {Record<string, unknown> | null} prev Folded frame already on screen.
 * @param {unknown} message Parsed JSON from the socket.
 * @returns {{ frame: Record<string, unknown> | null, accepted: boolean }}
 */
export function applyFrame(prev, message) {
  if (!isRecord(message)) return { frame: prev, accepted: false };

  // Rule 2: Delta stream folding (strict sequence check: sequence === prev.sequence + 1)
  if (message.kind === 'delta') {
    const sequence = message.sequence;
    if (!isRecord(prev) || typeof sequence !== 'number' || sequence !== prev.sequence + 1) {
      return { frame: prev, accepted: false };
    }
    if (message.patch != null && !isRecord(message.patch)) {
      return { frame: prev, accepted: false };
    }
    const patch = isRecord(message.patch) ? message.patch : {};
    const prevReadings = isRecord(prev.readings) ? prev.readings : {};
    return {
      frame: {
        ...prev,
        sequence,
        timestamp: typeof message.timestamp === 'number' ? message.timestamp : prev.timestamp,
        readings: { ...prevReadings, ...patch },
      },
      accepted: true,
    };
  }

  // Rule 1: Snapshot, or a legacy full frame with no kind (MSW and the v1 FastAPI route).
  if (isRecord(message.readings) && typeof message.sequence === 'number') {
    return { frame: message, accepted: true };
  }

  // Rule 3: Public Bitcoin WebSocket adapter (Binance 24hrTicker / trade stream)
  if ((message.e === '24hrTicker' || message.e === 'trade') && message.c != null) {
    const priceUsd = Number(message.c ?? message.p);
    const change24hPct = Number(message.P ?? 0);
    const volumeBtc = Number(message.v ?? message.q ?? 0);
    if (!Number.isFinite(priceUsd)) {
      return { frame: prev, accepted: false };
    }
    const nextSeq = isRecord(prev) && typeof prev.sequence === 'number' ? prev.sequence + 1 : 0;
    const temperatureC = Math.round((21 + Math.max(-3, Math.min(3, change24hPct * 0.6))) * 10) / 10;
    const humidityPct = Math.round((45 + Math.max(-10, Math.min(10, change24hPct * 1.5))) * 10) / 10;

    return {
      frame: {
        kind: 'snapshot',
        deviceId: 'binance-btcusdt',
        symbol: message.s || 'BTCUSDT',
        online: true,
        readings: {
          priceUsd: Math.round(priceUsd * 100) / 100,
          change24hPct: Math.round(change24hPct * 100) / 100,
          volumeBtc: Math.round(volumeBtc * 100) / 100,
          temperatureC,
          humidityPct,
        },
        sequence: nextSeq,
        timestamp: typeof message.E === 'number' ? message.E : Date.now(),
      },
      accepted: true,
    };
  }

  return { frame: prev, accepted: false };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
