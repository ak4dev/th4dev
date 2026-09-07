#!/usr/bin/env bash
#
# Build, publish and verify a deploy of this site.
#
# CARRIES NO IDENTIFIERS ON PURPOSE. The bucket and the CloudFront distribution
# arrive as environment variables and there are no defaults, so this file names
# no account, no bucket and no domain — see the README's Deployment section,
# which states that those values are not in the repo. A wrapper that supplies
# them is a two-line script kept outside version control:
#
#   #!/usr/bin/env bash
#   TH4_BUCKET=... TH4_DIST_ID=... TH4_SITE=https://... \
#     exec "$HOME/<repo>/scripts/deploy.sh" "$@"
#
# What it adds over `npm run deploy`, which it ultimately calls:
#   - installs the aws CLI into a throwaway venv when the machine has none
#   - runs the same five checks CI does, before anything reaches AWS
#   - says what commit is shipping, and warns if it is not what the remote has
#   - polls the live site until it serves the entry chunk just built
#
# Usage:
#   scripts/deploy.sh              build, publish, verify
#   scripts/deploy.sh --dry-run    everything up to the build; writes nothing
#   scripts/deploy.sh --no-verify  skip the post-publish fetch
#
set -euo pipefail


# The repo is wherever this script lives, so the wrapper needs no second copy
# of that path and a checkout can sit anywhere.
REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# One venv, reused: the install is slow enough that doing it per deploy would
# be felt, and it is kept out of the repo so a build never sees it.
VENV="${TH4_AWS_VENV:-$HOME/.local/share/th4-deploy/awsenv}"

DRY_RUN=0
VERIFY=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-verify) VERIFY=0 ;;
    -h | --help)
      sed -n '3,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "deploy.sh: unknown option '$arg'" >&2
      exit 2
      ;;
  esac
done

# Checked AFTER the arguments, so `--help` works on a machine that has never
# been configured for a deploy.
: "${TH4_BUCKET:?set TH4_BUCKET to the target bucket}"
: "${TH4_DIST_ID:?set TH4_DIST_ID to the CloudFront distribution to invalidate}"
# Optional: with no site to poll there is nothing to verify against, so the
# last step is skipped rather than guessed at.
SITE="${TH4_SITE:-}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warning:\033[0m %s\n' "$*"; }
die() {
  printf '\033[1;31mdeploy.sh:\033[0m %s\n' "$*" >&2
  exit 1
}

cd "$REPO"

# ---------- 1. the aws CLI ----------
if command -v aws > /dev/null 2>&1; then
  say "aws CLI: $(aws --version 2>&1)"
else
  if [ ! -x "$VENV/bin/aws" ]; then
    say "installing the aws CLI into $VENV (one time)"
    mkdir -p "$(dirname "$VENV")"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --upgrade pip
    "$VENV/bin/pip" install --quiet awscli
  fi
  PATH="$VENV/bin:$PATH"
  export PATH
  say "aws CLI: $(aws --version 2>&1)"
fi

# ---------- 2. credentials ----------
CALLER="$(aws sts get-caller-identity --query Arn --output text 2>&1)" \
  || die "AWS credentials are not working: $CALLER"
say "authenticated as $CALLER"

# ---------- 3. what is about to ship ----------
HEAD_SHA="$(git rev-parse --short HEAD)"
say "deploying $HEAD_SHA — $(git log -1 --pretty=%s)"
if [ -n "$(git status --porcelain)" ]; then
  # A warning, not a refusal: deploying a dirty tree is occasionally
  # deliberate, but it must never be silent, because what lands is then not
  # any commit anyone can check out.
  warn "working tree is dirty; what ships will not match $HEAD_SHA"
fi
# Asked of the remote itself rather than of the origin/master ref. Pushing over
# SSH while `origin` is an https URL leaves that ref permanently stale, so
# comparing against it would warn on every deploy. Reading is unauthenticated
# on a public repo and simply yields nothing on a private one, which is why a
# failure here is silent.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/$BRANCH" 2> /dev/null | cut -c1-7 || true)"
if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$HEAD_SHA" ]; then
  warn "HEAD ($HEAD_SHA) is not what the remote has ($REMOTE_SHA) — push first?"
fi

# ---------- 4. the gate ----------
# The same five checks, in the same order, as .github/workflows/ci.yml and
# buildspec.yml. Publishing is outward-facing and this is the last chance not
# to do it.
say "running the full gate (lint, typecheck, format, tests, build)"
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build

if [ "$DRY_RUN" -eq 1 ]; then
  say "--dry-run: built dist/, wrote nothing to AWS"
  exit 0
fi

# ---------- 5. publish ----------
# Delegated to `npm run sync` rather than restated here, so the cache-control
# policy — assets/ immutable for a year, index.html no-cache, then invalidate,
# and no --delete so a visitor holding a stale index.html can still fetch the
# assets it names — lives in exactly one place.
say "syncing to s3://$TH4_BUCKET and invalidating $TH4_DIST_ID"
BUCKET="$TH4_BUCKET" DIST_ID="$TH4_DIST_ID" npm run sync

# ---------- 6. verify ----------
if [ "$VERIFY" -eq 0 ]; then
  exit 0
fi
if [ -z "$SITE" ]; then
  say "TH4_SITE is unset, so there is nothing to verify against; skipping"
  exit 0
fi
# The entry chunk is content-hashed, so the live index.html naming the one just
# built is proof that both the upload and the invalidation took effect. Without
# this the script would report success for a deploy that never became visible.
ENTRY="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1 || true)"
if [ -z "$ENTRY" ]; then
  say "could not read the entry chunk from dist/index.html; skipping verify"
  exit 0
fi
say "verifying $SITE serves $ENTRY"
for attempt in 1 2 3 4 5 6; do
  LIVE="$(curl -fsS --max-time 20 "$SITE/?cachebust=$(date +%s)" 2> /dev/null || true)"
  case "$LIVE" in
    *"$ENTRY"*)
      say "live: $SITE is serving $HEAD_SHA"
      exit 0
      ;;
  esac
  if [ "$attempt" -lt 6 ]; then
    echo "    not yet (attempt $attempt/6), waiting 10s"
    sleep 10
  fi
done
die "$SITE did not serve $ENTRY within ~60s — the sync succeeded, so check the CloudFront invalidation"
