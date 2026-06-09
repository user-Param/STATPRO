import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-8">
      <div className="space-y-4">
        <h1 className="text-5xl font-extrabold tracking-tight">
          Welcome to <span className="text-blue-500">Statpro</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-md mx-auto">
          The professional interface for spot and perpetual trading agents.
          Manage your portfolio and execute strategies with precision.
        </p>
      </div>
      <Link
        href="/spot"
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all scale-100 hover:scale-105 active:scale-95"
      >
        Enter Dashboard
      </Link>
    </div>
  );
}
