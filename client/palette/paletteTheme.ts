import { DEFAULT_THEME, type TLDefaultColor, type TLTheme, type TLThemes } from 'tldraw'
import { DEFAULT_PALETTE, PALETTE_SLOTS, type DiagramPalette } from '../../shared/palette'

// Turns a diagram palette into tldraw theme colors. An admin picks one color per slot; tldraw
// wants a dozen variants of it (fills, frames, notes, highlights) for both light and dark mode.
// These mixes follow the ratios in tldraw's own default palette.

const LIGHT_BACKGROUND = '#ffffff'
const DARK_BACKGROUND = '#101012'

function lightVariants(color: string): TLDefaultColor {
	const toward = (amount: number) => mix(color, LIGHT_BACKGROUND, amount)
	return {
		solid: color,
		fill: color,
		semi: toward(0.82),
		pattern: toward(0.15),
		linedFill: toward(0.15),
		frameHeadingStroke: toward(0.15),
		frameHeadingFill: toward(0.97),
		frameStroke: toward(0.15),
		frameFill: toward(0.97),
		frameText: '#000000',
		noteFill: toward(0.35),
		noteText: '#000000',
		highlightSrgb: color,
		highlightP3: color,
	}
}

function darkVariants(color: string): TLDefaultColor {
	const toward = (amount: number) => mix(color, DARK_BACKGROUND, amount)
	return {
		solid: color,
		fill: color,
		semi: toward(0.8),
		pattern: toward(0.35),
		linedFill: toward(0.15),
		frameHeadingStroke: toward(0.4),
		frameHeadingFill: toward(0.85),
		frameStroke: toward(0.4),
		frameFill: toward(0.92),
		frameText: '#f2f2f2',
		noteFill: toward(0.45),
		noteText: '#f2f2f2',
		highlightSrgb: color,
		highlightP3: color,
	}
}

/** tldraw's default theme with the diagram's palette added. */
export function themeWithPalette(palette: DiagramPalette, base: TLTheme = DEFAULT_THEME): TLTheme {
	const light = { ...base.colors.light }
	const dark = { ...base.colors.dark }
	for (const slot of PALETTE_SLOTS) {
		light[slot] = lightVariants(palette[slot].color)
		dark[slot] = darkVariants(palette[slot].color)
	}
	return { ...base, colors: { light, dark } }
}

/**
 * Themes to give tldraw before any document loads, so the palette's color names are registered
 * in time for shapes using them to pass validation. The diagram's real colors replace these
 * once its document arrives.
 */
export const initialThemes: Partial<TLThemes> = {
	default: themeWithPalette(DEFAULT_PALETTE),
}

/** The color-style labels tldraw's style panel shows for the palette slots. */
export function paletteTranslations(palette: DiagramPalette): Record<string, string> {
	return Object.fromEntries(
		PALETTE_SLOTS.map((slot) => [`color-style.${slot}`, palette[slot].name])
	)
}

/** Mixes two #rrggbb colors; amount 0 is all `from`, 1 is all `to`. */
export function mix(from: string, to: string, amount: number): string {
	const a = parseHex(from)
	const b = parseHex(to)
	const channel = (i: number) =>
		Math.round(a[i] + (b[i] - a[i]) * amount)
			.toString(16)
			.padStart(2, '0')
	return `#${channel(0)}${channel(1)}${channel(2)}`
}

function parseHex(color: string): [number, number, number] {
	const n = parseInt(color.slice(1), 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
