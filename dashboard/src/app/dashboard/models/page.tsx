import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fmt, fmtPct } from '@/lib/utils';
import { prisma } from '@/lib/prisma';

async function getData() {
  try {
    const [modelForecasts, observations] = await Promise.all([
      prisma.modelForecast.findMany({ include: { prediction: { select: { targetDate: true, logFile: true } } } }),
      prisma.observation.findMany(),
    ]);

    const observedMap = new Map(observations.map((o) => [o.date, o]));
    const byLabel = new Map<string, { diffs: number[]; absDiffs: number[]; hits: number; total: number }>();

    for (const mf of modelForecasts) {
      if (mf.prediction.logFile !== 'main') continue;
      const obs = observedMap.get(mf.prediction.targetDate);
      if (!obs) continue;
      const actual = obs.maxTempEra5 ?? obs.maxTemp;
      const diff = mf.maxTemp - actual;
      if (!byLabel.has(mf.label)) byLabel.set(mf.label, { diffs: [], absDiffs: [], hits: 0, total: 0 });
      const entry = byLabel.get(mf.label)!;
      entry.diffs.push(diff);
      entry.absDiffs.push(Math.abs(diff));
      entry.total++;
      if (Math.abs(diff) <= 0.5) entry.hits++;
    }

    const models = Array.from(byLabel.entries()).map(([label, data]) => {
      const mae = data.absDiffs.reduce((a, b) => a + b, 0) / data.absDiffs.length;
      const bias = data.diffs.reduce((a, b) => a + b, 0) / data.diffs.length;
      const hitRate = data.total ? data.hits / data.total : 0;
      const recent = data.absDiffs.slice(-10);
      const prev = data.absDiffs.slice(-20, -10);
      const recentMae = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
      const prevMae = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
      const trend = recentMae != null && prevMae != null
        ? recentMae < prevMae - 0.05 ? 'up' : recentMae > prevMae + 0.05 ? 'down' : 'flat'
        : 'flat';
      return { label, mae, bias, hitRate, forecastCount: data.total, trend };
    });

    models.sort((a, b) => a.mae - b.mae);
    return { models: models.map((m, i) => ({ ...m, rank: i + 1 })) };
  } catch (err) {
    console.error('[models page]', err);
    return { models: [] };
  }
}

interface ModelRow { rank: number; label: string; mae: number; bias: number; hitRate: number; forecastCount: number; trend: string }

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up') return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (trend === 'down') return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-[#52525b]" />;
}

export default async function ModelsPage() {
  const data = await getData();
  const models: ModelRow[] = data.models ?? [];
  const best = models[0];
  const worst = models[models.length - 1];

  return (
    <div>
      <Topbar title="Models" subtitle="Per-model accuracy ranking" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-2">Best Model</p>
            <p className="text-sm font-semibold text-cyan-400">{best?.label ?? '—'}</p>
            <p className="text-[10px] font-mono text-[#52525b] mt-1">MAE {fmt(best?.mae, 2)}°C</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-2">Models Tracked</p>
            <p className="text-2xl font-semibold font-mono">{models.length}</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#71717a] mb-2">Worst Model</p>
            <p className="text-sm font-semibold text-[#a1a1aa]">{worst?.label ?? '—'}</p>
            <p className="text-[10px] font-mono text-[#52525b] mt-1">MAE {fmt(worst?.mae, 2)}°C</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Model Rankings</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27272a]">
                  {['#', 'Model', 'MAE', 'Bias', 'Hit %', 'Forecasts', 'Trend'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-[#52525b] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.label} className="border-b border-[#27272a]/50 hover:bg-[#27272a]/30 transition-colors">
                    <td className="px-5 py-3"><span className={`font-mono font-semibold ${m.rank <= 3 ? 'text-cyan-400' : 'text-[#52525b]'}`}>{m.rank}</span></td>
                    <td className="px-5 py-3 font-semibold">{m.label}</td>
                    <td className="px-5 py-3 text-right font-mono"><span className={m.mae <= 0.8 ? 'text-emerald-400' : m.mae <= 1.2 ? 'text-yellow-400' : 'text-red-400'}>{fmt(m.mae, 2)}°C</span></td>
                    <td className="px-5 py-3 text-right font-mono"><span className={m.bias > 0.2 ? 'text-orange-400' : m.bias < -0.2 ? 'text-blue-400' : 'text-[#a1a1aa]'}>{m.bias >= 0 ? '+' : ''}{fmt(m.bias, 2)}°C</span></td>
                    <td className="px-5 py-3 text-right font-mono"><span className={m.hitRate >= 0.4 ? 'text-emerald-400' : 'text-[#71717a]'}>{fmtPct(m.hitRate)}</span></td>
                    <td className="px-5 py-3 text-right font-mono text-[#a1a1aa]">{m.forecastCount}</td>
                    <td className="px-5 py-3"><div className="flex justify-center"><TrendIcon trend={m.trend} /></div></td>
                  </tr>
                ))}
                {models.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-[#52525b]">No model data — sync logs first</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
