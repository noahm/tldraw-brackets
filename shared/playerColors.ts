import type { TLDocument } from '@tldraw/tlschema'

// Colors admins give individual players, kept for the whole diagram so a player can be followed
// through the bracket. Keyed by BracketGraph entrant key (e.g. "btp:player:42"); values are tldraw
// color names, built-in or palette slots, so they follow palette edits and dark mode.
//
// Stored in the document record's meta alongside the palette, so they sync and undo with the
// diagram.

const PLAYER_COLORS_META_KEY = 'playerColors'

export type PlayerColors = Record<string, string>

export function playerColorsFromDocument(document: Pick<TLDocument, 'meta'>): PlayerColors {
	const stored = document.meta[PLAYER_COLORS_META_KEY]
	if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
	return Object.fromEntries(
		Object.entries(stored).filter(
			(entry): entry is [string, string] => typeof entry[1] === 'string'
		)
	)
}

/** Document meta with one player's color set, or cleared when `color` is null. */
export function documentMetaWithPlayerColor(
	document: Pick<TLDocument, 'meta'>,
	playerKey: string,
	color: string | null
): TLDocument['meta'] {
	const { [playerKey]: _previous, ...others } = playerColorsFromDocument(document)
	return {
		...document.meta,
		[PLAYER_COLORS_META_KEY]: color ? { ...others, [playerKey]: color } : others,
	}
}
