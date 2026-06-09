'use client';

import { useEffect, useState, useCallback } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EquityCurve } from '@/components/charts/equity-curve';
import { fmtPct, fmtMoney, fmt } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';

interface TradeRow {
  id: string;
  type: string;
  date: string;
  band: number | null;
  betOn: string | null;
  stake: number;
  price: number;
  ourP: number | null;
  edge: number | null;
  bankBefore: number | null;
  bankAfter: number | null;
  won: boolean | null;
  delta: number | null;
}

const col = createColumnHelper<TradeRow>();
const columns = [
  col.accessor('type', {
    header: 'Type',
    cell: (i) => (
      <Badge variant={i.getValue() === 'place' ? 'open' : i.row.original.won ? 'hit' : 'miss'}>
        {i.getValue()}
      </Badge>
    ),
  }),
  col.accessor('date', {
    header: 'Date',
    cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
  }),
  col.accessor('betOn', {
    header: 'Bet On',
    cell: (i) => <span className="font-semibold">{i.getValue() ?? '—'}</span>,
  }),
  col.accessor('stake', {
    header: 'Stake',
    cell: (i) => <span className="font-mono">${i.getValue()?.toFixed(2)}</span>,
  }),
  col.accessor('price', {
    header: 'Price',
    cell: (i) => <span className="font-mono">{fmtPct(i.getValue())}</span>,
  }),
  col.accessor('bankBefore', {
    header: 'Bank Before',
    cell: (i) => <span className="font-mono text-[#71717a]">${i.getValue()?.toFixed(2) ?? '—'}</span>,
  }),
  col.accessor('bankAfter', {
    header: 'Bank After',
    cell: (i) => <span className="font-mono">${i.getValue()?.toFixed(2) ?? '—'}</span>,
  }),
  col.accessor('delta', {
    header: 'PnL',
    cell: (i) => {
      const v = i.getValue();
      if (v == null) return <span className="text-[#52525b]">—</span>;
      return (
        <span className={`font-mono font-semibold ${v > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}
        </span>
      );
    },
  }),
];

export default function TradesPage() {
  const [data, setData] = useState<{
    rows: TradeRow[];
    equityCurve: { date: string; bank: number }[];
    monthlyRoi: { month: string; pnl: number; bets: number }[];
    drawdown: { date: string; bank: number; drawdown: number }[];
    stats: { winRate: number | null; totalTrades: number; wins: number; losses: number; totalPnl: number; currentBank: number; roi: number; maxDrawdown: number };
    allStrategiesBank: { strategy: string; bank: number }[];
  } | null>(null);

  const [strategy, setStrategy] = useState('kelly_shrunk');

  const load = useCallback(async () => {
    const res = await fetch(`/api/trades?strategy=${strategy}`);
    const json = await res.json();
    setData(json);
  }, [strategy]);

  useEffect(() => { load(); }, [load]);

  const table = useReactTable({ data: data?.rows ?? [], columns, getCoreRowModel: getCoreRowModel() });

  const stats = data?.stats;

  return (
    <div>
      <Topbar title="Trades" subtitle="Paper trading history" />
      <div className="p-6 space-y-6">
        {/* Strategy selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#71717a]">Strategy</span>
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kelly_pure">¼ Kelly (Pure)</SelectItem>
              <SelectItem value="kelly_shrunk">¼ Kelly + Shrink</SelectItem>
              <SelectItem value="market_weighted">Market Weighted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Strategy comparison */}
        <div className="grid grid-cols-3 gap-4">
          {(data?.allStrategiesBank ?? []).map((s) => {
            const pnl = s.bank - 100;
            return (
              <div
                key={s.strategy}
                className={`rounded-lg border p-4 ${strategy === s.strategy ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-[#27272a] bg-[#18181b]'}`}
              >
                <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-2 truncate">
                  {s.strategy.replace('_', ' ')}
                </p>
                <p className={`text-lg font-semibold font-mono ${s.bank >= 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${s.bank.toFixed(2)}
                </p>
                <p className={`text-[10px] font-mono mt-0.5 ${pnl >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({((pnl / 100) * 100).toFixed(1)}%)
                </p>
              </div>
            );
          })}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-1">Win Rate</p>
            <p className={`text-xl font-semibold font-mono ${(stats?.winRate ?? 0) >= 0.5 ? 'text-emerald-400' : 'text-[#a1a1aa]'}`}>
              {stats?.winRate != null ? `${(stats.winRate * 100).toFixed(1)}%` : '—'}
            </p>
            <p className="text-[10px] text-[#52525b] mt-1">{stats?.wins ?? 0}W / {stats?.losses ?? 0}L</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-1">Total PnL</p>
            <p className={`text-xl font-semibold font-mono ${(stats?.totalPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stats?.totalPnl != null ? `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-1">ROI</p>
            <p className={`text-xl font-semibold font-mono ${(stats?.roi ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stats?.roi != null ? `${stats.roi >= 0 ? '+' : ''}${(stats.roi * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-1">Max Drawdown</p>
            <p className="text-xl font-semibold font-mono text-red-400">
              {stats?.maxDrawdown != null ? `${(stats.maxDrawdown * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Equity Curve</CardTitle></CardHeader>
            <CardContent>
              <EquityCurve data={data?.equityCurve ?? []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Monthly PnL</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data?.monthlyRoi ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                  <Tooltip
                    formatter={(v: number) => [`$${v.toFixed(2)}`, 'PnL']}
                    contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
                  />
                  <ReferenceLine y={0} stroke="#27272a" />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={40}>
                    {(data?.monthlyRoi ?? []).map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Drawdown */}
        <Card>
          <CardHeader><CardTitle>Drawdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={data?.drawdown ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Drawdown']}
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
                />
                <Bar dataKey="drawdown" fill="#ef4444" fillOpacity={0.5} radius={[0, 0, 2, 2]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trade log */}
        <div className="rounded-lg border border-[#27272a] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-[#27272a] bg-[#18181b]">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#52525b] font-medium">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-[#27272a]/50 hover:bg-[#18181b]/50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#52525b]">No trade data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
