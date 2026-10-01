import type { TLDocument } from '@tldraw/tlschema'

// The colors of a card's "live" and "up next" badges, chosen per diagram so they can match its
// palette. Values are tldraw color names (built-in or palette slots), or HIDDEN to leave the badge
// off. Stored in the document record's meta, so they sync and undo with the diagram.

const STATUS_COLORS_META_KEY = 'statusColors'

export const HIDDEN = 'hidden'

export const STATUS_BADGES = ['live', 'ready'] as const
export type StatusBadge = (typeof STATUS_BADGES)[number]

export type StatusColors = Record<StatusBadge, string>

export const DEFAULT_STATUS_COLORS: StatusColors = { live: 'green', ready: 'orange' }

export const STATUS_BADGE_LABELS: Record<StatusBadge, string> = {
	live: '● live',
	ready: 'up next',
}

export function statusColorsFromDocument(document: Pick<TLDocument, 'meta'>): StatusColors {
	const stored = document.meta[STATUS_COLORS_META_KEY]
	const valid = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
	return Object.fromEntries(
		STATUS_BADGES.map((badge) => {
			const value = (valid as Record<string, unknown>)[badge]
			return [badge, typeof value === 'string' && value ? value : DEFAULT_STATUS_COLORS[badge]]
		})
	) as StatusColors
}

export function documentMetaWithStatusColor(
	document: Pick<TLDocument, 'meta'>,
	badge: StatusBadge,
	color: string
): TLDocument['meta'] {
	return {
		...document.meta,
		[STATUS_COLORS_META_KEY]: { ...statusColorsFromDocument(document), [badge]: color },
	}
}
