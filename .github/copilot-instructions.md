# Copilot Instructions for TH4Dev

## Project Overview

TH4Dev is a React + TypeScript investment calculator with:
- Dual-track (A/B) investment growth projections
- Monte Carlo confidence bands
- FIRE (Financial Independence, Retire Early) calculator
- Fee & expense ratio tracking
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
Use the feature area: `fees`, `monte-carlo`, `fire`, `scenarios`, `pdf`, `portfolio`, `ui`, `infra`, `chart`, etc.

## Code Style

- **Language**: TypeScript (strict mode)
- **CSS-in-JS**: Stitches (`stitches.config.ts` for theme tokens)
- **Components**: Radix UI primitives for accessible toggles, popovers, sliders
- **Charts**: Recharts (`ComposedChart` with Area + Line)
- **Testing**: Vitest with `globals: true`, test files in `src/**/__tests__/**/*.test.ts`
- **No semicolons at EOL**: Project uses no-semicolon style in most files
- **Comments**: Only when clarifying non-obvious logic. No commented-out code.

## Architecture

### Toggle System
- Core toggles (Advanced, Inflated) always visible
- Tool toggles (Rollover, Fees, Monte Carlo, FIRE, Scenarios, Portfolio) visible only in Advanced mode
- `TogglesState` is defined BOTH in `src/common/types/types.ts` (as `TH4State.toggles`) AND in `InvestmentCalculatorModern.tsx` — **keep both in sync**

### State Management
- Sliders: `Record<string, number>` (keyed by slider name)
- Inputs: `Record<string, string>` (keyed by input name)
- Toggles: Typed object (`TogglesState`)
- All persisted to localStorage when user consents

### Adding a New Feature Toggle
1. Add to `TH4State.toggles` in `src/common/types/types.ts`
2. Add to local `TogglesState` in `InvestmentCalculatorModern.tsx`
3. Add default `false` in `App.tsx` default state
4. Add backward-compat check in `StateIOPopover.tsx` type guard
5. Add `SwitchRow` in the Tools toggle section
6. Conditionally render feature UI when toggle is on

### Type Guard (StateIOPopover)
New toggle fields must use backward-compatible check:
```ts
(t["newToggle"] === undefined || typeof t["newToggle"] === "boolean")
```

## Testing

- Run app tests: `npx vitest run`
- Run CDK tests: `cd infra && npx jest`
- Use `vi.useFakeTimers()` frozen to Jan 15, 2026 for time-sensitive tests
- `InvestmentCalculator` class is instantiated fresh per test
- Target: all tests pass before every commit

## CDK Infrastructure

- Located in `infra/`
- Run `node bin/configure.js` to add deployment targets
- Each deployment gets its own CloudFormation stack
- Config stored in `infra/deploy-config.json` (gitignored)
- ACM certificates must be in `us-east-1` for CloudFront
