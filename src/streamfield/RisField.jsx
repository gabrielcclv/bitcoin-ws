import { useEffect, useMemo, useState } from 'react';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import { catmullRomPath } from './path.js';

const CX = 200;
const CY = 200;
const HISTORY_SPAN = 48;

/**
 * RIS — Radial Interference Spectrogram for Bitcoin Telemetry.
 * Inline SVG owns the operational reading (accessible, inspectable paths).
 * BTC Price → polar radius; 24h change / humidity → ring opacity; sequence → ripple phase.
 *
 * Lesson — Unit 10, How to read the graphics, in order:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#how-to-read-the-graphics-in-order
 */
export default function RisField({ data, status, history, reducedMotion }) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    if (reduced || status !== 'live') return undefined;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      setSweep(((now - start) / 40) % 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, status]);

  const trail = useMemo(() => {
    if (!history || history.length < 2) return '';
    const values = history.map((r) => r.priceUsd ?? r.temperatureC ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spanVal = Math.max(max - min, 20);

    const points = values.map((val, i) => {
      const angle = (i / HISTORY_SPAN) * Math.PI * 2 - Math.PI / 2;
      const t = (val - min) / spanVal;
      const radius = 52 + Math.max(0, Math.min(1, t)) * 108;
      return {
        x: CX + Math.cos(angle) * radius,
        y: CY + Math.sin(angle) * radius,
      };
    });
    return catmullRomPath(points);
  }, [history]);

  const humidity = data?.readings?.humidityPct ?? 45;
  const ringOpacity = Math.max(0.12, Math.min(0.65, 0.18 + ((humidity - 40) / 20) * 0.35));
  const sequence = data?.sequence ?? 0;
  const ripple = 70 + (sequence % 12) * 8;
  const live = status === 'live';
  const price = data?.readings?.priceUsd;

  return (
    <svg
      className="ris-field"
      viewBox="0 0 400 400"
      role="img"
      aria-label={
        data
          ? `Radial spectrogram: Bitcoin $${price} USD, 24h change ${data.readings.change24hPct}%, sequence ${data.sequence}`
          : `Radial spectrogram waiting — connection ${status}`
      }
    >
      <defs>
        <radialGradient id="ris-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3ecfbf" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#f7931a" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#161411" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ris-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3ecfbf" stopOpacity="0" />
          <stop offset="70%" stopColor="#3ecfbf" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f7931a" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      <rect width="400" height="400" fill="#0e0c0a" />
      <circle cx={CX} cy={CY} r="180" fill="url(#ris-glow)" />

      {[60, 100, 140, 180].map((r) => (
        <circle
          key={r}
          cx={CX}
          cy={CY}
          r={r}
          fill="none"
          stroke="#f4efe6"
          strokeOpacity={ringOpacity}
          strokeWidth="1"
        />
      ))}

      {[0, 90, 180, 270].map((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x2 = CX + Math.cos(rad) * 180;
        const y2 = CY + Math.sin(rad) * 180;
        return (
          <line
            key={deg}
            x1={CX}
            y1={CY}
            x2={x2}
            y2={y2}
            stroke="#f4efe6"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
        );
      })}

      <circle
        cx={CX}
        cy={CY}
        r={ripple}
        fill="none"
        stroke="#3ecfbf"
        strokeOpacity={live ? 0.48 : 0.15}
        strokeWidth="1.5"
        className={live && !reduced ? 'ris-ripple' : undefined}
      />

      {trail ? (
        <path
          d={trail}
          fill="none"
          stroke="#f7931a"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {live && !reduced ? (
        <g transform={`rotate(${sweep} ${CX} ${CY})`}>
          <path d={`M ${CX} ${CY} L ${CX + 175} ${CY}`} stroke="url(#ris-beam)" strokeWidth="2" />
        </g>
      ) : null}

      <circle cx={CX} cy={CY} r="4.5" fill={live ? '#3ecfbf' : '#f7931a'} />

      <text
        x="20"
        y="26"
        fill="#f4efe6"
        fillOpacity="0.82"
        fontFamily="ui-monospace, monospace"
        fontSize="11"
      >
        RIS — polar view of the 48-frame BTC history ring
      </text>
      <text
        x="20"
        y="42"
        fill="#f4efe6"
        fillOpacity="0.52"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
      >
        same frames as continuum, mapped to angle
      </text>
      <text
        x="20"
        y="366"
        fill="#f7931a"
        fillOpacity="0.9"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
      >
        priceUsd / temperatureC → polar radius
      </text>
      <text
        x="20"
        y="380"
        fill="#3ecfbf"
        fillOpacity="0.85"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
      >
        change24hPct / humidityPct → ring opacity
      </text>
      <text
        x="20"
        y="394"
        fill="#f4efe6"
        fillOpacity="0.65"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
      >
        sequence (#{sequence}) → ripple size
      </text>
    </svg>
  );
}
