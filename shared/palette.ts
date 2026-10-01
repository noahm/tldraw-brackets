import {
	DefaultColorStyle,
	registerColorsFromThemes,
	type TLDocument,
	type TLThemes,
} from '@tldraw/tlschema'

// A diagram's own colors, on top of tldraw's built-in palette.
//
// tldraw validates shape colors against a fixed list of names, on the server as well as the
// client, so the slots themselves are fixed: `palette-1` … `palette-8`. What each slot looks like,
// and what it's called, belongs to the diagram and lives in its document record's meta, so it
// syncs and undoes like any other edit. Each client turns that into tldraw theme colors.

export const PALETTE_SLOTS = [
	'palette-1',
	'palette-2',
	'palette-3',
	'palette-4',
	'palette-5',
	'palette-6',
	'palette-7',
	'palette-8',
] as const

export type PaletteSlot = (typeof PALETTE_SLOTS)[number]

declare module '@tldraw/tlschema' {
	export interface TLThemeDefaultColors {
		'palette-1': import('@tldraw/tlschema').TLDefaultColor
		'palette-2': import('@tldraw/tlschema').TLDefaultColor
		'palette-3': import('@tldraw/tlschema').TLDefaultColor
		'palette-4': import('@tldraw/tlschema').TLDefaultColor
		'palette-5': import('@tldraw/tlschema').TLDefaultColor
		'palette-6': import('@tldraw/tlschema').TLDefaultColor
		'palette-7': import('@tldraw/tlschema').TLDefaultColor
		'palette-8': import('@tldraw/tlschema').TLDefaultColor
	}
}

// A type alias rather than an interface so it fits tldraw's JSON-typed record meta.
export type PaletteEntry = {
	name: string
	/** #rrggbb */
	color: string
}

export type DiagramPalette = Record<PaletteSlot, PaletteEntry>

/** Useful out of the box: hues tldraw's own palette doesn't have. */
export const DEFAULT_PALETTE: DiagramPalette = {
	'palette-1': { name: 'Pink', color: '#e64980' },
	'palette-2': { name: 'Teal', color: '#0c8599' },
	'palette-3': { name: 'Gold', color: '#d4a017' },
	'palette-4': { name: 'Brown', color: '#8d5524' },
	'palette-5': { name: 'Navy', color: '#1c3d7a' },
	'palette-6': { name: 'Lime', color: '#82c91e' },
	'palette-7': { name: 'Magenta', color: '#ae3ec9' },
	'palette-8': { name: 'Slate', color: '#495057' },
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const PALETTE_META_KEY = 'palette'

/** The diagram's palette from its document meta, with defaults for anything unset or invalid. */
export function paletteFromDocument(document: Pick<TLDocument, 'meta'>): DiagramPalette {
	const stored = document.meta[PALETTE_META_KEY]
	const palette = { ...DEFAULT_PALETTE }
	if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return palette
	for (const slot of PALETTE_SLOTS) {
		const entry = (stored as Record<string, unknown>)[slot]
		if (!entry || typeof entry !== 'object') continue
		const { name, color } = entry as Record<string, unknown>
		palette[slot] = {
			name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : palette[slot].name,
			color:
				typeof color === 'string' && HEX_COLOR.test(color)
					? color.toLowerCase()
					: palette[slot].color,
		}
	}
	return palette
}

/** Document meta with the palette replaced, keeping any other meta. */
export function documentMetaWithPalette(
	document: Pick<TLDocument, 'meta'>,
	palette: DiagramPalette
): TLDocument['meta'] {
	return { ...document.meta, [PALETTE_META_KEY]: { ...palette } }
}

/**
 * Lets shapes use the palette slots. The client does this through the themes it gives tldraw,
 * but the worker has no themes, and validates against the same global list of color names.
 */
export function registerPaletteColorNames() {
	const names = [...new Set([...DefaultColorStyle.values, ...PALETTE_SLOTS])]
	// registerColorsFromThemes only looks at which palette keys hold objects, so stand-in colors
	// are enough to register the names (for both the color and label color styles).
	const colors = Object.fromEntries(names.map((name) => [name, {}]))
	registerColorsFromThemes({
		default: { colors: { light: colors, dark: colors } },
	} as unknown as TLThemes)
}
