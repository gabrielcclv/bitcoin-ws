import { useState } from 'react';
import AnalyticsAndPositionBar from './components/AnalyticsAndPositionBar.jsx';
import OrderBookAndTape from './components/OrderBookAndTape.jsx';
import ProChart from './components/ProChart.jsx';
import useCryptoTerminalStream, { PAIR_DEFAULTS } from './hooks/useCryptoTerminalStream.js';

const SYMBOLS = Object.keys(PAIR_DEFAULTS);
const INTERVALS = [
  { id: '1s', label: '1s (Live Tick)' },
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
];

function formatPrice(val) {
  if (val == null || !Number.isFinite(val)) return '—';
  const digits = val >= 1000 ? 2 : val >= 10 ? 2 : 4;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalState] = useState('1s');
  const [mode, setMode] = useState('live'); // 'live' (Binance WS) | 'simulated' (HF Engine)
  const [streamEnabled, setStreamEnabled] = useState(true);

  // Chart display controls
  const [chartType, setChartType] = useState('area'); // 'area' | 'candles' | 'baseline'
  const [showEMA, setShowEMA] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  // Alerts & Paper Trading state
  const [alertPrice, setAlertPrice] = useState(null);
  const [activePosition, setActivePosition] = useState(null);
  const [realizedPnl, setRealizedPnl] = useState(0);

  const {
    pairMeta,
    candles,
    ticker,
    priceDirection,
    orderBook,
    trades,
    status,
    lastMessageAt,
    latencyMs,
    ticksPerSec,
    sequence,
    latestFrame,
  } = useCryptoTerminalStream({
    symbol,
    interval,
    mode,
    enabled: streamEnabled,
  });

  const currentPrice = ticker.price;
  const isPositive24h = (ticker.change24hPct ?? 0) >= 0;

  function handleSymbolChange(nextSym) {
    setSymbol(nextSym);
    setAlertPrice(null);
    setActivePosition(null);
  }

  function handleClosePosition(pnlUsd) {
    setRealizedPnl((prev) => Number((prev + pnlUsd).toFixed(2)));
    setActivePosition(null);
  }

  return (
    <div className="nexus-terminal">
      {/* TOP INSTITUTIONAL BAR */}
      <header className="nexus-topbar">
        <div className="topbar-left">
          <div className="brand-mark">
            <span className="brand-icon">₿</span>
            <div>
              <span className="brand-name">NEXUS</span>
              <span className="brand-tag">PRO WS</span>
            </div>
          </div>

          {/* Pair Switcher */}
          <div className="pair-selector" role="tablist" aria-label="Selector de criptomoneda">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                className={`pair-pill ${symbol === sym ? 'is-active' : ''}`}
                onClick={() => handleSymbolChange(sym)}
              >
                {PAIR_DEFAULTS[sym].label}
              </button>
            ))}
          </div>

          {/* Hero Live Quote */}
          <div className={`hero-price-box dir-${priceDirection}`}>
            <span className="hero-price-val">${formatPrice(currentPrice)}</span>
            <span className={`hero-price-change ${isPositive24h ? 'text-bull' : 'text-bear'}`}>
              {isPositive24h ? '▲ +' : '▼ '}
              {ticker.change24hPct}%
            </span>
          </div>
        </div>

        {/* 24h Key Market Metrics */}
        <div className="topbar-metrics">
          <div className="metric-cell">
            <span>24H MÁXIMO</span>
            <strong>${formatPrice(ticker.high24h)}</strong>
          </div>
          <div className="metric-cell">
            <span>24H MÍNIMO</span>
            <strong>${formatPrice(ticker.low24h)}</strong>
          </div>
          <div className="metric-cell">
            <span>24H VOL ({symbol.replace('USDT', '')})</span>
            <strong>{ticker.volume24h?.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
          </div>
          <div className="metric-cell">
            <span>THROUGHPUT</span>
            <strong className="text-cyan">
              {ticksPerSec} TPS · {latencyMs}ms
            </strong>
          </div>
        </div>

        {/* WebSocket Source & Connection Lifecycle Controls */}
        <div className="topbar-right">
          <div className="mode-toggle" role="group" aria-label="Fuente de datos WebSocket">
            <button
              type="button"
              className={`mode-btn ${mode === 'live' ? 'is-active' : ''}`}
              onClick={() => setMode('live')}
              title="WebSocket real combinado de Binance (@trade + @ticker + @depth10)"
            >
              Binance Live API
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === 'simulated' ? 'is-active' : ''}`}
              onClick={() => setMode('simulated')}
              title="Motor de alta frecuencia autónomo para demos sin red"
            >
              Turbo Sim
            </button>
          </div>

          <button
            type="button"
            className={`ws-status-pill status-${status}`}
            onClick={() => setStreamEnabled((prev) => !prev)}
            title="Haz clic para pausar o reconectar el socket (Unit 10 lifecycle test)"
          >
            <span className="ws-dot" />
            <span>
              {status === 'live'
                ? 'WS LIVE'
                : status === 'paused'
                  ? 'PAUSED'
                  : 'RECONNECTING…'}
            </span>
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE: CENTERPIECE CHART + RIGHT ORDERBOOK DOCK */}
      <div className="nexus-workspace">
        <main className="nexus-main-stage">
          {/* CHART CONTROL TOOLBAR */}
          <div className="chart-toolbar">
            <div className="toolbar-group">
              <span className="toolbar-label">INTERVALO</span>
              {INTERVALS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`tool-btn ${interval === item.id ? 'is-active' : ''}`}
                  onClick={() => setIntervalState(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="toolbar-group">
              <span className="toolbar-label">MODO GRÁFICO</span>
              <button
                type="button"
                className={`tool-btn ${chartType === 'area' ? 'is-active' : ''}`}
                onClick={() => setChartType('area')}
              >
                ◢ Continuum Spline
              </button>
              <button
                type="button"
                className={`tool-btn ${chartType === 'candles' ? 'is-active' : ''}`}
                onClick={() => setChartType('candles')}
              >
                ╫ Velas OHLC
              </button>
              <button
                type="button"
                className={`tool-btn ${chartType === 'baseline' ? 'is-active' : ''}`}
                onClick={() => setChartType('baseline')}
              >
                ± Baseline Delta
              </button>
            </div>

            <div className="toolbar-group">
              <span className="toolbar-label">INDICADORES</span>
              <button
                type="button"
                className={`tool-btn tool-btn--ind ${showEMA ? 'is-active' : ''}`}
                onClick={() => setShowEMA((v) => !v)}
              >
                EMA 9/21
              </button>
              <button
                type="button"
                className={`tool-btn tool-btn--ind ${showBollinger ? 'is-active' : ''}`}
                onClick={() => setShowBollinger((v) => !v)}
              >
                Bollinger (14,2)
              </button>
              <button
                type="button"
                className={`tool-btn tool-btn--ind ${showVolume ? 'is-active' : ''}`}
                onClick={() => setShowVolume((v) => !v)}
              >
                Volumen
              </button>
            </div>
          </div>

          {/* CENTERPIECE HERO CHART */}
          <ProChart
            candles={candles}
            currentPrice={currentPrice}
            status={status}
            chartType={chartType}
            showEMA={showEMA}
            showBollinger={showBollinger}
            showVolume={showVolume}
            alertPrice={alertPrice}
            onSetAlertPrice={setAlertPrice}
            activePosition={activePosition}
          />

          {/* BOTTOM ANALYTICS, ALERTS & PAPER TRADING DECK */}
          <AnalyticsAndPositionBar
            candles={candles}
            ticker={ticker}
            currentPrice={currentPrice}
            symbolLabel={pairMeta.label}
            alertPrice={alertPrice}
            onSetAlertPrice={setAlertPrice}
            activePosition={activePosition}
            onOpenPosition={setActivePosition}
            onClosePosition={handleClosePosition}
            realizedPnl={realizedPnl}
          />
        </main>

        {/* RIGHT SIDEBAR: ORDER BOOK L2 + LIVE TRADES TAPE + UNIT 10 TELEMETRY */}
        <OrderBookAndTape
          orderBook={orderBook}
          trades={trades}
          currentPrice={currentPrice}
          priceDirection={priceDirection}
          status={status}
          lastMessageAt={lastMessageAt}
          latencyMs={latencyMs}
          ticksPerSec={ticksPerSec}
          sequence={sequence}
          latestFrame={latestFrame}
        />
      </div>
    </div>
  );
}
