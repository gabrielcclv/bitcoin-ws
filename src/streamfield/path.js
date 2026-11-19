/**
 * Catmull–Rom → cubic Bézier & Financial Technical Indicator Helpers.
 *
 * Lesson — Unit 10, File map & SVG continuity:
 * https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/#file-map--every-participant
 */
export function catmullRomPath(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Close a stroke path down to a baseline so a fill can read "volume of time". */
export function closedRibbon(points, baselineY) {
  const stroke = catmullRomPath(points);
  if (!stroke || points.length < 2) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${stroke} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

/** Build a closed SVG polygon between an upper point array and a lower point array (e.g. Bollinger Bands). */
export function closedBandPath(upperPoints, lowerPoints) {
  if (!upperPoints || !lowerPoints || upperPoints.length < 2 || lowerPoints.length < 2) return '';
  const top = catmullRomPath(upperPoints);
  const reversedBottom = [...lowerPoints].reverse();
  let bottom = '';
  for (let i = 0; i < reversedBottom.length; i += 1) {
    bottom += ` L ${reversedBottom[i].x.toFixed(2)} ${reversedBottom[i].y.toFixed(2)}`;
  }
  return `${top}${bottom} Z`;
}

/**
 * Exponential Moving Average (EMA) over an array of numbers.
 * @param {number[]} values
 * @param {number} period
 * @returns {number[]}
 */
export function computeEMA(values, period = 9) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * Bollinger Bands (SMA + upper/lower standard deviation bands).
 * @param {number[]} values
 * @param {number} period
 * @param {number} mult
 */
export function computeBollingerBands(values, period = 14, mult = 2) {
  if (!values || values.length === 0) return { upper: [], middle: [], lower: [] };
  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    middle.push(mean);
    upper.push(mean + mult * sd);
    lower.push(mean - mult * sd);
  }
  return { upper, middle, lower };
}

/**
 * Relative Strength Index (RSI) on the latest window.
 * @param {number[]} values
 * @param {number} period
 * @returns {number} 0..100
 */
export function computeRSI(values, period = 14) {
  if (!values || values.length < 3) return 50;
  const slice = values.slice(-Math.min(values.length, period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  if (gains === 0) return 0;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}
