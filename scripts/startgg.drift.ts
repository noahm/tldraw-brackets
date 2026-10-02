import { describe, expect, it } from 'vitest'
import { layoutBracket } from '../client/bracket/layout'
import { fetchEventRows } from '../worker/sources/startgg/fetchEventRows'
import { startggRowsToGraph } from '../worker/sources/startgg/toGraph'
import {
	daysUntilTokenExpires,
	STARTGG_TOKEN_EXPIRES,
	STARTGG_TOKEN_WARNING_DAYS,
} from '../worker/sources/startgg/token'

// Two things start.gg can spring on us, checked daily:
//
// - The API token expiring. Tokens last a year and can only be replaced by hand, so this starts
//   failing a month before the date in worker/sources/startgg/token.ts. That failure is the
//   reminder: run scripts/rotate-startgg-token.sh.
// - The API changing. This reads the final phase of a few finished events through the adapter.

// Runs in Node, but the project's types are the worker's and the browser's.
declare const process: { env: Record<string, string | undefined> }

/** Finished events, read for their final phase (usually a single pool, like a top 8). */
const PINNED_EVENTS = ['tournament/genesis-9-1/event/melee-singles']

const token = process.env.STARTGG_TOKEN ?? ''
if (!token) throw new Error('Set STARTGG_TOKEN to check against start.gg')

describe('start.gg API token', () => {
	it(`doesn't expire within ${STARTGG_TOKEN_WARNING_DAYS} days`, () => {
		const days = daysUntilTokenExpires()
		if (days == null) {
			throw new Error(
				'STARTGG_TOKEN_EXPIRES in worker/sources/startgg/token.ts is not set. ' +
					'Record the token’s expiry date there (scripts/rotate-startgg-token.sh does this).'
			)
		}
		if (days < STARTGG_TOKEN_WARNING_DAYS) {
			throw new Error(
				`The start.gg API token ${days < 0 ? 'expired' : `expires in ${days} days, `} on ` +
					`${STARTGG_TOKEN_EXPIRES}. Make a new one at https://start.gg/admin/profile/developer ` +
					'and run scripts/rotate-startgg-token.sh.'
			)
		}
	})
})

describe.each(PINNED_EVENTS)('start.gg event %s', (eventSlug) => {
	it('reads, maps and lays out its final phase', async () => {
		const phaseId = await lastPhaseId(eventSlug)
		const { rows } = await fetchEventRows(token, { eventSlug, phaseId })
		const graph = startggRowsToGraph(rows)
		const matchKeys = new Set(graph.matches.map((m) => m.key))

		expect(graph.title).toBeTruthy()
		expect(graph.matches.length).toBeGreaterThan(0)
		expect(matchKeys.size).toBe(graph.matches.length)
		for (const match of graph.matches) {
			expect(match.status).toBe('complete')
			for (const entrant of match.entrants) expect(entrant.name).toBeTruthy()
		}
		for (const edge of graph.edges) {
			expect(matchKeys).toContain(edge.from)
			expect(matchKeys).toContain(edge.to)
		}
		expect(layoutBracket(graph).size).toBe(graph.matches.length)
	})
})

async function lastPhaseId(eventSlug: string): Promise<number> {
	const response = await fetch('https://api.start.gg/gql/alpha', {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			query: 'query ($slug: String!) { event(slug: $slug) { phases { id phaseOrder } } }',
			variables: { slug: eventSlug },
		}),
	})
	const body = (await response.json()) as {
		data?: { event?: { phases?: { id: number; phaseOrder: number }[] } }
	}
	const phases = body.data?.event?.phases ?? []
	if (!phases.length) throw new Error(`No phases found for ${eventSlug}: ${JSON.stringify(body)}`)
	return phases.reduce((last, p) => (p.phaseOrder > last.phaseOrder ? p : last)).id
}
