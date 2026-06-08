/**
 * backfill_era5.js — Self-healing ERA5 precise-truth backfill.
 *
 * ERA5 reanalysis is published with a 2–5 day delay, so when we record an
 * observation for "yesterday" the precise ERA5 value is usually not available
 * yet (maxTempEra5 = null). This script re-scans observed-london.ndjson and
 * fills in maxTempEra5 for any entry still missing it, once ERA5 has caught up.
 *
 * Why a precise truth at all?
 *   • maxTemp / maxTempBand = Polymarket band (integer) → "did the bet win?"
 *   • maxTempEra5           = sub-degree reanalysis    → accurate bias/MAE for
 *                                                        model calibration.
 *
 * Idempotent: entries that already have maxTempEra5 are left untouched.
 * Safe to run daily (called from run.js after fetch_observed).
 *
 * Usage: node scripts/backfill_era5.js [--dry-run]
 */

const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const fetch = global.fetch;
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const OBSERVED_LOG_PATH = path.resolve(LOG_DIR, process.env.OBSERVED_LOG_PATH || 'observed-london.ndjson');

// London City Airport (EGLC) — same station predict.js targets.
const WEATHER_LATITUDE = 51.5048;
const WEATHER_LONGITUDE = 0.0495;

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.split('=');
      return [k.replace(/^--?/, ''), v];
    })
  );
  return { dryRun: 'dry-run' in args || args['dry-run'] === 'true' };
}

async function fetchWithRetry(fn, { retries = 2, baseMs = 800, label = '' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = baseMs * Math.pow(2, attempt);
        console.warn(`[retry] ${label} attempt ${attempt + 1}: ${err.message}. Waiting ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function fetchEra5(date) {
  return fetchWithRetry(async () => {
    const params = new URLSearchParams({
      latitude: WEATHER_LATITUDE.toString(),
      longitude: WEATHER_LONGITUDE.toString(),
      daily: 'temperature_2m_max',
      start_date: date,
      end_date: date,
      timezone: 'UTC',
      models: 'era5'
    });
    const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo archive ${r.status}`);
    const data = await r.json();
    const temps = data?.daily?.temperature_2m_max;
    if (!Array.isArray(temps) || temps[0] == null) throw new Error('no ERA5 data yet');
    return Number(Number(temps[0]).toFixed(2));
  }, { label: `ERA5 ${date}`, retries: 2 });
}

async function main() {
  const { dryRun } = parseArgs();
  if (dryRun) console.log('🔍 Dry run — no file writes.\n');

  let text;
  try {
    text = await fs.readFile(OBSERVED_LOG_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No observed log yet — nothing to backfill.');
      return;
    }
    throw err;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const entries = lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  });
  // Only touch entries where ERA5 is genuinely missing (null/undefined).
  const missing = entries.filter((e) => e && e.date && (e.maxTempEra5 === null || e.maxTempEra5 === undefined));
  console.log(`Entries: ${entries.length} total, ${missing.length} missing ERA5.`);

  if (!missing.length) {
    console.log('Nothing to backfill.');
    return;
  }

  let filled = 0;
  let stillPending = 0;
  for (const entry of missing) {
    try {
      const era5 = await fetchEra5(entry.date);
      entry.maxTempEra5 = era5;
      filled++;
      console.log(`  ${entry.date}: ERA5 = ${era5}°C  (band: ${entry.maxTempBand ?? entry.maxTemp ?? '?'}°C)`);
    } catch (err) {
      stillPending++;
      // Leave as null — will retry on the next daily run once ERA5 publishes.
    }
    await new Promise((r) => setTimeout(r, 150)); // gentle on the API
  }

  console.log(`\nFilled: ${filled}, still pending: ${stillPending}.`);

  if (filled === 0) {
    console.log('No new ERA5 values available — leaving log unchanged.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — not rewriting log.');
    return;
  }

  // Rewrite the whole log preserving original line order; only filled entries changed.
  // Unparseable lines are kept verbatim so we never corrupt the log.
  const rebuilt = entries.map((e, i) => (e == null ? lines[i] : JSON.stringify(e))).join('\n') + '\n';
  await fs.writeFile(OBSERVED_LOG_PATH, rebuilt, 'utf8');
  console.log(`✅ Rewrote ${OBSERVED_LOG_PATH} with ${filled} ERA5 value(s).`);
}

main().catch((err) => {
  console.error('backfill_era5 failed:', err.message);
  process.exit(1);
});
