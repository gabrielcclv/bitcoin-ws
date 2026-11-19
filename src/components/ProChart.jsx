import { useMemo, useRef, useState } from 'react';
import {
  catmullRomPath,
  closedBandPath,
  closedRibbon,
  computeBollingerBands,
  computeEMA,
} from '../streamfield/path.js';

const W = 1080;
const H = 540;
const PAD_LEFT = 22;
const PAD_RIGHT = 105; // Reserved for right-hand Y-axis price scale
const PRICE_TOP = 34;
const PRICE_BOTTOM = 415;
const VOL_TOP = 435;
const VOL_BOTTOM = 502;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PRICE_H = PRICE_BOTTOM - PRICE_TOP;
const VOL_H = VOL_BOTTOM - VOL_TOP;

function formatPrice(val) {
  if (val == null || !Number.isFinite(val)) return '—';
  const digits = val >= 1000 ? 2 : val >= 10 ? 2 : 4;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('es-ES', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function ProChart({
  candles,
  currentPrice,
  status,
  chartType,
  showEMA,
  showBollinger,
  showVolume,
  alertPrice,
  onSetAlertPrice,
  activePosition,
}) {
  const svgRef = useRef(null);
  const [hoverState, setHoverState] = useState(null);

  const chartData = useMemo(() => {
    if (!candles || candles.length < 2) return null;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume || 0);

    const ema9 = computeEMA(closes, 9);
    const ema21 = computeEMA(closes, 21);
    const bb = computeBollingerBands(closes, 14, 2);

    const allPriceValues = [...highs, ...lows];
    if (showBollinger) {
      allPriceValues.push(...bb.upper, ...bb.lower);
    }
    if (typeof alertPrice === 'number' && Number.isFinite(alertPrice)) {
      // Include alertPrice if within 3% of current range so it's visible
      const rawMean = closes[closes.length - 1] || 1;
      if (Math.abs(alertPrice - rawMean) / rawMean < 0.025) {
        allPriceValues.push(alertPrice);
      }
    }
    if (activePosition?.entryPrice) {
      const rawMean = closes[closes.length - 1] || 1;
      if (Math.abs(activePosition.entryPrice - rawMean) / rawMean < 0.025) {
        allPriceValues.push(activePosition.entryPrice);
      }
    }

    const rawMin = Math.min(...allPriceValues);
    const rawMax = Math.max(...allPriceValues);
    const pad = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.0004, 1);
    const minPrice = rawMin - pad;
    const maxPrice = rawMax + pad;
    const priceRange = Math.max(maxPrice - minPrice, 0.0001);
    const maxVol = Math.max(...volumes, 0.01);

    const span = Math.max(candles.length - 1, 1);
    const xForIndex = (i) => PAD_LEFT + (i / span) * PLOT_W;
    const yForPrice = (p) => {
      const t = (p - minPrice) / priceRange;
      return PRICE_BOTTOM - Math.max(0, Math.min(1, t)) * PRICE_H;
    };
    const priceForY = (y) => {
      const clampedY = Math.max(PRICE_TOP, Math.min(PRICE_BOTTOM, y));
      const t = (PRICE_BOTTOM - clampedY) / PRICE_H;
      return minPrice + t * priceRange;
    };

    const closePoints = closes.map((p, i) => ({ x: xForIndex(i), y: yForPrice(p) }));
    const ema9Points = ema9.map((p, i) => ({ x: xForIndex(i), y: yForPrice(p) }));
    const ema21Points = ema21.map((p, i) => ({ x: xForIndex(i), y: yForPrice(p) }));
    const bbUpperPoints = bb.upper.map((p, i) => ({ x: xForIndex(i), y: yForPrice(p) }));
    const bbLowerPoints = bb.lower.map((p, i) => ({ x: xForIndex(i), y: yForPrice(p) }));

    const baselinePrice = closes[0];
    const baselineY = yForPrice(baselinePrice);

    return {
      closes,
      volumes,
      ema9,
      ema21,
      bb,
      rawMin: Math.min(...lows),
      rawMax: Math.max(...highs),
      minPrice,
      maxPrice,
      priceRange,
      maxVol,
      xForIndex,
      yForPrice,
      priceForY,
      closePoints,
      strokePath: catmullRomPath(closePoints),
      fillPath: closedRibbon(closePoints, PRICE_BOTTOM),
      ema9Path: catmullRomPath(ema9Points),
      ema21Path: catmullRomPath(ema21Points),
      bbBandPath: closedBandPath(bbUpperPoints, bbLowerPoints),
      bbUpperPath: catmullRomPath(bbUpperPoints),
      bbLowerPath: catmullRomPath(bbLowerPoints),
      baselinePrice,
      baselineY,
      head: closePoints[closePoints.length - 1],
    };
  }, [candles, showBollinger, alertPrice, activePosition]);

  function handleMouseMove(e) {
    if (!svgRef.current || !chartData || !candles.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const relY = ((e.clientY - rect.top) / rect.height) * H;

    if (relX < PAD_LEFT || relX > W - PAD_RIGHT) {
      setHoverState(null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (relX - PAD_LEFT) / PLOT_W));
    const index = Math.round(ratio * (candles.length - 1));
    const snapX = chartData.xForIndex(index);
    const cursorPrice = chartData.priceForY(relY);

    setHoverState({
      index,
      x: snapX,
      y: Math.max(PRICE_TOP, Math.min(PRICE_BOTTOM, relY)),
      cursorPrice,
      candle: candles[index],
      ema9: chartData.ema9[index],
      ema21: chartData.ema21[index],
    });
  }

  function handleChartClick() {
    if (hoverState && onSetAlertPrice) {
      const rounded = Number(hoverState.cursorPrice.toFixed(2));
      onSetAlertPrice(rounded);
    }
  }

  if (!chartData) {
    return <div className="pro-chart-empty">Iniciando motor gráfico WebSocket…</div>;
  }

  const activeCandle = hoverState?.candle ?? candles[candles.length - 1];
  const activeEma9 = hoverState?.ema9 ?? chartData.ema9[chartData.ema9.length - 1];
  const activeEma21 = hoverState?.ema21 ?? chartData.ema21[chartData.ema21.length - 1];
  const isCandleBullish = activeCandle.close >= activeCandle.open;
  const sessionBullish =
    candles[candles.length - 1].close >= candles[0].open;

  const liveY = chartData.yForPrice(currentPrice ?? candles[candles.length - 1].close);
  const alertY =
    typeof alertPrice === 'number' &&
    alertPrice >= chartData.minPrice &&
    alertPrice <= chartData.maxPrice
      ? chartData.yForPrice(alertPrice)
      : null;

  const entryY =
    activePosition?.entryPrice &&
    activePosition.entryPrice >= chartData.minPrice &&
    activePosition.entryPrice <= chartData.maxPrice
      ? chartData.yForPrice(activePosition.entryPrice)
      : null;

  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => {
    const y = PRICE_TOP + r * PRICE_H;
    const val = chartData.maxPrice - r * chartData.priceRange;
    return { y, val };
  });

  const xTickIndices = [
    0,
    Math.floor(candles.length * 0.25),
    Math.floor(candles.length * 0.5),
    Math.floor(candles.length * 0.75),
    candles.length - 1,
  ];

  const candleWidth = Math.max(4, Math.min(14, (PLOT_W / candles.length) * 0.62));

  return (
    <div className="pro-chart-container">
      {/* Floating Top-Left OHLCV & Indicators Legend */}
      <div className="pro-chart-hud">
        <div className="hud-ohlc-row">
          <span className="hud-time">{formatTime(activeCandle.timestamp)}</span>
          <span className="hud-item">
            <em>O</em> {formatPrice(activeCandle.open)}
          </span>
          <span className="hud-item">
            <em>H</em> {formatPrice(activeCandle.high)}
          </span>
          <span className="hud-item">
            <em>L</em> {formatPrice(activeCandle.low)}
          </span>
          <span className={`hud-item ${isCandleBullish ? 'is-bull' : 'is-bear'}`}>
            <em>C</em> {formatPrice(activeCandle.close)}
          </span>
          <span className="hud-item">
            <em>VOL</em> {activeCandle.volume?.toFixed(3)}
          </span>
        </div>
        <div className="hud-indicators-row">
          {showEMA && (
            <>
              <span className="hud-badge hud-badge--ema9">
                EMA(9): ${formatPrice(activeEma9)}
              </span>
              <span className="hud-badge hud-badge--ema21">
                EMA(21): ${formatPrice(activeEma21)}
              </span>
            </>
          )}
          {showBollinger && (
            <span className="hud-badge hud-badge--bb">
              BB(14, 2): ${formatPrice(chartData.bb.lower[hoverState?.index ?? candles.length - 1])} – $
              {formatPrice(chartData.bb.upper[hoverState?.index ?? candles.length - 1])}
            </span>
          )}
          <span className="hud-tip">Haz clic en cualquier punto del gráfico para fijar alerta</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className={`pro-chart-svg ${status === 'live' ? 'is-live' : 'is-paused'}`}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverState(null)}
        onClick={handleChartClick}
        role="img"
        aria-label={`Gráfico profesional de Bitcoin en tiempo real: $${formatPrice(currentPrice)}`}
      >
        <defs>
          {/* Bullish / Dynamic Area Gradient */}
          <linearGradient id="nexus-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={sessionBullish ? '#00f0ff' : '#ff3b69'}
              stopOpacity="0.34"
            />
            <stop
              offset="55%"
              stopColor={sessionBullish ? '#10b981' : '#f43f5e'}
              stopOpacity="0.10"
            />
            <stop offset="100%" stopColor="#06080f" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="nexus-stroke-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor={sessionBullish ? '#00e676' : '#ff3b69'} />
          </linearGradient>

          {/* Baseline Above/Below Clip Paths */}
          <clipPath id="clip-above-baseline">
            <rect x={PAD_LEFT} y={0} width={PLOT_W} height={Math.max(0, chartData.baselineY)} />
          </clipPath>
          <clipPath id="clip-below-baseline">
            <rect
              x={PAD_LEFT}
              y={chartData.baselineY}
              width={PLOT_W}
              height={Math.max(0, PRICE_BOTTOM - chartData.baselineY)}
            />
          </clipPath>

          <linearGradient id="baseline-bull-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00e676" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00e676" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="baseline-bear-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff3b69" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ff3b69" stopOpacity="0.35" />
          </linearGradient>

          {/* Glow Filter for the Main Curve */}
          <filter id="neon-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background Grid Lines & Y-Axis Labels */}
        {yTicks.map(({ y, val }, idx) => (
          <g key={idx}>
            <line
              x1={PAD_LEFT}
              y1={y}
              x2={W - PAD_RIGHT}
              y2={y}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="1"
            />
            <text
              x={W - PAD_RIGHT + 10}
              y={y + 4}
              fill="rgba(148, 163, 184, 0.75)"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="11"
            >
              ${formatPrice(val)}
            </text>
          </g>
        ))}

        {/* Vertical Time Grid Lines & X-Axis Labels */}
        {xTickIndices.map((idx) => {
          const c = candles[idx];
          if (!c) return null;
          const x = chartData.xForIndex(idx);
          return (
            <g key={idx}>
              <line
                x1={x}
                y1={PRICE_TOP}
                x2={x}
                y2={VOL_BOTTOM}
                stroke="rgba(255, 255, 255, 0.04)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={H - 12}
                textAnchor="middle"
                fill="rgba(148, 163, 184, 0.65)"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="10.5"
              >
                {formatTime(c.timestamp)}
              </text>
            </g>
          );
        })}

        {/* Separator between Price Plot and Volume Histogram */}
        <line
          x1={PAD_LEFT}
          y1={VOL_TOP - 8}
          x2={W - PAD_RIGHT}
          y2={VOL_TOP - 8}
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth="1"
        />
        <line
          x1={W - PAD_RIGHT}
          y1={PRICE_TOP}
          x2={W - PAD_RIGHT}
          y2={VOL_BOTTOM}
          stroke="rgba(255, 255, 255, 0.09)"
          strokeWidth="1"
        />

        {/* Bollinger Bands Volatility Cloud */}
        {showBollinger && chartData.bbBandPath && (
          <g>
            <path d={chartData.bbBandPath} fill="rgba(99, 102, 241, 0.09)" />
            <path
              d={chartData.bbUpperPath}
              fill="none"
              stroke="rgba(129, 140, 248, 0.45)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <path
              d={chartData.bbLowerPath}
              fill="none"
              stroke="rgba(129, 140, 248, 0.45)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
          </g>
        )}

        {/* CHART MODE 1: CONTINUUM AREA SPLINE */}
        {chartType === 'area' && (
          <g>
            <path d={chartData.fillPath} fill="url(#nexus-area-fill)" />
            <path
              d={chartData.strokePath}
              fill="none"
              stroke="url(#nexus-stroke-grad)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#neon-glow)"
            />
          </g>
        )}

        {/* CHART MODE 2: OHLC CANDLESTICKS */}
        {chartType === 'candles' && (
          <g>
            {candles.map((c, i) => {
              const x = chartData.xForIndex(i);
              const yOpen = chartData.yForPrice(c.open);
              const yClose = chartData.yForPrice(c.close);
              const yHigh = chartData.yForPrice(c.high);
              const yLow = chartData.yForPrice(c.low);
              const bull = c.close >= c.open;
              const color = bull ? '#00e676' : '#ff3b69';
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

              return (
                <g key={c.timestamp || i}>
                  <line
                    x1={x}
                    y1={yHigh}
                    x2={x}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="1.4"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="1"
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* CHART MODE 3: BASELINE DELTA CHART */}
        {chartType === 'baseline' && (
          <g>
            <line
              x1={PAD_LEFT}
              y1={chartData.baselineY}
              x2={W - PAD_RIGHT}
              y2={chartData.baselineY}
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <g clipPath="url(#clip-above-baseline)">
              <path
                d={closedRibbon(chartData.closePoints, chartData.baselineY)}
                fill="url(#baseline-bull-fill)"
              />
              <path
                d={chartData.strokePath}
                fill="none"
                stroke="#00e676"
                strokeWidth="2.5"
              />
            </g>
            <g clipPath="url(#clip-below-baseline)">
              <path
                d={closedRibbon(chartData.closePoints, chartData.baselineY)}
                fill="url(#baseline-bear-fill)"
              />
              <path
                d={chartData.strokePath}
                fill="none"
                stroke="#ff3b69"
                strokeWidth="2.5"
              />
            </g>
          </g>
        )}

        {/* Technical Overlay: EMA 9 & EMA 21 */}
        {showEMA && (
          <g>
            <path
              d={chartData.ema21Path}
              fill="none"
              stroke="#a855f7"
              strokeWidth="1.6"
              strokeOpacity="0.85"
            />
            <path
              d={chartData.ema9Path}
              fill="none"
              stroke="#00f0ff"
              strokeWidth="1.8"
              strokeOpacity="0.92"
            />
          </g>
        )}

        {/* Volume Histogram Subplot */}
        {showVolume && (
          <g>
            {candles.map((c, i) => {
              const x = chartData.xForIndex(i);
              const bull = c.close >= c.open;
              const barH = Math.max(2, ((c.volume || 0) / chartData.maxVol) * VOL_H);
              return (
                <rect
                  key={`vol-${i}`}
                  x={x - candleWidth / 2}
                  y={VOL_BOTTOM - barH}
                  width={candleWidth}
                  height={barH}
                  fill={bull ? 'rgba(0, 230, 118, 0.35)' : 'rgba(255, 59, 105, 0.35)'}
                  rx="1"
                />
              );
            })}
          </g>
        )}

        {/* Active Paper Position Entry Line */}
        {entryY != null && activePosition && (
          <g>
            <line
              x1={PAD_LEFT}
              y1={entryY}
              x2={W - PAD_RIGHT}
              y2={entryY}
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <rect
              x={PAD_LEFT + 8}
              y={entryY - 11}
              width={175}
              height={20}
              rx="4"
              fill="rgba(14, 165, 233, 0.2)"
              stroke="#38bdf8"
            />
            <text
              x={PAD_LEFT + 16}
              y={entryY + 3}
              fill="#38bdf8"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10.5"
              fontWeight="600"
            >
              {activePosition.side} ENTRY ${formatPrice(activePosition.entryPrice)}
            </text>
          </g>
        )}

        {/* Target Alert Horizontal Line */}
        {alertY != null && (
          <g>
            <line
              x1={PAD_LEFT}
              y1={alertY}
              x2={W - PAD_RIGHT}
              y2={alertY}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <rect
              x={W - PAD_RIGHT + 2}
              y={alertY - 10}
              width={PAD_RIGHT - 4}
              height={20}
              rx="3"
              fill="#f59e0b"
            />
            <text
              x={W - PAD_RIGHT + 8}
              y={alertY + 4}
              fill="#06080f"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10.5"
              fontWeight="700"
            >
              ⚑ ${formatPrice(alertPrice)}
            </text>
          </g>
        )}

        {/* Live Price Horizontal Laser Line & Right-Axis Badge */}
        <g>
          <line
            x1={PAD_LEFT}
            y1={liveY}
            x2={W - PAD_RIGHT}
            y2={liveY}
            stroke={sessionBullish ? 'rgba(0, 230, 118, 0.55)' : 'rgba(255, 59, 105, 0.55)'}
            strokeWidth="1.2"
            strokeDasharray="2 3"
          />
          <rect
            x={W - PAD_RIGHT + 2}
            y={liveY - 11}
            width={PAD_RIGHT - 4}
            height={22}
            rx="4"
            fill={sessionBullish ? '#00e676' : '#ff3b69'}
          />
          <text
            x={W - PAD_RIGHT + 8}
            y={liveY + 4}
            fill="#06080f"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="11"
            fontWeight="700"
          >
            ${formatPrice(currentPrice)}
          </text>
        </g>

        {/* Live Glowing Beacon on the Latest Tick */}
        {chartData.head && (
          <g>
            <circle
              cx={chartData.head.x}
              cy={chartData.head.y}
              r="11"
              fill={sessionBullish ? '#00e676' : '#ff3b69'}
              fillOpacity="0.22"
              className="live-pulse-ring"
            />
            <circle
              cx={chartData.head.x}
              cy={chartData.head.y}
              r="4.5"
              fill="#ffffff"
              stroke={sessionBullish ? '#00e676' : '#ff3b69'}
              strokeWidth="2.5"
            />
          </g>
        )}

        {/* Interactive Crosshair & Inspection Overlay */}
        {hoverState && (
          <g className="crosshair-layer" pointerEvents="none">
            {/* Vertical Crosshair */}
            <line
              x1={hoverState.x}
              y1={PRICE_TOP}
              x2={hoverState.x}
              y2={VOL_BOTTOM}
              stroke="rgba(0, 240, 255, 0.55)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* Horizontal Crosshair */}
            <line
              x1={PAD_LEFT}
              y1={hoverState.y}
              x2={W - PAD_RIGHT}
              y2={hoverState.y}
              stroke="rgba(0, 240, 255, 0.55)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* Snapped Point Highlight */}
            <circle
              cx={hoverState.x}
              cy={chartData.yForPrice(hoverState.candle.close)}
              r="5.5"
              fill="#00f0ff"
              stroke="#06080f"
              strokeWidth="2"
            />
            {/* Cursor Price Pill on Y-Axis */}
            <rect
              x={W - PAD_RIGHT + 2}
              y={hoverState.y - 10}
              width={PAD_RIGHT - 4}
              height={20}
              rx="3"
              fill="#1e293b"
              stroke="#00f0ff"
              strokeWidth="1"
            />
            <text
              x={W - PAD_RIGHT + 8}
              y={hoverState.y + 4}
              fill="#00f0ff"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10.5"
              fontWeight="600"
            >
              ${formatPrice(hoverState.cursorPrice)}
            </text>
            {/* Cursor Time Pill on X-Axis */}
            <rect
              x={Math.max(PAD_LEFT, Math.min(W - PAD_RIGHT - 74, hoverState.x - 37))}
              y={VOL_BOTTOM + 4}
              width={74}
              height={18}
              rx="3"
              fill="#1e293b"
              stroke="#00f0ff"
              strokeWidth="1"
            />
            <text
              x={Math.max(PAD_LEFT + 37, Math.min(W - PAD_RIGHT - 37, hoverState.x))}
              y={VOL_BOTTOM + 16}
              textAnchor="middle"
              fill="#00f0ff"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fontWeight="600"
            >
              {formatTime(hoverState.candle.timestamp)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
