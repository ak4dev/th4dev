# th4dev — Investment Growth Calculator

A client-side investment planning app built with React 18, TypeScript, Vite,
Stitches, Radix UI, and Recharts. Everything runs in the browser — no backend,
no accounts; state persistence is opt-in via localStorage or JSON export.

## Features

- **Dual investment lanes (A/B)** with monthly compound growth, contributions,
  withdrawals, fees, and inflation adjustment
- **Partial years** — horizon, contribution stop year, and withdrawal start
  year all accept fractional values (e.g. `10.5`), resolved to whole months
- **Rollover** — roll Investment A's ending balance into B at A's finish year
- **Target solver** — enter a target ending balance and the app solves for the
  monthly withdrawal that lands on it
- **Monte Carlo simulation** — percentile bands (P10–P90) from randomized
  annual returns, in combined, individual, or rollover modes
- **Portfolio capital preservation** — required share prices per holding to
  keep pace with the projection (live quotes via a configurable stock API)
- **FIRE calculator, budget builder, scenario snapshots, PDF export**

## Development

```sh
npm install
npm run dev        # start Vite dev server
npm test           # run vitest suite
npm run lint       # eslint
npm run build      # prettier + tsc -b + vite build → dist/
```

## Deployment (AWS)

The site deploys as a static bundle to S3 behind CloudFront.

**Quick sync** (existing buckets/distributions):

```sh
DEV_BUCKET=... DEV_DIST_ID=... npm run deploy-dev
IO_BUCKET=...  IO_DIST_ID=...  npm run deploy-io
npm run deploy-all
```

**CodeBuild**: `buildspec.yml` installs, builds, and emits `dist/` as the
artifact.

**CDK** (full infrastructure — S3 + CloudFront with security headers + ACM +
Route 53):

```sh
cd infra
npm install
npm run configure   # writes deploy-config.json (see deploy-config.example.json)
npm test            # CDK assertion tests
npm run deploy:all
```

## Local Subdomain Testing

This project supports subdomain-based routing in development.

- Run the dev server: `npm run dev`
- Open your mapped host with HTTPS, for example: `https://f.local.dev:5173`

Why HTTPS is required:

- Browsers enforce HTTPS for `.dev` domains via HSTS preload.
- If you use HTTP with a `.dev` hostname, browsers will try TLS anyway and can
  show SSL errors.
