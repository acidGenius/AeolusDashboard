import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number | null;
  subtitle?: string;
  accent?: 'cyan' | 'emerald' | 'purple' | 'neutral';
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  className?: string;
}

const accentMap = {
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  purple: 'text-purple-400',
  neutral: 'text-[#fafafa]',
};

export function MetricCard({
  title,
  value,
  subtitle,
  accent = 'neutral',
  trend,
  trendValue,
  className,
}: MetricCardProps) {
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-400'
      : trend === 'down'
      ? 'text-red-400'
      : 'text-[#52525b]';

  return (
    <div
      className={cn(
        'rounded-lg border border-[#27272a] bg-[#18181b] p-5 flex flex-col gap-3',
        className
      )}
    >
      <p className="text-[10px] uppercase tracking-widest font-medium text-[#71717a]">{title}</p>

      <div className="flex items-end justify-between gap-2">
        <span className={cn('text-2xl font-semibold font-mono tabular-nums leading-none', accentMap[accent])}>
          {value ?? '—'}
        </span>

        {trend && (
          <div className={cn('flex items-center gap-1 text-xs', trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {trendValue && <span className="font-mono">{trendValue}</span>}
          </div>
        )}
      </div>

      {subtitle && <p className="text-[11px] text-[#52525b]">{subtitle}</p>}
    </div>
  );
}
