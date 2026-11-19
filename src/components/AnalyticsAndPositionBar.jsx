import { useEffect, useState } from 'react';
import { computeBollingerBands, computeEMA, computeRSI } from '../streamfield/path.js';

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
}) {
  const [alertInput, setAlertInput] = useState('');

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
    rsi >= 70
      ? 'SOBRECOMPRA'
      : rsi <= 30
        ? 'SOBREVENTA'
        : rsi >= 55
          ? 'IMPULSO ALCISTA'
          : rsi <= 45
            ? 'IMPULSO BAJISTA'
            : 'ZONA NEUTRAL';
  const rsiColorClass =
    rsi >= 70 ? 'text-bear' : rsi <= 30 ? 'text-bull' : rsi >= 52 ? 'text-bull' : 'text-cyan';

  const high24 = ticker.high24h || (currentPrice ? currentPrice * 1.01 : 0);
  const low24 = ticker.low24h || (currentPrice ? currentPrice * 0.99 : 0);
  const range24Pct =
    currentPrice && high24 > low24
      ? Math.max(0, Math.min(100, Math.round(((currentPrice - low24) / (high24 - low24)) * 100)))
      : 50;

  const vwapDiffPct =
    ticker.vwap && currentPrice
      ? (((currentPrice - ticker.vwap) / ticker.vwap) * 100).toFixed(2)
      : '0.00';

  // Calculate Session & Technical Summary for Card 3
  const ema9Arr = computeEMA(closes, 9);
  const ema21Arr = computeEMA(closes, 21);
  const bb = computeBollingerBands(closes, 14, 2);

  const lastEma9 = ema9Arr[ema9Arr.length - 1];
  const lastEma21 = ema21Arr[ema21Arr.length - 1];
  const lastBbUpper = bb.upper[bb.upper.length - 1];
  const lastBbLower = bb.lower[bb.lower.length - 1];

  const isTrendBullish = lastEma9 != null && lastEma21 != null && lastEma9 >= lastEma21;
  const bbWidthPct =
    lastBbUpper && lastBbLower && currentPrice
      ? (((lastBbUpper - lastBbLower) / currentPrice) * 100).toFixed(3)
      : '0.000';

  const alertTriggered =
    typeof alertPrice === 'number' &&
    typeof currentPrice === 'number' &&
    Math.abs(currentPrice - alertPrice) / currentPrice <= 0.0008;

  function handleApplyAlert(e) {
    e.preventDefault();
    const num = parseFloat(alertInput);
    if (Number.isFinite(num) && num > 0) {
      onSetAlertPrice(Number(num.toFixed(2)));
    }
  }

  return (
    <section
      className="bottom-analytics-deck"
      aria-label="Panel Informativo de Indicadores y Métricas en Tiempo Real"
    >
      {/* CARD 1: REAL-TIME TECHNICAL OSCILLATORS */}
      <div className="deck-card">
        <div className="deck-card-header">
          <span className="deck-title">OSCILADORES EN VIVO · {symbolLabel}</span>
          <span className={`deck-badge ${rsiColorClass}`}>
            RSI(14): {rsi.toFixed(1)} · {rsiLabel}
          </span>
        </div>

        <div className="oscillator-bars">
          <div className="osc-row">
            <div className="osc-meta">
              <span>Índice de Fuerza Relativa (RSI 14)</span>
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
              <span>
                Rango 24h (${formatPrice(low24)} – ${formatPrice(high24)})
              </span>
              <strong>{range24Pct}%</strong>
            </div>
            <div className="osc-track">
              <div className="osc-fill osc-fill--range" style={{ width: `${range24Pct}%` }} />
            </div>
          </div>

          <div className="osc-stats-strip">
            <div>
              <span>VWAP 24H</span>
              <strong>${formatPrice(ticker.vwap)}</strong>
            </div>
            <div>
              <span>DESVIACIÓN VWAP</span>
              <strong className={Number(vwapDiffPct) >= 0 ? 'text-bull' : 'text-bear'}>
                {Number(vwapDiffPct) >= 0 ? '+' : ''}
                {vwapDiffPct}%
              </strong>
            </div>
            <div>
              <span>VOLUMEN 24H (USDT)</span>
              <strong>
                {ticker.quoteVolume24h
                  ? `$${(ticker.quoteVolume24h / 1e6).toFixed(1)}M`
                  : '—'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: TENDENCIA TÉCNICA & VOLATILIDAD EN TIEMPO REAL */}
      <div className="deck-card">
        <div className="deck-card-header">
          <span className="deck-title">DIAGNÓSTICO DE TENDENCIA &amp; VOLATILIDAD</span>
          <span className={`deck-badge ${isTrendBullish ? 'text-bull' : 'text-bear'}`}>
            {isTrendBullish ? '▲ CRUCE EMA ALCISTA' : '▼ CRUCE EMA BAJISTA'}
          </span>
        </div>

        <div className="osc-stats-strip" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>
            <span>EMA RÁPIDA (9)</span>
            <strong className="text-cyan">${formatPrice(lastEma9)}</strong>
          </div>
          <div>
            <span>EMA LENTA (21)</span>
            <strong style={{ color: '#a855f7' }}>${formatPrice(lastEma21)}</strong>
          </div>
          <div>
            <span>OPERACIONES 24H</span>
            <strong>
              {ticker.tradesCount24h
                ? ticker.tradesCount24h.toLocaleString('en-US')
                : '—'}
            </strong>
          </div>
        </div>

        <div className="osc-stats-strip">
          <div>
            <span>BANDA BOLLINGER SUP.</span>
            <strong>${formatPrice(lastBbUpper)}</strong>
          </div>
          <div>
            <span>BANDA BOLLINGER INF.</span>
            <strong>${formatPrice(lastBbLower)}</strong>
          </div>
          <div>
            <span>AMPLITUD CANAL BB</span>
            <strong className="text-cyan">{bbWidthPct}%</strong>
          </div>
        </div>
      </div>

      {/* CARD 3: MONITOR DE UMBRAL / ALERTA VISUAL EN EL GRÁFICO */}
      <div className={`deck-card ${alertTriggered ? 'is-alert-active' : ''}`}>
        <div className="deck-card-header">
          <span className="deck-title">MARCADOR DE REFERENCIA EN GRÁFICO</span>
          <span className="deck-badge text-amber">
            {alertPrice ? `⚑ NIVEL: $${formatPrice(alertPrice)}` : 'CLIC EN GRÁFICO'}
          </span>
        </div>

        <form className="alert-form" onSubmit={handleApplyAlert}>
          <div className="alert-input-group">
            <input
              type="number"
              step="any"
              value={alertInput}
              onChange={(e) => setAlertInput(e.target.value)}
              placeholder={
                currentPrice
                  ? `Nivel de referencia (ej. ${Math.round(currentPrice * 1.002)})`
                  : 'Nivel de referencia USD'
              }
              className="pro-input"
            />
            <button type="submit" className="pro-btn pro-btn--amber">
              Trazar Línea
            </button>
          </div>

          {currentPrice && (
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
                  Quitar línea
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
