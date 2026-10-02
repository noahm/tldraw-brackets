import { describe, expect, it } from 'vitest'
import { layoutBracket, matchLanes } from '../../../client/bracket/layout'
import { matchCardModel } from '../../../shared/matchCardModel'
import { startggDe4Midway } from '../fixtures/startggDe4'
import type { SetRow, StartggEventRows } from './rows'
import { setTitle, shortRoundName, startggRowsToGraph } from './toGraph'

const SET_A = 'startgg:set:700:A'

describe('shortRoundName', () => {
	it('abbreviates the round names start.gg uses', () => {
		expect(shortRoundName('Winners Round 1', 1)).toBe('WR1')
		expect(shortRoundName('Winners Quarter-Final', 3)).toBe('WQF')
		expect(shortRoundName('Winners Semi-Final', 4)).toBe('WSF')
		expect(shortRoundName('Winners Final', 5)).toBe('WF')
		expect(shortRoundName('Losers Round 3', -3)).toBe('LR3')
		expect(shortRoundName('Losers Final', -6)).toBe('LF')
		expect(shortRoundName('Semi-Final', 2)).toBe('SF')
		expect(shortRoundName('Final', 3)).toBe('Final')
		expect(shortRoundName('Grand Final Reset', 7)).toBe('Grand Final Reset')
	})

	it('keeps names it doesn’t recognize, and falls back to the round number', () => {
		expect(shortRoundName('Pools Round 2', 2)).toBe('Pools Round 2')
		expect(shortRoundName(null, -2)).toBe('LR2')
		expect(shortRoundName(null, null)).toBe('')
	})

	it('titles sets like Blame the Pads rounds', () => {
		expect(setTitle({ fullRoundText: 'Losers Round 1', round: -1, identifier: 'J' })).toBe('LR1:J')
		expect(setTitle({ fullRoundText: 'Grand Final', round: 5, identifier: 'X' })).toBe(
			'Grand Final'
		)
	})
})

describe('startggRowsToGraph', () => {
	it('maps pools, sets and slot prereqs to phases, matches and edges', () => {
		const graph = startggRowsToGraph(startggDe4Midway)

		expect(graph.title).toBe('Fixture: start.gg 4-player double elim: Singles')
		expect(graph.format).toBe('double-elimination')
		expect(graph.phases).toEqual([{ key: 'startgg:group:700', name: 'Bracket', order: 0 }])
		expect(graph.matches.map((m) => [m.key, m.title, m.status])).toEqual([
			[SET_A, 'WSF:A', 'complete'],
			['startgg:set:700:B', 'WSF:B', 'complete'],
			['startgg:set:700:C', 'WF:C', 'live'],
			['startgg:set:700:F', 'Grand Final', 'pending'],
			['startgg:set:700:G', 'Grand Final Reset', 'pending'],
			['startgg:set:700:D', 'LSF:D', 'ready'],
			['startgg:set:700:E', 'LF:E', 'pending'],
		])
		expect(graph.edges).toHaveLength(10)
		expect(graph.edges.find((e) => e.to === 'startgg:set:700:D')).toEqual({
			key: 'startgg:slot:700:D:0',
			from: SET_A,
			to: 'startgg:set:700:D',
			rankStart: 2,
			rankEnd: 2,
			label: 'Loser',
		})
	})

	it('records results of completed sets, and which edge each entrant left by', () => {
		const graph = startggRowsToGraph(startggDe4Midway)
		const entrants = (key: string) =>
			graph.matches
				.find((m) => m.key === key)!
				.entrants.map((e) => [e.name, e.seed, e.placement, e.advancedVia])
		expect(entrants(SET_A)).toEqual([
			['Alice', 1, 1, 'startgg:slot:700:C:0'],
			['Dave', 4, 2, 'startgg:slot:700:D:0'],
		])
		// still being played
		expect(entrants('startgg:set:700:C')).toEqual([
			['Alice', undefined, undefined, undefined],
			['Carol', undefined, undefined, undefined],
		])
	})

	it('shows where empty slots will be filled from', () => {
		const graph = startggRowsToGraph(startggDe4Midway)
		const rows = matchCardModel(graph, 'startgg:set:700:E')!.rows
		expect(rows).toEqual([
			{ kind: 'placeholder', label: 'Loser of WF:C' },
			{ kind: 'placeholder', label: 'Winner of LSF:D' },
		])
	})

	it('only counts an entrant as having left once they reach the next set', () => {
		// The winners side won Grand Finals outright, so nobody went on to the reset.
		const rows = withSets(startggDe4Midway, (set) =>
			set.identifier === 'F'
				? {
						...set,
						state: 3,
						winnerId: 1001,
						slots: set.slots!.map((slot, i) => ({
							...slot,
							entrant: i === 0 ? { id: '1001', name: 'Alice' } : { id: '1003', name: 'Carol' },
						})),
					}
				: set
		)
		const gf = startggRowsToGraph(rows).matches.find((m) => m.key === 'startgg:set:700:F')!
		expect(gf.entrants.map((e) => [e.name, e.placement, e.advancedVia])).toEqual([
			['Alice', 1, undefined],
			['Carol', 2, undefined],
		])
	})

	it('keys sets by identifier, so cards survive a bracket starting', () => {
		// Before a bracket starts, start.gg gives its sets temporary ids, and slots refer to them.
		const preview = withSets(startggDe4Midway, (set) => ({
			...set,
			id: `preview_700_${set.id}`,
			slots: set.slots!.map((slot) => ({
				...slot,
				prereqId: slot.prereqId && `preview_700_${slot.prereqId}`,
			})),
		}))
		const before = startggRowsToGraph(preview)
		const after = startggRowsToGraph(startggDe4Midway)
		expect(before.matches.map((m) => m.key)).toEqual(after.matches.map((m) => m.key))
		expect(before.edges).toEqual(after.edges)
	})

	it('leaves out slots and sets that byes mean nobody will reach', () => {
		// start.gg leaves out sets with a bye, but not the losers-bracket sets they feed.
		const fromSet = (prereqId: string, prereqPlacement: number) => ({
			slotIndex: null,
			prereqId,
			prereqType: 'set',
			prereqPlacement,
			entrant: null,
			seed: null,
		})
		const base = { fullRoundText: null, state: 1, winnerId: null }
		const rows: StartggEventRows = {
			...startggDe4Midway,
			groups: [
				{
					...startggDe4Midway.groups[0],
					sets: [
						{ ...startggDe4Midway.groups[0].sets[0], round: 1 },
						// the loser of A, and the loser of a bye: nobody
						{
							...base,
							id: '2',
							identifier: 'L',
							round: -1,
							slots: [fromSet('501', 2), fromSet('bye-1', 2)],
						},
						// waiting on two byes' losers: never played
						{
							...base,
							id: '3',
							identifier: 'M',
							round: -1,
							slots: [fromSet('bye-2', 2), fromSet('bye-3', 2)],
						},
						// the winner of L, and the winner of M, which is never played
						{
							...base,
							id: '4',
							identifier: 'N',
							round: -2,
							slots: [fromSet('2', 1), fromSet('3', 1)],
						},
						{
							...base,
							id: '5',
							identifier: 'O',
							round: -2,
							slots: [{ ...fromSet('', 0), prereqType: 'bye' }, fromSet('4', 1)],
						},
					],
				},
			],
		}
		const graph = startggRowsToGraph(rows)
		expect(graph.matches.map((m) => [m.title, m.capacity])).toEqual([
			['WSF:A', 2],
			['LR1:L', 1],
			['LR2:N', 1],
			['LR2:O', 1],
		])
		expect(matchCardModel(graph, 'startgg:set:700:N')!.rows).toEqual([
			{ kind: 'placeholder', label: 'Winner of LR1:L' },
		])
	})

	it('names each pool when a phase has several', () => {
		const pools: StartggEventRows = {
			...startggDe4Midway,
			groups: ['B2', 'A1'].map((displayIdentifier, i) => ({
				...startggDe4Midway.groups[0],
				phase: { ...startggDe4Midway.groups[0].phase, name: 'Pools', groupCount: 2 },
				group: { id: String(800 + i), displayIdentifier, bracketType: 'DOUBLE_ELIMINATION' },
			})),
		}
		expect(startggRowsToGraph(pools).phases.map((p) => p.name)).toEqual([
			'Pools: Pool A1',
			'Pools: Pool B2',
		])
	})

	it('puts losers sets in the losers lane and grand finals after both', () => {
		const graph = startggRowsToGraph(startggDe4Midway)
		const lanes = matchLanes(graph)
		expect(lanes.get(SET_A)).toBe('main')
		expect(lanes.get('startgg:set:700:D')).toBe('losers')
		expect(lanes.get('startgg:set:700:E')).toBe('losers')
		expect(lanes.get('startgg:set:700:F')).toBe('finals')
		expect(lanes.get('startgg:set:700:G')).toBe('finals')
		expect(layoutBracket(graph).size).toBe(graph.matches.length)
	})
})

function withSets(rows: StartggEventRows, map: (set: SetRow) => SetRow): StartggEventRows {
	return { ...rows, groups: rows.groups.map((g) => ({ ...g, sets: g.sets.map(map) })) }
}
