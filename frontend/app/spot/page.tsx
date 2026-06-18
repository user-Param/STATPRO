'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

const SpotPage = () => {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, router]);

  const handleTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      const data = await apiRequest<any>('/trade', {
        method: 'POST',
        body: JSON.stringify({ symbol, amount: parseFloat(amount) }),
      });
      setStatus({ type: 'success', message: 'Trade executed successfully!' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Trade execution failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Spot Trading</h1>
        <div className="flex gap-2">
          <span className="text-sm text-zinc-400 px-3 py-1 rounded-full border border-zinc-700">Market: Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 bg-zinc-900/30">
          Chart Placeholder
        </div>
        <div className="h-96 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 bg-zinc-900/50">
          <h3 className="font-semibold text-lg">Quick Trade</h3>
          <form onSubmit={handleTrade} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Amount</label>
              <input
                type="number"
                step="0.0001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Executing...' : 'Execute Trade'}
            </button>
            {status && (
              <div className={`p-2 text-xs rounded border ${status.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {status.message}
              </div>
            )}
          </form>
        </div>
      </div>

      <div className="h-64 border border-zinc-800 rounded-xl p-6 bg-zinc-900/50">
        <h3 className="font-semibold text-lg mb-4">Your Positions</h3>
        <div className="text-zinc-500 text-center py-12">
          No active spot positions.
        </div>
      </div>
    </div>
  );
};

export default SpotPage;
