import { useEffect, useRef, useState } from 'react';

const HISTORY_LIMIT = 64;

const PAIR_DEFAULTS = {
  BTCUSDT: { label: 'BTC / USDT', name: 'Bitcoin', basePrice: 92480, tickScale: 28 },
  ETHUSDT: { label: 'ETH / USDT', name: 'Ethereum', basePrice: 3185, tickScale: 2.2 },
  SOLUSDT: { label: 'SOL / USDT', name: 'Solana', basePrice: 214.5, tickScale: 0.35 },
  BNBUSDT: { label: 'BNB / USDT', name: 'BNB Chain', basePrice: 642.0, tickScale: 0.8 },
};

const INTERVAL_MS = {
  '1s': 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

function buildInitialCandles(basePrice, scale, intervalMs, count = HISTORY_LIMIT) {
  const now = Date.now();
  const candles = [];
  let cursor = basePrice - scale * 4;
  for (let i = count - 1; i >= 0; i -= 1) {
    const t = now - i * intervalMs;
    const phase = (count - i) / 5;
    const delta = Math.sin(phase) * scale * 1.4 + Math.cos(i * 0.7) * scale * 0.8;
    const open = cursor;
    const close = Math.max(1, Number((open + delta * 0.35).toFixed(2)));
    const high = Number((Math.max(open, close) + Math.abs(delta) * 0.45 + scale * 0.2).toFixed(2));
    const low = Number((Math.min(open, close) - Math.abs(delta) * 0.4 - scale * 0.15).toFixed(2));
    const volume = Number((12 + Math.abs(Math.sin(i * 0.9)) * 45).toFixed(3));
    candles.push({ timestamp: t, open, high, low, close, price: close, volume });
    cursor = close;
  }
  return candles;
}

function buildSyntheticOrderBook(midPrice, scale) {
  const step = Math.max(0.01, scale * 0.12);
  const bids = [];
  const asks = [];
  let bidCum = 0;
  let askCum = 0;

  for (let i = 0; i < 10; i += 1) {
    const bidPrice = Number((midPrice - (i + 1) * step).toFixed(2));
    const bidQty = Number((0.15 + Math.abs(Math.sin(midPrice + i * 1.7)) * 1.85).toFixed(4));
    bidCum = Number((bidCum + bidQty).toFixed(4));
    bids.push({ price: bidPrice, qty: bidQty, total: bidCum });

    const askPrice = Number((midPrice + (i + 1) * step).toFixed(2));
    const askQty = Number((0.15 + Math.abs(Math.cos(midPrice + i * 1.3)) * 1.85).toFixed(4));
    askCum = Number((askCum + askQty).toFixed(4));
    asks.push({ price: askPrice, qty: askQty, total: askCum });
  }

  const spread = Number((asks[0].price - bids[0].price).toFixed(2));
  const spreadPct = Number(((spread / midPrice) * 100).toFixed(4));
  const totalDepth = bidCum + askCum || 1;
  const buyPressurePct = Math.round((bidCum / totalDepth) * 100);

  return { bids, asks, spread, spreadPct, buyPressurePct, maxTotal: Math.max(bidCum, askCum, 1) };
}

/**
 * Full Unit 10 WebSocket Lifecycle Hook for Institutional Crypto Terminal.
 *
 * Implements:
 * - Connect (`onopen`), frame fold (`onmessage`), exponential backoff reconnect (`onclose`),
 *   and strict cleanup (`socket.close()`) on unmount or parameter change.
 * - Multi-stream ingestion (`@trade`, `@ticker`, `@depth10@100ms`) + REST Klines seed.
 * - Optional High-Frequency Simulation engine for offline/demo environments.
 */
export default function useCryptoTerminalStream({
  symbol = 'BTCUSDT',
  interval = '1s',
  mode = 'live', // 'live' | 'simulated'
  enabled = true,
}) {
  const pairMeta = PAIR_DEFAULTS[symbol] ?? PAIR_DEFAULTS.BTCUSDT;
  const intervalMs = INTERVAL_MS[interval] ?? 1000;

  const [candles, setCandles] = useState(() =>
    buildInitialCandles(pairMeta.basePrice, pairMeta.tickScale, intervalMs),
  );
  const [ticker, setTicker] = useState(() => ({
    price: pairMeta.basePrice,
    change24h: pairMeta.basePrice * 0.0265,
    change24hPct: 2.65,
    high24h: Number((pairMeta.basePrice * 1.034).toFixed(2)),
    low24h: Number((pairMeta.basePrice * 0.968).toFixed(2)),
    volume24h: 24890.45,
    quoteVolume24h: 24890.45 * pairMeta.basePrice,
    vwap: Number((pairMeta.basePrice * 0.996).toFixed(2)),
  }));
  const [priceDirection, setPriceDirection] = useState('neutral');
  const [orderBook, setOrderBook] = useState(() =>
    buildSyntheticOrderBook(pairMeta.basePrice, pairMeta.tickScale),
  );
  const [trades, setTrades] = useState([]);
  const [connStatus, setConnStatus] = useState('connecting');
  const [lastMessageAt, setLastMessageAt] = useState(null);
  const [latencyMs, setLatencyMs] = useState(18);
  const [ticksPerSec, setTicksPerSec] = useState(0);
  const [sequence, setSequence] = useState(0);
  const [latestFrame, setLatestFrame] = useState(null);

  const attemptRef = useRef(0);
  const seqRef = useRef(0);
  const tickCounterRef = useRef(0);
  const lastPriceRef = useRef(pairMeta.basePrice);

  // Measure ticks per second (TPS)
  useEffect(() => {
    const id = setInterval(() => {
      setTicksPerSec(tickCounterRef.current);
      tickCounterRef.current = 0;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const meta = PAIR_DEFAULTS[symbol] ?? PAIR_DEFAULTS.BTCUSDT;
    const bucketMs = INTERVAL_MS[interval] ?? 1000;

    // Reset baseline state immediately when switching pair or timeframe
    const seeded = buildInitialCandles(meta.basePrice, meta.tickScale, bucketMs);
    setCandles(seeded);
    lastPriceRef.current = seeded[seeded.length - 1]?.close ?? meta.basePrice;
    setOrderBook(buildSyntheticOrderBook(lastPriceRef.current, meta.tickScale));
    setTrades([]);
    seqRef.current = 0;
    setSequence(0);

    if (!enabled) {
      setConnStatus('paused');
      return undefined;
    }

    let socket = null;
    let reconnectTimer = null;
    let simTimer = null;
    let cancelled = false;

    function recordTick(nextPrice, tradeQty, eventTime, isBuyerMaker = false) {
      const prevPrice = lastPriceRef.current;
      if (nextPrice > prevPrice) setPriceDirection('up');
      else if (nextPrice < prevPrice) setPriceDirection('down');
      lastPriceRef.current = nextPrice;

      tickCounterRef.current += 1;
      seqRef.current += 1;
      const currentSeq = seqRef.current;
      const now = Date.now();
      const lag = eventTime ? Math.max(4, Math.min(450, now - eventTime)) : 14;

      setSequence(currentSeq);
      setLastMessageAt(now);
      setLatencyMs(lag);

      // Update OHLC candle ring
      setCandles((prev) => {
        if (!prev || prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const bucketStart = Math.floor(now / bucketMs) * bucketMs;
        const lastBucket = Math.floor(last.timestamp / bucketMs) * bucketMs;

        if (bucketStart <= lastBucket) {
          const updated = {
            ...last,
            close: nextPrice,
            price: nextPrice,
            high: Math.max(last.high, nextPrice),
            low: Math.min(last.low, nextPrice),
            volume: Number((last.volume + tradeQty).toFixed(4)),
          };
          return [...prev.slice(0, -1), updated];
        }

        const nextCandle = {
          timestamp: bucketStart,
          open: last.close,
          high: Math.max(last.close, nextPrice),
          low: Math.min(last.close, nextPrice),
          close: nextPrice,
          price: nextPrice,
          volume: Number(tradeQty.toFixed(4)),
        };
        const ring = [...prev, nextCandle];
        return ring.length > HISTORY_LIMIT ? ring.slice(-HISTORY_LIMIT) : ring;
      });

      // Update live trades tape
      const usdValue = nextPrice * tradeQty;
      const tradeEntry = {
        id: `${now}-${currentSeq}`,
        price: nextPrice,
        qty: tradeQty,
        usdValue,
        time: new Date(now).toLocaleTimeString('es-ES', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        side: isBuyerMaker ? 'SELL' : 'BUY',
        isWhale: usdValue >= 15000,
      };
      setTrades((prev) => [tradeEntry, ...prev.slice(0, 27)]);

      // Update Unit 10 Telemetry Frame object
      setTicker((prevTicker) => {
        const updatedTicker = {
          ...prevTicker,
          price: nextPrice,
          high24h: Math.max(prevTicker.high24h, nextPrice),
          low24h: Math.min(prevTicker.low24h, nextPrice),
        };
        setLatestFrame({
          kind: 'snapshot',
          deviceId: mode === 'live' ? `binance-${symbol.toLowerCase()}` : `sim-${symbol.toLowerCase()}`,
          symbol: meta.label,
          online: true,
          readings: {
            priceUsd: nextPrice,
            change24hPct: updatedTicker.change24hPct,
            high24h: updatedTicker.high24h,
            low24h: updatedTicker.low24h,
            volumeBtc: updatedTicker.volume24h,
            vwap: updatedTicker.vwap,
            tradeQty,
          },
          sequence: currentSeq,
          timestamp: now,
        });
        return updatedTicker;
      });
    }

    // Mode 1: High-Frequency Autonomous Simulator (guaranteed offline/competition mode)
    if (mode === 'simulated') {
      setConnStatus('live');
      simTimer = setInterval(() => {
        if (cancelled) return;
        const prev = lastPriceRef.current;
        const shock = (Math.random() - 0.492) * meta.tickScale * 0.9;
        const wave = Math.sin(seqRef.current / 7) * meta.tickScale * 0.35;
        const nextPrice = Number(Math.max(1, prev + shock + wave).toFixed(2));
        const qty = Number((0.015 + Math.random() * 1.45).toFixed(4));
        const isSell = nextPrice < prev;
        recordTick(nextPrice, qty, Date.now() - 8, isSell);
        setOrderBook(buildSyntheticOrderBook(nextPrice, meta.tickScale));
      }, 350);

      return () => {
        cancelled = true;
        clearInterval(simTimer);
      };
    }

    // Mode 2: Live Binance REST Klines Seed + Combined WebSocket Stream
    const klineUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${HISTORY_LIMIT}`;
    fetch(klineUrl)
      .then((res) => res.json())
      .then((raw) => {
        if (cancelled || !Array.isArray(raw) || raw.length === 0) return;
        const parsed = raw.map((k) => ({
          timestamp: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          price: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        setCandles(parsed);
        const latestClose = parsed[parsed.length - 1].close;
        lastPriceRef.current = latestClose;
        setTicker((prev) => ({ ...prev, price: latestClose }));
        setOrderBook(buildSyntheticOrderBook(latestClose, meta.tickScale));
      })
      .catch(() => {
        // Keep synthetic seed if REST is unreachable
      });

    const symLower = symbol.toLowerCase();
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${symLower}@trade/${symLower}@ticker/${symLower}@depth10@100ms`;

    function connect() {
      if (cancelled) return;
      setConnStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setConnStatus('live');
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const envelope = JSON.parse(event.data);
          const payload = envelope.data ?? envelope;

          // 1. Live Trade Tick (`@trade`)
          if (payload.e === 'trade') {
            const nextPrice = parseFloat(payload.p);
            const qty = parseFloat(payload.q);
            if (Number.isFinite(nextPrice)) {
              recordTick(nextPrice, Number.isFinite(qty) ? qty : 0.05, payload.E, Boolean(payload.m));
            }
            return;
          }

          // 2. 24hr Rolling Ticker (`@ticker`)
          if (payload.e === '24hrTicker') {
            const lastP = parseFloat(payload.c);
            setTicker((prev) => ({
              price: Number.isFinite(lastP) ? lastP : prev.price,
              change24h: parseFloat(payload.p) || prev.change24h,
              change24hPct: Number(parseFloat(payload.P || 0).toFixed(2)),
              high24h: parseFloat(payload.h) || prev.high24h,
              low24h: parseFloat(payload.l) || prev.low24h,
              volume24h: Number(parseFloat(payload.v || 0).toFixed(2)),
              quoteVolume24h: Number(parseFloat(payload.q || 0).toFixed(0)),
              vwap: Number(parseFloat(payload.w || prev.vwap).toFixed(2)),
            }));
            return;
          }

          // 3. Partial Book Depth (`@depth10@100ms`)
          if (Array.isArray(payload.bids) && Array.isArray(payload.asks)) {
            let bidCum = 0;
            const bids = payload.bids.slice(0, 10).map(([p, q]) => {
              const price = parseFloat(p);
              const qty = parseFloat(q);
              bidCum = Number((bidCum + qty).toFixed(4));
              return { price, qty, total: bidCum };
            });

            let askCum = 0;
            const asks = payload.asks.slice(0, 10).map(([p, q]) => {
              const price = parseFloat(p);
              const qty = parseFloat(q);
              askCum = Number((askCum + qty).toFixed(4));
              return { price, qty, total: askCum };
            });

            if (bids.length > 0 && asks.length > 0) {
              const spread = Number((asks[0].price - bids[0].price).toFixed(2));
              const mid = (asks[0].price + bids[0].price) / 2 || 1;
              const spreadPct = Number(((spread / mid) * 100).toFixed(4));
              const totalDepth = bidCum + askCum || 1;
              const buyPressurePct = Math.round((bidCum / totalDepth) * 100);
              setOrderBook({
                bids,
                asks,
                spread,
                spreadPct,
                buyPressurePct,
                maxTotal: Math.max(bidCum, askCum, 0.01),
              });
            }
          }
        } catch {
          // Ignore malformed wire message
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnStatus('reconnecting');
        attemptRef.current += 1;
        const delay = Math.min(8000, 1000 * 2 ** Math.min(attemptRef.current, 3));
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose handles reconnect
      };
    }

    connect();

    // Unit 10 Cleanup Contract: prevent socket leaks on unmount or symbol/interval switch
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      clearInterval(simTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [symbol, interval, mode, enabled]);

  return {
    pairMeta,
    candles,
    ticker,
    priceDirection,
    orderBook,
    trades,
    status: enabled ? connStatus : 'paused',
    lastMessageAt,
    latencyMs,
    ticksPerSec,
    sequence,
    latestFrame,
  };
}

export { PAIR_DEFAULTS };
