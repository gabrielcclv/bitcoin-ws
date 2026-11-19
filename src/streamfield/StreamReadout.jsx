import { useEffect, useState } from 'react';
import { COMMANDS_URL, REST_BASE_URL } from './contract.js';

const STATUS_COPY = {
  idle: 'Idle — stream paused',
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  resync: 'Waiting for a keyframe snapshot',
  offline: 'Offline / bad frame',
};

/**
 * Teaching & Operational Panel for Unit 10 Bitcoin Streamfield.
 * - Connection membrane status (Live / Reconnecting / Stale)
 * - Stream source selector (MSW mock, FastAPI Snapshot, Delta Server, Live Binance WS)
 * - REST Control Panel (`POST /v1/devices/lab-01/commands` & `GET /v1/devices/lab-01`)
 * - Price alert threshold simulator
 * - Latest wire message & folded telemetry frame JSON
 *
 * Lesson — Unit 10, How to read the graphics, in order:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#how-to-read-the-graphics-in-order
 */
export default function StreamReadout({
  data,
  wire,
  wireAccepted,
  status,
  lastMessageAt,
  source,
  onSourceChange,
  streamEnabled,
  onToggleStream,
  alertPrice,
  onAlertPriceChange,
}) {
  const [now, setNow] = useState(lastMessageAt);
  const [targetInput, setTargetInput] = useState(String(alertPrice ?? 92600));
  const [commandLog, setCommandLog] = useState(null);
  const [commandBusy, setCommandBusy] = useState(false);

  useEffect(() => {
    if (lastMessageAt == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lastMessageAt, status]);

  const clock = now ?? lastMessageAt;
  const staleMs = lastMessageAt != null && clock != null ? Math.max(0, clock - lastMessageAt) : null;
  const stale =
    status === 'live' && staleMs != null && staleMs > 2500 ? 'stale risk' : 'fresh';

  const currentPrice = data?.readings?.priceUsd;
  const alertTriggered =
    typeof currentPrice === 'number' &&
    typeof alertPrice === 'number' &&
    currentPrice >= alertPrice;

  const frameJson = data
    ? JSON.stringify(data, null, 2)
    : '{\n  // waiting for the first telemetry frame\n}';
  const wireJson = wire
    ? JSON.stringify(wire, null, 2)
    : '{\n  // waiting for a wire message\n}';

  let wireLabel = '—';
  if (wire) {
    const kind = wire.kind ?? (wire.e ? `binance:${wire.e}` : wireAccepted ? 'snapshot' : 'frame');
    wireLabel = wireAccepted ? `${kind} · folded` : `${kind} · refused (gap)`;
  }

  async function handleSendCommand(cmdType) {
    setCommandBusy(true);
    const numericTarget = Number(targetInput);
    if (cmdType === 'move' && Number.isFinite(numericTarget)) {
      onAlertPriceChange(numericTarget);
    } else if (cmdType === 'stop') {
      onAlertPriceChange(null);
    }

    const payload = {
      command: cmdType,
      target:
        cmdType === 'move' && Number.isFinite(numericTarget)
          ? { alertPriceUsd: numericTarget, x: numericTarget }
          : null,
    };

    try {
      const res = await fetch(COMMANDS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setCommandLog({ ok: res.ok, endpoint: 'POST /commands', response: json });
    } catch (err) {
      setCommandLog({
        ok: false,
        endpoint: 'POST /commands',
        error: `${err instanceof Error ? err.message : String(err)} (Local alert updated in UI)`,
        fallbackPayload: payload,
      });
    } finally {
      setCommandBusy(false);
    }
  }

  async function handleFetchRestSnapshot() {
    setCommandBusy(true);
    try {
      const res = await fetch(REST_BASE_URL);
      const json = await res.json();
      setCommandLog({ ok: res.ok, endpoint: 'GET /v1/devices/lab-01', response: json });
    } catch (err) {
      setCommandLog({
        ok: false,
        endpoint: 'GET /v1/devices/lab-01',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCommandBusy(false);
    }
  }

  return (
    <aside className="readout stream-readout" aria-live="polite">
      <div className="readout-header">
        <h1>Unit 10 — Bitcoin Streamfield</h1>
        <button
          type="button"
          className={`btn-toggle ${streamEnabled ? 'is-active' : 'is-paused'}`}
          onClick={() => onToggleStream(!streamEnabled)}
          title="Studio test: pause or disconnect the socket to verify close() and stale status"
        >
          {streamEnabled ? 'Disconnect Socket' : 'Connect Socket'}
        </button>
      </div>

      <p className="meta">
        Operational membrane between live Bitcoin WebSocket streams and human decisions. Read the
        JSON frame first, then the SVG Continuum and RIS polar radar.
      </p>

      {/* Bitcoin Hero Quote Card */}
      <div className={`btc-quote-card ${alertTriggered ? 'is-alert' : ''}`}>
        <div className="btc-quote-top">
          <span className="btc-symbol">{data?.symbol ?? 'BTC/USDT'}</span>
          <span className={`stream-pill stream-pill--${status}`}>{STATUS_COPY[status]}</span>
        </div>
        <div className="btc-price">
          {currentPrice != null
            ? `$${currentPrice.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : '—'}
        </div>
        <div className="btc-submetrics">
          <span>
            24h:{' '}
            <strong
              className={
                (data?.readings?.change24hPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'
              }
            >
              {data?.readings?.change24hPct != null
                ? `${data.readings.change24hPct >= 0 ? '+' : ''}${data.readings.change24hPct}%`
                : '—'}
            </strong>
          </span>
          <span>
            Vol:{' '}
            <strong>
              {data?.readings?.volumeBtc != null
                ? `${Number(data.readings.volumeBtc).toLocaleString('en-US')} BTC`
                : '—'}
            </strong>
          </span>
        </div>
        {alertTriggered ? (
          <div className="btc-alert-badge" role="status">
            Alert Triggered: BTC &ge; ${alertPrice?.toLocaleString('en-US')}
          </div>
        ) : null}
      </div>

      {/* Stream Source Selector */}
      <fieldset className="switch">
        <legend>Stream source (WebSocket transport)</legend>
        <label>
          <input
            type="radio"
            name="stream-source"
            checked={source === 'msw'}
            onChange={() => onSourceChange('msw')}
          />
          MSW Mock (browser Service Worker · 1s snapshots)
        </label>
        <label>
          <input
            type="radio"
            name="stream-source"
            checked={source === 'binance'}
            onChange={() => onSourceChange('binance')}
          />
          Binance Live Public WS (wss://…btcusdt@ticker)
        </label>
        <label>
          <input
            type="radio"
            name="stream-source"
            checked={source === 'live'}
            onChange={() => onSourceChange('live')}
          />
          FastAPI Template v1 (ws://localhost:8000/…/stream)
        </label>
        <label>
          <input
            type="radio"
            name="stream-source"
            checked={source === 'delta'}
            onChange={() => onSourceChange('delta')}
          />
          Delta Server (ws://127.0.0.1:8001/…/delta · fold patches)
        </label>
      </fieldset>

      {/* Telemetry Measures */}
      <dl className="measure">
        <dt>Freshness</dt>
        <dd className={stale === 'stale risk' ? 'text-warning' : ''}>
          {staleMs == null ? '—' : `${stale} (${staleMs} ms ago)`}
        </dd>
        <dt>deviceId</dt>
        <dd>{data?.deviceId ?? '—'}</dd>
        <dt>priceUsd / temperatureC</dt>
        <dd>
          {currentPrice != null ? `$${currentPrice}` : '—'} /{' '}
          {data?.readings?.temperatureC ?? '—'} °C
          <span className="stream-hint"> → Continuum Y height · RIS polar radius</span>
        </dd>
        <dt>change24hPct / humidityPct</dt>
        <dd>
          {data?.readings?.change24hPct ?? '—'}% / {data?.readings?.humidityPct ?? '—'}%
          <span className="stream-hint"> → RIS ring opacity · Continuum label</span>
        </dd>
        <dt>sequence</dt>
        <dd>
          {data?.sequence ?? '—'}
          <span className="stream-hint"> → RIS ripple phase · monotonic frame order</span>
        </dd>
        <dt>Wire status</dt>
        <dd>{wireLabel}</dd>
      </dl>

      {/* REST Control Panel & Alert Simulator (DeviceCommand contract) */}
      <fieldset className="switch control-box">
        <legend>Control Panel — REST Commands &amp; Price Target</legend>
        <p className="meta">
          Sends one-shot REST calls (<code>POST /v1/devices/lab-01/commands</code>) with{' '}
          <code>{`{ command: "move" | "stop", target }`}</code> and draws the threshold on the SVG.
        </p>
        <div className="control-row">
          <label htmlFor="target-price-input" className="visually-hidden">
            Target Alert Price (USD)
          </label>
          <input
            id="target-price-input"
            type="number"
            step="50"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="Target USD"
            className="control-input"
          />
          <button
            type="button"
            disabled={commandBusy}
            onClick={() => handleSendCommand('move')}
            className="btn-action"
          >
            Set Target (move)
          </button>
          <button
            type="button"
            disabled={commandBusy}
            onClick={() => handleSendCommand('stop')}
            className="btn-action btn-secondary"
          >
            Clear (stop)
          </button>
        </div>
        <div className="control-row" style={{ marginTop: '6px' }}>
          <button
            type="button"
            disabled={commandBusy}
            onClick={handleFetchRestSnapshot}
            className="btn-action btn-secondary"
            style={{ width: '100%' }}
          >
            One-shot REST Poll (GET /v1/devices/lab-01)
          </button>
        </div>
        {commandLog ? (
          <pre className="stream-frame-json control-log" tabIndex={0}>
            {JSON.stringify(commandLog, null, 2)}
          </pre>
        ) : null}
      </fieldset>

      {source === 'delta' || source === 'binance' ? (
        <>
          <h2 className="stream-subhead">Latest wire message (raw socket payload)</h2>
          <p className="meta">
            {source === 'delta' ? (
              <>
                What the socket just sent. A <code>delta</code> names only the fields that moved. A
                refused row means the sequence skipped; the folded frame below stays on the last
                good snapshot.
              </>
            ) : (
              <>
                Raw payload from Binance WebSocket before <code>applyFrame</code> normalizes it into
                the Unit 10 telemetry contract.
              </>
            )}
          </p>
          <pre className="stream-frame-json" tabIndex={0}>
            {wireJson}
          </pre>
        </>
      ) : null}

      <h2 className="stream-subhead">
        {source === 'delta' ? 'Folded telemetry frame' : 'Latest telemetry frame'}
      </h2>
      <p className="meta">
        {source === 'delta' ? (
          <>
            The graphics read this object. <code>applyFrame</code> in <code>reduce.js</code> writes
            the patch onto the previous readings. Held fields stay put until a patch names them.
          </>
        ) : (
          <>
            Built by <code>snapshot(sequence)</code> in <code>contract.js</code> / FastAPI. One
            message on the wire — not a Rive <code>Snapshot</code>.
          </>
        )}
      </p>
      <pre className="stream-frame-json" tabIndex={0}>
        {frameJson}
      </pre>

      <h2 className="stream-subhead">How to read the graphics (in order)</h2>
      <ol className="stream-howto">
        <li>
          <strong>Latest frame (JSON)</strong>: verify what arrived on the wire and how{' '}
          <code>applyFrame</code> folded it.
        </li>
        <li>
          <strong>Continuum (ribbon)</strong>: Bitcoin price across the 48-frame history ring;
          flowing dash = live channel; dashed gap = reconnecting.
        </li>
        <li>
          <strong>RIS (polar radar)</strong>: same history ring in polar coordinates — radius from
          BTC price, ring opacity from 24h change / humidity, ripple from sequence.
        </li>
      </ol>
    </aside>
  );
}
