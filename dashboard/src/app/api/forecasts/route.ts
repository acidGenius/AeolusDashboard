import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const confidence = searchParams.get('confidence');
    const result = searchParams.get('result');
    const logFile = searchParams.get('logFile') ?? 'main';

    const where = {
      logFile,
      ...(dateFrom || dateTo ? { targetDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
      ...(confidence === 'high' ? { confidence: { gte: 0.7 } }
        : confidence === 'medium' ? { confidence: { gte: 0.4, lt: 0.7 } }
        : confidence === 'low' ? { confidence: { lt: 0.4 } }
        : {}),
    };

    const [predictions, observations, total] = await Promise.all([
      prisma.prediction.findMany({ where, orderBy: { targetDate: 'desc' }, take: limit, skip: (page - 1) * limit }),
      prisma.observation.findMany(),
      prisma.prediction.count({ where }),
    ]);

    const observedMap = new Map(observations.map((o) => [o.date, o]));

    let rows = predictions.map((p) => {
      const obs = observedMap.get(p.targetDate);
      const actual = obs ? (obs.maxTempEra5 ?? obs.maxTemp) : null;
      const hit = actual != null && p.forecastRounded != null
        ? Math.round(obs!.maxTemp) === p.forecastRounded : null;
      const error = actual != null && p.forecastRaw != null ? actual - p.forecastRaw : null;
      return {
        id: p.id, date: p.targetDate, consensus: p.consensusValue,
        forecastRounded: p.forecastRounded, betOn: p.betOn,
        confidence: p.confidence, confidenceLabel: p.confidenceLabel,
        spread: p.spread, agreementRatio: p.agreementRatio,
        actualTemp: actual, hit, error,
      };
    });

    if (result === 'hit') rows = rows.filter((r) => r.hit === true);
    else if (result === 'miss') rows = rows.filter((r) => r.hit === false);
    else if (result === 'open') rows = rows.filter((r) => r.hit === null);

    return NextResponse.json({ rows, total, page, limit });
  } catch (err) {
    console.error('[/api/forecasts]', err);
    return NextResponse.json({ rows: [], total: 0, page: 1, limit: 50, error: String(err) }, { status: 500 });
  }
}
