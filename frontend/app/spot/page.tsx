'use client';

import React, { useState } from 'react';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import Ticker from './components/Ticker';
import Chart from './components/Chart';
import SystemSetup from './components/SystemSetup';
import Positions from './components/Positions';
import RiskManager from './components/RiskManager';

const SpotPage = () => {
  useAuthGuard();

  // Risk manager state variables (not used in SystemSetup, kept here for now)
  const [maxDrawdown, setMaxDrawdown] = useState(30);
  const [maxDrawdownBuffer, setMaxDrawdownBuffer] = useState(1);
  const [maxLeverageRisk, setMaxLeverageRisk] = useState(5);
  const [maxPositionPct, setMaxPositionPct] = useState(10);
  const [volatilityLookback, setVolatilityLookback] = useState(20);
  const [varConfidence, setVarConfidence] = useState(0.95);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Statstical Arbitrage</h1>
        <div className="flex gap-2">
          <span className="text-sm text-zinc-400 px-3 py-1 rounded-full border border-zinc-700">Market: Active</span>
        </div>
      </div>

      <Ticker />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Chart />
        <SystemSetup />
        <Positions />
        <RiskManager />
      </div>
    </div>
  );
};

export default SpotPage;
