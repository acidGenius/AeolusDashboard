import { cn } from '@/lib/utils';
import { fmt, fmtPct, fmtTemp } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface LastForecastProps {
  data: {
    targetDate: string;
    consensus: number | null;
    forecastRounded: number | null;
    betOn: string | null;
    confidence: number | null;
    confidenceLabel: string | null;
    spread: number | null;
    bestValue: {
      name: string;
      ourP: number;
      price: number;
      edge: number;
    } | null;
  } | null;
}

export function LastForecast({ data }: LastForecastProps) {
  if (!data) {
    return (
      <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-5 h-full flex items-center justify-center">
        <p className="text-xs text-[#52525b]">No forecast data</p>
      </div>
    );
  }

  const confVariant =
    data.confidenceLabel === 'high'
      ? 'high'
      : data.confidenceLabel === 'medium'
      ? 'medium'
      : 'low';

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#18181b] flex flex-col h-full">
      <div className="px-5 pt-5 pb-3 border-b border-[#27272a]">
        <p className="text-[10px] uppercase tracking-widest font-medium text-[#71717a]">
          Latest Forecast
        </p>
        <p className="mt-1 text-sm font-semibold">{data.targetDate}</p>
      </div>

      <div className="flex-1 p-5 grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <p className="text-[10px] text-[#52525b] mb-1">Consensus</p>
          <p className="text-base font-mono font-semibold text-cyan-400">
            {fmtTemp(data.consensus)}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-[#52525b] mb-1">Argmax</p>
          <p className="text-base font-mono font-semibold">
            {data.forecastRounded != null ? `${data.forecastRounded}°C` : '—'}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-[#52525b] mb-1">Bet On</p>
          <p className="text-sm font-semibold text-emerald-400">{data.betOn ?? '—'}</p>
        </div>

        <div>
          <p className="text-[10px] text-[#52525b] mb-1">Confidence</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{fmtPct(data.confidence)}</span>
            <Badge variant={confVariant as 'high' | 'medium' | 'low'}>
              {data.confidenceLabel ?? '—'}
            </Badge>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-[#52525b] mb-1">Spread</p>
          <p className="text-sm font-mono">{fmt(data.spread, 1)}°C</p>
        </div>

        <div>
          <p className="text-[10px] text-[#52525b] mb-1">Best Value</p>
          {data.bestValue ? (
            <div>
              <p className="text-sm font-semibold text-purple-400">{data.bestValue.name}</p>
              <p className="text-[10px] text-[#71717a] font-mono mt-0.5">
                edge +{(data.bestValue.edge * 100).toFixed(0)}% · mkt {(data.bestValue.price * 100).toFixed(0)}%
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#52525b]">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
