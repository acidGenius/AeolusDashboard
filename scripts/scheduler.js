/**
 * scheduler.js — Background scheduler for weatherBOT.
 *
 * Runs three recurring jobs:
 *   1. Hourly silent forecasts  — every hour, no Telegram, logs to predictions-hourly.ndjson
 *   2. Daily full run           — 08:00 UTC: fetch observed + daily report + prediction with Telegram
 *   3. Weekly timing report     — Sunday 09:00 UTC: analyze_timing.js sends timing accuracy to Telegram
 *
 * Usage:
 *   node scripts/scheduler.js
 *
 * Keep it running in the background (pm2, screen, Windows Task Scheduler on startup, etc.)
 */

const { execFileSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const SCRIPTS = {
  predictSilent: path.resolve(__dirname, 'predict.js'),
  dailyRun:      path.resolve(__dirname, 'run.js'),
  timingReport:  path.resolve(__dirname, 'analyze_timing.js'),
};

function log(msg) {
  console.log(`[scheduler] ${new Date().toISOString()}  ${msg}`);
}

function run(label, scriptPath, extraArgs = []) {
  log(`▶ ${label}`);
  try {
    execFileSync(process.execPath, [scriptPath, ...extraArgs], {
      stdio: 'inherit',
      env: { ...process.env }
    });
    log(`✅ ${label} — done`);
  } catch (err) {
    log(`❌ ${label} — failed (exit ${err.status ?? '?'}): ${err.message}`);
  }
}

// ── State tracking ─────────────────────────────────────────────────────────────
let lastHourlyHour   = -1;  // UTC hour when last hourly run fired
let lastDailyDate    = '';  // YYYY-MM-DD of last daily run
let lastWeeklyDate   = '';  // YYYY-MM-DD of last weekly report (Sunday)

function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// ── Main tick — runs every 60 seconds ─────────────────────────────────────────
function tick() {
  const now   = new Date();
  const hour  = now.getUTCHours();
  const min   = now.getUTCMinutes();
  const today = utcDateStr(now);
  const dow   = now.getUTCDay(); // 0 = Sunday

  // 1. Hourly silent forecast — fire once per UTC hour (at :01 to avoid overlap with daily)
  if (min >= 1 && hour !== lastHourlyHour) {
    lastHourlyHour = hour;
    run('Hourly silent forecast', SCRIPTS.predictSilent, ['--silent']);
  }

  // 2. Daily full run — 08:00 UTC (only once per calendar day)
  if (hour === 8 && min >= 0 && lastDailyDate !== today) {
    lastDailyDate = today;
    run('Daily full run (fetch + report + predict)', SCRIPTS.dailyRun);
  }

  // 3. Weekly timing report — Sunday 09:00 UTC (only once per calendar day)
  if (dow === 0 && hour === 9 && min >= 0 && lastWeeklyDate !== today) {
    lastWeeklyDate = today;
    run('Weekly timing analysis', SCRIPTS.timingReport, ['--days=7']);
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
log('weatherBOT scheduler started.');
log('Jobs: hourly silent forecast | daily 08:00 UTC | weekly timing Sunday 09:00 UTC');

// Fire immediately on startup so we don't wait up to an hour for first run.
run('Startup: initial hourly forecast', SCRIPTS.predictSilent, ['--silent']);
lastHourlyHour = new Date().getUTCHours();

// Check every 60 seconds.
setInterval(tick, 60 * 1000);
