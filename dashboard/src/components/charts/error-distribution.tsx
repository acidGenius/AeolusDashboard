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
  ReferenceLine,
} from 'recharts';

interface ErrorDistributionProps {
  data: { bin: number; count: number }[];
}

export function ErrorDistribution({ data }: ErrorDistributionProps) {
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
          dataKey="bin"
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}°`}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value) => [`${value} forecasts`, 'Count']}
          labelFormatter={(v) => `Error: ${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}°C`}
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
        />
        <ReferenceLine x={0} stroke="#27272a" />
        <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={32}>
          {data.map((entry) => (
            <Cell
              key={`cell-${entry.bin}`}
              fill={entry.bin === 0 ? '#06b6d4' : entry.bin > 0 ? '#a855f7' : '#f97316'}
              fillOpacity={0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
