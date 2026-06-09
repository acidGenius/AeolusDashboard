/**
 * prisma/seed.js — seeds the dashboard DB with realistic mock data.
 * Run: node prisma/seed.js   (after npm install && npx prisma db push)
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rand = rng(42);

function randn(mean, std) {
  const u = rand(), v = rand();
  return mean + std * Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoTs(dateStr, hour = 10) {
  return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
}

// London max temp baseline by month (°C)
function londonBaseline(dateStr) {
  const month = parseInt(dateStr.slice(5, 7));
  const baselines = { 1: 8, 2: 9, 3: 12, 4: 15, 5: 18, 6: 21, 7: 23, 8: 23, 9: 20, 10: 16, 11: 12, 12: 9 };
  return baselines[month] ?? 15;
}

const MODELS = [
  'ECMWF', 'GFS', 'ICON', 'UKMO', 'ARPEGE', 'AROME',
  'KNMI', 'DMI', 'GEM', 'JMA', 'MET Norway', 'CMA',
];

// Model biases: some run warm, some cold
const MODEL_BIAS = {
  'ECMWF': 0.1,  'GFS': 0.3, 'ICON': -0.1, 'UKMO': 0.0,
  'ARPEGE': 0.2, 'AROME': -0.2, 'KNMI': 0.1, 'DMI': -0.3,
  'GEM': 0.4,    'JMA': -0.1, 'MET Norway': 0.0, 'CMA': 0.5,
};
const MODEL_NOISE = {
  'ECMWF': 0.6, 'GFS': 0.9, 'ICON': 0.7, 'UKMO': 0.6,
  'ARPEGE': 0.8, 'AROME': 0.7, 'KNMI': 0.8, 'DMI': 0.9,
  'GEM': 1.0, 'JMA': 0.8, 'MET Norway': 0.7, 'CMA': 1.1,
};

const STRATEGIES = ['kelly_pure', 'kelly_shrunk', 'market_weighted'];
const STRATEGY_KELLY = { kelly_pure: 0.25, kelly_shrunk: 0.125, market_weighted: 0 };
const START_BANK = 100;
const MAX_STAKE_FRAC = 0.10;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Clearing existing seed data…');
  await prisma.valueBet.deleteMany();
  await prisma.marketOutcome.deleteMany();
  await prisma.modelForecast.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.paperBet.deleteMany();

  const TODAY = '2026-06-09';
  const DAYS = 65;
  const banks = { kelly_pure: START_BANK, kelly_shrunk: START_BANK, market_weighted: START_BANK };
  const openBets = { kelly_pure: null, kelly_shrunk: null, market_weighted: null };

  console.log(`Generating ${DAYS} days of data…`);

  for (let i = DAYS - 1; i >= 0; i--) {
    const targetDate = addDays(TODAY, -i + 1); // forecast is for tomorrow
    const forecastDate = addDays(TODAY, -i);   // prediction made on this date
    const baseline = londonBaseline(targetDate);

    // True temperature (what actually happened)
    const trueTemp = parseFloat(randn(baseline, 1.5).toFixed(2));
    const trueBand = Math.round(trueTemp);

    // Model forecasts (each model sees the future with noise)
    const modelTemps = MODELS.map(label => ({
      label,
      source: `open-meteo:${label.toLowerCase().replace(/ /g, '_')}`,
      maxTemp: parseFloat(clamp(randn(trueTemp + MODEL_BIAS[label], MODEL_NOISE[label]), 5, 38).toFixed(1)),
    }));

    const temps = modelTemps.map(m => m.maxTemp);
    const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
    const sorted = [...temps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const spread = sorted[sorted.length - 1] - sorted[0];
    const stddev = Math.sqrt(temps.reduce((s, t) => s + (t - mean) ** 2, 0) / temps.length);
    const min = sorted[0], max = sorted[sorted.length - 1];

    const confidenceScore = parseFloat(Math.max(0, 1 - Math.min(1, spread / 5)).toFixed(2));
    const confidenceLabel = spread <= 0.6 ? 'high' : spread <= 1.2 ? 'medium' : 'low';

    // Consensus (weighted agreement)
    const TOLERANCE = 0.4;
    let bestVal = null, bestAgreement = 0;
    for (const t of temps) {
      const agreeing = temps.filter(v => Math.abs(v - t) <= TOLERANCE);
      if (agreeing.length > bestAgreement) { bestAgreement = agreeing.length; bestVal = t; }
    }
    const consensusValue = parseFloat((bestVal ?? median).toFixed(2));
    const agreementRatio = parseFloat((bestAgreement / temps.length).toFixed(2));

    // Distribution (argmax)
    const dist = {};
    for (const t of temps) {
      const band = Math.round(t);
      dist[band] = (dist[band] ?? 0) + 1 / temps.length;
    }
    const argmaxBand = parseInt(Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0]);

    // Market: outcomes around the true temp ±2
    const marketCenter = Math.round(mean);
    const outcomeTemps = [marketCenter - 2, marketCenter - 1, marketCenter, marketCenter + 1, marketCenter + 2];
    const rawProbs = outcomeTemps.map(t => Math.exp(-0.5 * ((t - mean) / 1.2) ** 2));
    const totalProb = rawProbs.reduce((a, b) => a + b, 0);
    const outcomes = outcomeTemps.map((t, idx) => ({
      name: `${t}°C`,
      price: parseFloat((rawProbs[idx] / totalProb).toFixed(3)),
    }));

    // Add slight noise to prices (market isn't perfectly calibrated)
    const marketNoise = 0.05;
    for (const o of outcomes) {
      o.price = parseFloat(clamp(o.price + randn(0, marketNoise), 0.01, 0.95).toFixed(3));
    }

    // Our probability for each outcome
    const ourPs = outcomes.map(o => {
      const band = parseInt(o.name);
      return { ...o, ourP: parseFloat((dist[band] ?? 0).toFixed(3)) };
    });

    // Value bets (edge > 0)
    const valueBets = ourPs
      .map(o => ({ ...o, edge: parseFloat((o.ourP - o.price).toFixed(3)) }))
      .filter(o => o.edge > 0)
      .sort((a, b) => b.edge - a.edge);

    const betOnOutcome = outcomes.find(o => parseInt(o.name) === argmaxBand) ?? outcomes[2];
    const marketPrice = betOnOutcome.price;
    const ourP = dist[argmaxBand] ?? 0;
    const edge = parseFloat((ourP - marketPrice).toFixed(3));
    const bestValue = valueBets[0] ?? null;

    // Historical model error stats (simplified: use noise params)
    const errorStats = {};
    for (const m of MODELS) {
      const rmse = MODEL_NOISE[m] * 1.1;
      const ema = MODEL_NOISE[m];
      const metaError = parseFloat(((rmse + ema) / 2).toFixed(3));
      const weight = 1 / Math.pow(metaError + 0.1, 2);
      errorStats[m] = { weight, metaError };
    }
    const totalWeight = Object.values(errorStats).reduce((s, e) => s + e.weight, 0);
    const weightedModels = modelTemps.map(m => ({
      ...m,
      weight: errorStats[m.label].weight,
      normalizedWeight: parseFloat((errorStats[m.label].weight / totalWeight).toFixed(4)),
      metaError: errorStats[m.label].metaError,
    }));

    // Market expectation
    const marketExpectation = parseFloat(
      (outcomes.reduce((s, o) => s + parseInt(o.name) * o.price, 0) /
        outcomes.reduce((s, o) => s + o.price, 0)).toFixed(2)
    );

    // Create prediction
    const ts = isoTs(forecastDate, 10);
    const pred = await prisma.prediction.create({
      data: {
        timestamp: ts,
        targetDate,
        targetDayOffset: 1,
        logFile: 'main',
        forecastRaw: parseFloat(consensusValue.toFixed(2)),
        forecastRounded: argmaxBand,
        betOn: betOnOutcome.name,
        marketPrice,
        confidence: confidenceScore,
        confidenceLabel,
        spread: parseFloat(spread.toFixed(2)),
        consensusValue,
        agreementRatio,
        sourceCount: Math.round(agreementRatio * MODELS.length),
        consensusAchieved: agreementRatio >= 0.75,
        statsMean: parseFloat(mean.toFixed(2)),
        statsMedian: parseFloat(median.toFixed(2)),
        statsMin: parseFloat(min.toFixed(1)),
        statsMax: parseFloat(max.toFixed(1)),
        statsStddev: parseFloat(stddev.toFixed(2)),
        marketId: `market-${targetDate}`,
        marketName: `Highest temperature in London on ${targetDate}`,
        marketStatus: i <= 1 ? 'open' : 'closed',
        marketExpectation,
      },
    });

    await prisma.modelForecast.createMany({
      data: weightedModels.map(m => ({
        predictionId: pred.id,
        source: m.source,
        label: m.label,
        maxTemp: m.maxTemp,
        weight: m.weight,
        normalizedWeight: m.normalizedWeight,
        metaError: m.metaError,
      })),
    });

    await prisma.marketOutcome.createMany({
      data: ourPs.map(o => ({
        predictionId: pred.id,
        name: o.name,
        price: o.price,
        ourP: o.ourP,
        edge: o.edge,
      })),
    });

    if (valueBets.length > 0) {
      await prisma.valueBet.createMany({
        data: valueBets.map(v => ({
          predictionId: pred.id,
          name: v.name,
          ourP: v.ourP,
          price: v.price,
          edge: v.edge,
        })),
      });
    }

    // Observation (not yet available for last 2 days)
    const resolved = i >= 2;
    if (resolved) {
      const era5 = parseFloat(randn(trueTemp, 0.15).toFixed(2));
      await prisma.observation.upsert({
        where: { date: targetDate },
        create: {
          date: targetDate,
          maxTemp: trueBand,
          maxTempBand: trueBand,
          maxTempEra5: era5,
          source: 'polymarket-resolved',
          observedAt: isoTs(addDays(targetDate, 1), 8),
          note: `${trueBand}°C`,
        },
        update: {},
      });

      // Paper bets — settle previous + place new
      for (const strategy of STRATEGIES) {
        // Settle open bet
        if (openBets[strategy]) {
          const open = openBets[strategy];
          if (open.targetDate === targetDate) {
            const won = trueBand === open.band;
            const delta = won
              ? parseFloat((open.stake * (1 - open.price) / open.price).toFixed(2))
              : parseFloat((-open.stake).toFixed(2));
            banks[strategy] = parseFloat((banks[strategy] + delta).toFixed(2));
            await prisma.paperBet.upsert({
              where: { id: `${strategy}-settle-${targetDate}` },
              create: {
                id: `${strategy}-settle-${targetDate}`,
                type: 'settle',
                strategy,
                targetDate,
                band: open.band,
                betOn: open.betOn,
                stake: open.stake,
                price: open.price,
                ourP: open.ourP,
                edge: open.edge,
                observedBand: trueBand,
                won,
                delta,
                bankAfter: banks[strategy],
                settledAt: isoTs(addDays(targetDate, 1), 8),
              },
              update: {},
            });
            openBets[strategy] = null;
          }
        }

        // Place new bet (only if there's edge and market price in range)
        if (edge > 0 && marketPrice >= 0.02 && marketPrice <= 0.60) {
          let frac = 0;
          if (strategy === 'kelly_pure') {
            frac = Math.min(0.25 * (edge / (1 - marketPrice)), MAX_STAKE_FRAC);
          } else if (strategy === 'kelly_shrunk') {
            const pEff = 0.5 * ourP + 0.5 * marketPrice;
            const edgeEff = pEff - marketPrice;
            frac = edgeEff > 0 ? Math.min(0.25 * (edgeEff / (1 - marketPrice)), MAX_STAKE_FRAC) : 0;
          } else {
            frac = Math.min(0.15 * marketPrice, MAX_STAKE_FRAC);
          }

          const stake = parseFloat((banks[strategy] * frac).toFixed(2));
          if (stake > 0.01) {
            const betId = `${strategy}-place-${forecastDate}`;
            openBets[strategy] = { targetDate, band: argmaxBand, betOn: betOnOutcome.name, stake, price: marketPrice, ourP, edge };
            await prisma.paperBet.upsert({
              where: { id: betId },
              create: {
                id: betId,
                type: 'place',
                strategy,
                targetDate,
                band: argmaxBand,
                betOn: betOnOutcome.name,
                stake,
                price: marketPrice,
                ourP,
                edge,
                bankBefore: banks[strategy],
                placedAt: isoTs(forecastDate, 13),
              },
              update: {},
            });
          }
        }
      }
    }
  }

  // Summary
  const [pCount, oCount, bCount] = await Promise.all([
    prisma.prediction.count(),
    prisma.observation.count(),
    prisma.paperBet.count(),
  ]);

  const shrunkBets = await prisma.paperBet.findMany({ where: { strategy: 'kelly_shrunk', type: 'settle' }, orderBy: { targetDate: 'desc' } });
  const finalBank = shrunkBets[0]?.bankAfter ?? START_BANK;
  const wins = shrunkBets.filter(b => b.won).length;

  console.log(`\n✓ Seed complete`);
  console.log(`  Predictions : ${pCount}`);
  console.log(`  Observations: ${oCount}`);
  console.log(`  Paper bets  : ${bCount}`);
  console.log(`  kelly_shrunk: $${finalBank.toFixed(2)} | ${wins}W / ${shrunkBets.length - wins}L`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
