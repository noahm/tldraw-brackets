import { describe, expect, it } from 'vitest'
import {
	DEFAULT_PALETTE,
	documentMetaWithPalette,
	paletteFromDocument,
	PALETTE_SLOTS,
} from '../../shared/palette'
import { mix, paletteTranslations, themeWithPalette } from './paletteTheme'

describe('paletteFromDocument', () => {
	it('uses the defaults for a diagram that has never set a palette', () => {
		expect(paletteFromDocument({ meta: {} })).toEqual(DEFAULT_PALETTE)
	})

	it('keeps valid entries and falls back per field for invalid ones', () => {
		const palette = paletteFromDocument({
			meta: {
				palette: {
					'palette-1': { name: '  Team Red ', color: '#FF0000' },
					'palette-2': { name: '', color: 'red' },
					'palette-9': { name: 'Not a slot', color: '#000000' },
				},
			},
		})
		expect(palette['palette-1']).toEqual({ name: 'Team Red', color: '#ff0000' })
		expect(palette['palette-2']).toEqual(DEFAULT_PALETTE['palette-2'])
		expect(Object.keys(palette)).toEqual([...PALETTE_SLOTS])
	})

	it('round-trips through document meta without disturbing other meta', () => {
		const custom = { ...DEFAULT_PALETTE, 'palette-3': { name: 'Gold medal', color: '#c9b037' } }
		const meta = documentMetaWithPalette({ meta: { somethingElse: 1 } }, custom)
		expect(meta.somethingElse).toBe(1)
		expect(paletteFromDocument({ meta })).toEqual(custom)
	})
})

describe('themeWithPalette', () => {
	it('adds every slot to both color modes, deriving variants from the one color', () => {
		const palette = { ...DEFAULT_PALETTE, 'palette-1': { name: 'Blue', color: '#4465e9' } }
		const theme = themeWithPalette(palette)
		for (const slot of PALETTE_SLOTS) {
			expect(theme.colors.light[slot].solid).toBe(palette[slot].color)
			expect(theme.colors.dark[slot].solid).toBe(palette[slot].color)
		}
		// tldraw's own blue semi fill is #dce1f8; the derived one should be close
		expect(theme.colors.light['palette-1'].semi).toBe('#dde3fb')
		expect(theme.colors.light.blue.solid).toBe('#4465e9') // built-in colors untouched
	})

	it('names the slots for the style panel', () => {
		expect(paletteTranslations(DEFAULT_PALETTE)['color-style.palette-1']).toBe('Pink')
	})
})

describe('mix', () => {
	it('blends channel by channel', () => {
		expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
		expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
		expect(mix('#ff0000', '#0000ff', 0.5)).toBe('#800080')
	})
})
