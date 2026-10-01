import { describe, expect, it } from 'vitest'
import {
	DEFAULT_STATUS_COLORS,
	documentMetaWithStatusColor,
	HIDDEN,
	statusColorsFromDocument,
} from './statusColors'

describe('status colors', () => {
	it('defaults, and falls back per badge on junk', () => {
		expect(statusColorsFromDocument({ meta: {} })).toEqual(DEFAULT_STATUS_COLORS)
		expect(statusColorsFromDocument({ meta: { statusColors: 'red' } })).toEqual(
			DEFAULT_STATUS_COLORS
		)
		expect(statusColorsFromDocument({ meta: { statusColors: { live: 'red', ready: 4 } } })).toEqual(
			{ live: 'red', ready: 'orange' }
		)
	})

	it('sets one badge, keeping the other and other meta', () => {
		const meta = documentMetaWithStatusColor({ meta: { palette: { kept: true } } }, 'ready', HIDDEN)
		expect(statusColorsFromDocument({ meta })).toEqual({ live: 'green', ready: HIDDEN })
		expect(meta.palette).toEqual({ kept: true })
	})
})
