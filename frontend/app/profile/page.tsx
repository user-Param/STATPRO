'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { useAuthGuard } from '@/hooks/useAuthGuard';

interface UserProfile {
  username: string;
  email: string;
  status: string;
}

interface Balance {
  asset: string;
  available: number;
  locked: number;
}

const ProfilePage = () => {
  const { user } = useAuth();
  const { isAuthenticated } = useAuthGuard();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchData() {
      try {
        const [profileData, balanceData] = await Promise.all([
          apiRequest<UserProfile>('/profile'),
          apiRequest<Balance[]>('/balance'),
        ]);
        setProfile(profileData);
        setBalances(balanceData);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch profile data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-3xl font-bold">User Profile</h1>

      <div className="border border-zinc-800 rounded-xl p-6 flex items-center gap-6 bg-zinc-900/50">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl bg-zinc-800">👤</div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{profile?.username || user?.username || 'Trader'}</h2>
          <p className="text-zinc-400 text-sm">{profile?.email || 'User Account'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 uppercase">Primary Asset</p>
          <p className="text-2xl font-bold">
            {balances.length > 0 ? `${balances[0].available} ${balances[0].asset}` : 'No Assets'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50">
          <h3 className="font-semibold mb-4">Wallet Balances</h3>
          <div className="space-y-3">
            {balances.map((b, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <span className="font-medium">{b.asset}</span>
                <div className="text-right">
                  <p className="text-sm text-white font-semibold">{b.available}</p>
                  <p className="text-[10px] text-zinc-500 uppercase">Available</p>
                </div>
              </div>
            ))}
            {balances.length === 0 && <p className="text-zinc-500 text-sm italic">No assets found in wallet</p>}
          </div>
        </div>
        <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/50">
          <h3 className="font-semibold mb-4">Account Status</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-2 rounded-md">
              <span className="text-sm">Account Type</span>
              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full uppercase font-bold">Verified</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-md">
              <span className="text-sm">Status</span>
              <span className="text-xs text-green-400 font-medium">{profile?.status || 'Active'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
