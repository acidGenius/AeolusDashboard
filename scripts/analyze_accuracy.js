const fs = require('fs/promises');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const PREDICTION_LOGS = [
  path.resolve(LOG_DIR, 'predictions.ndjson'),
  path.resolve(LOG_DIR, 'predictions-same-day.ndjson')
];
const OBSERVED_LOG_PATH = path.resolve(LOG_DIR, process.env.OBSERVED_LOG_PATH || 'observed-london.ndjson');

async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, { encoding: 'utf8' });
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.warn(`Unable to read ${filePath}: ${error.message}`);
    return [];
  }
}

function buildObservedMap(entries) {
  // This script measures model bias/RMSE → use the most PRECISE truth available:
  // ERA5 (sub-degree) first, then the Polymarket band, then legacy maxTemp.
  return entries.reduce((map, entry) => {
    if (!entry?.date) return map;
    const precise = typeof entry.maxTempEra5 === 'number' ? entry.maxTempEra5
      : typeof entry.maxTempBand === 'number' ? entry.maxTempBand
      : typeof entry.maxTemp === 'number' ? entry.maxTemp
      : null;
    if (precise !== null) map[entry.date] = precise;
    return map;
  }, {});
}

function computeStats(arr) {
  if (!arr.length) return null;
  const sum = arr.reduce((acc, value) => acc + value, 0);
  const mean = sum / arr.length;
  const mse = arr.reduce((acc, value) => acc + value * value, 0) / arr.length;
  const rmse = Math.sqrt(mse);
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  return { mean, rmse, min, max, count: arr.length };
}

function groupByHour(records) {
  const map = {};
  for (const entry of records) {
    const validTimestamp = typeof entry.timestamp === 'number' && !Number.isNaN(entry.timestamp);
    const hour = validTimestamp ? new Date(entry.timestamp).getUTCHours() : 'unknown';
    map[hour] = map[hour] ?? [];
    map[hour].push(entry);
  }
  return map;
}

function summarizeGroup(grouped) {
  return Object.entries(grouped)
    .sort((a, b) => (a[0] === 'unknown' ? 99 : Number(a[0])) - (b[0] === 'unknown' ? 99 : Number(b[0])))
    .map(([hour, rows]) => {
      const absErrors = rows.map((row) => Math.abs(row.diff));
      const stats = computeStats(absErrors);
      return {
        hour,
        count: rows.length,
        meanAbs: stats?.mean ?? null,
        rmse: stats?.rmse ?? null,
        minAbs: stats?.min ?? null,
        maxAbs: stats?.max ?? null
      };
    });
}

function summarizeSources(records) {
  const map = {};
  for (const entry of records) {
    const models = entry.models ?? [];
    for (const model of models) {
      const label = model.label ?? model.source ?? 'unknown';
      map[label] = map[label] ?? [];
      const diff = typeof model.maxTemp === 'number' ? model.maxTemp - entry.actual : null;
      if (diff != null) {
        map[label].push(diff);
      }
    }
  }
  return Object.entries(map)
    .map(([label, diffs]) => {
      const stats = computeStats(diffs);
      return { label, count: diffs.length, meanDiff: stats?.mean ?? null, rmse: stats?.rmse ?? null };
    })
    .sort((a, b) => (b.count - a.count) || (a.rmse ?? Infinity) - (b.rmse ?? Infinity));
}

async function main() {
  const [predictionRecords, sameDayRecords, observedEntries] = await Promise.all([
    readJsonLines(PREDICTION_LOGS[0]),
    readJsonLines(PREDICTION_LOGS[1]),
    readJsonLines(OBSERVED_LOG_PATH)
  ]);

  const observedMap = buildObservedMap(observedEntries);
  const combined = [...predictionRecords, ...sameDayRecords]
    .map((record) => ({
      ...record,
      timestamp: Date.parse(record.timestamp || record.targetDate || ''),
      actual: observedMap[record.targetDate]
    }))
    .filter((record) => record.actual !== undefined);

  if (!combined.length) {
    console.log('Нет наблюдений — добавь реальные максимумы через scripts/record_observed.js и запусти анализ позже.');
    return;
  }

  const hourly = groupByHour(combined.map((entry) => ({
    timestamp: entry.timestamp,
    diff: (entry.ensembleForecast?.consensus?.consensusValue ?? entry.ensembleForecast?.stats?.median ?? entry.consensus?.consensusValue ?? entry.stats?.median ?? 0) - entry.actual
  })));

  const summary = summarizeGroup(hourly);
  const sourceSummary = summarizeSources(combined.map((entry) => ({
    ...entry,
    models: entry.ensembleForecast?.models ?? entry.models ?? []
  })));

  console.log('Hourly performance (abs error):');
  for (const row of summary) {
    console.log(`- ${row.hour}: count=${row.count}, mean=${row.meanAbs?.toFixed(2) ?? 'n/a'}°C, rmse=${row.rmse?.toFixed(2) ?? 'n/a'}°C, range=${row.minAbs?.toFixed(2) ?? 'n/a'}-${row.maxAbs?.toFixed(2) ?? 'n/a'}°C`);
  }

  console.log('\nTop sources by observation count / RMSE:');
  for (const row of sourceSummary.slice(0, 12)) {
    console.log(`- ${row.label}: samples=${row.count}, rmse=${row.rmse?.toFixed(2) ?? 'n/a'}°C, bias=${row.meanDiff?.toFixed(2) ?? 'n/a'}°C`);
  }
}

main().catch((error) => {
  console.error('Analysis failed:', error.message);
  process.exit(1);
});
