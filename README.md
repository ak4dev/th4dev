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
- **Target value** — mark a goal for the ending balance: a dashed line on the
  chart, and the info panel reports the first year the plan reaches it. In
  advanced mode with fixed withdrawals the app also solves the monthly
  withdrawal that lands on the goal. The target never moves the assumed
  return, the contribution or any other input, and it is stored exactly as
  entered even when the plan does not reach it; both rules are pinned by
  `src/common/helpers/__tests__/target-contract.test.ts`
- **Dynamic withdrawal** — withdraw a percentage of the balance each year,
  clamped between a floor and ceiling, reflected in the Monte Carlo bands
- **Withdrawal tax** — one flat effective rate on every dollar drawn. With it
  on, the withdrawal figures are what you get to **spend**, and the plan sells
  `spending ÷ (1 − rate)` to deliver it. A dynamic policy's `ratePct` stays a
  draw on the balance ("4% of the balance" has a settled meaning outside this
  app); its floor and ceiling are spending, so they gross up like the fixed
  figure.
- **Indexed spending** — the fixed monthly withdrawal is a today's-dollars
  figure that rises with inflation, rather than a flat nominal instruction. A
  plan told prices rise 3% a year and then handed a grocery bill held flat for
  twenty years is describing a 45% real spending cut it never announces.
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
- **Return model** — `clustered` (the default) or `normal`. Both keep the
  return and volatility sliders' plain reading exactly, including over a long
  horizon; only the ORDER bad years arrive in changes. `normal` draws every
  year independently. `clustered` switches between a calm and a crisis market
  that each tend to persist, so bad years arrive in runs the way 1973–74,
  2000–02 and 2008–09 did — which is what actually empties a portfolio being
  drawn down, and which independent draws almost never produce.
- **Per-account depletion** — in combined and rollover mode the percentile
  rows describe the **summed** portfolio while the depletion rows describe the
  **accounts**, and each says which. They are different pools: a lane drawing
  9% a year beside a lane that only saves reports the spending lane's risk
  next to a 10th percentile made almost entirely of the saving lane's money.
- **Portfolio capital preservation** — required share prices per holding to
  keep pace with the projection (live quotes via a configurable stock API)
- **FIRE calculator, budget builder, scenario snapshots, PDF export**

### Modelling defaults that changed

Three defaults moved because they were wrong, not because they were arbitrary.
They do **not** all reach the same people, and the difference matters:

| Setting       | Was | Now         | Who it reaches                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volatility σ  | 12  | 18          | **Only new plans.** `volatilityA/B` has been in `DEFAULT_SLIDERS` for a while, so every export and every localStorage record written since then carries an explicit value that `normalizeState` preserves. A stored 12 stays 12 — which means the defect below stays in force, silently, for exactly the people who already have plans. Set σ to 18 by hand to get the corrected figures. |
| Return model  | —   | `clustered` | **Every plan.** It is a toggle no previous build ever wrote, so it is absent from every existing export and record, and all of them take the new default on load. Set it back with the Return model switch.                                                                                                                                                                               |
| Paths per run | 500 | 2,000       | **Every plan, unavoidably.** `MONTE_CARLO_SIM_COUNT` is a module constant with no key in the saved state and no control anywhere, so there is nothing to set by hand.                                                                                                                                                                                                                     |

Why each is right:

- **σ 18.** σ is the spread of the annual _rate_ the engine compounds monthly,
  so the calendar years it produces are ~1.115× wider. σ 18 gives years
  averaging 12.1% arithmetic / 10.3% geometric with a 20.1-point spread — the
  US large-cap record. σ 12 produced a market a third less variable than any
  broad index has ever been. The simulated geometric mean is unchanged, so this
  widens the cone without moving the return the plan compounds.
- **`clustered`.** Independent annual draws almost never produce the clustered
  bad sequence that actually sinks a withdrawal plan. Measured on a $400,000
  pot drawing $1,333/mo over 30 years at the same mean and σ: 0.07% ruin under
  `normal`, 0.27% under `clustered`; at σ 18, 1.97% and 2.56%.
- **2,000 paths.** At 500 the depletion share printed to whole-percent
  resolution carries a sampling standard deviation of about 2 points. A fixed
  seed made that error reproducible, not small.

### Deliberately not modelled

- **Stochastic inflation.** Measured at **0.00 percentage points** of ruin on
  both a stressed and a near-safe plan at every setting tried, because
  inflation reaches the balance through exactly one channel (a dynamic
  policy's indexed guardrails) and that clamp does not bind on the app's own
  defaults. The only figure it moves — the real-track 10–90 width — moves less
  than the arbitrary choice of `MONTE_CARLO_SEED` already moves it. Indexed
  spending, above, is the first-order version of the same concern and moves
  ruin by tens of points.
- **A historical block bootstrap.** It would need a hard-coded annual return
  table in a client-side bundle, and it would silently override the return and
  volatility sliders — a bootstrap's mean is whatever history was. The
  regime-switching model gets the clustering while keeping the sliders exact.
- **Fat tails as a separate model.** The engine draws one return per _year_,
  and fat tails are a daily/monthly fact that averaging washes out by the time
  a year is up. The non-normality that does survive annual aggregation is
  negative skew (about −0.43), so it is folded into the clustered model's
  innovation rather than shipped as a family of its own.
- **Multiple asset classes, glide paths, rebalancing, correlations.** A static
  stock/bond blend with no rebalancing is arithmetically just a lower mean and
  a lower σ, which the two existing sliders already express. The one thing a
  multi-asset model buys that they cannot is a glide path, and that is
  structural.
- **A dynamic policy's default ceiling.** It is the default track span
  ($10,000/mo), so it binds on any portfolio above about $3,000,000 — a
  guardrail nobody chose. Raising the default is not the fix: the withdrawal,
  floor and ceiling controls must span every stored guardrail, so a large
  default stretches all three tracks and leaves a real $2,000 withdrawal at
  0.2% of the slider. A ceiling that is genuinely absent needs an optional
  value rather than a large one. Until then the binding is **disclosed** — the
  withdrawal row says "held at the ceiling" rather than printing a flat number
  that looks like a policy — and it is **escapable**: the three withdrawal
  boxes accept any figure up to $1,000,000/mo whatever their track shows, and
  the track re-spans around what you type.

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

`scripts/deploy.sh` wraps that with the things a bare `npm run deploy` leaves
to you: it installs the `aws` CLI into a venv when the machine has none, runs
the same five checks CI does **before** anything reaches AWS, prints the commit
being shipped and warns when it is not what the remote has, and then polls the
live site until it serves the content-hashed entry chunk that was just built —
so a deploy that uploaded but never became visible is reported as a failure
rather than a success.

It reads `TH4_BUCKET` and `TH4_DIST_ID` from the environment and has **no
defaults**, so the script names no bucket, distribution, account or domain.
`TH4_SITE` is optional; without it the last step has nothing to poll and is
skipped. Keep your own values in a wrapper outside version control:

```sh
#!/usr/bin/env bash
TH4_BUCKET=... TH4_DIST_ID=... TH4_SITE=https://... \
  exec "$HOME/th4dev/scripts/deploy.sh" "$@"
```

```sh
scripts/deploy.sh              # build, publish, verify
scripts/deploy.sh --dry-run    # everything up to the build; writes nothing
scripts/deploy.sh --no-verify  # skip the post-publish fetch
```

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
