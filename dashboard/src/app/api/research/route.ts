import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [predictions, observations] = await Promise.all([
      prisma.prediction.findMany({ where: { logFile: 'main' }, orderBy: { targetDate: 'asc' } }),
      prisma.observation.findMany(),
    ]);

    const observedMap = new Map(observations.map((o) => [o.date, o]));
    const resolved = predictions.filter((p) => observedMap.has(p.targetDate));

    const argmaxVsConsensus = resolved.map((p) => {
      const obs = observedMap.get(p.targetDate)!;
      const actual = obs.maxTempEra5 ?? obs.maxTemp;
      const actualBand = Math.round(obs.maxTemp);
      const argmax = p.forecastRounded;
      const consensus = p.consensusValue != null ? Math.round(p.consensusValue) : null;
      return {
        date: p.targetDate, argmax, consensus, actual: actualBand,
        argmaxHit: argmax != null ? argmax === actualBand : null,
        consensusHit: consensus != null ? consensus === actualBand : null,
        argmaxErr: argmax != null ? Math.abs(actual - argmax) : null,
        consensusErr: consensus != null && p.consensusValue != null ? Math.abs(actual - p.consensusValue) : null,
      };
    });

    const resolvedCount = argmaxVsConsensus.length;
    const argmaxHits = argmaxVsConsensus.filter((r) => r.argmaxHit === true).length;
    const consensusHits = argmaxVsConsensus.filter((r) => r.consensusHit === true).length;
    const argmaxErrs = argmaxVsConsensus.filter((r) => r.argmaxErr != null).map((r) => r.argmaxErr!);
    const consensusErrs = argmaxVsConsensus.filter((r) => r.consensusErr != null).map((r) => r.consensusErr!);
    const argmaxMae = argmaxErrs.length ? argmaxErrs.reduce((a, b) => a + b, 0) / argmaxErrs.length : null;
    const consensusMae = consensusErrs.length ? consensusErrs.reduce((a, b) => a + b, 0) / consensusErrs.length : null;

    const spreadBuckets: Record<string, { hits: number; total: number }> = {
      '0-0.6': { hits: 0, total: 0 }, '0.6-1.2': { hits: 0, total: 0 },
      '1.2-2': { hits: 0, total: 0 }, '2+': { hits: 0, total: 0 },
    };
    for (const p of resolved) {
      const obs = observedMap.get(p.targetDate)!;
      const hit = p.forecastRounded != null && Math.round(obs.maxTemp) === p.forecastRounded;
      const spread = p.spread ?? 0;
      const key = spread <= 0.6 ? '0-0.6' : spread <= 1.2 ? '0.6-1.2' : spread <= 2 ? '1.2-2' : '2+';
      spreadBuckets[key].total++;
      if (hit) spreadBuckets[key].hits++;
    }
    const spreadAccuracy = Object.entries(spreadBuckets).map(([range, data]) => ({
      range, accuracy: data.total ? data.hits / data.total : null, count: data.total,
    }));

    const confBuckets: Record<string, { hits: number; total: number }> = {
      '0-0.4': { hits: 0, total: 0 }, '0.4-0.6': { hits: 0, total: 0 },
      '0.6-0.8': { hits: 0, total: 0 }, '0.8-1': { hits: 0, total: 0 },
    };
    for (const p of resolved) {
      const obs = observedMap.get(p.targetDate)!;
      const hit = p.forecastRounded != null && Math.round(obs.maxTemp) === p.forecastRounded;
      const conf = p.confidence ?? 0;
      const key = conf < 0.4 ? '0-0.4' : conf < 0.6 ? '0.4-0.6' : conf < 0.8 ? '0.6-0.8' : '0.8-1';
      confBuckets[key].total++;
      if (hit) confBuckets[key].hits++;
    }
    const confidenceAccuracy = Object.entries(confBuckets).map(([range, data]) => ({
      range, winRate: data.total ? data.hits / data.total : null, count: data.total,
    }));

    const errors = resolved.map((p) => {
      const obs = observedMap.get(p.targetDate)!;
      return (obs.maxTempEra5 ?? obs.maxTemp) - (p.forecastRaw ?? p.forecastRounded ?? 0);
    }).filter(isFinite);
    const errorBins: Record<string, number> = {};
    for (const e of errors) {
      const bin = Math.round(e * 2) / 2;
      const key = `${bin >= 0 ? '+' : ''}${bin.toFixed(1)}`;
      errorBins[key] = (errorBins[key] ?? 0) + 1;
    }
    const errorDistribution = Object.entries(errorBins)
      .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
      .map(([bin, count]) => ({ bin: parseFloat(bin), count }));

    const modelForecasts = await prisma.modelForecast.findMany({
      where: { prediction: { logFile: 'main' } },
      select: { label: true, normalizedWeight: true },
    });
    const contributionMap = new Map<string, number[]>();
    for (const mf of modelForecasts) {
      if (mf.normalizedWeight == null) continue;
      if (!contributionMap.has(mf.label)) contributionMap.set(mf.label, []);
      contributionMap.get(mf.label)!.push(mf.normalizedWeight);
    }
    const modelContribution = Array.from(contributionMap.entries())
      .map(([label, weights]) => ({ label, avgWeight: weights.reduce((a, b) => a + b, 0) / weights.length }))
      .sort((a, b) => b.avgWeight - a.avgWeight);

    return NextResponse.json({
      argmaxVsConsensus: {
        data: argmaxVsConsensus.slice(-30),
        summary: { argmaxAccuracy: resolvedCount ? argmaxHits / resolvedCount : null,
          consensusAccuracy: resolvedCount ? consensusHits / resolvedCount : null,
          argmaxMae, consensusMae, resolvedCount },
      },
      spreadAccuracy, confidenceAccuracy, errorDistribution, modelContribution,
    });
  } catch (err) {
    console.error('[/api/research]', err);
    return NextResponse.json(
      { argmaxVsConsensus: { data: [], summary: {} }, spreadAccuracy: [],
        confidenceAccuracy: [], errorDistribution: [], modelContribution: [], error: String(err) },
      { status: 500 }
    );
  }
}
