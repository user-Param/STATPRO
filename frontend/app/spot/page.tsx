import React from 'react';

const SpotPage = () => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Spot Trading</h1>
        <div className="flex gap-2">
          <span className="text-sm text-zinc-400  px-3 py-1 rounded-full border border-zinc-700">Market: Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96  border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
          Chart Placeholder
        </div>
        <div className="h-96  border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
          <h3 className="font-semibold text-lg">Order Book</h3>
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm italic">
            Loading order book...
          </div>
        </div>
      </div>

      <div className="h-64  border border-zinc-800 rounded-xl p-6">
        <h3 className="font-semibold text-lg mb-4">Your Positions</h3>
        <div className="text-zinc-500 text-center py-12">
          No active spot positions.
        </div>
      </div>
    </div>
  );
};

export default SpotPage;
