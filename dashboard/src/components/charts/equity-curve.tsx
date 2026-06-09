'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface EquityCurveProps {
  data: { date: string; bank: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const bank = payload[0].value;
  const pnl = bank - 100;
  return (
    <div className="rounded border border-[#27272a] bg-[#18181b] px-3 py-2 text-xs">
      <p className="text-[#71717a]">{label}</p>
      <p className="font-mono font-semibold">${bank.toFixed(2)}</p>
      <p className={`font-mono text-[10px] ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({((pnl / 100) * 100).toFixed(1)}%)
      </p>
    </div>
  );
}

export function EquityCurve({ data }: EquityCurveProps) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-[#52525b]">
        No trade data
      </div>
    );
  }

  const lastBank = data[data.length - 1]?.bank ?? 100;
  const isPositive = lastBank >= 100;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={100} stroke="#27272a" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="bank"
          stroke={isPositive ? '#10b981' : '#ef4444'}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: isPositive ? '#10b981' : '#ef4444' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
