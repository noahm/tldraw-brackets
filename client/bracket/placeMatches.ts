import { Box, createShapeId, type Editor, type TLShapeId } from 'tldraw'
import type { BracketGraph } from '../../shared/bracketGraph'
import { MATCH_CARD_TYPE, type MatchCardShape } from '../../shared/matchCardShape'
import { layoutBracket, type MatchPlacement } from './layout'

// Puts bracket matches on the canvas. Only ever adds: cards and arrows that already exist are
// left exactly where admins put them.
//
// Card and arrow ids derive from graph keys, so two editors clicking at once create the same
// records rather than duplicates, and "is this match on the canvas yet?" is a lookup.

export function matchCardId(matchKey: string): TLShapeId {
	return createShapeId(matchKey)
}

export function edgeArrowId(edgeKey: string): TLShapeId {
	return createShapeId(edgeKey)
}

export function unplacedMatches(editor: Editor, graph: BracketGraph) {
	return graph.matches.filter((m) => !editor.getShape(matchCardId(m.key)))
}

/**
 * Adds cards for every match not yet on the canvas, laid out as a fresh layout would place
 * them, shifted to line up with cards admins have already placed. Arrows are added only for
 * advancements touching a new card, so ones an admin deleted stay deleted.
 */
export function placeMatches(editor: Editor, graph: BracketGraph) {
	const missing = unplacedMatches(editor, graph)
	if (!missing.length) return

	const layout = layoutBracket(graph)
	const offset = layoutOffset(editor, graph, layout)
	const newKeys = new Set(missing.map((m) => m.key))
	const cardDefaults = editor.getShapeUtil<MatchCardShape>(MATCH_CARD_TYPE).getDefaultProps()

	editor.markHistoryStoppingPoint('place bracket matches')
	editor.run(() => {
		editor.createShapes<MatchCardShape>(
			missing.map((match) => {
				const p = layout.get(match.key)!
				return {
					id: matchCardId(match.key),
					type: MATCH_CARD_TYPE,
					x: p.x + offset.x,
					y: p.y + offset.y,
					// Every style is given explicitly: anything left out would take the user's current
					// "next shape" styles, and the layout sized cards for the default ones.
					props: { ...cardDefaults, matchKey: match.key, w: p.w, h: p.h },
				}
			})
		)

		for (const edge of graph.edges) {
			if (!newKeys.has(edge.from) && !newKeys.has(edge.to)) continue
			const from = editor.getShape(matchCardId(edge.from))
			const to = editor.getShape(matchCardId(edge.to))
			if (!from || !to || editor.getShape(edgeArrowId(edge.key))) continue

			// A drop from the main bracket into the losers bracket would cross the whole diagram;
			// the losers card's "Loser of …" slot already says where its players come from.
			const fromLane = layout.get(edge.from)!.lane
			const toLane = layout.get(edge.to)!.lane
			if (fromLane === 'main' && toLane === 'losers') continue

			connect(editor, edgeArrowId(edge.key), from.id, to.id, edge.key)
		}
	})

	// First placement: bring the new bracket into view.
	if (missing.length === graph.matches.length) {
		const bounds = Box.Common(missing.map((m) => editor.getShapePageBounds(matchCardId(m.key))!))
		editor.zoomToBounds(bounds, { inset: 64, animation: { duration: 200 } })
	}
}

/**
 * Where a fresh layout's origin should go: aligned with the cards already placed (using the
 * median shift, so one dragged-away card doesn't throw everything off), or the top left of the
 * viewport for a first placement.
 */
function layoutOffset(editor: Editor, graph: BracketGraph, layout: Map<string, MatchPlacement>) {
	const shifts = graph.matches.flatMap((m) => {
		const shape = editor.getShape(matchCardId(m.key))
		const p = layout.get(m.key)
		return shape && p ? [{ x: shape.x - p.x, y: shape.y - p.y }] : []
	})
	if (shifts.length) {
		const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
		return { x: median(shifts.map((s) => s.x)), y: median(shifts.map((s) => s.y)) }
	}
	const viewport = editor.getViewportPageBounds()
	return { x: viewport.x + 64, y: viewport.y + 64 }
}

/** An elbow arrow from the right edge of one card to the left edge of the next. */
function connect(
	editor: Editor,
	id: TLShapeId,
	fromId: TLShapeId,
	toId: TLShapeId,
	edgeKey: string
) {
	const start = editor.getShapePageBounds(fromId)!
	const end = editor.getShapePageBounds(toId)!
	const startPoint = { x: start.maxX, y: start.midY }
	const endPoint = { x: end.minX, y: end.midY }

	editor.createShape({
		id,
		type: 'arrow',
		x: startPoint.x,
		y: startPoint.y,
		props: {
			kind: 'elbow',
			start: { x: 0, y: 0 },
			end: { x: endPoint.x - startPoint.x, y: endPoint.y - startPoint.y },
			arrowheadEnd: 'none',
			color: 'grey',
			dash: 'draw',
			size: 's',
		},
		meta: { edgeKey },
	})
	editor.createBindings([
		{
			type: 'arrow',
			fromId: id,
			toId: fromId,
			props: {
				terminal: 'start',
				normalizedAnchor: { x: 1, y: 0.5 },
				isExact: false,
				isPrecise: true,
				snap: 'edge',
			},
		},
		{
			type: 'arrow',
			fromId: id,
			toId: toId,
			props: {
				terminal: 'end',
				normalizedAnchor: { x: 0, y: 0.5 },
				isExact: false,
				isPrecise: true,
				snap: 'edge',
			},
		},
	])
}
