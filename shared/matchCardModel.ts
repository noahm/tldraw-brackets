import {
	edgeSlots,
	type BracketGraph,
	type GraphEdge,
	type GraphEntrant,
	type GraphMatch,
} from './bracketGraph'

// What a match card shows, row by row, derived from the live graph.

export type MatchCardRow =
	| { kind: 'entrant'; entrant: GraphEntrant; result?: string }
	/** a slot waiting on another match, e.g. "Loser of WR1:M1" */
	| { kind: 'placeholder'; label: string }
	| { kind: 'empty' }

export interface MatchCardModel {
	match: GraphMatch
	rows: MatchCardRow[]
}

/** null when the graph has no such match (the card is left over from a source change) */
export function matchCardModel(graph: BracketGraph, matchKey: string): MatchCardModel | null {
	const match = graph.matches.find((m) => m.key === matchKey)
	if (!match) return null

	const rows: MatchCardRow[] = match.entrants.map((entrant) => ({
		kind: 'entrant',
		entrant,
		result: entrantResult(graph, match, entrant),
	}))

	for (const label of pendingArrivals(graph, match)) {
		if (rows.length >= match.capacity) break
		rows.push({ kind: 'placeholder', label })
	}
	while (rows.length < match.capacity) rows.push({ kind: 'empty' })

	return { match, rows }
}

/**
 * The player's exact place when known; otherwise the range of places the advancement they took
 * covers (e.g. "3rd–6th"), which says more in less space than its label.
 */
function entrantResult(
	graph: BracketGraph,
	match: GraphMatch,
	entrant: GraphEntrant
): string | undefined {
	if (entrant.placement != null) return ordinal(entrant.placement)
	const edge = entrant.advancedVia && graph.edges.find((e) => e.key === entrant.advancedVia)
	if (!edge) return undefined
	return edgeDescription(edge, edgeSlots(edge, match.capacity))
}

/**
 * One label per player still expected to arrive: each incoming edge contributes as many slots as
 * it carries, less those its source match has already sent on.
 */
function pendingArrivals(graph: BracketGraph, match: GraphMatch): string[] {
	const labels: string[] = []
	const matchOrder = new Map(graph.matches.map((m, i) => [m.key, i]))
	const incoming = graph.edges
		.filter((e) => e.to === match.key)
		.sort(
			(a, b) =>
				(matchOrder.get(a.from) ?? 0) - (matchOrder.get(b.from) ?? 0) || a.rankStart - b.rankStart
		)

	for (const edge of incoming) {
		const from = graph.matches.find((m) => m.key === edge.from)
		if (!from) continue
		const sent = from.entrants.filter((e) => e.advancedVia === edge.key).length
		const expected = edgeSlots(edge, from.capacity)
		const description = edgeDescription(edge, expected)
		for (let i = sent; i < expected; i++) labels.push(`${description} of ${from.title}`)
	}
	return labels
}

/**
 * "Winner", "Loser", or a rank range like "1st–2nd" / "3rd+" when the edge carries several
 * players (where a label like "Advance" alone wouldn't say which).
 */
export function edgeDescription(edge: GraphEdge, slots: number): string {
	if (slots === 1) return edge.label ?? ordinal(edge.rankStart)
	if (edge.rankEnd == null) return `${ordinal(edge.rankStart)}+`
	return `${ordinal(edge.rankStart)}–${ordinal(edge.rankEnd)}`
}

export function ordinal(n: number): string {
	const tens = n % 100
	if (tens >= 11 && tens <= 13) return `${n}th`
	return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}
