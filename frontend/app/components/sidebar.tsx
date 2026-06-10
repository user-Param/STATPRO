"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Sidebar = () => {
  const pathname = usePathname();

  const menuItems = [
    { name: 'Spot', href: '/spot', icon: '' },
    { name: 'Perp', href: '/perp', icon: '' },
    { name: 'Corelation', href: '/corelation', icon: '' },
    { name: 'Profile', href: '/profile', icon: '' },
  ];

  return (
    <aside className="w-64 h-screen text-zinc-300 border-r border-zinc-800 flex flex-col">
      <div className="p-6">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
          Navigation
        </h2>
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  pathname === item.href
                    ? 'bg-zinc-800 text-white'
                    : 'hover:bg-zinc-900 hover:text-zinc-100'
                }`}
              >
                <span>{item.icon}</span>
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;
