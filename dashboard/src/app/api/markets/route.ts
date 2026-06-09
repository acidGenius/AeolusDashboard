import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));

    const [outcomes, observations, total] = await Promise.all([
      prisma.marketOutcome.findMany({
        include: { prediction: { select: { targetDate: true, forecastRounded: true } } },
        orderBy: { prediction: { targetDate: 'desc' } },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.observation.findMany(),
      prisma.marketOutcome.count(),
    ]);

    const rows = outcomes.map((o) => ({
      id: o.id,
      date: o.prediction.targetDate,
      outcomeName: o.name,
      marketProbability: o.price,
      ourProbability: o.ourP,
      edge: o.edge,
    }));

    const all = await prisma.marketOutcome.findMany({
      where: { price: { not: null } },
      select: { price: true },
    });

    const dist: Record<string, number> = { '0-0.1': 0, '0.1-0.3': 0, '0.3-0.5': 0, '0.5-0.7': 0, '0.7-1': 0 };
    for (const { price } of all) {
      if (price == null) continue;
      if (price < 0.1) dist['0-0.1']++;
      else if (price < 0.3) dist['0.1-0.3']++;
      else if (price < 0.5) dist['0.3-0.5']++;
      else if (price < 0.7) dist['0.5-0.7']++;
      else dist['0.7-1']++;
    }

    return NextResponse.json({ rows, total, page, limit, distribution: dist });
  } catch (err) {
    console.error('[/api/markets]', err);
    return NextResponse.json(
      { rows: [], total: 0, page: 1, limit: 50, distribution: {}, error: String(err) },
      { status: 500 }
    );
  }
}
