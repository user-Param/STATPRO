import React from 'react';

const Navbar = () => {
  return (
    <nav className="h-16 border-b border-black text-white flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <span className="font-bold text-xl text-[#000] tracking-tight">STATPRO</span>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-black px-2 py-1 border rounded-sm font-medium transition-colors text-sm">
          Connect Wallet
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
