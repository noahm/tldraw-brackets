// Secrets aren't in wrangler.toml, so `wrangler types` can't see them. Declare them here; set
// them with `wrangler secret put` in production and in .dev.vars locally.
interface SecretEnv {
	/** Blame the Pads' Supabase project URL, e.g. https://<project>.supabase.co */
	BTP_SUPABASE_URL?: string
	/** Blame the Pads' public anon key (the same one its frontend ships) */
	BTP_SUPABASE_ANON_KEY?: string
	/**
	 * A start.gg API token (developer settings → personal access tokens). These expire after a
	 * year; record the date in worker/sources/startgg/token.ts. See scripts/rotate-startgg-token.sh.
	 */
	STARTGG_TOKEN?: string
}

interface Env extends SecretEnv {}

declare namespace Cloudflare {
	interface Env extends SecretEnv {}
}
