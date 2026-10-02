import type { BracketGraph } from '../../shared/bracketGraph'
import type { DiagramSource } from '../../shared/source'
import { fetchTourneyRows } from './btp/fetchTourneyRows'
import { btpRowsToGraph } from './btp/toGraph'
import { fixtures as btpFixtures } from './fixtures/de4'
import { startggDe4Midway } from './fixtures/startggDe4'
import { SourceError, type SourceRead } from './read'
import { fetchEventRows } from './startgg/fetchEventRows'
import { startggRowsToGraph } from './startgg/toGraph'

export { SourceError, type SourceRead } from './read'

/** Blame the Pads and fixtures can be read as often as anyone likes. */
const DEFAULT_READ_INTERVAL_MS = 5_000
/** start.gg is never read more often than this, however small the bracket. */
const STARTGG_MIN_READ_INTERVAL_MS = 15_000
/**
 * The share of start.gg's 80 requests a minute (per token, across every diagram) that one diagram
 * may use. Bigger brackets need more requests per read, so they're read less often.
 */
const STARTGG_REQUESTS_PER_MINUTE = 20

const fixtures: Record<string, () => BracketGraph> = {
	...Object.fromEntries(
		Object.entries(btpFixtures).map(([name, rows]) => [name, () => btpRowsToGraph(rows)])
	),
	'startgg-de4': () => startggRowsToGraph(startggDe4Midway),
}

/** Reads a diagram's source and normalizes it. Never writes anything back to the source. */
export async function readSource(source: DiagramSource, env: Env): Promise<SourceRead> {
	switch (source.kind) {
		case 'btp': {
			if (!env.BTP_SUPABASE_URL || !env.BTP_SUPABASE_ANON_KEY) {
				throw new SourceError('BTP_SUPABASE_URL and BTP_SUPABASE_ANON_KEY are not configured')
			}
			const rows = await fetchTourneyRows(
				{ supabaseUrl: env.BTP_SUPABASE_URL, anonKey: env.BTP_SUPABASE_ANON_KEY },
				source.tourneyId
			)
			return { graph: btpRowsToGraph(rows), nextReadMs: DEFAULT_READ_INTERVAL_MS }
		}
		case 'startgg': {
			if (!env.STARTGG_TOKEN) throw new SourceError('STARTGG_TOKEN is not configured')
			const { rows, requests } = await fetchEventRows(env.STARTGG_TOKEN, source)
			return {
				graph: startggRowsToGraph(rows),
				nextReadMs: Math.max(
					STARTGG_MIN_READ_INTERVAL_MS,
					(requests * 60_000) / STARTGG_REQUESTS_PER_MINUTE
				),
			}
		}
		case 'fixture': {
			const graph = fixtures[source.name]
			if (!graph) throw new SourceError(`Unknown fixture "${source.name}"`)
			return { graph: graph(), nextReadMs: DEFAULT_READ_INTERVAL_MS }
		}
	}
}
