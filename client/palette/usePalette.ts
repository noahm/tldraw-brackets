import { useEffect, useMemo } from 'react'
import { DEFAULT_THEME, useValue, type Editor, type TLUiOverrides } from 'tldraw'
import {
	DEFAULT_PALETTE,
	documentMetaWithPalette,
	paletteFromDocument,
	type DiagramPalette,
} from '../../shared/palette'
import { paletteTranslations, themeWithPalette } from './paletteTheme'

/**
 * The diagram's palette, kept applied to the editor's theme as it changes (from this client or
 * any other), plus the UI overrides that give the style panel the palette's names.
 */
export function usePalette(editor: Editor | null) {
	const palette = useValue(
		'diagram palette',
		() => (editor ? paletteFromDocument(editor.getDocumentSettings()) : DEFAULT_PALETTE),
		[editor]
	)

	useEffect(() => {
		if (!editor) return
		editor.updateTheme(themeWithPalette(palette, editor.getTheme('default') ?? DEFAULT_THEME))
	}, [editor, palette])

	const overrides = useMemo<TLUiOverrides>(
		() => ({ translations: { en: paletteTranslations(palette) } }),
		[palette]
	)

	return { palette, overrides }
}

export function setPalette(editor: Editor, palette: DiagramPalette) {
	if (editor.getIsReadonly()) return
	const document = editor.getDocumentSettings()
	// Not editor.updateDocumentSettings, which leaves changes out of undo history; palette edits
	// should undo like any other edit.
	editor.run(() => {
		editor.store.put([{ ...document, meta: documentMetaWithPalette(document, palette) }])
	})
}
