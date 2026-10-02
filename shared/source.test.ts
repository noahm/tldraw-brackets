import { describe, expect, it } from 'vitest'
import { describeSource, parseDiagramSource, parseSourceInput, parseStartggUrl } from './source'

describe('parseSourceInput', () => {
	it('reads each kind of source an editor can type', () => {
		expect(parseSourceInput(' fixture:de4-late ')).toEqual({ kind: 'fixture', name: 'de4-late' })
		expect(parseSourceInput('https://www.start.gg/tournament/t/event/e/brackets/1')).toEqual({
			kind: 'startgg',
			eventSlug: 'tournament/t/event/e',
			phaseId: 1,
		})
		expect(parseSourceInput('107')).toEqual({ kind: 'btp', tourneyId: 107 })
		expect(parseSourceInput('https://blamethepads.com/tourney/92/bracket')).toEqual({
			kind: 'btp',
			tourneyId: 92,
		})
	})

	it('rejects anything else', () => {
		expect(parseSourceInput('')).toBeNull()
		expect(parseSourceInput('0')).toBeNull()
		expect(parseSourceInput('fixture:Bad Name')).toBeNull()
		expect(parseSourceInput('https://example.com/')).toBeNull()
	})
})

describe('parseStartggUrl', () => {
	it('reads an event from any page within it', () => {
		const source = { kind: 'startgg', eventSlug: 'tournament/genesis-9-1/event/melee-singles' }
		expect(
			parseStartggUrl('https://www.start.gg/tournament/genesis-9-1/event/melee-singles/overview')
		).toEqual(source)
		expect(parseStartggUrl('start.gg/tournament/genesis-9-1/event/melee-singles')).toEqual(source)
		expect(parseStartggUrl('tournament/genesis-9-1/event/melee-singles')).toEqual(source)
	})

	it('narrows to the phase and pool a bracket link names', () => {
		const base = 'https://www.start.gg/tournament/t/event/e/brackets'
		expect(parseStartggUrl(`${base}/1234`)).toEqual({
			kind: 'startgg',
			eventSlug: 'tournament/t/event/e',
			phaseId: 1234,
		})
		expect(parseStartggUrl(`${base}/1234/5678?filter=x`)).toEqual({
			kind: 'startgg',
			eventSlug: 'tournament/t/event/e',
			phaseId: 1234,
			phaseGroupId: 5678,
		})
	})

	it('ignores other links', () => {
		expect(parseStartggUrl('https://www.start.gg/tournament/genesis-9-1/details')).toBeNull()
		expect(parseStartggUrl('https://example.com/tourney/12')).toBeNull()
		expect(parseStartggUrl('42')).toBeNull()
	})
})

describe('parseDiagramSource', () => {
	it('validates start.gg sources from the network', () => {
		expect(
			parseDiagramSource({ kind: 'startgg', eventSlug: 'tournament/t/event/e', phaseId: 3 })
		).toEqual({ kind: 'startgg', eventSlug: 'tournament/t/event/e', phaseId: 3 })
		expect(parseDiagramSource({ kind: 'startgg', eventSlug: '../../admin' })).toBeNull()
		expect(
			parseDiagramSource({ kind: 'startgg', eventSlug: 'tournament/t/event/e', phaseId: -1 })
		).toBeNull()
	})

	it('describes start.gg sources', () => {
		expect(
			describeSource({ kind: 'startgg', eventSlug: 'tournament/t/event/e', phaseGroupId: 9 })
		).toBe('start.gg t / e, pool 9')
	})
})
