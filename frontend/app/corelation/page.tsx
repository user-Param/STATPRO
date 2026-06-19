'use client';

import React, { useState, useEffect } from 'react';

const COINS = ['BTC', 'ETH', 'ADA', 'DOT', 'LINK', 'UNI', 'AVAX', 'MATIC'];
const HISTORY_SIZE = 50;

type PricePoint = {
  price: number;
  timestamp: number;
};

type CoinData = {
  symbol: string;
  history: PricePoint[];
  latestPrice: number;
  change24h: number; // placeholder, we don't have 24h data
  volatility: number; // standard deviation of recent prices
};

const CorelationPage = () => {
  const [coinData, setCoinData] = useState<Record<string, CoinData>>({});
  const [correlationMatrix, setCorrelationMatrix] = useState<Record<string, Record<string, number>>>({});
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize coin data
  useEffect(() => {
    const initialData: Record<string, CoinData> = {};
    COINS.forEach(coin => {
      initialData[coin] = {
        symbol: coin,
        history: [],
        latestPrice: 0,
        change24h: 0,
        volatility: 0,
      };
    });
    setCoinData(initialData);
    setCorrelationMatrix(
      COINS.reduce((acc, coin) => {
        acc[coin] = COINS.reduce((innerAcc, innerCoin) => {
          innerAcc[innerCoin] = 0;
          return innerAcc;
        }, {} as Record<string, number>);
        return acc;
      }, {} as Record<string, Record<string, number>>)
    );
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:9000');
    setWs(ws);

    ws.onopen = () => {
      console.log('Connected to datafeed WebSocket');
      setConnected(true);
      setError(null);
      // Identify as adapter (if needed)
      ws.send(JSON.stringify({ type: 'adapter' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Expect format: { topic: 'ticker_BTC', symbol: 'BTC', price: ..., ... }
        if (data.topic && data.topic.startsWith('ticker_') && data.symbol) {
          const symbol = data.symbol;
          if (COINS.includes(symbol)) {
            updateCoinData(symbol, data.price, data.timestamp);
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Failed to connect to datafeed');
      setConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setConnected(false);
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (!ws.CLOSED) {
          // This effect will re-run if ws changes, but we set ws only once.
          // We'll rely on the reconnect logic in the component.
        }
      }, 3000);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Update coin data with new price
  const updateCoinData = (symbol: string, price: number, timestamp: number) => {
    setCoinData((prev) => {
      const coin = prev[symbol];
      if (!coin) return prev;

      const newHistory = [...coin.history, { price, timestamp }];
      // Keep only last HISTORY_SIZE points
      if (newHistory.length > HISTORY_SIZE) {
        newHistory.shift();
      }

      // Calculate latest price, change (simplified), and volatility
      const latestPrice = price;
      const change24h = 0; // We don't have 24h data, so placeholder
      const prices = newHistory.map((p) => p.price);
      const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
      const volatility = Math.sqrt(variance);

      return {
        ...prev,
        [symbol]: {
          ...coin,
          history: newHistory,
          latestPrice,
          change24h,
          volatility,
        },
      };
    });
  };

  // Calculate correlation matrix whenever coin data updates
  useEffect(() => {
    if (Object.keys(coinData).length === 0) return;

    const symbols = COINS;
    const matrix: Record<string, Record<string, number>> = {};

    symbols.forEach((sym1) => {
      matrix[sym1] = {};
      symbols.forEach((sym2) => {
        if (sym1 === sym2) {
          matrix[sym1][sym2] = 1;
          return;
        }

        const data1 = coinData[sym1].history.map((p) => p.price);
        const data2 = coinData[sym2].history.map((p) => p.price);

        // Ensure we have enough data points
        if (data1.length < 2 || data2.length < 2) {
          matrix[sym1][sym2] = 0;
          return;
        }

        // Trim to same length (min length)
        const len = Math.min(data1.length, data2.length);
        const sliced1 = data1.slice(-len);
        const sliced2 = data2.slice(-len);

        const correlation = pearsonCorrelation(sliced1, sliced2);
        matrix[sym1][sym2] = correlation;
      });
    });

    setCorrelationMatrix(matrix);
  }, [coinData]);

  // Pearson correlation coefficient
  function pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    let sumX = 0,
      sumY = 0,
      sumXY = 0;
    let sumX2 = 0,
      sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
        <h2 className="text-red-600">Error: {error}</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Corelation Analysis</h1>
        <div className="flex gap-2">
          <span className={`text-sm px-3 py-1 rounded-full border ${
            connected ? 'border-green-600 bg-green-900/20 text-green-400' : 'border-zinc-700'
          }`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Correlation Matrix */}
        <div className="border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold text-lg mb-4">Correlation Matrix</h3>
          {Object.keys(correlationMatrix).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-center">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-zinc-400"></th>
                    {COINS.map((coin) => (
                      <th key={coin} className="px-4 py-2 text-zinc-400">
                        {coin}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COINS.map((rowCoin) => (
                    <tr key={rowCoin}>
                      <th className="px-4 py-2 text-left text-zinc-400 font-medium">
                        {rowCoin}
                      </th>
                      {COINS.map((colCoin) => {
                        const corr = correlationMatrix[rowCoin][colCoin];
                        // Determine background color based on correlation
                        const bgColor = corr >= 0.7
                          ? 'bg-green-500/20'
                          : corr <= -0.7
                          ? 'bg-red-500/20'
                          : corr >= 0.3
                          ? 'bg-yellow-500/20'
                          : corr <= -0.3
                          ? 'bg-blue-500/20'
                          : 'bg-transparent';
                        return (
                          <td
                            key={colCoin}
                            className={`px-4 py-2 border border-zinc-700 ${bgColor} transition-colors hover:bg-zinc-700/10`}
                          >
                            {corr.toFixed(3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-zinc-500 text-center py-12">
              Loading correlation data...
            </div>
          )}
        </div>

        {/* Patterns / Coin Details */}
        <div className="border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold text-lg mb-4">Coin Patterns</h3>
          {Object.keys(coinData).length > 0 ? (
            <div className="space-y-4">
              {COINS.map((symbol) => {
                const data = coinData[symbol];
                const changeColor =
                  data.change24h > 0 ? 'text-green-400' : data.change24h < 0 ? 'text-red-400' : 'text-zinc-400';
                return (
                  <div key={symbol} className="border border-zinc-700 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold">{symbol}</h4>
                      <span className="text-xs text-zinc-500">Vol: {data.volatility.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold">${data.latestPrice.toFixed(2)}</div>
                      <div className="text-sm space-y-1">
                        <span className={changeColor}>
                          24h: {data.change24h.toFixed(2)}%
                        </span>
                        <span className="text-xs text-zinc-400">
                          {data.history.length} ticks
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-zinc-500 text-center py-12">
              Loading coin data...
            </div>
          )}
        </div>
      </div>

      </div>
  );
};

export default CorelationPage;