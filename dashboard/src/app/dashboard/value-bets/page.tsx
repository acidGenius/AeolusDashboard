'use client';

import { useEffect, useState, useCallback } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtPct } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';

interface ValueBetRow {
  id: string;
  date: string;
  name: string;
  ourP: number;
  marketPrice: number;
  edge: number;
  won: boolean | null;
  roi: number | null;
}

interface EdgeBucket {
  range: string;
  count: number;
  roi: number | null;
  winRate: number | null;
}

const col = createColumnHelper<ValueBetRow>();
const columns = [
  col.accessor('date', {
    header: 'Date',
    cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
  }),
  col.accessor('name', {
    header: 'Outcome',
    cell: (i) => <span className="font-semibold">{i.getValue()}</span>,
  }),
  col.accessor('ourP', {
    header: 'Our P',
    cell: (i) => <span className="font-mono text-cyan-400">{fmtPct(i.getValue())}</span>,
  }),
  col.accessor('marketPrice', {
    header: 'Market P',
    cell: (i) => <span className="font-mono">{fmtPct(i.getValue())}</span>,
  }),
  col.accessor('edge', {
    header: 'Edge',
    cell: (i) => (
      <span className={`font-mono font-semibold ${i.getValue() > 0.1 ? 'text-emerald-400' : i.getValue() > 0.05 ? 'text-yellow-400' : 'text-[#a1a1aa]'}`}>
        +{fmtPct(i.getValue())}
      </span>
    ),
  }),
  col.accessor('won', {
    header: 'Result',
    cell: (i) => {
      const v = i.getValue();
      if (v === null) return <Badge variant="open">Open</Badge>;
      return <Badge variant={v ? 'hit' : 'miss'}>{v ? 'Win' : 'Loss'}</Badge>;
    },
  }),
  col.accessor('roi', {
    header: 'ROI',
    cell: (i) => {
      const v = i.getValue();
      if (v == null) return <span className="text-[#52525b]">—</span>;
      return (
        <span className={`font-mono font-semibold ${v > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {v >= 0 ? '+' : ''}{(v * 100).toFixed(0)}%
        </span>
      );
    },
  }),
];

export default function ValueBetsPage() {
  const [rows, setRows] = useState<ValueBetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [buckets, setBuckets] = useState<EdgeBucket[]>([]);
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    const res = await fetch(`/api/value-bets?page=${page}&limit=${limit}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setBuckets(data.edgeBuckets ?? []);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <Topbar title="Value Bets" subtitle="Edge analysis" />
      <div className="p-6 space-y-6">
        {/* Edge bucket cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {buckets.map((b) => (
            <div key={b.range} className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
              <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-2">Edge {b.range}</p>
              <p className="text-lg font-semibold font-mono text-purple-400">{b.count}</p>
              <p className="text-[10px] text-[#52525b] mt-1">
                ROI: <span className={`font-mono ${b.roi == null ? '' : b.roi > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.roi != null ? `${b.roi >= 0 ? '+' : ''}${(b.roi * 100).toFixed(0)}%` : '—'}
                </span>
                {b.winRate != null && (
                  <span className="ml-2 text-[#52525b]">W:{(b.winRate * 100).toFixed(0)}%</span>
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Edge ROI chart */}
        <Card>
          <CardHeader>
            <CardTitle>ROI by Edge Bucket</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#52525b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'ROI']}
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
                />
                <Bar dataKey="roi" radius={[2, 2, 0, 0]} maxBarSize={48}>
                  {buckets.map((b, i) => (
                    <Cell key={`cell-${i}`} fill={b.roi != null && b.roi > 0 ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Table */}
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
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#52525b]">No value bet data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-[#71717a]">{total} total · page {page} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
