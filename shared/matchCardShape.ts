import {
	createShapePropsMigrationSequence,
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	type RecordProps,
	type TLDefaultColorStyle,
	type TLDefaultDashStyle,
	type TLDefaultFillStyle,
	type TLDefaultFontStyle,
	type TLDefaultSizeStyle,
	type TLShape,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

// A card standing for one match of the bracket. It stores only which match it is and how it
// looks; who's playing is looked up from live data by matchKey every time it renders.
//
// Defined here rather than next to the client's ShapeUtil because the worker validates every
// change against the same props and migrations.

export const MATCH_CARD_TYPE = 'bracket-match'

export interface MatchCardProps {
	/** BracketGraph match key, e.g. "btp:round:123" */
	matchKey: string
	w: number
	h: number
	color: TLDefaultColorStyle
	fill: TLDefaultFillStyle
	dash: TLDefaultDashStyle
	size: TLDefaultSizeStyle
	font: TLDefaultFontStyle
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[MATCH_CARD_TYPE]: MatchCardProps
	}
}

export type MatchCardShape = TLShape<typeof MATCH_CARD_TYPE>

export const matchCardShapeProps: RecordProps<MatchCardShape> = {
	matchKey: T.string,
	w: T.nonZeroNumber,
	h: T.nonZeroNumber,
	color: DefaultColorStyle,
	fill: DefaultFillStyle,
	dash: DefaultDashStyle,
	size: DefaultSizeStyle,
	font: DefaultFontStyle,
}

export const matchCardShapeMigrations = createShapePropsMigrationSequence({ sequence: [] })

/** Card text sizes per size style, in multiples of the theme's base font size. */
export const MATCH_CARD_FONT_SCALE: Record<TLDefaultSizeStyle, number> = {
	s: 1,
	m: 1.25,
	l: 1.5,
	xl: 1.875,
}

const BASE_FONT_SIZE = 16 // tldraw's default theme fontSize
export const MATCH_CARD_WIDTH = 220
const WIDE_MATCH_CARD_WIDTH = 260

/** Groups bigger than a head-to-head get room for longer names next to their results. */
export function matchCardWidth(capacity: number) {
	return capacity > 2 ? WIDE_MATCH_CARD_WIDTH : MATCH_CARD_WIDTH
}

/** Card measurements for a size style, so layout and rendering agree. */
export function matchCardMetrics(size: TLDefaultSizeStyle, baseFontSize = BASE_FONT_SIZE) {
	const fontSize = baseFontSize * MATCH_CARD_FONT_SCALE[size]
	return {
		fontSize,
		headerHeight: Math.round(fontSize * 2),
		rowHeight: Math.round(fontSize * 1.6),
		padding: Math.round(fontSize * 0.5),
	}
}

export function matchCardHeight(capacity: number, size: TLDefaultSizeStyle = 's') {
	const m = matchCardMetrics(size)
	return m.headerHeight + Math.max(capacity, 1) * m.rowHeight + m.padding
}
