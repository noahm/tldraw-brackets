import { useState } from 'react'
import {
	DefaultColorStyle,
	DefaultStylePanel,
	DefaultStylePanelContent,
	getColorStyleItems,
	getColorValue,
	StylePanelButtonPicker,
	StylePanelSection,
	StylePanelSubheading,
	useEditor,
	useValue,
	type TLDefaultColorStyle,
	type TLUiStylePanelProps,
} from 'tldraw'
import type { GraphEntrant } from '../../shared/bracketGraph'
import { MATCH_CARD_TYPE, type MatchCardShape } from '../../shared/matchCardShape'
import { matchCardModel } from '../../shared/matchCardModel'
import { documentMetaWithPlayerColor, playerColorsFromDocument } from '../../shared/playerColors'
import { updateDocumentMeta } from '../documentMeta'
import { useLiveData } from '../live/liveDataStore'

// tldraw's style panel, plus a "Players" section when a single match card is selected: each of
// its players can be given a color, which then applies wherever that player appears.

export function BracketStylePanel(props: TLUiStylePanelProps) {
	return (
		<DefaultStylePanel {...props}>
			<DefaultStylePanelContent />
			<PlayerColorsSection />
		</DefaultStylePanel>
	)
}

export function usePlayerColors() {
	const editor = useEditor()
	return useValue('player colors', () => playerColorsFromDocument(editor.getDocumentSettings()), [
		editor,
	])
}

function PlayerColorsSection() {
	const editor = useEditor()
	const graph = useLiveData()?.graph
	const card = useValue(
		'selected match card',
		() => {
			const shape = editor.getOnlySelectedShape()
			return shape?.type === MATCH_CARD_TYPE ? (shape as MatchCardShape) : null
		},
		[editor]
	)
	const isReadonly = useValue('readonly', () => editor.getIsReadonly(), [editor])
	const [expanded, setExpanded] = useState<string | null>(null)

	const entrants =
		card && graph
			? (matchCardModel(graph, card.props.matchKey)?.match.entrants ?? [])
			: ([] as GraphEntrant[])
	if (isReadonly || !entrants.length) return null

	return (
		<StylePanelSection>
			<StylePanelSubheading>Players</StylePanelSubheading>
			{entrants.map((entrant) => (
				<PlayerColorRow
					key={entrant.key}
					entrant={entrant}
					expanded={expanded === entrant.key}
					onToggle={() => setExpanded((key) => (key === entrant.key ? null : entrant.key))}
				/>
			))}
		</StylePanelSection>
	)
}

function PlayerColorRow({
	entrant,
	expanded,
	onToggle,
}: {
	entrant: GraphEntrant
	expanded: boolean
	onToggle(): void
}) {
	const editor = useEditor()
	const playerColors = usePlayerColors()
	const colors = useValue(
		'theme colors',
		() => editor.getCurrentTheme().colors[editor.getColorMode()],
		[editor]
	)
	const items = getColorStyleItems(colors)
	const current = playerColors[entrant.key]
	const setColor = (color: string | null) =>
		updateDocumentMeta(editor, (document) =>
			documentMetaWithPlayerColor(document, entrant.key, color)
		)

	return (
		<div className="PlayerColorRow" data-testid={`player-color.${entrant.key}`}>
			<button
				className="PlayerColorRow-toggle"
				aria-expanded={expanded}
				onClick={onToggle}
				aria-label={`Color for ${entrant.name}`}
			>
				<span
					className="PlayerColorRow-swatch"
					style={{
						background: current ? getColorValue(colors, current, 'solid') : 'transparent',
					}}
				/>
				<span className="PlayerColorRow-name">{entrant.name}</span>
				{current && (
					<span
						role="button"
						className="PlayerColorRow-reset"
						title="Use the card's color"
						aria-label={`Clear ${entrant.name}'s color`}
						onClick={(e) => {
							e.stopPropagation()
							editor.markHistoryStoppingPoint('reset player color')
							setColor(null)
						}}
					>
						×
					</span>
				)}
			</button>
			{expanded && (
				<StylePanelButtonPicker
					title={`${entrant.name} color`}
					uiType="color"
					style={DefaultColorStyle}
					items={items}
					value={
						current ? { type: 'shared', value: current as TLDefaultColorStyle } : { type: 'mixed' }
					}
					onHistoryMark={(id) => editor.markHistoryStoppingPoint(id)}
					onValueChange={(_style, value) => setColor(value)}
				/>
			)}
		</div>
	)
}
