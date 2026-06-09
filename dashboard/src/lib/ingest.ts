import fs from 'fs/promises';
import path from 'path';
import { prisma } from './prisma';

const LOGS_DIR = path.resolve(process.env.LOGS_DIR ?? path.join(process.cwd(), '..', 'logs'));

async function readNdjson<T>(filename: string): Promise<T[]> {
  try {
    const content = await fs.readFile(path.join(LOGS_DIR, filename), 'utf-8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as T; } catch { return null; }
      })
      .filter(Boolean) as T[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

interface RawModelEntry {
  source?: string;
  label?: string;
  maxTemp?: number;
  weight?: number;
  normalizedWeight?: number;
  metaError?: number | null;
}

interface RawOutcome {
  name?: string;
  price?: number | null;
}

interface RawValueBet {
  name?: string;
  ourP?: number;
  price?: number;
  edge?: number;
}

interface RawPrediction {
  timestamp?: string;
  targetDate?: string;
  targetDayOffset?: number;
  ensembleForecast?: {
    models?: RawModelEntry[];
    stats?: {
      mean?: number;
      median?: number;
      min?: number;
      max?: number;
      stddev?: number;
      spread?: number;
      confidenceLabel?: string;
      confidenceScore?: number;
    };
    consensus?: {
      consensusValue?: number;
      agreementRatio?: number;
      sourceCount?: number;
      achieved?: boolean;
    };
  };
  market?: {
    id?: string;
    name?: string;
    status?: string;
    expectation?: number | null;
    outcomes?: RawOutcome[];
  };
  decision?: {
    forecastRaw?: number;
    forecastRounded?: number;
    betOn?: string | null;
    marketPrice?: number | null;
    confidence?: number | null;
    confidenceLabel?: string | null;
    spread?: number;
    value?: RawValueBet[];
  };
}

interface RawObservation {
  date?: string;
  maxTemp?: number;
  maxTempBand?: number | null;
  maxTempEra5?: number | null;
  source?: string;
  observedAt?: string;
  note?: string | null;
}

interface RawPaperBet {
  type?: string;
  strategy?: string;
  targetDate?: string;
  date?: string;
  band?: number;
  betOn?: string | null;
  stake?: number;
  price?: number;
  ourP?: number | null;
  edge?: number | null;
  bankBefore?: number | null;
  observedBand?: number | null;
  won?: boolean | null;
  delta?: number | null;
  bankAfter?: number | null;
  placedAt?: string;
  settledAt?: string;
}

async function ingestPredictions(records: RawPrediction[], logFile: string): Promise<number> {
  let count = 0;

  for (const rec of records) {
    if (!rec.timestamp || !rec.targetDate) continue;

    const ts = new Date(rec.timestamp);
    if (isNaN(ts.getTime())) continue;

    const ef = rec.ensembleForecast ?? {};
    const stats = ef.stats ?? {};
    const consensus = ef.consensus ?? {};
    const decision = rec.decision ?? {};
    const market = rec.market ?? {};

    try {
      const pred = await prisma.prediction.upsert({
        where: { targetDate_timestamp: { targetDate: rec.targetDate, timestamp: ts } },
        create: {
          timestamp: ts,
          targetDate: rec.targetDate,
          targetDayOffset: rec.targetDayOffset ?? null,
          logFile,
          forecastRaw: decision.forecastRaw ?? null,
          forecastRounded: decision.forecastRounded ?? null,
          betOn: decision.betOn ?? null,
          marketPrice: decision.marketPrice ?? null,
          confidence: decision.confidence ?? null,
          confidenceLabel: decision.confidenceLabel ?? null,
          spread: decision.spread ?? null,
          consensusValue: consensus.consensusValue ?? null,
          agreementRatio: consensus.agreementRatio ?? null,
          sourceCount: consensus.sourceCount ?? null,
          consensusAchieved: consensus.achieved ?? null,
          statsMean: stats.mean ?? null,
          statsMedian: stats.median ?? null,
          statsMin: stats.min ?? null,
          statsMax: stats.max ?? null,
          statsStddev: stats.stddev ?? null,
          marketId: market.id ?? null,
          marketName: market.name ?? null,
          marketStatus: market.status ?? null,
          marketExpectation: market.expectation ?? null,
        },
        update: {},
      });

      const models = ef.models ?? [];
      if (models.length > 0) {
        const existing = await prisma.modelForecast.count({ where: { predictionId: pred.id } });
        if (existing === 0) {
          await prisma.modelForecast.createMany({
            data: models
              .filter((m) => typeof m.maxTemp === 'number')
              .map((m) => ({
                predictionId: pred.id,
                source: m.source ?? 'unknown',
                label: m.label ?? m.source ?? 'unknown',
                maxTemp: m.maxTemp as number,
                weight: m.weight ?? null,
                normalizedWeight: m.normalizedWeight ?? null,
                metaError: m.metaError ?? null,
              })),
          });
        }
      }

      const outcomes = market.outcomes ?? [];
      if (outcomes.length > 0) {
        const existingO = await prisma.marketOutcome.count({ where: { predictionId: pred.id } });
        if (existingO === 0) {
          await prisma.marketOutcome.createMany({
            data: outcomes
              .filter((o) => o.name)
              .map((o) => ({
                predictionId: pred.id,
                name: o.name as string,
                price: o.price ?? null,
              })),
          });
        }
      }

      const valueBets = decision.value ?? [];
      if (valueBets.length > 0) {
        const existingV = await prisma.valueBet.count({ where: { predictionId: pred.id } });
        if (existingV === 0) {
          await prisma.valueBet.createMany({
            data: valueBets
              .filter((v) => v.name && typeof v.ourP === 'number' && typeof v.price === 'number' && typeof v.edge === 'number')
              .map((v) => ({
                predictionId: pred.id,
                name: v.name as string,
                ourP: v.ourP as number,
                price: v.price as number,
                edge: v.edge as number,
              })),
          });
        }
      }

      count++;
    } catch {
      // Skip duplicate / invalid records
    }
  }

  return count;
}

async function ingestObservations(records: RawObservation[]): Promise<number> {
  let count = 0;

  for (const rec of records) {
    if (!rec.date || typeof rec.maxTemp !== 'number') continue;

    await prisma.observation.upsert({
      where: { date: rec.date },
      create: {
        date: rec.date,
        maxTemp: rec.maxTemp,
        maxTempBand: rec.maxTempBand ?? null,
        maxTempEra5: rec.maxTempEra5 ?? null,
        source: rec.source ?? null,
        observedAt: rec.observedAt ? new Date(rec.observedAt) : null,
        note: rec.note ?? null,
      },
      update: {
        maxTemp: rec.maxTemp,
        maxTempBand: rec.maxTempBand ?? null,
        maxTempEra5: rec.maxTempEra5 ?? null,
        source: rec.source ?? null,
      },
    });

    count++;
  }

  return count;
}

async function ingestPaperBets(records: RawPaperBet[]): Promise<number> {
  let count = 0;

  for (const rec of records) {
    if (!rec.type || !rec.strategy || typeof rec.stake !== 'number' || typeof rec.price !== 'number') continue;

    const targetDate = rec.targetDate ?? rec.date ?? '';
    if (!targetDate) continue;

    const ts = rec.placedAt ?? rec.settledAt;
    if (!ts) continue;

    try {
      await prisma.paperBet.upsert({
        where: { id: `${rec.strategy}-${rec.type}-${targetDate}-${ts}` },
        create: {
          id: `${rec.strategy}-${rec.type}-${targetDate}-${ts}`,
          type: rec.type,
          strategy: rec.strategy,
          targetDate,
          band: rec.band ?? null,
          betOn: rec.betOn ?? null,
          stake: rec.stake,
          price: rec.price,
          ourP: rec.ourP ?? null,
          edge: rec.edge ?? null,
          bankBefore: rec.bankBefore ?? null,
          observedBand: rec.observedBand ?? null,
          won: rec.won ?? null,
          delta: rec.delta ?? null,
          bankAfter: rec.bankAfter ?? null,
          placedAt: rec.placedAt ? new Date(rec.placedAt) : null,
          settledAt: rec.settledAt ? new Date(rec.settledAt) : null,
        },
        update: {
          won: rec.won ?? undefined,
          delta: rec.delta ?? undefined,
          bankAfter: rec.bankAfter ?? undefined,
          settledAt: rec.settledAt ? new Date(rec.settledAt) : undefined,
        },
      });

      count++;
    } catch {
      // Skip duplicates
    }
  }

  return count;
}

export interface IngestResult {
  predictions: number;
  observations: number;
  paperBets: number;
}

export async function runIngest(): Promise<IngestResult> {
  const [main, hourly, sameDay, observed, paperBets] = await Promise.all([
    readNdjson<RawPrediction>('predictions.ndjson'),
    readNdjson<RawPrediction>('predictions-hourly.ndjson'),
    readNdjson<RawPrediction>('predictions-same-day.ndjson'),
    readNdjson<RawObservation>('observed-london.ndjson'),
    readNdjson<RawPaperBet>('paper-bets.ndjson'),
  ]);

  const [pMain, pHourly, pSameDay, obs, bets] = await Promise.all([
    ingestPredictions(main, 'main'),
    ingestPredictions(hourly, 'hourly'),
    ingestPredictions(sameDay, 'same-day'),
    ingestObservations(observed),
    ingestPaperBets(paperBets),
  ]);

  return {
    predictions: pMain + pHourly + pSameDay,
    observations: obs,
    paperBets: bets,
  };
}
