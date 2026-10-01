import { getColorStyleItems, getColorValue, useEditor, useValue, type Editor } from 'tldraw'
import { PALETTE_SLOTS, type DiagramPalette, type PaletteSlot } from '../../shared/palette'
import {
	documentMetaWithStatusColor,
	HIDDEN,
	STATUS_BADGE_LABELS,
	STATUS_BADGES,
	statusColorsFromDocument,
	type StatusBadge,
} from '../../shared/statusColors'
import { updateDocumentMeta } from '../documentMeta'

// Picks the colors of the "live" and "up next" badges on match cards, or hides them. Lives in
// the palette popover, since that's where the diagram's own colors are set.

export function useStatusColors() {
	const editor = useEditor()
	return useValue('status colors', () => statusColorsFromDocument(editor.getDocumentSettings()), [
		editor,
	])
}

export function StatusColorsEditor({
	editor,
	palette,
}: {
	editor: Editor
	palette: DiagramPalette
}) {
	const statusColors = useValue(
		'status colors',
		() => statusColorsFromDocument(editor.getDocumentSettings()),
		[editor]
	)
	const colors = useValue(
		'theme colors',
		() => editor.getCurrentTheme().colors[editor.getColorMode()],
		[editor]
	)
	const choices = getColorStyleItems(colors).map((item) => item.value)
	const nameOf = (color: string) =>
		(PALETTE_SLOTS as readonly string[]).includes(color)
			? palette[color as PaletteSlot].name
			: color.replace(/-/g, ' ')

	const set = (badge: StatusBadge, color: string) => {
		editor.markHistoryStoppingPoint('edit status color')
		updateDocumentMeta(editor, (document) => documentMetaWithStatusColor(document, badge, color))
	}

	return (
		<div className="StatusColorsEditor">
			<p>Match status badges</p>
			{STATUS_BADGES.map((badge) => (
				<div key={badge} className="StatusColorsEditor-row" role="radiogroup" aria-label={badge}>
					<span
						className="StatusColorsEditor-label"
						style={{
							color:
								statusColors[badge] === HIDDEN
									? undefined
									: getColorValue(colors, statusColors[badge], 'solid'),
							textDecoration: statusColors[badge] === HIDDEN ? 'line-through' : undefined,
						}}
					>
						{STATUS_BADGE_LABELS[badge]}
					</span>
					{choices.map((color) => (
						<button
							key={color}
							role="radio"
							aria-checked={statusColors[badge] === color}
							aria-label={`${badge} ${nameOf(color)}`}
							title={nameOf(color)}
							className="StatusColorsEditor-swatch"
							style={{ background: getColorValue(colors, color, 'solid') }}
							onClick={() => set(badge, color)}
						/>
					))}
					<button
						role="radio"
						aria-checked={statusColors[badge] === HIDDEN}
						aria-label={`${badge} hidden`}
						className="StatusColorsEditor-hide"
						onClick={() => set(badge, HIDDEN)}
					>
						Hide
					</button>
				</div>
			))}
		</div>
	)
}
