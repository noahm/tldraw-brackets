import type { BracketGraph, GraphMatch } from '../../shared/bracketGraph'
import { MATCH_CARD_WIDTH, matchCardHeight } from '../../shared/matchCardShape'

// A starting layout for a bracket. It only has to be a decent first draft: admins rearrange
// from there, and it never runs again for cards that are already placed.
//
// - Columns follow time: a match sits one column right of the latest match feeding it.
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

export interface LayoutOptions {
	cardWidth: number
	cardHeight: (match: GraphMatch) => number
	columnGap: number
	rowGap: number
	laneGap: number
}

const defaultOptions: LayoutOptions = {
	cardWidth: MATCH_CARD_WIDTH,
	cardHeight: (match) => matchCardHeight(match.capacity),
	columnGap: 80,
	rowGap: 24,
	laneGap: 96,
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

export function layoutBracket(
	graph: BracketGraph,
	options: Partial<LayoutOptions> = {}
): Map<string, MatchPlacement> {
	const opts = { ...defaultOptions, ...options }
	const phaseNames = new Map(graph.phases.map((p) => [p.key, p.name]))
	const order = new Map(graph.matches.map((m, i) => [m.key, i]))
	const lanes = new Map(
		graph.matches.map((m) => [m.key, laneOf(m, phaseNames.get(m.phaseKey ?? '') ?? '')])
	)
	const columns = matchColumns(graph)
	const sources = new Map<string, string[]>()
	for (const edge of graph.edges) {
		sources.set(edge.to, [...(sources.get(edge.to) ?? []), edge.from])
	}

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
		const maxColumn = Math.max(...laneMatches.map((m) => columns.get(m.key)!))

		for (let column = 0; column <= maxColumn; column++) {
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
			for (const { match, desired } of items) {
				const h = opts.cardHeight(match)
				const y = Math.max(
					desired == null ? (cursor === -Infinity ? 0 : cursor) : desired - h / 2,
					cursor
				)
				placed.set(match.key, {
					x: column * (opts.cardWidth + opts.columnGap),
					y,
					w: opts.cardWidth,
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
 * Longest path from the bracket's starting matches. Without any advancements (a hand-built
 * tourney), fall back to phase order. Matches caught in a cycle, which a well-formed bracket
 * never has, stay in column 0.
 */
export function matchColumns(graph: BracketGraph): Map<string, number> {
	const columns = new Map(graph.matches.map((m) => [m.key, 0]))
	if (!graph.edges.length) {
		const phaseOrder = new Map(graph.phases.map((p) => [p.key, p.order]))
		for (const m of graph.matches) columns.set(m.key, phaseOrder.get(m.phaseKey ?? '') ?? 0)
		return columns
	}

	const edges = graph.edges.filter((e) => columns.has(e.from) && columns.has(e.to))
	const inDegree = new Map(graph.matches.map((m) => [m.key, 0]))
	for (const e of edges) inDegree.set(e.to, inDegree.get(e.to)! + 1)
	const queue = graph.matches.filter((m) => inDegree.get(m.key) === 0).map((m) => m.key)
	while (queue.length) {
		const key = queue.shift()!
		for (const e of edges) {
			if (e.from !== key) continue
			columns.set(e.to, Math.max(columns.get(e.to)!, columns.get(key)! + 1))
			inDegree.set(e.to, inDegree.get(e.to)! - 1)
			if (inDegree.get(e.to) === 0) queue.push(e.to)
		}
	}
	return columns
}
