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
- **Target solver** — enter a target ending balance and the app solves
  backwards for it, adjusting the monthly withdrawal in advanced mode, the
  monthly contribution under a dynamic withdrawal policy, and falling back to
  the assumed return when no other lever can reach the goal. The info panel
  names the lever each solve moved
- **Dynamic withdrawal** — withdraw a percentage of the balance each year,
  clamped between a floor and ceiling, reflected in the Monte Carlo bands
- **Monte Carlo simulation** — percentile bands (P10–P90) from randomized
  annual returns, in combined, individual, or rollover modes. Like every tool
  toggle it is Advanced-mode only: leaving basic mode stops the simulation
  rather than hiding a cone that cannot be switched off. The seed is a
  fixed constant, so the same plan always draws the same cone. The return
  slider is the _arithmetic mean_ of the annual draw, so the simulated median
  trails the deterministic plan line — the more volatility and the longer the
  horizon, the further (1.5% at σ 12 over 30 years, 10% at σ 30). That gap is
  the cost of compounding a volatile return rather than a steady one, and it is
  deliberately left uncorrected: see the header of
  `src/common/helpers/monte-carlo.ts`
- **Portfolio capital preservation** — required share prices per holding to
  keep pace with the projection (live quotes via a configurable stock API)
- **FIRE calculator, budget builder, scenario snapshots, PDF export**

## Development

```sh
npm install
npm --prefix infra install   # lint type-checks the CDK sources too
npm run dev          # start Vite dev server (plain http, no local CA)
npm run dev:https    # same, plus a mkcert TLS cert (see Local Subdomain Testing)
npm test             # run vitest suite
npm run lint         # eslint, --max-warnings 0
npm run typecheck    # tsc -b
npm run format       # prettier --write .
npm run format:check # prettier --check . (what CI runs; never rewrites)
npm run build        # tsc -b + vite build → dist/
```

`npm run build` is side-effect free: it writes `dist/` and nothing else. The
same five checks — `lint`, `typecheck`, `format:check`, `test`, `build` — run
in CI (`.github/workflows/ci.yml`) and in CodeBuild (`buildspec.yml`).

There are no npm workspaces here, so the root install does not populate
`infra/node_modules`. `npm run lint` lints `infra/**/*.ts` with full type
information and fails on a fresh clone until `npm --prefix infra install` has
been run; both pipelines install it for the same reason.

## Deployment (AWS)

The site deploys as a static bundle to S3 behind CloudFront. Hashed files
under `assets/` are uploaded with a one-year immutable cache header; everything
else (`index.html`) is `no-cache`, so a new deploy is picked up immediately.

**There are two deploy paths, and only the first one is live today.**

`th4.dev` is currently served by a CloudFront distribution and an S3 bucket
that were created by hand and belong to no CloudFormation stack. The CDK app
in `infra/` describes the site it _should_ be, but it has never been deployed
for this domain: its stack does not exist. Deploying it as-is would not update
the live site — it would try to create a second distribution claiming the same
alias, which CloudFront refuses while another distribution holds it.

**Deploy the live site** (what shipping this app means today):

```sh
TH4_BUCKET=<bucket> TH4_DIST_ID=<distribution-id> npm run deploy
```

The bucket and distribution ID are not in the repo. `deploy` builds, uploads
with the cache-control policy above, and invalidates the distribution.

**Deploy the CDK stack** (`npm run deploy:cdk`) provisions the intended
infrastructure from scratch: bucket, certificate, distribution with security
headers, and Route 53 aliases. Moving the domain onto it means releasing the
aliases from the existing distribution first, so it is a migration with a
cutover, not an update. `th4.dev` is its only target and it provisions the
apex domain only: no wildcard SANs and no `*.th4.dev` records, though the
live distribution does serve `*.th4.dev`. The `f.` subdomain the app knows
about is a local-development convenience (see Local Subdomain Testing); in
production the same page is reached as `th4.dev/?p=f`.

Its cache-control policy lives in exactly one place, the `BucketDeployment`
pair in `infra/lib/static-site-stack.ts`, which is why the `sync` script
duplicates rather than defines it.

```sh
cd infra
npm install
npm run configure   # writes deploy-config.json (see deploy-config.example.json)
npm test            # CDK assertion tests (no deploy-config.json needed)
cd .. && npm run deploy:cdk
```

First-time prerequisites for the CDK path, in this order:

0. Install the CDK toolchain: `npm --prefix infra install`.
1. The Route 53 public hosted zone for the domain must already exist — the
   stack looks it up by attributes rather than creating it, and its zone ID
   goes into `deploy-config.json`.
2. Bootstrap the target account/region once:
   `npx cdk bootstrap aws://<account-id>/us-east-1`. `BucketDeployment`
   publishes S3 assets, so an unbootstrapped environment fails the first
   deploy with a CDK bootstrap-version error.

Every stack deploys to `us-east-1` (CloudFront only accepts ACM certificates
from that region); any other `region` in `deploy-config.json` is rejected.

**CodeBuild**: `buildspec.yml` installs, runs the same lint/typecheck/format/
test gate as GitHub Actions, builds, and emits `dist/` as the artifact. That
artifact carries no cache-control metadata; anything that publishes it
directly must reproduce the policy CDK owns.

## Local Subdomain Testing

This project supports subdomain-based routing in development.

- Map both hostnames to your machine first — `local.dev` and `f.local.dev` are
  real registrable `.dev` names, so without this the browser resolves them on
  the public internet. Add to `/etc/hosts`:

  ```
  127.0.0.1 local.dev f.local.dev
  ```

- Run the dev server with TLS: `npm run dev:https` (that is `TH4_HTTPS=1 vite`;
  the env var is what `vite.config.ts` checks)
- Open your mapped host with HTTPS, for example: `https://f.local.dev:5173`.
  Opening `f.local.dev` immediately redirects to `local.dev:5173/?p=f`, so
  every visit ends up on the one origin and all saved state stays in a single
  `localStorage` bucket rather than being split per subdomain.
- Without a subdomain, `?p=<page>` on the root origin (e.g. `?p=f`) is equivalent to the `f.` subdomain and takes priority over the remembered page

Why HTTPS is required here, and only here:

- Browsers enforce HTTPS for `.dev` domains via HSTS preload.
- If you use HTTP with a `.dev` hostname, browsers will try TLS anyway and can
  show SSL errors.
- Plain `http://localhost:5173` is already a secure context, so the app itself
  never needs TLS locally. That is why `npm run dev` does not set it up:
  `vite-plugin-mkcert` downloads the `mkcert` binary and runs `mkcert -install`,
  which writes a root CA into your system and browser trust stores and usually
  wants sudo. `npm run dev:https` opts into that; `npm run dev` does not, and so
  it also starts in sandboxes and containers with no TTY.
