'use client';

import { useEffect, useState, useCallback } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface MarketRow {
  id: string;
  date: string;
  outcomeName: string;
  marketProbability: number | null;
  ourProbability: number | null;
  edge: number | null;
}

const col = createColumnHelper<MarketRow>();
const columns = [
  col.accessor('date', {
    header: 'Date',
    cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
  }),
  col.accessor('outcomeName', {
    header: 'Outcome',
    cell: (i) => <span className="font-semibold">{i.getValue()}</span>,
  }),
  col.accessor('marketProbability', {
    header: 'Market P',
    cell: (i) => <span className="font-mono">{fmtPct(i.getValue())}</span>,
  }),
  col.accessor('ourProbability', {
    header: 'Our P',
    cell: (i) => <span className="font-mono text-cyan-400">{fmtPct(i.getValue())}</span>,
  }),
  col.accessor('edge', {
    header: 'Edge',
    cell: (i) => {
      const v = i.getValue();
      if (v == null) return <span className="text-[#52525b]">—</span>;
      return (
        <span className={`font-mono font-semibold ${v > 0.05 ? 'text-emerald-400' : v > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
          {v >= 0 ? '+' : ''}{fmtPct(v)}
        </span>
      );
    },
  }),
];

export default function MarketsPage() {
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    const res = await fetch(`/api/markets?page=${page}&limit=${limit}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setDistribution(data.distribution ?? {});
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const totalPages = Math.ceil(total / limit);

  const distData = Object.entries(distribution).map(([range, count]) => ({ range, count }));

  return (
    <div>
      <Topbar title="Markets" subtitle="Market outcome history" />
      <div className="p-6 space-y-6">
        {/* Distribution chart */}
        <Card>
          <CardHeader>
            <CardTitle>Market Probability Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={distData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={48}>
                  {distData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill="#06b6d4" fillOpacity={0.6} />
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
                  {hg.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#52525b] font-medium">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-[#27272a]/50 hover:bg-[#18181b]/50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[#52525b]">No market data</td></tr>
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
