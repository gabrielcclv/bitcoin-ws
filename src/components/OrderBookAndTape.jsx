import { useEffect, useState } from 'react';

function formatPrice(val) {
  if (val == null || !Number.isFinite(val)) return '—';
  const digits = val >= 1000 ? 2 : val >= 10 ? 2 : 4;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function OrderBookAndTape({
  orderBook,
  trades,
  currentPrice,
  priceDirection,
  status,
  lastMessageAt,
  latencyMs,
  ticksPerSec,
  sequence,
  latestFrame,
}) {
  const [bottomTab, setBottomTab] = useState('trades'); // 'trades' | 'telemetry'
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(id);
  }, []);

  const staleMs = lastMessageAt != null ? Math.max(0, now - lastMessageAt) : null;
  const isStale = status === 'live' && staleMs != null && staleMs > 2500;

  const asksReversed = [...(orderBook?.asks?.slice(0, 7) || [])].reverse();
  const bidsTop = orderBook?.bids?.slice(0, 7) || [];
  const maxDepth = orderBook?.maxTotal || 1;
  const buyPct = orderBook?.buyPressurePct ?? 50;
  const sellPct = 100 - buyPct;

  return (
    <aside className="terminal-sidebar" aria-label="Order Book and Live Telemetry">
      {/* SECTION 1: ORDER BOOK L2 DEPTH */}
      <section className="panel-card orderbook-panel">
        <div className="panel-header">
          <span className="panel-title">ORDER BOOK · DEPTH L2</span>
          <span className="panel-sub">100ms WS</span>
        </div>

        {/* Buy / Sell Imbalance Bar */}
        <div className="imbalance-meter">
          <div className="imbalance-labels">
            <span className="text-bull">BIDS {buyPct}%</span>
            <span className="text-bear">{sellPct}% ASKS</span>
          </div>
          <div className="imbalance-track">
            <div className="imbalance-fill-bull" style={{ width: `${buyPct}%` }} />
            <div className="imbalance-fill-bear" style={{ width: `${sellPct}%` }} />
          </div>
        </div>

        <div className="ob-table-head">
          <span>PRECIO (USDT)</span>
          <span>CANT.</span>
          <span>TOTAL</span>
        </div>

        {/* Asks (Sells) */}
        <div className="ob-rows ob-rows--asks">
          {asksReversed.map((ask, idx) => {
            const widthPct = Math.min(100, (ask.total / maxDepth) * 100);
            return (
              <div className="ob-row" key={`ask-${idx}`}>
                <div
                  className="ob-depth-bar ob-depth-bar--ask"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="ob-price text-bear">{formatPrice(ask.price)}</span>
                <span className="ob-qty">{ask.qty.toFixed(4)}</span>
                <span className="ob-total">{ask.total.toFixed(3)}</span>
              </div>
            );
          })}
        </div>

        {/* Mid Spread Divider */}
        <div className={`ob-spread-banner dir-${priceDirection}`}>
          <span className="ob-mid-price">
            ${formatPrice(currentPrice)}{' '}
            {priceDirection === 'up' ? '▲' : priceDirection === 'down' ? '▼' : '•'}
          </span>
          <span className="ob-spread-val">
            Spread: ${orderBook?.spread?.toFixed(2) ?? '0.01'} ({orderBook?.spreadPct ?? 0}%)
          </span>
        </div>

        {/* Bids (Buys) */}
        <div className="ob-rows ob-rows--bids">
          {bidsTop.map((bid, idx) => {
            const widthPct = Math.min(100, (bid.total / maxDepth) * 100);
            return (
              <div className="ob-row" key={`bid-${idx}`}>
                <div
                  className="ob-depth-bar ob-depth-bar--bid"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="ob-price text-bull">{formatPrice(bid.price)}</span>
                <span className="ob-qty">{bid.qty.toFixed(4)}</span>
                <span className="ob-total">{bid.total.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: LIVE TRADES TAPE & UNIT 10 TELEMETRY MEMBRANE */}
      <section className="panel-card tape-panel">
        <div className="panel-tabs">
          <button
            type="button"
            className={`panel-tab ${bottomTab === 'trades' ? 'is-active' : ''}`}
            onClick={() => setBottomTab('trades')}
          >
            LIVE TRADES ({trades.length})
          </button>
          <button
            type="button"
            className={`panel-tab ${bottomTab === 'telemetry' ? 'is-active' : ''}`}
            onClick={() => setBottomTab('telemetry')}
          >
            UNIT 10 JSON (#{sequence})
          </button>
        </div>

        {bottomTab === 'trades' ? (
          <div className="trades-tape-container">
            <div className="ob-table-head">
              <span>PRECIO</span>
              <span>CANT.</span>
              <span>HORA</span>
            </div>
            <div className="trades-list">
              {trades.length === 0 ? (
                <div className="trades-empty">Esperando ejecuciones en vivo…</div>
              ) : (
                trades.slice(0, 14).map((t) => (
                  <div
                    key={t.id}
                    className={`trade-row ${t.isWhale ? 'is-whale' : ''}`}
                    title={`Valor: $${t.usdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                  >
                    <span className={t.side === 'BUY' ? 'text-bull' : 'text-bear'}>
                      {t.side === 'BUY' ? '▲' : '▼'} {formatPrice(t.price)}
                    </span>
                    <span className="trade-qty">
                      {t.qty.toFixed(4)}
                      {t.isWhale && <em className="whale-badge">WHALE</em>}
                    </span>
                    <span className="trade-time">{t.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="telemetry-inspector">
            <dl className="telemetry-grid">
              <div>
                <dt>Lifecycle</dt>
                <dd className="text-cyan">{status.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd className={isStale ? 'text-bear' : 'text-bull'}>
                  {staleMs == null ? '—' : `${isStale ? 'STALE' : 'FRESH'} (${staleMs}ms)`}
                </dd>
              </div>
              <div>
                <dt>Latency / TPS</dt>
                <dd>
                  {latencyMs}ms · {ticksPerSec} ticks/s
                </dd>
              </div>
              <div>
                <dt>Sequence</dt>
                <dd>#{sequence}</dd>
              </div>
            </dl>
            <pre className="telemetry-json" tabIndex={0}>
              {latestFrame
                ? JSON.stringify(latestFrame, null, 2)
                : '{\n  // waiting for WebSocket telemetry frame\n}'}
            </pre>
          </div>
        )}
      </section>
    </aside>
  );
}
