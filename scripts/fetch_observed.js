const fs = require('fs/promises');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const OBSERVED_LOG_PATH = path.resolve(LOG_DIR, process.env.OBSERVED_LOG_PATH || 'observed-london.ndjson');
const fetch = global.fetch;

const POLYMARKET_BASE_URL = process.env.POLYMARKET_BASE_URL || 'https://polymarket.com';
const EVENT_SLUG_PREFIX = 'highest-temperature-in-london-on-';
const MONTH_FORMATTER = new Intl.DateTimeFormat('en', { month: 'long' });

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.split('=');
      return [key.replace(/^--?/, ''), value];
    })
  );
  return {
    date: args.date,
    note: args.note
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function pickTargetDate(provided) {
  if (provided) return provided;
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);
  return formatDate(now);
}

function buildSlug(date) {
  const [year, month, day] = date.split('-');
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const monthName = MONTH_FORMATTER.format(parsed).toLowerCase();
  return `${EVENT_SLUG_PREFIX}${monthName}-${Number(day)}-${year}`;
}

async function ensureLogDir() {
  await fs.mkdir(path.dirname(OBSERVED_LOG_PATH), { recursive: true });
}

function parseTemperatureFromPage(text) {
  const officialMatch = text.match(/confirm(?:s)?[\s\S]{0,200}?reached exactly (\d+(?:\.\d+)?)°C/i);
  if (officialMatch) {
    return Number.parseFloat(officialMatch[1]);
  }
  const fallbackMatch = text.match(/highest temperature[^\d]*?(\d+(?:\.\d+)?)°C/i);
  if (fallbackMatch) {
    return Number.parseFloat(fallbackMatch[1]);
  }
  return null;
}

async function fetchPolymarketObservation(date) {
  const slug = buildSlug(date);
  const url = `${POLYMARKET_BASE_URL}/event/${slug}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Jarvis-weather/1.0' } });
  if (!response.ok) {
    throw new Error(`Polymarket page responded ${response.status}`);
  }
  const text = await response.text();
  const maxTemp = parseTemperatureFromPage(text);
  if (maxTemp === null || Number.isNaN(maxTemp)) {
    throw new Error('Polymarket page missing resolved temperature');
  }
  return {
    maxTemp: Number(maxTemp.toFixed(2)),
    source: 'polymarket',
    note: `resolved slug ${slug}`
  };
}

async function appendObservation({ date, maxTemp, note, source }) {
  const entry = {
    date,
    maxTemp,
    source,
    observedAt: new Date().toISOString(),
    note: note ?? null
  };
  const line = `${JSON.stringify(entry)}\n`;
  await fs.appendFile(OBSERVED_LOG_PATH, line, { encoding: 'utf8' });
  console.log(`Logged observed max for ${date}: ${maxTemp}°C (source ${source})`);
}

async function main() {
  try {
    const args = parseArgs();
    const date = pickTargetDate(args.date);
    await ensureLogDir();
    const result = await fetchPolymarketObservation(date);
    await appendObservation({ date, maxTemp: result.maxTemp, source: result.source, note: args.note ?? result.note });
  } catch (error) {
    console.error('Failed to fetch observed temperature:', error.message);
    process.exit(1);
  }
}

main();
