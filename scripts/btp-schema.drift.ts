import { describe, expect, it } from 'vitest'
import { layoutBracket } from '../client/bracket/layout'
import { fetchTourneyRows, type BtpConnection } from '../worker/sources/btp/fetchTourneyRows'
import { btpRowsToGraph } from '../worker/sources/btp/toGraph'

// Runs the btp adapter over real tourneys: a few finished ones covering each format we've seen
// (double elimination, a gauntlet waterfall, a manually run bracket), plus the newest ones, which
// are the likeliest to show a change on Blame the Pads' side. The row schemas in rows.ts do most
// of the checking; the rest is what a broken mapping would look like.

// Runs in Node, but the project's types are the worker's and the browser's.
declare const process: { env: Record<string, string | undefined> }

const PINNED_TOURNEYS = [
	107, // double elimination
	101, // gauntlet waterfall
	92, // advancements added by hand
]
const NEWEST_TOURNEYS = 3

const conn: BtpConnection = {
	supabaseUrl: process.env.BTP_SUPABASE_URL ?? '',
	anonKey: process.env.BTP_SUPABASE_ANON_KEY ?? '',
}
if (!conn.supabaseUrl || !conn.anonKey) {
	throw new Error('Set BTP_SUPABASE_URL and BTP_SUPABASE_ANON_KEY to check against Blame the Pads')
}

async function newestTourneyIds() {
	const url = `${conn.supabaseUrl.replace(/\/+$/, '')}/rest/v1/tourneys?select=id&order=id.desc&limit=${NEWEST_TOURNEYS}`
	const response = await fetch(url, {
		headers: { apikey: conn.anonKey, authorization: `Bearer ${conn.anonKey}` },
	})
	if (!response.ok) throw new Error(`tourneys query failed: ${response.status}`)
	return ((await response.json()) as { id: number }[]).map((t) => t.id)
}

const tourneyIds = [...new Set([...PINNED_TOURNEYS, ...(await newestTourneyIds())])]

describe.each(tourneyIds)('Blame the Pads tourney #%i', (tourneyId) => {
	it('reads, maps and lays out', async () => {
		const graph = btpRowsToGraph(await fetchTourneyRows(conn, tourneyId))
		const matchKeys = new Set(graph.matches.map((m) => m.key))
		const phaseKeys = new Set(graph.phases.map((p) => p.key))

		expect(graph.title).toBeTruthy()
		expect(matchKeys.size).toBe(graph.matches.length)
		for (const match of graph.matches) {
			if (match.phaseKey) expect(phaseKeys).toContain(match.phaseKey)
			expect(match.capacity).toBeGreaterThanOrEqual(match.entrants.length)
			for (const entrant of match.entrants) expect(entrant.name).toBeTruthy()
			const placements = match.entrants.flatMap((e) => (e.placement ? [e.placement] : []))
			expect(new Set(placements).size).toBe(placements.length)
		}
		for (const edge of graph.edges) {
			expect(matchKeys).toContain(edge.from)
			expect(matchKeys).toContain(edge.to)
		}

		const layout = layoutBracket(graph)
		expect(layout.size).toBe(graph.matches.length)
	})
})
