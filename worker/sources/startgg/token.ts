// start.gg API tokens expire a year after they're made, and there's no API to make a new one, so
// a person has to. The daily start.gg check (scripts/startgg.drift.ts) starts failing a month
// before this date, which is the reminder. scripts/rotate-startgg-token.sh installs a new token
// everywhere it's needed and rewrites this line.

/** When the STARTGG_TOKEN in use expires (YYYY-MM-DD), or null if no token has been set up. */
export const STARTGG_TOKEN_EXPIRES: string | null = '2027-10-02'

/** How long before expiry the daily check starts failing. */
export const STARTGG_TOKEN_WARNING_DAYS = 30

/** Whole days until the token expires (negative once it has), or null if the date isn't recorded. */
export function daysUntilTokenExpires(now = new Date()): number | null {
	if (!STARTGG_TOKEN_EXPIRES) return null
	const expires = Date.parse(`${STARTGG_TOKEN_EXPIRES}T00:00:00Z`)
	return Math.floor((expires - now.getTime()) / 86_400_000)
}
