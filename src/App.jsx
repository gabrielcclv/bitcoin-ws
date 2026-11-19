import { useEffect, useState } from 'react';
import { catmullRomPath, closedRibbon } from './streamfield/path.js';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@trade';
const BINANCE_REST_URL = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=48';
const HISTORY_LIMIT = 48;

/**
 * Custom hook following Unit 10's full WebSocket lifecycle:
 * - Initial seed from REST API
 * - Connect (`onopen`), receive frames (`onmessage`), auto-reconnect (`onclose`),
 *   and clean `socket.close()` on unmount.
 */
function useBitcoinStream() {
  const [price, setPrice] = useState(null);
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let cancelled = false;

    // Cargar las últimas 48 lecturas iniciales desde la API REST de Binance para pintar la gráfica al instante
    fetch(BINANCE_REST_URL)
      .then((res) => res.json())
      .then((klines) => {
        if (cancelled || !Array.isArray(klines)) return;
        const points = klines.map((k) => ({
          price: parseFloat(k[4]),
          timestamp: k[0],
        }));
        if (points.length > 0) {
          setHistory(points);
          setPrice(points[points.length - 1].price);
        }
      })
      .catch(() => {
        // Si falla el seed inicial por red, el WebSocket irá llenando la gráfica igualmente
      });

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(BINANCE_WS_URL);

      socket.onopen = () => {
        if (cancelled) return;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data);
          const nextPrice = parseFloat(msg.p ?? msg.c);
          if (!Number.isFinite(nextPrice)) return;

          const now = msg.T ?? Date.now();
          setPrice(nextPrice);
          setHistory((prev) => {
            // Muestreamos como máximo ~1 punto cada 500ms para que la gráfica avance fluida
            if (prev.length > 0 && now - prev[prev.length - 1].timestamp < 500) {
              const updated = [...prev];
              updated[updated.length - 1] = { price: nextPrice, timestamp: prev[prev.length - 1].timestamp };
              return updated;
            }
            const next = [...prev, { price: nextPrice, timestamp: now }];
            return next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
          });
        } catch {
          // Ignorar tramas malformadas
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        // Reconexión automática tras 2 segundos (Unit 10 lifecycle)
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    // Cleanup al desmontar: limpia el timer y cierra el WebSocket
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  return { price, history, connected };
}

export default function App() {
  const { price, history, connected } = useBitcoinStream();

  const W = 800;
  const H = 360;
  const PAD_X = 28;
  const PAD_Y = 36;
  const BASE_Y = H - PAD_Y;

  const prices = history.map((d) => d.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const padRange = Math.max((maxPrice - minPrice) * 0.15, 5);
  const low = minPrice - padRange;
  const high = maxPrice + padRange;
  const range = Math.max(high - low, 1);

  const points =
    history.length >= 2
      ? history.map((item, i) => {
          const t = (item.price - low) / range;
          return {
            x: PAD_X + (i / (history.length - 1)) * (W - PAD_X * 2),
            y: BASE_Y - Math.max(0, Math.min(1, t)) * (H - PAD_Y * 2),
          };
        })
      : [];

  const strokePath = catmullRomPath(points);
  const fillPath = closedRibbon(points, BASE_Y);
  const head = points[points.length - 1];

  return (
    <main className="btc-chart-page">
      <div className="btc-chart-card">
        <header className="btc-chart-header">
          <div>
            <span className="btc-label">BTC / USDT · Live API</span>
            <h1 className="btc-current-price">
              {price != null
                ? `$${price.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : 'Cargando…'}
            </h1>
          </div>
          <span className={`status-badge ${connected ? 'is-live' : 'is-reconnecting'}`}>
            <span className="status-dot" />
            {connected ? 'Connected (WebSocket)' : 'Reconnecting…'}
          </span>
        </header>

        <div className="btc-svg-wrapper">
          <svg
            className="btc-svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={
              price != null
                ? `Gráfica del precio de Bitcoin en tiempo real: $${price} USD`
                : 'Esperando datos de Bitcoin'
            }
          >
            <defs>
              <linearGradient id="btc-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3ecfbf" />
                <stop offset="100%" stopColor="#f7931a" />
              </linearGradient>
              <linearGradient id="btc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f7931a" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#f7931a" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Líneas de guía horizontal */}
            {[0.2, 0.5, 0.8].map((ratio) => {
              const y = PAD_Y + ratio * (H - PAD_Y * 2);
              const val = high - ratio * range;
              return (
                <g key={ratio}>
                  <line
                    x1={PAD_X}
                    y1={y}
                    x2={W - PAD_X}
                    y2={y}
                    stroke="#f4efe6"
                    strokeOpacity="0.08"
                    strokeDasharray="4 4"
                  />
                  {prices.length > 0 && (
                    <text
                      x={W - PAD_X}
                      y={y - 6}
                      textAnchor="end"
                      fill="#f4efe6"
                      fillOpacity="0.4"
                      fontFamily="ui-monospace, monospace"
                      fontSize="11"
                    >
                      ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </text>
                  )}
                </g>
              );
            })}

            {fillPath && <path d={fillPath} fill="url(#btc-fill)" />}

            {strokePath ? (
              <path
                d={strokePath}
                fill="none"
                stroke="url(#btc-stroke)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <text
                x={W / 2}
                y={H / 2}
                textAnchor="middle"
                fill="#f4efe6"
                fillOpacity="0.5"
                fontFamily="ui-monospace, monospace"
                fontSize="14"
              >
                Conectando con la API de Bitcoin…
              </text>
            )}

            {head && (
              <g>
                <circle cx={head.x} cy={head.y} r="8" fill="#f7931a" fillOpacity="0.3" />
                <circle cx={head.x} cy={head.y} r="4" fill="#f7931a" />
              </g>
            )}
          </svg>
        </div>

        {prices.length > 0 && (
          <footer className="btc-chart-footer">
            <span>
              Mín: <strong>${minPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span>Últimas {history.length} lecturas en vivo</span>
            <span>
              Máx: <strong>${maxPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
          </footer>
        )}
      </div>
    </main>
  );
}
