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

interface ModelContributionProps {
  data: { label: string; avgWeight: number }[];
}

export function ModelContribution({ data }: ModelContributionProps) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-[#52525b]">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: '#52525b' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          domain={[0, 'dataMax']}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 10, fill: '#a1a1aa' }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip
          formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Avg Weight']}
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
        />
        <Bar dataKey="avgWeight" radius={[0, 2, 2, 0]} maxBarSize={18}>
          {data.map((entry, index) => {
            const opacity = 0.4 + (1 - index / data.length) * 0.6;
            return <Cell key={`cell-${index}`} fill="#06b6d4" fillOpacity={opacity} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
