import { useMemo } from 'react'
import {
	getColorValue,
	getFontFamily,
	HTMLContainer,
	PathBuilder,
	Rectangle2d,
	resizeBox,
	ShapeUtil,
	SVGContainer,
	useColorMode,
	useEditor,
	useValue,
	type TLDefaultFillStyle,
	type TLResizeInfo,
	type TLThemeColors,
} from 'tldraw'
import { matchCardModel, type MatchCardRow } from '../../shared/matchCardModel'
import {
	MATCH_CARD_FONT_SCALE,
	MATCH_CARD_TYPE,
	MATCH_CARD_WIDTH,
	matchCardHeight,
	matchCardMetrics,
	matchCardShapeMigrations,
	matchCardShapeProps,
	type MatchCardShape,
} from '../../shared/matchCardShape'
import type { MatchStatus } from '../../shared/bracketGraph'
import { useLiveData } from '../live/liveDataStore'
import { usePlayerColors } from './PlayerColorsSection'

// Stroke widths per size, matching tldraw's built-in shapes.
const STROKE_SIZES = { s: 1, m: 1.75, l: 2.5, xl: 5 } as const

export class MatchCardShapeUtil extends ShapeUtil<MatchCardShape> {
	static override type = MATCH_CARD_TYPE
	static override props = matchCardShapeProps
	static override migrations = matchCardShapeMigrations

	getDefaultProps(): MatchCardShape['props'] {
		return {
			matchKey: '',
			w: MATCH_CARD_WIDTH,
			h: matchCardHeight(2),
			color: 'black',
			fill: 'semi',
			dash: 'draw',
			size: 's',
			font: 'draw',
		}
	}

	override canEdit() {
		return false
	}

	override hideRotateHandle() {
		return true
	}

	getGeometry(shape: MatchCardShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override onResize(shape: MatchCardShape, info: TLResizeInfo<MatchCardShape>) {
		return resizeBox(shape, info)
	}

	// Card text scales with the size style, so scale the card with it to keep everything fitting.
	override onBeforeUpdate(prev: MatchCardShape, next: MatchCardShape) {
		if (prev.props.size === next.props.size) return
		const ratio = MATCH_CARD_FONT_SCALE[next.props.size] / MATCH_CARD_FONT_SCALE[prev.props.size]
		return { ...next, props: { ...next.props, w: next.props.w * ratio, h: next.props.h * ratio } }
	}

	component(shape: MatchCardShape) {
		return <MatchCard shape={shape} />
	}

	getIndicatorPath(shape: MatchCardShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function MatchCard({ shape }: { shape: MatchCardShape }) {
	const editor = useEditor()
	const live = useLiveData()
	const colorMode = useColorMode()
	const theme = useValue('theme', () => editor.getCurrentTheme(), [editor])
	const colors = theme.colors[colorMode]

	const { w, h, color, fill, dash, size, font, matchKey } = shape.props
	const graph = live?.graph
	const model = useMemo(() => (graph ? matchCardModel(graph, matchKey) : null), [graph, matchKey])

	const metrics = matchCardMetrics(size, theme.fontSize)
	const strokeWidth = theme.strokeWidth * STROKE_SIZES[size]
	const stroke = getColorValue(colors, color, 'solid')
	const muted = getColorValue(colors, 'grey', 'solid')
	const playerColors = usePlayerColors()
	// A player's own color, if an admin gave them one that the current theme knows.
	const playerColor = (key: string) => {
		const name = playerColors[key]
		return name && name in colors ? getColorValue(colors, name, 'solid') : undefined
	}
	const frame = new PathBuilder()
		.moveTo(0, 0, { geometry: { isFilled: fill !== 'none' } })
		.lineTo(w, 0)
		.lineTo(w, h)
		.lineTo(0, h)
		.close()
	const divider = PathBuilder.lineThroughPoints([
		{ x: 0, y: metrics.headerHeight },
		{ x: w, y: metrics.headerHeight },
	])
	const fillColor = fillValue(colors, color, fill)
	const fillPath =
		dash === 'draw'
			? frame.toDrawD({ strokeWidth, randomSeed: shape.id, passes: 1, offset: 0, onlyFilled: true })
			: frame.toD({ onlyFilled: true })

	// Live data hasn't arrived yet, or this card's match is gone from the source.
	const missing = !!graph && !model

	return (
		<>
			<SVGContainer style={{ opacity: missing ? 0.4 : 1 }}>
				{fillColor && <path d={fillPath} fill={fillColor} />}
				{frame.toSvg({
					style: dash,
					strokeWidth,
					randomSeed: shape.id,
					props: { fill: 'none', stroke },
				})}
				{divider.toSvg({
					style: dash,
					strokeWidth,
					randomSeed: `${shape.id}-divider`,
					props: { fill: 'none', stroke },
				})}
			</SVGContainer>
			<HTMLContainer
				style={{
					pointerEvents: 'none',
					opacity: missing ? 0.4 : 1,
					color: stroke,
					fontFamily: getFontFamily(theme, font),
					fontSize: metrics.fontSize,
					lineHeight: 1.2,
				}}
			>
				<div
					className="MatchCard-header"
					style={{ height: metrics.headerHeight, padding: `0 ${metrics.padding}px` }}
				>
					<span className="MatchCard-title">
						{model?.match.title ?? (missing ? 'Not in source' : '…')}
					</span>
					{model && <StatusBadge status={model.match.status} colors={colors} />}
				</div>
				<div style={{ padding: `0 ${metrics.padding}px` }}>
					{model?.rows.map((row, i) => (
						<CardRow
							key={i}
							row={row}
							height={metrics.rowHeight}
							muted={muted}
							nameColor={row.kind === 'entrant' ? playerColor(row.entrant.key) : undefined}
						/>
					))}
				</div>
			</HTMLContainer>
		</>
	)
}

function CardRow({
	row,
	height,
	muted,
	nameColor,
}: {
	row: MatchCardRow
	height: number
	muted: string
	nameColor?: string
}) {
	if (row.kind === 'empty') return <div style={{ height }} />
	if (row.kind === 'placeholder') {
		return (
			<div className="MatchCard-row MatchCard-placeholder" style={{ height, color: muted }}>
				{row.label}
			</div>
		)
	}
	const { entrant, result } = row
	return (
		<div
			className="MatchCard-row"
			style={{ height, fontWeight: entrant.placement === 1 ? 700 : undefined }}
		>
			{entrant.seed != null && (
				<span className="MatchCard-seed" style={{ color: muted }}>
					{entrant.seed}
				</span>
			)}
			<span className="MatchCard-name" style={{ color: nameColor }}>
				{entrant.name}
			</span>
			{result && (
				<span className="MatchCard-result" style={{ color: muted }}>
					{result}
				</span>
			)}
		</div>
	)
}

function StatusBadge({ status, colors }: { status: MatchStatus; colors: TLThemeColors }) {
	if (status === 'live') {
		return (
			<span className="MatchCard-status" style={{ color: getColorValue(colors, 'green', 'solid') }}>
				● live
			</span>
		)
	}
	if (status === 'ready') {
		return (
			<span
				className="MatchCard-status"
				style={{ color: getColorValue(colors, 'orange', 'solid') }}
			>
				up next
			</span>
		)
	}
	return null
}

/** The same fill conventions as tldraw's built-in shapes. */
function fillValue(colors: TLThemeColors, color: string, fill: TLDefaultFillStyle) {
	switch (fill) {
		case 'none':
			return null
		case 'semi':
			return colors.solid
		case 'solid':
			return getColorValue(colors, color, 'semi')
		case 'pattern':
			return getColorValue(colors, color, 'pattern')
		case 'lined-fill':
			return getColorValue(colors, color, 'linedFill')
		case 'fill':
			return getColorValue(colors, color, 'fill')
	}
}
