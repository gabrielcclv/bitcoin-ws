import { useEffect, useRef, useState } from 'react';

const HISTORY_LIMIT = 64;

const PAIR_DEFAULTS = {
  BTCUSDT: { label: 'BTC / USDT', name: 'Bitcoin', asset: 'BTC' },
  ETHUSDT: { label: 'ETH / USDT', name: 'Ethereum', asset: 'ETH' },
  SOLUSDT: { label: 'SOL / USDT', name: 'Solana', asset: 'SOL' },
  BNBUSDT: { label: 'BNB / USDT', name: 'BNB Chain', asset: 'BNB' },
};

const INTERVAL_MS = {
  '1s': 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

function parseDepthSide(entries) {
  let cum = 0;
  return (entries || []).slice(0, 10).map(([p, q]) => {
    const price = parseFloat(p);
    const qty = parseFloat(q);
    cum = Number((cum + qty).toFixed(4));
    return { price, qty, total: cum };
  });
}

function formatDepthPayload(rawBids, rawAsks) {
  const bids = parseDepthSide(rawBids);
  const asks = parseDepthSide(rawAsks);
  if (bids.length === 0 || asks.length === 0) return null;

  const bidCum = bids[bids.length - 1].total;
  const askCum = asks[asks.length - 1].total;
  const spread = Number(Math.max(0, asks[0].price - bids[0].price).toFixed(2));
  const mid = (asks[0].price + bids[0].price) / 2 || 1;
  const spreadPct = Number(((spread / mid) * 100).toFixed(4));
  const totalDepth = bidCum + askCum || 1;
  const buyPressurePct = Math.round((bidCum / totalDepth) * 100);

  return {
    bids,
    asks,
    spread,
    spreadPct,
    buyPressurePct,
    maxTotal: Math.max(bidCum, askCum, 0.001),
  };
}

/**
 * Full Unit 10 WebSocket Lifecycle Hook — 100% Real Binance Market Data.
 *
 * - Seeds real historical candles (`/api/v3/klines`), real 24h stats (`/api/v3/ticker/24hr`),
 *   real L2 order book (`/api/v3/depth`), and real recent trades (`/api/v3/trades`).
 * - Streams live updates via Binance Combined WebSocket (`@trade`, `@ticker`, `@depth10@100ms`).
 * - Full Unit 10 lifecycle: `onopen`, `onmessage`, exponential backoff `onclose`, and `socket.close()` on cleanup.
 */
export default function useCryptoTerminalStream({
  symbol = 'BTCUSDT',
  interval = '1s',
  enabled = true,
}) {
  const pairMeta = PAIR_DEFAULTS[symbol] ?? PAIR_DEFAULTS.BTCUSDT;

  const [candles, setCandles] = useState([]);
  const [ticker, setTicker] = useState({
    price: null,
    change24h: 0,
    change24hPct: 0,
    high24h: null,
    low24h: null,
    volume24h: null,
    quoteVolume24h: null,
    vwap: null,
    tradesCount24h: null,
  });
  const [priceDirection, setPriceDirection] = useState('neutral');
  const [orderBook, setOrderBook] = useState({
    bids: [],
    asks: [],
    spread: 0,
    spreadPct: 0,
    buyPressurePct: 50,
    maxTotal: 1,
  });
  const [trades, setTrades] = useState([]);
  const [connStatus, setConnStatus] = useState('connecting');
  const [lastMessageAt, setLastMessageAt] = useState(null);
  const [latencyMs, setLatencyMs] = useState(0);
  const [ticksPerSec, setTicksPerSec] = useState(0);
  const [sequence, setSequence] = useState(0);
  const [latestFrame, setLatestFrame] = useState(null);

  const attemptRef = useRef(0);
  const seqRef = useRef(0);
  const tickCounterRef = useRef(0);
  const lastPriceRef = useRef(null);

  // Measure live ticks per second (TPS)
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

    let socket = null;
    let reconnectTimer = null;
    let cancelled = false;

    setCandles([]);
    setTrades([]);
    seqRef.current = 0;
    setSequence(0);

    // 1. Seed 100% REAL market data from Binance REST API immediately on mount / pair switch
    async function seedRealMarketData() {
      try {
        const [klinesRes, tickerRes, depthRes, tradesRes] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${HISTORY_LIMIT}`),
          fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
          fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=10`),
          fetch(`https://api.binance.com/api/v3/trades?symbol=${symbol}&limit=20`),
        ]);

        if (cancelled) return;

        const [rawKlines, rawTicker, rawDepth, rawTrades] = await Promise.all([
          klinesRes.json(),
          tickerRes.json(),
          depthRes.json(),
          tradesRes.json(),
        ]);

        if (cancelled) return;

        if (Array.isArray(rawKlines) && rawKlines.length > 0) {
          const parsedCandles = rawKlines.map((k) => ({
            timestamp: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            price: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
          setCandles(parsedCandles);
          lastPriceRef.current = parsedCandles[parsedCandles.length - 1].close;
        }

        if (rawTicker && rawTicker.lastPrice != null) {
          const realPrice = parseFloat(rawTicker.lastPrice);
          lastPriceRef.current = realPrice;
          const nextTicker = {
            price: realPrice,
            change24h: parseFloat(rawTicker.priceChange) || 0,
            change24hPct: Number(parseFloat(rawTicker.priceChangePercent || 0).toFixed(2)),
            high24h: parseFloat(rawTicker.highPrice),
            low24h: parseFloat(rawTicker.lowPrice),
            volume24h: Number(parseFloat(rawTicker.volume || 0).toFixed(2)),
            quoteVolume24h: Number(parseFloat(rawTicker.quoteVolume || 0).toFixed(0)),
            vwap: Number(parseFloat(rawTicker.weightedAvgPrice || realPrice).toFixed(2)),
            tradesCount24h: rawTicker.count ?? null,
          };
          setTicker(nextTicker);
          setLatestFrame({
            kind: 'snapshot',
            deviceId: `binance-${symbol.toLowerCase()}`,
            symbol: meta.label,
            online: true,
            readings: {
              priceUsd: nextTicker.price,
              change24hPct: nextTicker.change24hPct,
              high24h: nextTicker.high24h,
              low24h: nextTicker.low24h,
              volumeAsset: nextTicker.volume24h,
              vwap: nextTicker.vwap,
            },
            sequence: 0,
            timestamp: Date.now(),
          });
        }

        if (rawDepth && Array.isArray(rawDepth.bids) && Array.isArray(rawDepth.asks)) {
          const formattedBook = formatDepthPayload(rawDepth.bids, rawDepth.asks);
          if (formattedBook) setOrderBook(formattedBook);
        }

        if (Array.isArray(rawTrades)) {
          const parsedTrades = rawTrades
            .slice(-20)
            .reverse()
            .map((t) => {
              const p = parseFloat(t.price);
              const q = parseFloat(t.qty);
              const usdVal = p * q;
              return {
                id: `${t.id}-${t.time}`,
                price: p,
                qty: q,
                usdValue: usdVal,
                time: new Date(t.time).toLocaleTimeString('es-ES', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
                side: t.isBuyerMaker ? 'SELL' : 'BUY',
                isWhale: usdVal >= 15000,
              };
            });
          setTrades(parsedTrades);
        }
      } catch {
        // WebSocket stream will populate on first message if REST call fails
      }
    }

    seedRealMarketData();

    if (!enabled) {
      setConnStatus('paused');
      return () => {
        cancelled = true;
      };
    }

    // 2. Connect to Real Binance Combined WebSocket Stream
    const symLower = symbol.toLowerCase();
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${symLower}@trade/${symLower}@ticker/${symLower}@depth10@100ms`;

    function recordTick(nextPrice, tradeQty, eventTime, isBuyerMaker = false) {
      const prevPrice = lastPriceRef.current;
      if (prevPrice != null) {
        if (nextPrice > prevPrice) setPriceDirection('up');
        else if (nextPrice < prevPrice) setPriceDirection('down');
      }
      lastPriceRef.current = nextPrice;

      tickCounterRef.current += 1;
      seqRef.current += 1;
      const currentSeq = seqRef.current;
      const now = Date.now();
      const lag = eventTime ? Math.max(2, Math.min(600, Math.abs(now - eventTime))) : 12;

      setSequence(currentSeq);
      setLastMessageAt(now);
      setLatencyMs(lag);

      // Update OHLC candle ring with real trade price
      setCandles((prev) => {
        const bucketStart = Math.floor(now / bucketMs) * bucketMs;
        if (!prev || prev.length === 0) {
          return [
            {
              timestamp: bucketStart,
              open: nextPrice,
              high: nextPrice,
              low: nextPrice,
              close: nextPrice,
              price: nextPrice,
              volume: Number(tradeQty.toFixed(4)),
            },
          ];
        }

        const last = prev[prev.length - 1];
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

      // Add real trade to tape
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

      // Update ticker price and Unit 10 telemetry frame
      setTicker((prevTicker) => {
        const updatedTicker = {
          ...prevTicker,
          price: nextPrice,
          high24h: prevTicker.high24h != null ? Math.max(prevTicker.high24h, nextPrice) : nextPrice,
          low24h: prevTicker.low24h != null ? Math.min(prevTicker.low24h, nextPrice) : nextPrice,
        };
        setLatestFrame({
          kind: 'snapshot',
          deviceId: `binance-${symbol.toLowerCase()}`,
          symbol: meta.label,
          online: true,
          readings: {
            priceUsd: nextPrice,
            change24hPct: updatedTicker.change24hPct,
            high24h: updatedTicker.high24h,
            low24h: updatedTicker.low24h,
            volumeAsset: updatedTicker.volume24h,
            vwap: updatedTicker.vwap,
            tradeQty,
          },
          sequence: currentSeq,
          timestamp: now,
        });
        return updatedTicker;
      });
    }

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

          if (payload.e === 'trade') {
            const nextPrice = parseFloat(payload.p);
            const qty = parseFloat(payload.q);
            if (Number.isFinite(nextPrice)) {
              recordTick(nextPrice, Number.isFinite(qty) ? qty : 0, payload.E, Boolean(payload.m));
            }
            return;
          }

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
              tradesCount24h: payload.n ?? prev.tradesCount24h,
            }));
            return;
          }

          if (Array.isArray(payload.bids) && Array.isArray(payload.asks)) {
            const formattedBook = formatDepthPayload(payload.bids, payload.asks);
            if (formattedBook) setOrderBook(formattedBook);
          }
        } catch {
          // Ignore malformed message
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
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [symbol, interval, enabled]);

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
