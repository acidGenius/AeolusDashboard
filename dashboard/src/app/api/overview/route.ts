import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
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
    const strategies = ['kelly_pure', 'kelly_shrunk', 'market_weighted'];
    const bankByStrategy: Record<string, number> = {};
    for (const s of strategies) {
      const last = settledBets.filter((b) => b.strategy === s).at(-1);
      bankByStrategy[s] = last?.bankAfter ?? 100;
    }

    const shrunkSettled = settledBets.filter((b) => b.strategy === 'kelly_shrunk');
    const wonBets = shrunkSettled.filter((b) => b.won).length;
    const winRate = shrunkSettled.length ? wonBets / shrunkSettled.length : null;
    const pnl = shrunkSettled.reduce((sum, b) => sum + (b.delta ?? 0), 0);
    const roi = pnl / 100;

    const allValueBets = await prisma.valueBet.findMany({ where: { edge: { gt: 0 } } });
    const avgEdge = allValueBets.length
      ? allValueBets.reduce((s, v) => s + v.edge, 0) / allValueBets.length : null;

    const openPrediction = predictions
      .filter((p) => !observedMap.has(p.targetDate))
      .sort((a, b) => b.targetDate.localeCompare(a.targetDate))[0];

    const equityCurve: { date: string; bank: number }[] = [{ date: 'start', bank: 100 }];
    for (const bet of paperBets.filter((b) => b.strategy === 'kelly_shrunk').sort((a, b) => a.targetDate.localeCompare(b.targetDate))) {
      if (bet.type === 'settle' && bet.bankAfter != null) equityCurve.push({ date: bet.targetDate, bank: bet.bankAfter });
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

    return NextResponse.json({
      kpis: {
        accuracy, mae, roi,
        currentBank: bankByStrategy['kelly_shrunk'] ?? 100,
        forecastCount: predictions.length,
        openPositions: openPrediction ? 1 : 0,
        winRate, avgEdge,
      },
      equityCurve, forecastVsActual, latestPrediction,
    });
  } catch (err) {
    console.error('[/api/overview]', err);
    return NextResponse.json(
      { kpis: { accuracy: null, mae: null, roi: null, currentBank: 100, forecastCount: 0, openPositions: 0, winRate: null, avgEdge: null },
        equityCurve: [], forecastVsActual: [], latestPrediction: null, error: String(err) },
      { status: 500 }
    );
  }
}
