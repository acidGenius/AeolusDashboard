const fs = require('fs/promises');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const OBSERVED_LOG_PATH = path.resolve(LOG_DIR, process.env.OBSERVED_LOG_PATH || 'observed-london.ndjson');

async function ensureLogDir() {
  await fs.mkdir(path.dirname(OBSERVED_LOG_PATH), { recursive: true });
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.split('=');
      return [key.replace(/^--?/, ''), value];
    })
  );
  return {
    date: args.date,
    maxTemp: args.maxTemp,
    note: args.note
  };
}

function validate(args) {
  if (!args.date) {
    throw new Error('Missing --date argument (YYYY-MM-DD).');
  }
  if (!args.maxTemp) {
    throw new Error('Missing --maxTemp argument.');
  }
  const parsed = Number(args.maxTemp);
  if (Number.isNaN(parsed)) {
    throw new Error('--maxTemp must be a number.');
  }
  return { date: args.date, maxTemp: parsed, note: args.note };
}

async function appendObservation({ date, maxTemp, note }) {
  const entry = {
    date,
    maxTemp,
    observedAt: new Date().toISOString(),
    note: note ?? null
  };
  const line = `${JSON.stringify(entry)}\n`;
  await fs.appendFile(OBSERVED_LOG_PATH, line, { encoding: 'utf8' });
  console.log(`Logged observed max temp for ${date}: ${maxTemp}°C`);
}

async function main() {
  try {
    const args = parseArgs();
    const validated = validate(args);
    await ensureLogDir();
    await appendObservation(validated);
  } catch (error) {
    console.error('Failed to log observation:', error.message);
    process.exit(1);
  }
}

main();
