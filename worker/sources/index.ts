import type { BracketGraph } from '../../shared/bracketGraph'
import type { DiagramSource } from '../../shared/source'
import { fetchTourneyRows } from './btp/fetchTourneyRows'
import { btpRowsToGraph } from './btp/toGraph'
import { fixtures } from './fixtures/de4'

/** Reads a diagram's source and normalizes it. Never writes anything back to the source. */
export async function fetchGraph(source: DiagramSource, env: Env): Promise<BracketGraph> {
	switch (source.kind) {
		case 'btp': {
			if (!env.BTP_SUPABASE_URL || !env.BTP_SUPABASE_ANON_KEY) {
				throw new Error('BTP_SUPABASE_URL and BTP_SUPABASE_ANON_KEY are not configured')
			}
			const rows = await fetchTourneyRows(
				{ supabaseUrl: env.BTP_SUPABASE_URL, anonKey: env.BTP_SUPABASE_ANON_KEY },
				source.tourneyId
			)
			return btpRowsToGraph(rows)
		}
		case 'fixture': {
			const rows = fixtures[source.name]
			if (!rows) throw new Error(`Unknown fixture "${source.name}"`)
			return btpRowsToGraph(rows)
		}
	}
}
