import { useEffect, useMemo, useRef } from 'react';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import { catmullRomPath, closedRibbon } from './path.js';

const W = 520;
const H = 140;
const PAD_X = 20;
const PAD_Y = 22;
const BASE_Y = H - PAD_Y;

/**
 * Stream Continuum — time-domain SVG ribbon for Bitcoin price continuity.
 * Lesson — Unit 10, How to read the graphics, in order:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#how-to-read-the-graphics-in-order
 *
 * Pedagogy (SVG master session):
 *   - Inline path owns the reading (inspectable `d`)
 *   - Smooth cubic ribbon = continuous frames, not REST ticks
 *   - `stroke-dashoffset` flow (CSS) = live transport; freeze / gap = reconnect
 */
export default function StreamContinuum({ history, status, data, alertPrice }) {
  const reduced = usePrefersReducedMotion();
  const pathRef = useRef(null);
  const live = status === 'live';
  const reconnecting = status === 'reconnecting' || status === 'connecting';

  const { stroke, fill, head, length, minVal, maxVal, alertY } = useMemo(() => {
    if (!history || history.length < 2) {
      return {
        stroke: '',
        fill: '',
        head: null,
        length: 0,
        minVal: null,
        maxVal: null,
        alertY: null,
      };
    }

    const values = history.map((r) => r.priceUsd ?? r.temperatureC ?? 0);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padRange = Math.max((rawMax - rawMin) * 0.15, 25);
    const min = rawMin - padRange;
    const max = rawMax + padRange;
    const range = Math.max(max - min, 1);

    const span = Math.max(history.length - 1, 1);
    const points = values.map((val, i) => {
      const t = (val - min) / range;
      const clamped = Math.max(0, Math.min(1, t));
      return {
        x: PAD_X + (i / span) * (W - PAD_X * 2),
        y: BASE_Y - clamped * (H - PAD_Y * 2),
      };
    });

    const strokePath = catmullRomPath(points);
    let approx = 0;
    for (let i = 1; i < points.length; i += 1) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      approx += Math.hypot(dx, dy);
    }

    let computedAlertY = null;
    if (typeof alertPrice === 'number' && Number.isFinite(alertPrice)) {
      const tAlert = (alertPrice - min) / range;
      if (tAlert >= -0.05 && tAlert <= 1.05) {
        const clampedAlert = Math.max(0, Math.min(1, tAlert));
        computedAlertY = BASE_Y - clampedAlert * (H - PAD_Y * 2);
      }
    }

    return {
      stroke: strokePath,
      fill: closedRibbon(points, BASE_Y),
      head: points[points.length - 1],
      length: Math.max(approx, 1),
      minVal: rawMin,
      maxVal: rawMax,
      alertY: computedAlertY,
    };
  }, [history, alertPrice]);

  useEffect(() => {
    const node = pathRef.current;
    if (!node || !stroke) return;
    try {
      const measured = node.getTotalLength();
      if (Number.isFinite(measured) && measured > 0) {
        node.style.setProperty('--stream-len', `${measured}`);
      }
    } catch {
      node.style.setProperty('--stream-len', `${length}`);
    }
  }, [stroke, length]);

  const price = data?.readings?.priceUsd;
  const change24h = data?.readings?.change24hPct;
  const label = data
    ? `Stream continuum: Bitcoin price trail through ${history.length} frames, now $${price} USD, status ${status}`
    : `Stream continuum waiting — ${status}`;

  return (
    <svg
      className={`stream-continuum${live ? ' is-live' : ''}${reconnecting ? ' is-gap' : ''}${reduced ? ' is-reduced' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="continuum-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3ecfbf" stopOpacity="0.18" />
          <stop offset="55%" stopColor="#3ecfbf" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#f7931a" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="continuum-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7931a" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#3ecfbf" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="continuum-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0e0c0a" stopOpacity="0.85" />
          <stop offset="18%" stopColor="#0e0c0a" stopOpacity="0" />
          <stop offset="100%" stopColor="#0e0c0a" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="#0e0c0a" />

      {/* Baseline = open channel; broken opacity when reconnecting */}
      <line
        x1={PAD_X}
        y1={BASE_Y}
        x2={W - PAD_X}
        y2={BASE_Y}
        stroke="#f4efe6"
        strokeOpacity={reconnecting ? 0.12 : 0.22}
        strokeWidth="1"
        strokeDasharray={reconnecting ? '4 6' : undefined}
      />

      {/* Target / Alert threshold line */}
      {alertY != null ? (
        <g>
          <line
            x1={PAD_X}
            y1={alertY}
            x2={W - PAD_X}
            y2={alertY}
            stroke="#f7931a"
            strokeOpacity="0.6"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <text
            x={W - PAD_X - 4}
            y={Math.max(24, alertY - 4)}
            textAnchor="end"
            fill="#f7931a"
            fillOpacity="0.85"
            fontFamily="ui-monospace, monospace"
            fontSize="8.5"
          >
            target ${alertPrice.toLocaleString('en-US')}
          </text>
        </g>
      ) : null}

      {fill ? <path d={fill} fill="url(#continuum-fill)" className="stream-continuum__volume" /> : null}

      {stroke ? (
        <path
          ref={pathRef}
          className="stream-continuum__path"
          d={stroke}
          fill="none"
          stroke="url(#continuum-stroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ '--stream-len': length }}
        />
      ) : (
        <text
          x={PAD_X}
          y={H / 2 + 4}
          fill="#f4efe6"
          fillOpacity="0.45"
          fontFamily="ui-monospace, monospace"
          fontSize="11"
        >
          waiting for continuous Bitcoin telemetry frames…
        </text>
      )}

      {/* Past fades — continuity without clutter */}
      <rect width={W} height={H} fill="url(#continuum-fade)" pointerEvents="none" />

      {head ? (
        <g className="stream-continuum__head">
          <circle cx={head.x} cy={head.y} r="6.5" fill="#f7931a" fillOpacity="0.35" />
          <circle cx={head.x} cy={head.y} r="3.2" fill={live ? '#3ecfbf' : '#f7931a'} />
        </g>
      ) : null}

      <text
        x={PAD_X}
        y="14"
        fill="#f4efe6"
        fillOpacity="0.7"
        fontFamily="ui-monospace, monospace"
        fontSize="9.5"
      >
        continuum — BTC/USD price ribbon ({history.length}/48)
        {change24h != null ? ` · 24h ${change24h >= 0 ? '+' : ''}${change24h}%` : ''}
      </text>
      <text
        x={W - PAD_X}
        y="14"
        textAnchor="end"
        fill="#f4efe6"
        fillOpacity="0.45"
        fontFamily="ui-monospace, monospace"
        fontSize="9"
      >
        {minVal != null && maxVal != null
          ? `min $${minVal.toFixed(0)} · max $${maxVal.toFixed(0)}`
          : 'past → now (history ring)'}
      </text>
    </svg>
  );
}
