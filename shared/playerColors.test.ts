import type { TLDocument } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { documentMetaWithPlayerColor, playerColorsFromDocument } from './playerColors'

type Doc = Pick<TLDocument, 'meta'>

describe('player colors', () => {
	it('starts empty and ignores junk', () => {
		expect(playerColorsFromDocument({ meta: {} })).toEqual({})
		expect(playerColorsFromDocument({ meta: { playerColors: ['red'] } })).toEqual({})
		expect(
			playerColorsFromDocument({ meta: { playerColors: { 'btp:player:1': 'red', bad: 3 } } })
		).toEqual({ 'btp:player:1': 'red' })
	})

	it('sets and clears one player without touching others or other meta', () => {
		const set = (doc: Doc, key: string, color: string | null): Doc => ({
			meta: documentMetaWithPlayerColor(doc, key, color),
		})
		let doc: Doc = { meta: { palette: { kept: true } } }
		doc = set(doc, 'btp:player:1', 'palette-2')
		doc = set(doc, 'btp:player:2', 'blue')
		expect(playerColorsFromDocument(doc)).toEqual({
			'btp:player:1': 'palette-2',
			'btp:player:2': 'blue',
		})
		doc = set(doc, 'btp:player:1', null)
		expect(playerColorsFromDocument(doc)).toEqual({ 'btp:player:2': 'blue' })
		expect(doc.meta.palette).toEqual({ kept: true })
	})
})
