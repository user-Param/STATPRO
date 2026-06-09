import React from 'react';

const ProfilePage = () => {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-3xl font-bold">User Profile</h1>

      <div className=" border border-zinc-800 rounded-xl p-6 flex items-center gap-6">
        <div className="w-20 h-20  rounded-full flex items-center justify-center text-2xl">👤</div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Trader_0x7a...</h2>
          <p className="text-zinc-400 text-sm">Member since June 2026</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 uppercase">Total Balance</p>
          <p className="text-2xl font-bold">$12,450.00</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className=" border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Account Settings</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-2  rounded-md transition-colors cursor-pointer">
              <span className="text-sm">Email Notifications</span>
              <div className="w-10 h-5  rounded-full relative"><div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full"></div></div>
            </div>
            <div className="flex justify-between items-center p-2  rounded-md transition-colors cursor-pointer">
              <span className="text-sm">Two-Factor Auth</span>
              <span className="text-xs text-zinc-500 italic">Not Enabled</span>
            </div>
          </div>
        </div>
        <div className=" border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Trading Performance</h3>
          <div className="text-center py-8">
            <p className="text-4xl font-bold text-green-500">+12.4%</p>
            <p className="text-zinc-500 text-sm mt-2">All-time ROI</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
