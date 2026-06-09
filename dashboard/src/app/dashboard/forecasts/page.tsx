'use client';

import { useEffect, useState, useCallback } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { fmt, fmtPct, fmtTemp } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ForecastRow {
  id: string;
  date: string;
  consensus: number | null;
  forecastRounded: number | null;
  betOn: string | null;
  confidence: number | null;
  confidenceLabel: string | null;
  spread: number | null;
  agreementRatio: number | null;
  actualTemp: number | null;
  hit: boolean | null;
  error: number | null;
}

const col = createColumnHelper<ForecastRow>();

const columns = [
  col.accessor('date', {
    header: 'Date',
    cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
  }),
  col.accessor('consensus', {
    header: 'Consensus',
    cell: (i) => <span className="font-mono">{fmtTemp(i.getValue())}</span>,
  }),
  col.accessor('forecastRounded', {
    header: 'Argmax',
    cell: (i) => <span className="font-mono">{i.getValue() != null ? `${i.getValue()}°C` : '—'}</span>,
  }),
  col.accessor('betOn', {
    header: 'Bet On',
    cell: (i) => <span className="text-emerald-400 font-semibold">{i.getValue() ?? '—'}</span>,
  }),
  col.accessor('confidence', {
    header: 'Confidence',
    cell: (i) => {
      const row = i.row.original;
      const variant =
        row.confidenceLabel === 'high' ? 'high' : row.confidenceLabel === 'medium' ? 'medium' : 'low';
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono">{fmtPct(i.getValue())}</span>
          <Badge variant={variant as 'high' | 'medium' | 'low'}>{row.confidenceLabel ?? '—'}</Badge>
        </div>
      );
    },
  }),
  col.accessor('spread', {
    header: 'Spread',
    cell: (i) => <span className="font-mono">{fmt(i.getValue(), 1)}°</span>,
  }),
  col.accessor('agreementRatio', {
    header: 'Agreement',
    cell: (i) => <span className="font-mono">{fmtPct(i.getValue())}</span>,
  }),
  col.accessor('actualTemp', {
    header: 'Actual',
    cell: (i) => <span className="font-mono">{fmtTemp(i.getValue())}</span>,
  }),
  col.accessor('hit', {
    header: 'Result',
    cell: (i) => {
      const v = i.getValue();
      if (v === null) return <Badge variant="open">Open</Badge>;
      return <Badge variant={v ? 'hit' : 'miss'}>{v ? 'Hit' : 'Miss'}</Badge>;
    },
  }),
  col.accessor('error', {
    header: 'Error',
    cell: (i) => {
      const v = i.getValue();
      if (v == null) return <span className="text-[#52525b]">—</span>;
      return (
        <span
          className={`font-mono ${Math.abs(v) <= 0.5 ? 'text-emerald-400' : Math.abs(v) <= 1 ? 'text-yellow-400' : 'text-red-400'}`}
        >
          {v >= 0 ? '+' : ''}{v.toFixed(2)}°
        </span>
      );
    },
  }),
];

export default function ForecastsPage() {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [confidence, setConfidence] = useState('all');
  const [result, setResult] = useState('all');
  const limit = 50;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (confidence !== 'all') params.set('confidence', confidence);
    if (result !== 'all') params.set('result', result);
    const res = await fetch(`/api/forecasts?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
  }, [page, confidence, result]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [confidence, result]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <Topbar title="Forecasts" subtitle={`${total} total predictions`} />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Confidence</span>
            <Select value={confidence} onValueChange={setConfidence}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717a]">Result</span>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="hit">Hit</SelectItem>
                <SelectItem value="miss">Miss</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-[#52525b]">
                    No forecasts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#71717a]">
            {total} total · page {page} of {totalPages}
          </p>
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
