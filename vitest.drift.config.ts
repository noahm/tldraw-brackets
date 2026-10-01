import { defineConfig } from 'vitest/config'

// Checks the Blame the Pads adapter against the live database, to catch schema drift on their
// side before an admin does. Needs BTP_SUPABASE_URL and BTP_SUPABASE_ANON_KEY in the
// environment; run with `npm run check:btp`. Not part of `npm test`, which stays offline.
export default defineConfig({
	test: {
		include: ['scripts/**/*.drift.ts'],
		testTimeout: 30_000,
	},
})
