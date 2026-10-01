import type { Editor, TLDocument } from 'tldraw'

/**
 * Rewrites the document record's meta, where diagram-wide settings (palette, player colors) live.
 *
 * Not editor.updateDocumentSettings, which leaves changes out of undo history; these edits
 * should undo like any other.
 */
export function updateDocumentMeta(
	editor: Editor,
	update: (document: TLDocument) => TLDocument['meta']
) {
	if (editor.getIsReadonly()) return
	const document = editor.getDocumentSettings()
	editor.run(() => {
		editor.store.put([{ ...document, meta: update(document) }])
	})
}
