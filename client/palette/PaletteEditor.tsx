import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { PALETTE_SLOTS, type DiagramPalette, type PaletteSlot } from '../../shared/palette'
import { StatusColorsEditor } from './StatusColorsEditor'
import { setPalette } from './usePalette'

// Lets editors name and recolor the diagram's palette slots. Changes sync to everyone and show
// up in tldraw's style panel, for match cards and every other shape alike.

export function PaletteEditor({ editor, palette }: { editor: Editor; palette: DiagramPalette }) {
	const [open, setOpen] = useState(false)
	const isReadonly = useValue('readonly', () => editor.getIsReadonly(), [editor])
	if (isReadonly) return null

	const update = (slot: PaletteSlot, change: Partial<DiagramPalette[PaletteSlot]>) =>
		setPalette(editor, { ...palette, [slot]: { ...palette[slot], ...change } })
	// One undo step per edit, however many intermediate values a color picker sends.
	const markUndoStep = () => editor.markHistoryStoppingPoint('edit palette')

	return (
		<div className="HeaderPopover">
			<button
				className="DiagramWrapper-copy"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				Palette
			</button>
			{open && (
				<div
					className="HeaderPopover-panel PaletteEditor"
					role="dialog"
					aria-label="Diagram palette"
				>
					<p>Extra colors for this diagram, shown in the style panel after the built-in ones.</p>
					{PALETTE_SLOTS.map((slot) => (
						<label key={slot} className="PaletteEditor-row">
							<input
								type="color"
								value={palette[slot].color}
								aria-label={`${palette[slot].name} color`}
								onFocus={markUndoStep}
								onChange={(e) => update(slot, { color: e.target.value })}
							/>
							<input
								type="text"
								value={palette[slot].name}
								maxLength={40}
								aria-label={`${slot} name`}
								onFocus={markUndoStep}
								onChange={(e) => update(slot, { name: e.target.value })}
							/>
						</label>
					))}
					<StatusColorsEditor editor={editor} palette={palette} />
				</div>
			)}
		</div>
	)
}
