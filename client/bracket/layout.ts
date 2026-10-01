import type { BracketGraph, GraphEdge, GraphMatch } from '../../shared/bracketGraph'
import { matchCardHeight, matchCardWidth } from '../../shared/matchCardShape'

// A starting layout for a bracket. It only has to be a decent first draft: admins rearrange
// from there, and it never runs again for cards that are already placed.
//
// - Columns follow time: a match sits right of the matches feeding it. When the source groups
//   matches into phases (Blame the Pads' pools, e.g. a waterfall's divisions), each phase gets its
//   own block of columns, so a division's winners and redemption groups share a column.
// - Lanes keep the losers bracket below the main one, and grand finals to the right of both.
// - Within a lane, each match is centered on the matches feeding it from the same lane, which
//   gives elimination brackets their familiar shape.

export type Lane = 'main' | 'losers' | 'finals'

export interface MatchPlacement {
	x: number
	y: number
	w: number
	h: number
	lane: Lane
	column: number
}

export interface PhaseLabelPlacement {
	phaseKey: string
	name: string
	x: number
	y: number
}

export interface LayoutOptions {
	cardWidth: (match: GraphMatch) => number
	cardHeight: (match: GraphMatch) => number
	columnGap: number
	rowGap: number
	laneGap: number
	/** distance from a phase label's top to the first card under it */
	labelOffset: number
}

const defaultOptions: LayoutOptions = {
	cardWidth: (match) => matchCardWidth(match.capacity),
	cardHeight: (match) => matchCardHeight(match.capacity),
	columnGap: 80,
	rowGap: 24,
	laneGap: 96,
	labelOffset: 40,
}

const LOSERS_TITLE = /^L(R\d*|QF|SF|F)\b/
const LOSERS_NAME = /loser|redemption/i
const FINALS_NAME = /grand\s*final|reset/i

export function laneOf(match: GraphMatch, phaseName = ''): Lane {
	if (FINALS_NAME.test(match.title) || FINALS_NAME.test(phaseName)) return 'finals'
	if (LOSERS_TITLE.test(match.title) || LOSERS_NAME.test(match.title)) return 'losers'
	if (LOSERS_NAME.test(phaseName)) return 'losers'
	return 'main'
}

export function matchLanes(graph: BracketGraph): Map<string, Lane> {
	const phaseNames = new Map(graph.phases.map((p) => [p.key, p.name]))
	return new Map(
		graph.matches.map((m) => [m.key, laneOf(m, phaseNames.get(m.phaseKey ?? '') ?? '')])
	)
}

export function layoutBracket(
	graph: BracketGraph,
	options: Partial<LayoutOptions> = {}
): Map<string, MatchPlacement> {
	const opts = { ...defaultOptions, ...options }
	const order = new Map(graph.matches.map((m, i) => [m.key, i]))
	const lanes = matchLanes(graph)
	const columns = matchColumns(graph, lanes)
	const sources = new Map<string, string[]>()
	for (const edge of graph.edges) {
		sources.set(edge.to, [...(sources.get(edge.to) ?? []), edge.from])
	}

	// Each column is as wide as its widest card.
	const columnCount = Math.max(0, ...columns.values()) + 1
	const columnWidths = Array.from({ length: columnCount }, () => 0)
	for (const match of graph.matches) {
		const column = columns.get(match.key)!
		columnWidths[column] = Math.max(columnWidths[column], opts.cardWidth(match))
	}
	const columnX = columnWidths.map((_, i) =>
		columnWidths.slice(0, i).reduce((x, width) => x + width + opts.columnGap, 0)
	)

	const placed = new Map<string, MatchPlacement>()
	const center = (key: string) => {
		const p = placed.get(key)!
		return p.y + p.h / 2
	}
	const average = (values: number[]) =>
		values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined

	let laneTop = 0
	for (const lane of ['main', 'losers', 'finals'] as const) {
		const laneMatches = graph.matches.filter((m) => lanes.get(m.key) === lane)
		if (!laneMatches.length) continue

		for (let column = 0; column < columnCount; column++) {
			const items = laneMatches
				.filter((m) => columns.get(m.key) === column)
				.map((match) => {
					const feeders = (sources.get(match.key) ?? []).filter((k) => placed.has(k))
					// Finals take in both brackets; everywhere else, line up with your own lane only.
					const aligned = lane === 'finals' ? feeders : feeders.filter((k) => lanes.get(k) === lane)
					const desired = average(aligned.map(center))
					return {
						match,
						desired,
						sortKey: desired ?? average(feeders.map(center)) ?? Infinity,
					}
				})
				.sort((a, b) => a.sortKey - b.sortKey || order.get(a.match.key)! - order.get(b.match.key)!)

			// Finals float wherever their feeders put them; other lanes stack downward from the top.
			let cursor = lane === 'finals' ? -Infinity : laneTop
			let previousPhase: string | undefined
			for (const { match, desired } of items) {
				// A new phase partway down a column gets room for its label above it.
				if (previousPhase && match.phaseKey && match.phaseKey !== previousPhase) {
					cursor += opts.labelOffset
				}
				previousPhase = match.phaseKey
				const h = opts.cardHeight(match)
				const y = Math.max(
					desired == null ? (cursor === -Infinity ? 0 : cursor) : desired - h / 2,
					cursor
				)
				placed.set(match.key, {
					x: columnX[column],
					y,
					w: opts.cardWidth(match),
					h,
					lane,
					column,
				})
				cursor = y + h + opts.rowGap
			}
		}

		if (lane !== 'finals') {
			const bottom = Math.max(...laneMatches.map((m) => placed.get(m.key)!).map((p) => p.y + p.h))
			laneTop = bottom + opts.laneGap
		}
	}
	return placed
}

/**
 * Where to put each phase's name: above its topmost card, at its leftmost column. One label per
 * phase, so a waterfall division's label sits over its winners group, with the division's
 * redemption groups below. A phase holding a single match named the same (a "Grand Finals" pool
 * with a "Grand Finals" match) needs no label.
 */
export function layoutPhaseLabels(
	graph: BracketGraph,
	layout: Map<string, MatchPlacement>,
	options: Partial<LayoutOptions> = {}
): PhaseLabelPlacement[] {
	const { labelOffset } = { ...defaultOptions, ...options }
	return graph.phases.flatMap((phase) => {
		const matches = graph.matches.filter((m) => m.phaseKey === phase.key)
		const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
		if (matches.length === 1 && sameName(matches[0].title, phase.name)) return []
		const cards = matches.map((m) => layout.get(m.key)).filter((p): p is MatchPlacement => !!p)
		if (!cards.length) return []
		const left = Math.min(...cards.map((p) => p.x))
		const top = Math.min(...cards.filter((p) => p.x === left).map((p) => p.y))
		return [{ phaseKey: phase.key, name: phase.name, x: left, y: top - labelOffset }]
	})
}

/**
 * Columns for every match.
 *
 * When every match belongs to a phase, phases are laid out in order of the advancements between
 * them, each taking as many columns as the longest same-lane chain inside it. Moves between lanes
 * within a phase (a division's winners dropping into its redemption group) stay in the same
 * column. Otherwise (no phases, or phases whose advancements form a cycle, which no real bracket
 * has), it's the longest path through the advancements. Without any advancements at all (a
 * hand-built tourney), it's phase order.
 */
export function matchColumns(
	graph: BracketGraph,
	lanes: Map<string, Lane> = matchLanes(graph)
): Map<string, number> {
	const keys = graph.matches.map((m) => m.key)
	if (!graph.edges.length) {
		const phaseOrder = new Map(graph.phases.map((p) => [p.key, p.order]))
		return new Map(graph.matches.map((m) => [m.key, phaseOrder.get(m.phaseKey ?? '') ?? 0]))
	}
	const byPhase = phaseColumns(graph, lanes)
	return byPhase ?? longestPath(keys, graph.edges).depths
}

function phaseColumns(graph: BracketGraph, lanes: Map<string, Lane>): Map<string, number> | null {
	const phaseOf = new Map(graph.matches.map((m) => [m.key, m.phaseKey]))
	if (!graph.phases.length || graph.matches.some((m) => !m.phaseKey)) return null

	const sameLaneWithinPhase = graph.edges.filter(
		(e) => phaseOf.get(e.from) === phaseOf.get(e.to) && lanes.get(e.from) === lanes.get(e.to)
	)
	const inner = longestPath(
		graph.matches.map((m) => m.key),
		sameLaneWithinPhase
	).depths
	const widths = new Map<string, number>()
	for (const m of graph.matches) {
		widths.set(m.phaseKey!, Math.max(widths.get(m.phaseKey!) ?? 0, inner.get(m.key)! + 1))
	}

	const phaseEdges = graph.edges
		.map((e) => ({ from: phaseOf.get(e.from)!, to: phaseOf.get(e.to)! }))
		.filter((e) => e.from !== e.to)
	const phaseKeys = [...new Set(graph.matches.map((m) => m.phaseKey!))]
	const { depths: starts, complete } = longestPath(
		phaseKeys,
		phaseEdges,
		(from) => widths.get(from)!
	)
	if (!complete) return null

	return new Map(graph.matches.map((m) => [m.key, starts.get(m.phaseKey!)! + inner.get(m.key)!]))
}

/**
 * Longest-path depth of each node from the nodes nothing points to, where crossing an edge adds
 * `step(from)`. `complete` is false if a cycle left some nodes unvisited (they stay at 0).
 */
function longestPath(
	keys: string[],
	edges: Pick<GraphEdge, 'from' | 'to'>[],
	step: (from: string) => number = () => 1
) {
	const depths = new Map(keys.map((k) => [k, 0]))
	const relevant = edges.filter((e) => depths.has(e.from) && depths.has(e.to))
	const inDegree = new Map(keys.map((k) => [k, 0]))
	for (const e of relevant) inDegree.set(e.to, inDegree.get(e.to)! + 1)
	const queue = keys.filter((k) => inDegree.get(k) === 0)
	let visited = 0
	while (queue.length) {
		const key = queue.shift()!
		visited++
		for (const e of relevant) {
			if (e.from !== key) continue
			depths.set(e.to, Math.max(depths.get(e.to)!, depths.get(key)! + step(key)))
			inDegree.set(e.to, inDegree.get(e.to)! - 1)
			if (inDegree.get(e.to) === 0) queue.push(e.to)
		}
	}
	return { depths, complete: visited === keys.length }
}
