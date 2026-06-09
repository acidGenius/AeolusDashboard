import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [modelForecasts, observations] = await Promise.all([
      prisma.modelForecast.findMany({
        include: { prediction: { select: { targetDate: true, logFile: true } } },
      }),
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
    const ranked = models.map((m, i) => ({ ...m, rank: i + 1 }));

    return NextResponse.json({ models: ranked });
  } catch (err) {
    console.error('[/api/models]', err);
    return NextResponse.json({ models: [], error: String(err) }, { status: 500 });
  }
}
