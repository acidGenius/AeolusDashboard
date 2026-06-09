# WeatherBOT Dashboard — Architecture

## Overview

Analytics dashboard for the London Temperature Signal Engine.  
Stack: Next.js 15 · TypeScript · TailwindCSS · Prisma · SQLite · Recharts · TanStack Table · shadcn/ui

---

## Data Sources

| File | Description |
|------|-------------|
| `logs/predictions.ndjson` | Daily prediction records (main cycle) |
| `logs/predictions-hourly.ndjson` | Hourly silent-mode predictions |
| `logs/predictions-same-day.ndjson` | Same-day predictions |
| `logs/observed-london.ndjson` | Observed max temperatures (Polymarket + ERA5) |
| `logs/paper-bets.ndjson` | Paper trading records (place + settle) |
| `logs/bank.json` | Current virtual bankrolls per strategy |

---

## NDJSON Schemas

### predictions.ndjson / predictions-hourly.ndjson

```jsonc
{
  "timestamp": "2026-06-09T10:00:00.000Z",
  "targetDate": "2026-06-10",
  "targetDayOffset": 1,
  "ensembleForecast": {
    "models": [
      {
        "source": "open-meteo:ecmwf_ifs025",
        "label": "ECMWF",
        "maxTemp": 23.5,
        "weight": 1.4,
        "normalizedWeight": 0.09,
        "metaError": 0.82
      }
      // ... 12 models total
    ],
    "stats": {
      "mean": 23.1,
      "median": 23.2,
      "min": 21.0,
      "max": 25.0,
      "stddev": 1.1,
      "spread": 4.0,
      "confidenceLabel": "medium",   // "high" | "medium" | "low"
      "confidenceScore": 0.72        // 0..1
    },
    "consensus": {
      "consensusValue": 23.0,
      "agreementRatio": 0.75,
      "sourceCount": 8,
      "agreeingSources": ["open-meteo:ecmwf_ifs025", ...],
      "achieved": true
    }
  },
  "marketLookup": {
    "id": "...",
    "source": "auto-slug",
    "slug": "highest-temperature-in-london-on-june-10-2026"
  },
  "market": {
    "id": "...",
    "name": "Highest temperature in London on June 10 2026",
    "status": "open",
    "expectation": 22.5,
    "outcomeNames": ["21°C", "22°C", "23°C"],
    "outcomes": [
      { "name": "21°C", "price": 0.05 },
      { "name": "22°C", "price": 0.25 },
      { "name": "23°C", "price": 0.45 }
    ]
  },
  "decision": {
    "forecastRaw": 23.12,
    "forecastRounded": 23,
    "betOn": "23°C",
    "marketPrice": 0.45,
    "confidence": 0.72,
    "confidenceLabel": "medium",
    "spread": 4.0,
    "distribution": { "21": 0.08, "22": 0.22, "23": 0.52, "24": 0.18 },
    "value": [
      { "name": "23°C", "ourP": 0.52, "price": 0.45, "edge": 0.07 }
    ],
    "bestValue": { "name": "23°C", "ourP": 0.52, "price": 0.45, "edge": 0.07 }
  }
}
```

### observed-london.ndjson

```jsonc
{
  "date": "2026-06-09",
  "maxTemp": 23,           // betting truth (Polymarket integer band)
  "maxTempBand": 23,       // explicit band field
  "maxTempEra5": 22.87,    // ERA5 precise value (sub-degree)
  "source": "polymarket-resolved",
  "observedAt": "2026-06-10T08:00:00.000Z",
  "note": "23°C"
}
```

### paper-bets.ndjson

```jsonc
// Place record
{
  "type": "place",
  "strategy": "kelly_shrunk",
  "targetDate": "2026-06-09",
  "band": 23,
  "betOn": "23°C",
  "stake": 3.50,
  "price": 0.45,       // market price at time of bet
  "ourP": 0.52,        // our probability for this band
  "edge": 0.07,
  "bankBefore": 100.00,
  "placedAt": "2026-06-09T13:00:00.000Z"
}

// Settle record
{
  "type": "settle",
  "strategy": "kelly_shrunk",
  "date": "2026-06-09",
  "band": 23,
  "stake": 3.50,
  "price": 0.45,
  "observedBand": 23,
  "won": true,
  "delta": 4.28,        // PnL = stake * (1-price)/price on win, -stake on loss
  "bankAfter": 104.28,
  "settledAt": "2026-06-10T08:30:00.000Z"
}
```

### bank.json

```jsonc
{
  "startedAt": "2026-05-20",
  "strategies": {
    "kelly_pure": { "bank": 112.50, "open": null },
    "kelly_shrunk": { "bank": 108.30, "open": { "targetDate": "2026-06-09", "band": 23, ... } },
    "market_weighted": { "bank": 103.80, "open": null }
  }
}
```

---

## Prisma Schema (SQLite → PostgreSQL portable)

```prisma
model Prediction {
  id               String   @id @default(cuid())
  timestamp        DateTime
  targetDate       String
  targetDayOffset  Int?
  logFile          String?  // "main" | "hourly" | "same-day"

  forecastRaw      Float?
  forecastRounded  Int?
  betOn            String?
  marketPrice      Float?
  confidence       Float?
  confidenceLabel  String?
  spread           Float?

  consensusValue   Float?
  agreementRatio   Float?
  sourceCount      Int?
  consensusAchieved Boolean?

  statsMean        Float?
  statsMedian      Float?
  statsMin         Float?
  statsMax         Float?
  statsStddev      Float?

  marketId         String?
  marketName       String?
  marketStatus     String?
  marketExpectation Float?

  modelForecasts   ModelForecast[]
  marketOutcomes   MarketOutcome[]
  valueBets        ValueBet[]

  createdAt        DateTime @default(now())

  @@unique([targetDate, timestamp])
  @@index([targetDate])
}

model ModelForecast {
  id               String    @id @default(cuid())
  predictionId     String
  prediction       Prediction @relation(...)
  source           String
  label            String
  maxTemp          Float
  weight           Float?
  normalizedWeight Float?
  metaError        Float?
  @@index([label])
}

model MarketOutcome {
  id           String    @id @default(cuid())
  predictionId String
  prediction   Prediction @relation(...)
  name         String
  price        Float?
  ourP         Float?
  edge         Float?
}

model ValueBet {
  id           String    @id @default(cuid())
  predictionId String
  prediction   Prediction @relation(...)
  name         String
  ourP         Float
  price        Float
  edge         Float
}

model Observation {
  id           String    @id @default(cuid())
  date         String    @unique
  maxTemp      Float
  maxTempBand  Float?
  maxTempEra5  Float?
  source       String?
  observedAt   DateTime?
  note         String?
  createdAt    DateTime  @default(now())
}

model PaperBet {
  id           String    @id @default(cuid())
  type         String    // "place" | "settle"
  strategy     String
  targetDate   String
  band         Int?
  betOn        String?
  stake        Float
  price        Float
  ourP         Float?
  edge         Float?
  bankBefore   Float?
  observedBand Float?
  won          Boolean?
  delta        Float?
  bankAfter    Float?
  placedAt     DateTime?
  settledAt    DateTime?
  createdAt    DateTime  @default(now())
  @@index([strategy])
  @@index([targetDate])
}
```

---

## Routes

| Route | Description |
|-------|-------------|
| `GET /` | Redirect → `/dashboard` or `/login` |
| `GET /login` | Login page |
| `POST /api/auth/login` | Validate password, set JWT cookie |
| `POST /api/auth/logout` | Clear JWT cookie |
| `POST /api/ingest` | Re-index all NDJSON files into SQLite |
| `GET /api/overview` | KPI cards + equity curve data |
| `GET /api/forecasts` | Paginated forecast list with filters |
| `GET /api/models` | Per-model accuracy stats |
| `GET /api/markets` | Market odds history |
| `GET /api/value-bets` | Value bet history + edge buckets |
| `GET /api/trades` | Paper trading history + PnL |
| `GET /api/research` | Research analytics (argmax vs consensus, spread, confidence) |
| `GET /dashboard` | Overview page |
| `GET /dashboard/forecasts` | Forecasts page |
| `GET /dashboard/models` | Models page |
| `GET /dashboard/markets` | Markets page |
| `GET /dashboard/value-bets` | Value Bets page |
| `GET /dashboard/trades` | Trades page |
| `GET /dashboard/research` | Research page |
| `GET /dashboard/settings` | Settings page |

---

## Components

```
src/components/
├── ui/                    (shadcn: button, card, input, badge, table, tabs, select, separator)
├── layout/
│   ├── sidebar.tsx        (left nav with active state)
│   └── topbar.tsx         (breadcrumb + ingest button)
├── cards/
│   ├── metric-card.tsx    (KPI card with sparkline)
│   └── last-forecast.tsx  (latest prediction panel)
├── charts/
│   ├── equity-curve.tsx   (bank growth line chart)
│   ├── forecast-vs-actual.tsx (forecast vs actual overlay)
│   ├── error-distribution.tsx (histogram of errors)
│   ├── confidence-accuracy.tsx (confidence → win rate)
│   └── spread-accuracy.tsx    (spread → accuracy scatter)
└── tables/
    ├── forecasts-table.tsx  (TanStack Table with filters)
    ├── models-table.tsx
    ├── value-bets-table.tsx
    └── trades-table.tsx
```

---

## Auth Design

- Password stored in `DASHBOARD_PASSWORD` env var (bcrypt hashed at startup)
- JWT signed with `JWT_SECRET` env var, stored in httpOnly cookie `session`
- Middleware protects all routes under `/dashboard` and `/api/*` (except auth endpoints)
- Cookie expires in 7 days; sliding window can be added later
- RBAC-ready: JWT payload has `{ sub: "admin", role: "admin" }`; role checked in middleware

---

## Migration Path to PostgreSQL

1. Change `datasource db { provider = "postgresql" }` in `prisma/schema.prisma`
2. Update `DATABASE_URL` to PostgreSQL connection string
3. Run `prisma migrate dev`
4. All query code is provider-agnostic (no raw SQL with SQLite-specific syntax)
