import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));

    const [valueBets, observations, total] = await Promise.all([
      prisma.valueBet.findMany({
        include: { prediction: { select: { targetDate: true } } },
        orderBy: { edge: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.observation.findMany(),
      prisma.valueBet.count(),
    ]);

    const observedMap = new Map(observations.map((o) => [o.date, o]));

    const rows = valueBets.map((v) => {
      const obs = observedMap.get(v.prediction.targetDate);
      const actualBand = obs ? Math.round(obs.maxTemp) : null;
      const outcomeBand = v.name.match(/(-?\d+)/)?.[1];
      const won = actualBand != null && outcomeBand != null
        ? actualBand === parseInt(outcomeBand) : null;
      const roi = won != null ? (won ? (1 - v.price) / v.price : -1) : null;
      return { id: v.id, date: v.prediction.targetDate, name: v.name, ourP: v.ourP, marketPrice: v.price, edge: v.edge, won, roi };
    });

    const allBets = await prisma.valueBet.findMany({
      include: { prediction: { select: { targetDate: true } } },
    });

    const buckets: Record<string, { count: number; wins: number; totalRoi: number; bets: number }> = {
      '0-3%': { count: 0, wins: 0, totalRoi: 0, bets: 0 },
      '3-5%': { count: 0, wins: 0, totalRoi: 0, bets: 0 },
      '5-10%': { count: 0, wins: 0, totalRoi: 0, bets: 0 },
      '10%+': { count: 0, wins: 0, totalRoi: 0, bets: 0 },
    };

    for (const v of allBets) {
      if (v.edge <= 0) continue;
      const obs = observedMap.get(v.prediction.targetDate);
      const key = v.edge < 0.03 ? '0-3%' : v.edge < 0.05 ? '3-5%' : v.edge < 0.1 ? '5-10%' : '10%+';
      buckets[key].count++;
      if (obs) {
        const actualBand = Math.round(obs.maxTemp);
        const outcomeBand = v.name.match(/(-?\d+)/)?.[1];
        const won = outcomeBand != null && actualBand === parseInt(outcomeBand);
        buckets[key].wins += won ? 1 : 0;
        buckets[key].totalRoi += won ? (1 - v.price) / v.price : -1;
        buckets[key].bets++;
      }
    }

    const edgeBuckets = Object.entries(buckets).map(([range, data]) => ({
      range,
      count: data.count,
      roi: data.bets > 0 ? data.totalRoi / data.bets : null,
      winRate: data.bets > 0 ? data.wins / data.bets : null,
    }));

    return NextResponse.json({ rows, total, page, limit, edgeBuckets });
  } catch (err) {
    console.error('[/api/value-bets]', err);
    return NextResponse.json(
      { rows: [], total: 0, page: 1, limit: 50, edgeBuckets: [], error: String(err) },
      { status: 500 }
    );
  }
}
