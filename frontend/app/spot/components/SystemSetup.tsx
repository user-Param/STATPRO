'use client';

import React, { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { inputClassCompact } from '@/lib/styles';

const SystemSetup: React.FC = () => {
  const [symbol, setSymbol] = useState('BTC/USDT');
  // Strategy parameters
  const [lookback, setLookback] = useState(40);
  const [stdDevMult, setStdDevMult] = useState(1.75);
  const [stopLossSd, setStopLossSd] = useState(3.0);
  const [leverage, setLeverage] = useState(5);
  const [quantity, setQuantity] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleStrategy = async () => {
    setStatus(null);
    setLoading(true);
    try {
      const data = await apiRequest<any>('/strategy/toggle', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          lookback,
          stdDevMult,
          stopLossSd,
          leverage,
          quantity,
          enabled: !isRunning,
        }),
      });
      setIsRunning(!isRunning);
      setStatus({
        type: 'success',
        message: `${isRunning ? 'Strategy stopped' : 'Strategy started'} successfully!`,
      });
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'Failed to toggle strategy',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className=" border border-zinc-800 p-4 flex flex-col gap-4 bg-zinc-900/50">
      <h3 className="font-semibold text-lg">System Setup</h3>
      <form className="space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className={inputClassCompact}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Lookback (periods)</label>
          <input
            type="number"
            min="1"
            value={lookback}
            onChange={(e) => setLookback(parseInt(e.target.value) || 0)}
            className={inputClassCompact}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Std Dev Multiplier</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={stdDevMult}
            onChange={(e) => setStdDevMult(parseFloat(e.target.value) || 0)}
            className={inputClassCompact}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Stop Loss SD Multiplier</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={stopLossSd}
            onChange={(e) => setStopLossSd(parseFloat(e.target.value) || 0)}
            className={inputClassCompact}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Leverage</label>
          <input
            type="number"
            min="1"
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value) || 0)}
            className={inputClassCompact}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            className={inputClassCompact}
          />
        </div>
        <button
          type="button"
          onClick={toggleStrategy}
          disabled={loading}
          className={`w-full py-2 ${isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50`}
        >
          {loading ? (isRunning ? 'Stopping...' : 'Starting...') : isRunning ? 'Stop Strategy' : 'Start Strategy'}
        </button>


        {status && (
          <div className={`p-2 text-xs rounded border ${status.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {status.message}
          </div>
        )}
      </form>
    </div>
  );
};

export default SystemSetup;