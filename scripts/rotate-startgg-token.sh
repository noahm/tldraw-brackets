#!/usr/bin/env bash
# Installs a new start.gg API token everywhere it's used, and records when it expires.
#
#   1. Make a token at https://start.gg/admin/profile/developer and note its expiry date.
#   2. scripts/rotate-startgg-token.sh [YYYY-MM-DD]   (the expiry; defaults to a year from today)
#   3. Commit worker/sources/startgg/token.ts, which resets the daily reminder.
#
# The token goes to the deployed worker (wrangler secret), the daily check (GitHub secret) and
# .dev.vars. It's read from the terminal, so it never lands in shell history.
set -euo pipefail
cd "$(dirname "$0")/.."

expires="${1:-$(date -u -d '+1 year' +%F)}"
if ! [[ "$expires" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
	echo "Expiry must be YYYY-MM-DD, got '$expires'" >&2
	exit 1
fi

read -rsp 'New start.gg token: ' token
echo
[[ -n "$token" ]] || { echo 'No token given' >&2; exit 1; }

printf '%s' "$token" | npx wrangler secret put STARTGG_TOKEN
printf '%s' "$token" | gh secret set STARTGG_TOKEN

if [[ -f .dev.vars ]]; then
	grep -v '^STARTGG_TOKEN=' .dev.vars > .dev.vars.tmp || true
	printf 'STARTGG_TOKEN=%s\n' "$token" >> .dev.vars.tmp
	mv .dev.vars.tmp .dev.vars
fi

sed -i "s/^export const STARTGG_TOKEN_EXPIRES: string | null = .*/export const STARTGG_TOKEN_EXPIRES: string | null = '$expires'/" \
	worker/sources/startgg/token.ts

echo "Installed. The token expires on $expires; the daily check will remind you a month before."
echo 'Now commit worker/sources/startgg/token.ts.'
