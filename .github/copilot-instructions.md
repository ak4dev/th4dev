# Copilot Instructions for TH4Dev

## Project Overview

TH4Dev is a React + TypeScript investment calculator with:

- Dual-track (A/B) investment growth projections
- Monte Carlo confidence bands
- FIRE (Financial Independence, Retire Early) calculator
- Fee & expense ratio tracking
- Budget builder with category breakdown
- Scenario snapshot save/load/compare
- PDF report export
- Portfolio capital preservation analysis
- CDK infrastructure for multi-environment AWS deployment (S3 + CloudFront + Route53)

## Commit Conventions

All commits MUST use **Conventional Commits** format:

```
type(scope): short description

Optional body with more detail.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

### Types

- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code restructuring without behavior change
- `test` — Adding or updating tests
- `docs` — Documentation changes
- `chore` — Tooling, config, dependency updates
- `style` — Formatting only (no logic change)

### Scopes

Use the feature area: `fees`, `monte-carlo`, `fire`, `scenarios`, `budget`, `pdf`, `portfolio`, `ui`, `infra`, `chart`, etc.

## Code Style

- **Language**: TypeScript (strict mode)
- **CSS-in-JS**: Stitches (`stitches.config.ts` for theme tokens)
- **Components**: Radix UI primitives for accessible toggles, popovers, sliders
- **Charts**: Recharts (`ComposedChart` with Area + Line)
- **Testing**: Vitest with `globals: true`, test files in `src/**/__tests__/**/*.test.ts`
- **No semicolons at EOL**: Project uses no-semicolon style in most files
- **Comments**: Only when clarifying non-obvious logic. No commented-out code.
- **No emojis**: Never use emoji characters in UI text, labels, or code unless explicitly requested by the user.
- **Theme colors**: Always use Stitches theme tokens (`$cyan`, `$green`, `$comment`, etc.) for colors. Never hardcode colors outside of `stitches.config.ts` theme definitions.
- **Conventional Commits**: All commits must follow Conventional Commits format (`type(scope): description`).
- **No auto-push**: Never `git push` unless the user explicitly asks. Commit locally only.

## Architecture

### Toggle System

- Core toggles (Advanced, Inflated) always visible
- Tool toggles (Rollover, Fees, Portfolio, Monte Carlo, FIRE, Scenarios, Budget, Dynamic Withdrawal) visible only in Advanced mode
- `TogglesState` is defined ONCE, in `src/common/types/types.ts` (`TH4State.toggles` is a `TogglesState`) — never redeclare it locally

### State Management

- Sliders: `Record<string, number>` (keyed by slider name)
- Inputs: `Record<string, string>` (keyed by input name)
- Toggles: Typed object (`TogglesState`)
- All persisted to localStorage when user consents

### Calculator Engine

- `InvestmentCalculatorProps` (`src/common/types/types.ts`) is a plain input object with no setter callbacks; callers construct an `InvestmentCalculator`, call `calculateGrowth()`, and read results from its getters (`getGrowthMatrix()`, `getWithdrawalSchedule()`, `getCumulativeFees()`, ...)
- `dynamicWithdrawal?: DynamicWithdrawal` (rate % of balance with floor/ceiling) replaces `monthlyWithdrawal` when present; the hub passes it only when `toggles.advanced && toggles.dynamicWithdrawal`, and Monte Carlo applies the same policy per simulated path

### Privacy

- **User privacy is held above all else.** No data of any kind may be stored or persisted without explicit opt-in via the localStorage consent toggle.
- CRUD helper functions (budget-manager, scenario-manager) must be **pure** — they compute and return new arrays without localStorage side effects.
- All persistence flows through the single consent-gated `useEffect` in `App.tsx`.
- Whenever consent is absent (at boot and on revoke), all localStorage keys (including legacy standalone keys) are purged.

### Adding a New Feature Toggle

1. Add the field to `TogglesState` in `src/common/types/types.ts`
2. Add its default (`false`) to `DEFAULT_TOGGLES` in `src/common/helpers/state-manager.ts`
3. Nothing to add to `isValidTH4State`: the guard iterates the keys of `DEFAULT_TOGGLES` (boolean-or-undefined for every key, an enum check for `monteCarloMode`; only `advanced`, `rollover`, `showInflation` and `portfolio` are required so older exports still import)
4. Add the key and label to `TOOL_TOGGLES` in `InvestmentCalculatorModern.tsx` (rendered as a `SwitchRow` in the Tools section)
5. Conditionally render feature UI when the toggle is on

## Testing

- Run app tests: `npx vitest run`
- Run CDK tests: `cd infra && npx jest` (needs no `deploy-config.json`; tests use temp files)
- Use `vi.useFakeTimers()` frozen to Jan 15, 2026 for time-sensitive tests
- `InvestmentCalculator` class is instantiated fresh per test
- Target: all tests pass before every commit

## CDK Infrastructure

- Located in `infra/`
- Run `npm run configure` (ts-node, no build step) to add, edit, or remove deployment targets
- Each deployment gets its own CloudFormation stack; run `npm run build` at the repo root first because the stack deploys `./dist`
- Config stored in `infra/deploy-config.json` (gitignored); `loadConfig()` validates it and `bin/app.ts` prints the validation error
- Every stack must deploy to `us-east-1` (CloudFront only accepts ACM certificates from there); other regions are rejected at synth
- Hashed `assets/` are uploaded immutable and never pruned; `index.html` is uploaded `no-cache, must-revalidate` and triggers a `/*` invalidation
