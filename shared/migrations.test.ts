import type { RoomSnapshot } from '@tldraw/sync-core'
import type { TLRecord } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import diagramV0 from './fixtures/diagram-v0.json'
import { MATCH_CARD_TYPE, SAME_AS_CARD } from './matchCardShape'
import { diagramSchema } from './schema'

// Diagrams live for years in durable objects and in saved versions, so every one saved by an
// older build has to keep loading. The fixtures are real exports (Versions → "Download the
// diagram as it is now") from past builds: diagram-v0 predates every match card migration.
//
// If this fails after changing a shape's props, add a migration for the change (see
// matchCardShape.ts) rather than updating the fixture. Add a new fixture when a release changes
// the document in a way the old ones don't cover.

const fixtures = { 'diagram-v0': diagramV0 as unknown as RoomSnapshot }

describe.each(Object.entries(fixtures))('%s', (_name, snapshot) => {
	const migrate = () => {
		const store = Object.fromEntries(
			snapshot.documents.map((d) => [d.state.id, structuredClone(d.state)])
		) as Record<string, TLRecord>
		const result = diagramSchema.migrateStoreSnapshot({ store, schema: snapshot.schema! })
		if (result.type !== 'success') throw new Error(`migration failed: ${result.reason}`)
		return Object.values(result.value)
	}

	it('migrates to the current schema, and every record is valid', () => {
		const records = migrate()
		expect(records).toHaveLength(snapshot.documents.length)
		for (const record of records) {
			expect(() => diagramSchema.types[record.typeName].validate(record)).not.toThrow()
		}
	})

	it('keeps match cards and the diagram meta', () => {
		const records = migrate()
		const cards = records.filter((r) => r.typeName === 'shape' && r.type === MATCH_CARD_TYPE)
		expect(cards.length).toBeGreaterThan(0)
		for (const card of cards) {
			expect(card).toMatchObject({ props: { textColor: SAME_AS_CARD } })
		}
		const document = records.find((r) => r.typeName === 'document')!
		expect(Object.keys(document.meta)).toEqual(expect.arrayContaining(['palette', 'playerColors']))
	})
})
