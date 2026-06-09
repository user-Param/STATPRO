import React from 'react';

const PerpPage = () => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Perpetual Trading</h1>
        <div className="flex gap-2">
          <span className="text-sm text-zinc-400 bg-zinc-800 px-3 py-1 rounded-full border border-zinc-700">Funding: 0.01%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
          Chart Placeholder
        </div>
        <div className="h-96 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Trade</h3>
            <div className="flex gap-2 text-xs">
              <button className="px-2 py-1 bg-green-600 rounded text-white">Long</button>
              <button className="px-2 py-1 bg-red-600 rounded text-white">Short</button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase">Leverage</label>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value="10x" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase">Amount</label>
              <input type="text" placeholder="0.00" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </div>
            <button className="w-full py-3 bg-blue-600 rounded-lg font-bold hover:bg-blue-700 transition-colors">Open Position</button>
          </div>
        </div>
      </div>

      <div className="h-64 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="font-semibold text-lg mb-4">Open Perpetuals</h3>
        <div className="text-zinc-500 text-center py-12">
          No active perp positions.
        </div>
      </div>
    </div>
  );
};

export default PerpPage;
