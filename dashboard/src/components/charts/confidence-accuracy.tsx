'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface ConfidenceAccuracyProps {
  data: { range: string; winRate: number | null; count: number }[];
}

export function ConfidenceAccuracy({ data }: ConfidenceAccuracyProps) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-[#52525b]">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="range"
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 1]}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Win Rate']}
          labelFormatter={(v) => `Confidence: ${v}`}
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
        />
        <Bar dataKey="winRate" radius={[2, 2, 0, 0]} maxBarSize={48}>
          {data.map((entry, index) => {
            const rate = entry.winRate ?? 0;
            const color = rate >= 0.5 ? '#10b981' : rate >= 0.35 ? '#a855f7' : '#52525b';
            return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.8} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
