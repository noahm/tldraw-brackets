// Saved copies of a diagram's tldraw document, for restoring and export. Live tournament data
// isn't part of the document, so it isn't in versions either; the palette and player colors are.

export type DiagramVersionKind =
	/** saved on a timer while the diagram is being edited, and when the last editor leaves */
	| 'auto'
	/** an editor clicked "Save version" */
	| 'manual'
	/** the state just before a restore, so a restore can itself be undone */
	| 'before-restore'

export interface DiagramVersion {
	id: string
	kind: DiagramVersionKind
	label?: string
	/** ISO time */
	createdAt: string
	/** bytes of JSON */
	size: number
}

export const VERSION_ID_PATTERN = /^[a-z0-9-]{1,40}$/
export const VERSION_LABEL_MAX_LENGTH = 80
