import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const strategy = searchParams.get('strategy') ?? 'kelly_shrunk';

    const bets = await prisma.paperBet.findMany({
      where: { strategy },
      orderBy: { targetDate: 'asc' },
    });

    const settledBets = bets.filter((b) => b.type === 'settle');

    const equityCurve: { date: string; bank: number }[] = [{ date: 'start', bank: 100 }];
    for (const bet of settledBets) {
      if (bet.bankAfter != null) equityCurve.push({ date: bet.targetDate, bank: bet.bankAfter });
    }

    const monthlyMap = new Map<string, { pnl: number; count: number }>();
    for (const bet of settledBets) {
      const month = bet.targetDate.slice(0, 7);
      if (!monthlyMap.has(month)) monthlyMap.set(month, { pnl: 0, count: 0 });
      const entry = monthlyMap.get(month)!;
      entry.pnl += bet.delta ?? 0;
      entry.count++;
    }
    const monthlyRoi = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, pnl: data.pnl, bets: data.count }));

    const dailyRoi = settledBets
      .filter((b) => b.delta != null)
      .map((b) => ({ date: b.targetDate, pnl: b.delta! }));

    let peak = 100;
    const drawdown = equityCurve.map((point) => {
      peak = Math.max(peak, point.bank);
      return { date: point.date, bank: point.bank, drawdown: (point.bank - peak) / peak };
    });

    const ddValues = drawdown.map((d) => d.drawdown);
    const maxDrawdown = ddValues.length ? Math.min(...ddValues) : 0;

    const wins = settledBets.filter((b) => b.won).length;
    const total = settledBets.length;
    const totalPnl = settledBets.reduce((s, b) => s + (b.delta ?? 0), 0);
    const currentBank = settledBets[settledBets.length - 1]?.bankAfter ?? 100;

    const rows = bets.map((b) => ({
      id: b.id, type: b.type, date: b.targetDate, band: b.band,
      betOn: b.betOn, stake: b.stake, price: b.price, ourP: b.ourP,
      edge: b.edge, bankBefore: b.bankBefore, bankAfter: b.bankAfter,
      won: b.won, delta: b.delta, placedAt: b.placedAt, settledAt: b.settledAt,
    }));

    const strategies = ['kelly_pure', 'kelly_shrunk', 'market_weighted'];
    const allStrategiesBank = await Promise.all(
      strategies.map(async (s) => {
        const last = await prisma.paperBet.findFirst({
          where: { strategy: s, type: 'settle', bankAfter: { not: null } },
          orderBy: { targetDate: 'desc' },
        });
        return { strategy: s, bank: last?.bankAfter ?? 100 };
      })
    );

    return NextResponse.json({
      rows, equityCurve, monthlyRoi, dailyRoi, drawdown,
      stats: {
        winRate: total ? wins / total : null,
        totalTrades: total, wins, losses: total - wins,
        totalPnl, currentBank,
        roi: (currentBank - 100) / 100,
        maxDrawdown,
      },
      allStrategiesBank,
    });
  } catch (err) {
    console.error('[/api/trades]', err);
    return NextResponse.json(
      { rows: [], equityCurve: [], monthlyRoi: [], dailyRoi: [], drawdown: [],
        stats: { winRate: null, totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, currentBank: 100, roi: 0, maxDrawdown: 0 },
        allStrategiesBank: [], error: String(err) },
      { status: 500 }
    );
  }
}
