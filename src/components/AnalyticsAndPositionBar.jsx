import { useEffect, useState } from 'react';
import { computeRSI } from '../streamfield/path.js';

function formatPrice(val) {
  if (val == null || !Number.isFinite(val)) return '—';
  const digits = val >= 1000 ? 2 : val >= 10 ? 2 : 4;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function AnalyticsAndPositionBar({
  candles,
  ticker,
  currentPrice,
  symbolLabel,
  alertPrice,
  onSetAlertPrice,
  activePosition,
  onOpenPosition,
  onClosePosition,
  realizedPnl,
}) {
  const [alertInput, setAlertInput] = useState('');
  const [tradeQty, setTradeQty] = useState(1);
  const [leverage, setLeverage] = useState(10);

  useEffect(() => {
    if (alertPrice != null) {
      setAlertInput(String(alertPrice));
    } else {
      setAlertInput('');
    }
  }, [alertPrice]);

  const closes = candles.map((c) => c.close);
  const rsi = computeRSI(closes, 14);
  const rsiLabel =
    rsi >= 70 ? 'SOBRECOMPRA' : rsi <= 30 ? 'SOBREVENTA' : rsi >= 55 ? 'ALCISTA' : rsi <= 45 ? 'BAJISTA' : 'NEUTRAL';
  const rsiColorClass =
    rsi >= 70 ? 'text-bear' : rsi <= 30 ? 'text-bull' : rsi >= 52 ? 'text-bull' : 'text-cyan';

  const high24 = ticker.high24h || currentPrice * 1.02;
  const low24 = ticker.low24h || currentPrice * 0.98;
  const range24Pct = Math.max(
    0,
    Math.min(100, Math.round(((currentPrice - low24) / Math.max(high24 - low24, 0.01)) * 100)),
  );

  const vwapDiffPct = ticker.vwap
    ? (((currentPrice - ticker.vwap) / ticker.vwap) * 100).toFixed(2)
    : '0.00';

  // Calculate live Unrealized PnL if a simulated position is open
  let unrealizedUsd = 0;
  let unrealizedPct = 0;
  if (activePosition && currentPrice) {
    const dir = activePosition.side === 'LONG' ? 1 : -1;
    const priceDiff = (currentPrice - activePosition.entryPrice) * dir;
    unrealizedUsd = priceDiff * activePosition.qty * activePosition.leverage;
    const margin = (activePosition.entryPrice * activePosition.qty) / 1;
    unrealizedPct = margin > 0 ? (unrealizedUsd / margin) * 100 : 0;
  }

  const alertTriggered =
    typeof alertPrice === 'number' &&
    typeof currentPrice === 'number' &&
    Math.abs(currentPrice - alertPrice) / currentPrice <= 0.0006;

  function handleApplyAlert(e) {
    e.preventDefault();
    const num = parseFloat(alertInput);
    if (Number.isFinite(num) && num > 0) {
      onSetAlertPrice(Number(num.toFixed(2)));
    }
  }

  return (
    <section className="bottom-analytics-deck" aria-label="Technical Indicators and Trading Simulator">
      {/* CARD 1: REAL-TIME TECHNICAL OSCILLATORS */}
      <div className="deck-card">
        <div className="deck-card-header">
          <span className="deck-title">TECHNICAL PULSE · {symbolLabel}</span>
          <span className={`deck-badge ${rsiColorClass}`}>
            RSI(14): {rsi.toFixed(1)} · {rsiLabel}
          </span>
        </div>

        <div className="oscillator-bars">
          <div className="osc-row">
            <div className="osc-meta">
              <span>RSI Momentum (14)</span>
              <strong className={rsiColorClass}>{rsi.toFixed(1)} / 100</strong>
            </div>
            <div className="osc-track">
              <div
                className="osc-fill osc-fill--rsi"
                style={{ width: `${Math.max(4, Math.min(100, rsi))}%` }}
              />
            </div>
          </div>

          <div className="osc-row">
            <div className="osc-meta">
              <span>Posición Rango 24h (${formatPrice(low24)} – ${formatPrice(high24)})</span>
              <strong>{range24Pct}%</strong>
            </div>
            <div className="osc-track">
              <div
                className="osc-fill osc-fill--range"
                style={{ width: `${range24Pct}%` }}
              />
            </div>
          </div>

          <div className="osc-stats-strip">
            <div>
              <span>VWAP 24H</span>
              <strong>${formatPrice(ticker.vwap)}</strong>
            </div>
            <div>
              <span>DIST. VWAP</span>
              <strong className={Number(vwapDiffPct) >= 0 ? 'text-bull' : 'text-bear'}>
                {Number(vwapDiffPct) >= 0 ? '+' : ''}
                {vwapDiffPct}%
              </strong>
            </div>
            <div>
              <span>VOLUMEN 24H</span>
              <strong>${(ticker.quoteVolume24h / 1e6).toFixed(1)}M</strong>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: SMART PRICE TARGET & CHART CLICK ALERT */}
      <div className={`deck-card ${alertTriggered ? 'is-alert-active' : ''}`}>
        <div className="deck-card-header">
          <span className="deck-title">SMART PRICE ALERT · TRIGGER</span>
          <span className="deck-badge text-amber">
            {alertPrice ? `⚑ ACTIVA: $${formatPrice(alertPrice)}` : 'SIN ALERTA'}
          </span>
        </div>

        <form className="alert-form" onSubmit={handleApplyAlert}>
          <div className="alert-input-group">
            <input
              type="number"
              step="any"
              value={alertInput}
              onChange={(e) => setAlertInput(e.target.value)}
              placeholder={`Precio objetivo (ej. ${Math.round(currentPrice * 1.002)})`}
              className="pro-input"
            />
            <button type="submit" className="pro-btn pro-btn--amber">
              Fijar
            </button>
          </div>

          <div className="alert-quick-btns">
            <button
              type="button"
              className="chip-btn"
              onClick={() => onSetAlertPrice(Number((currentPrice * 1.0015).toFixed(2)))}
            >
              +0.15% (${formatPrice(currentPrice * 1.0015)})
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => onSetAlertPrice(Number((currentPrice * 0.9985).toFixed(2)))}
            >
              -0.15% (${formatPrice(currentPrice * 0.9985)})
            </button>
            {alertPrice && (
              <button
                type="button"
                className="chip-btn chip-btn--clear"
                onClick={() => onSetAlertPrice(null)}
              >
                Limpiar
              </button>
            )}
          </div>
        </form>
      </div>

      {/* CARD 3: LIVE PAPER TRADING & PNL EXECUTION SIMULATOR */}
      <div className="deck-card">
        <div className="deck-card-header">
          <span className="deck-title">LIVE EXECUTION SIMULATOR</span>
          <span className={`deck-badge ${realizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
             Balance PnL: {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
          </span>
        </div>

        {!activePosition ? (
          <div className="trade-exec-box">
            <div className="trade-params-row">
              <label className="param-field">
                <span>CANTIDAD</span>
                <select
                  value={tradeQty}
                  onChange={(e) => setTradeQty(Number(e.target.value))}
                  className="pro-select"
                >
                  <option value={0.25}>0.25 unidades</option>
                  <option value={1}>1.00 unidad</option>
                  <option value={2.5}>2.50 unidades</option>
                  <option value={5}>5.00 unidades</option>
                </select>
              </label>
              <label className="param-field">
                <span>APALANCAMIENTO</span>
                <select
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="pro-select"
                >
                  <option value={1}>1x Spot</option>
                  <option value={5}>5x Margin</option>
                  <option value={10}>10x Pro</option>
                  <option value={25}>25x Turbo</option>
                </select>
              </label>
            </div>

            <div className="trade-action-btns">
              <button
                type="button"
                className="pro-btn pro-btn--bull"
                onClick={() =>
                  onOpenPosition({
                    side: 'LONG',
                    entryPrice: currentPrice,
                    qty: tradeQty,
                    leverage,
                    openedAt: Date.now(),
                  })
                }
              >
                ▲ LONG / BUY
              </button>
              <button
                type="button"
                className="pro-btn pro-btn--bear"
                onClick={() =>
                  onOpenPosition({
                    side: 'SHORT',
                    entryPrice: currentPrice,
                    qty: tradeQty,
                    leverage,
                    openedAt: Date.now(),
                  })
                }
              >
                ▼ SHORT / SELL
              </button>
            </div>
          </div>
        ) : (
          <div className="active-position-box">
            <div className="pos-summary">
              <div>
                <span
                  className={`pos-side-badge ${
                    activePosition.side === 'LONG' ? 'is-bull' : 'is-bear'
                  }`}
                >
                  {activePosition.side} {activePosition.leverage}x
                </span>
                <span className="pos-entry">
                  Entrada: <strong>${formatPrice(activePosition.entryPrice)}</strong> ({activePosition.qty} u.)
                </span>
              </div>
              <div className={`pos-pnl ${unrealizedUsd >= 0 ? 'text-bull' : 'text-bear'}`}>
                <strong>
                  {unrealizedUsd >= 0 ? '+' : ''}${unrealizedUsd.toFixed(2)}
                </strong>
                <span>
                  ({unrealizedPct >= 0 ? '+' : ''}
                  {unrealizedPct.toFixed(2)}%)
                </span>
              </div>
            </div>
            <button
              type="button"
              className="pro-btn pro-btn--close"
              onClick={() => onClosePosition(unrealizedUsd)}
            >
              Cerrar Posición a Mercado (${formatPrice(currentPrice)})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
