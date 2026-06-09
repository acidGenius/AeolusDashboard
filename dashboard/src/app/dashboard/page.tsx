import { Topbar } from '@/components/layout/topbar';
import { MetricCard } from '@/components/cards/metric-card';
import { LastForecast } from '@/components/cards/last-forecast';
import { EquityCurve } from '@/components/charts/equity-curve';
import { ForecastVsActual } from '@/components/charts/forecast-vs-actual';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';

async function getData() {
  try {
    const [predictions, observations, paperBets] = await Promise.all([
      prisma.prediction.findMany({ where: { logFile: 'main' }, orderBy: { targetDate: 'asc' }, include: { modelForecasts: true } }),
      prisma.observation.findMany({ orderBy: { date: 'asc' } }),
      prisma.paperBet.findMany({ orderBy: { targetDate: 'asc' } }),
    ]);

    const observedMap = new Map(observations.map((o) => [o.date, o]));
    const resolved = predictions.filter((p) => observedMap.has(p.targetDate));

    const hits = resolved.filter((p) => {
      const obs = observedMap.get(p.targetDate);
      return obs && p.forecastRounded != null && Math.round(obs.maxTemp) === p.forecastRounded;
    });
    const maes = resolved.map((p) => {
      const obs = observedMap.get(p.targetDate)!;
      return Math.abs((obs.maxTempEra5 ?? obs.maxTemp) - (p.forecastRaw ?? p.forecastRounded ?? 0));
    }).filter(isFinite);

    const mae = maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null;
    const accuracy = resolved.length ? hits.length / resolved.length : null;

    const settledBets = paperBets.filter((b) => b.type === 'settle');
    const shrunkSettled = settledBets.filter((b) => b.strategy === 'kelly_shrunk');
    const wonBets = shrunkSettled.filter((b) => b.won).length;
    const winRate = shrunkSettled.length ? wonBets / shrunkSettled.length : null;
    const pnl = shrunkSettled.reduce((sum, b) => sum + (b.delta ?? 0), 0);
    const roi = pnl / 100;
    const currentBank = shrunkSettled.at(-1)?.bankAfter ?? 100;

    const allValueBets = await prisma.valueBet.findMany({ where: { edge: { gt: 0 } } });
    const avgEdge = allValueBets.length ? allValueBets.reduce((s, v) => s + v.edge, 0) / allValueBets.length : null;

    const openPrediction = predictions.filter((p) => !observedMap.has(p.targetDate)).at(-1);

    const equityCurve: { date: string; bank: number }[] = [{ date: 'start', bank: 100 }];
    for (const bet of shrunkSettled) {
      if (bet.bankAfter != null) equityCurve.push({ date: bet.targetDate, bank: bet.bankAfter });
    }

    const forecastVsActual = resolved.slice(-30).map((p) => {
      const obs = observedMap.get(p.targetDate)!;
      return { date: p.targetDate, forecast: p.forecastRaw ?? p.forecastRounded, actual: obs.maxTempEra5 ?? obs.maxTemp };
    });

    const latest = predictions.at(-1);
    const latestPrediction = latest
      ? {
          targetDate: latest.targetDate,
          consensus: latest.consensusValue,
          forecastRounded: latest.forecastRounded,
          betOn: latest.betOn,
          confidence: latest.confidence,
          confidenceLabel: latest.confidenceLabel,
          spread: latest.spread,
          bestValue: await prisma.valueBet.findFirst({
            where: { predictionId: latest.id, edge: { gt: 0 } },
            orderBy: { edge: 'desc' },
          }).then((v) => v ?? null),
        }
      : null;

    return {
      kpis: { accuracy, mae, roi, currentBank, forecastCount: predictions.length, openPositions: openPrediction ? 1 : 0, winRate, avgEdge },
      equityCurve, forecastVsActual, latestPrediction,
    };
  } catch (err) {
    console.error('[overview page]', err);
    return null;
  }
}

export default async function OverviewPage() {
  const data = await getData();
  const kpis = data?.kpis ?? {};

  return (
    <div>
      <Topbar title="Overview" subtitle="London max temperature signal engine" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Accuracy" value={kpis.accuracy != null ? `${(kpis.accuracy * 100).toFixed(1)}%` : '—'} subtitle="exact band hit rate" accent="cyan" />
          <MetricCard title="MAE" value={kpis.mae != null ? `${kpis.mae.toFixed(2)}°C` : '—'} subtitle="mean absolute error (ERA5)" accent="neutral" />
          <MetricCard title="ROI" value={kpis.roi != null ? `${(kpis.roi * 100).toFixed(1)}%` : '—'} subtitle="kelly_shrunk strategy" accent={kpis.roi >= 0 ? 'emerald' : 'neutral'} trend={kpis.roi > 0 ? 'up' : kpis.roi < 0 ? 'down' : 'flat'} />
          <MetricCard title="Current Bank" value={kpis.currentBank != null ? `$${kpis.currentBank.toFixed(2)}` : '—'} subtitle="started at $100" accent={kpis.currentBank >= 100 ? 'emerald' : 'neutral'} />
          <MetricCard title="Forecast Count" value={kpis.forecastCount ?? '—'} subtitle="main cycle predictions" accent="neutral" />
          <MetricCard title="Open Positions" value={kpis.openPositions ?? '0'} subtitle="unresolved forecasts" accent={kpis.openPositions > 0 ? 'cyan' : 'neutral'} />
          <MetricCard title="Win Rate" value={kpis.winRate != null ? `${(kpis.winRate * 100).toFixed(1)}%` : '—'} subtitle="kelly_shrunk settled bets" accent={kpis.winRate >= 0.5 ? 'emerald' : 'neutral'} />
          <MetricCard title="Average Edge" value={kpis.avgEdge != null ? `+${(kpis.avgEdge * 100).toFixed(1)}%` : '—'} subtitle="across positive value bets" accent="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Equity Curve</CardTitle></CardHeader>
            <CardContent><EquityCurve data={data?.equityCurve ?? []} /></CardContent>
          </Card>
          <LastForecast data={data?.latestPrediction ?? null} />
        </div>

        <Card>
          <CardHeader><CardTitle>Forecast vs Actual (last 30 resolved)</CardTitle></CardHeader>
          <CardContent><ForecastVsActual data={data?.forecastVsActual ?? []} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
