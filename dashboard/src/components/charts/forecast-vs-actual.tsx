'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ForecastVsActualProps {
  data: { date: string; forecast: number | null; actual: number | null }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[#27272a] bg-[#18181b] px-3 py-2 text-xs space-y-1">
      <p className="text-[#71717a]">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-mono">
          {entry.name}: {entry.value?.toFixed(1)}°C
        </p>
      ))}
      {payload.length === 2 && (
        <p className="text-[10px] text-[#71717a] font-mono">
          err: {(payload[1].value - payload[0].value).toFixed(1)}°C
        </p>
      )}
    </div>
  );
}

export function ForecastVsActual({ data }: ForecastVsActualProps) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-[#52525b]">
        No resolved forecasts
      </div>
    );
  }

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
          tickFormatter={(v) => `${v}°`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="plainline"
          iconSize={12}
          wrapperStyle={{ fontSize: 10, color: '#71717a' }}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          name="Forecast"
          stroke="#06b6d4"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Actual"
          stroke="#a855f7"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
