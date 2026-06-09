'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  BarChart2,
  Activity,
  Zap,
  ArrowLeftRight,
  FlaskConical,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/forecasts', label: 'Forecasts', icon: TrendingUp },
  { href: '/dashboard/models', label: 'Models', icon: BarChart2 },
  { href: '/dashboard/markets', label: 'Markets', icon: Activity },
  { href: '/dashboard/value-bets', label: 'Value Bets', icon: Zap },
  { href: '/dashboard/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/dashboard/research', label: 'Research', icon: FlaskConical },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-[#27272a] bg-[#09090b]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-[#27272a]">
        <Image src="/logo.png" alt="Aeolus" width={28} height={28} className="shrink-0 object-contain" />
        <span className="text-sm font-semibold tracking-tight">Aeolus</span>
        <span className="ml-auto text-[10px] text-[#52525b] font-mono">v2</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors',
                    active
                      ? 'bg-[#18181b] text-[#fafafa]'
                      : 'text-[#71717a] hover:bg-[#18181b] hover:text-[#a1a1aa]'
                  )}
                >
                  <item.icon
                    className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-cyan-400' : '')}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <Separator className="mx-3 my-4 w-auto" />

        <ul className="px-3">
          <li>
            <Link
              href="/dashboard/settings"
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors',
                pathname === '/dashboard/settings'
                  ? 'bg-[#18181b] text-[#fafafa]'
                  : 'text-[#71717a] hover:bg-[#18181b] hover:text-[#a1a1aa]'
              )}
            >
              <Settings
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  pathname === '/dashboard/settings' ? 'text-cyan-400' : ''
                )}
              />
              Settings
            </Link>
          </li>
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-[#27272a] px-5 py-3">
        <p className="text-[10px] text-[#3f3f46] font-mono">London Temperature Signal</p>

      </div>
    </aside>
  );
}
