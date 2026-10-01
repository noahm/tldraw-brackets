import {
	Box,
	createShapeId,
	toRichText,
	type Editor,
	type TLArrowShapeArrowheadStyle,
	type TLDefaultDashStyle,
	type TLShapeId,
} from 'tldraw'
import type { BracketGraph } from '../../shared/bracketGraph'
import { MATCH_CARD_TYPE, type MatchCardShape } from '../../shared/matchCardShape'
import { layoutBracket, layoutPhaseLabels, type Lane, type MatchPlacement } from './layout'

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

export function phaseLabelId(phaseKey: string): TLShapeId {
	return createShapeId(phaseKey)
}

export function unplacedMatches(editor: Editor, graph: BracketGraph) {
	return graph.matches.filter((m) => !editor.getShape(matchCardId(m.key)))
}

/**
 * Adds cards for every match not yet on the canvas, laid out as a fresh layout would place
 * them, shifted to line up with cards admins have already placed. Arrows are added only for
 * advancements touching a new card, and phase labels only for phases that are entirely new, so
 * ones an admin deleted stay deleted.
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

		const cardBounds = graph.matches.flatMap((m) => {
			const bounds = editor.getShapePageBounds(matchCardId(m.key))
			return bounds ? [bounds] : []
		})
		for (const edge of graph.edges) {
			if (!newKeys.has(edge.from) && !newKeys.has(edge.to)) continue
			const from = editor.getShape(matchCardId(edge.from))
			const to = editor.getShape(matchCardId(edge.to))
			if (!from || !to || editor.getShape(edgeArrowId(edge.key))) continue

			const style = edgeStyle(graph, layout.get(edge.from)!.lane, layout.get(edge.to)!.lane)
			if (style) connect(editor, edgeArrowId(edge.key), from.id, to.id, edge.key, style, cardBounds)
		}

		for (const label of layoutPhaseLabels(graph, layout)) {
			const phaseMatches = graph.matches.filter((m) => m.phaseKey === label.phaseKey)
			if (!phaseMatches.every((m) => newKeys.has(m.key))) continue
			if (editor.getShape(phaseLabelId(label.phaseKey))) continue
			editor.createShape({
				id: phaseLabelId(label.phaseKey),
				type: 'text',
				x: label.x + offset.x,
				y: label.y + offset.y,
				props: {
					richText: toRichText(label.name),
					color: 'black',
					size: 'm',
					font: 'draw',
					textAlign: 'start',
					autoSize: true,
				},
				meta: { phaseKey: label.phaseKey },
			})
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

// How far an arc bows out to the right to get around cards stacked between its ends.
const BLOCKED_BEND = 60

interface EdgeStyle {
	dash: TLDefaultDashStyle
	arrowheadEnd: TLArrowShapeArrowheadStyle
}

/**
 * How an advancement is drawn, or null for not at all.
 *
 * The bracket's main flow (left to right within a lane) is a plain hand-drawn arrow. Moves
 * between the main and losers/redemption lanes are dashed. In double elimination, drops into the losers bracket
 * aren't drawn: they would cross the whole diagram, and the losers card's "Loser of …" slot
 * already says where its players come from. In waterfalls and gauntlets, where moving between
 * lanes is the whole point, they are.
 */
function edgeStyle(graph: BracketGraph, fromLane: Lane, toLane: Lane): EdgeStyle | null {
	const crossesLanes =
		(fromLane === 'main' && toLane === 'losers') || (fromLane === 'losers' && toLane === 'main')
	if (!crossesLanes) return { dash: 'draw', arrowheadEnd: 'arrow' }
	if (graph.format === 'double-elimination' && fromLane === 'main') return null
	return { dash: 'dashed', arrowheadEnd: 'arrow' }
}

/**
 * An arc arrow bound to both cards: from the right edge of one to the left edge of the next.
 * When one card sits above the other (a drop within a waterfall division), straight down from
 * bottom to top, or around the right-hand side if other cards are in the way.
 */
function connect(
	editor: Editor,
	id: TLShapeId,
	fromId: TLShapeId,
	toId: TLShapeId,
	edgeKey: string,
	style: EdgeStyle,
	cardBounds: Box[]
) {
	const start = editor.getShapePageBounds(fromId)!
	const end = editor.getShapePageBounds(toId)!
	const stacked = end.minX < start.maxX && start.minX < end.maxX
	const downward = end.midY > start.midY
	const [upper, lower] = downward ? [start, end] : [end, start]
	const blocked =
		stacked &&
		cardBounds.some(
			(b) =>
				b.minY >= upper.maxY && b.maxY <= lower.minY && b.minX < start.midX && start.midX < b.maxX
		)
	let startAnchor = { x: 1, y: 0.5 }
	let endAnchor = { x: 0, y: 0.5 }
	let bend = 0
	if (stacked && blocked) {
		endAnchor = { x: 1, y: 0.5 } // out and back in on the right
		bend = downward ? -BLOCKED_BEND : BLOCKED_BEND // bulging right
	} else if (stacked) {
		startAnchor = { x: 0.5, y: downward ? 1 : 0 }
		endAnchor = { x: 0.5, y: downward ? 0 : 1 }
	}
	const startPoint = {
		x: start.minX + start.w * startAnchor.x,
		y: start.minY + start.h * startAnchor.y,
	}
	const endPoint = { x: end.minX + end.w * endAnchor.x, y: end.minY + end.h * endAnchor.y }

	editor.createShape({
		id,
		type: 'arrow',
		x: startPoint.x,
		y: startPoint.y,
		props: {
			kind: 'arc',
			bend,
			start: { x: 0, y: 0 },
			end: { x: endPoint.x - startPoint.x, y: endPoint.y - startPoint.y },
			arrowheadStart: 'none',
			arrowheadEnd: style.arrowheadEnd,
			color: 'grey',
			dash: style.dash,
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
				normalizedAnchor: startAnchor,
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
				normalizedAnchor: endAnchor,
				isExact: false,
				isPrecise: true,
				snap: 'edge',
			},
		},
	])
}
