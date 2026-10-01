import { describe, expect, it } from 'vitest'
import { de4Late, de4Midway } from '../fixtures/de4'
import type { BtpTourneyRows } from './rows'
import { btpRowsToGraph, roundTitle } from './toGraph'

function placements(graph: ReturnType<typeof btpRowsToGraph>, matchKey: string) {
	const match = graph.matches.find((m) => m.key === matchKey)!
	return Object.fromEntries(match.entrants.map((e) => [e.name, e.placement]))
}

describe('roundTitle', () => {
	it('keeps the template id prefix and drops player names', () => {
		expect(roundTitle('WR1:M1: Alice vs. Bob')).toBe('WR1:M1')
		expect(roundTitle('Winners Finals: Alice vs. ??')).toBe('Winners Finals')
		expect(roundTitle('WR1:M3: Carol (Bye)')).toBe('WR1:M3')
		expect(roundTitle('Grand Finals')).toBe('Grand Finals')
	})
})

describe('btpRowsToGraph', () => {
	it('maps pools, rounds and advancements to phases, matches and edges', () => {
		const graph = btpRowsToGraph(de4Midway)

		expect(graph.title).toBe('Fixture: 4-player double elim')
		expect(graph.format).toBe('double-elimination')
		expect(graph.phases.map((p) => p.name)).toEqual([
			'Winners Semi-Finals',
			'Winners Finals',
			'Losers Semi-Finals',
			'Losers Finals',
			'Grand Finals',
		])
		expect(graph.matches.map((m) => [m.key, m.title, m.status])).toEqual([
			['btp:round:101', 'WSF:M1', 'complete'],
			['btp:round:102', 'WSF:M2', 'complete'],
			['btp:round:103', 'Winners Finals', 'live'],
			['btp:round:104', 'Losers SF', 'ready'],
			['btp:round:105', 'Losers Finals', 'pending'],
			['btp:round:106', 'Grand Finals', 'pending'],
			['btp:round:107', 'RESET', 'pending'],
		])
		expect(graph.edges).toHaveLength(9)
		expect(graph.edges[0]).toEqual({
			key: 'btp:adv:201',
			from: 'btp:round:101',
			to: 'btp:round:103',
			rankStart: 1,
			rankEnd: 1,
			label: 'Winner',
		})
	})

	it('sizes empty matches from their incoming advancements', () => {
		const graph = btpRowsToGraph(de4Midway)
		const capacity = (key: string) => graph.matches.find((m) => m.key === key)!.capacity
		expect(capacity('btp:round:105')).toBe(2) // Loser of WF + Winner of LSF
		expect(capacity('btp:round:107')).toBe(1) // only the GF winner is routed to RESET
		expect(capacity('btp:round:101')).toBe(2) // seeded, no incoming edges
	})

	it('recovers placements of completed rounds from where players went next', () => {
		const graph = btpRowsToGraph(de4Midway)
		expect(placements(graph, 'btp:round:101')).toEqual({ Alice: 1, Bob: 2 })
		expect(placements(graph, 'btp:round:102')).toEqual({ Carol: 1, Dave: 2 })
		// still being played
		expect(placements(graph, 'btp:round:103')).toEqual({ Alice: undefined, Carol: undefined })
	})

	it('uses the row a round created when a player reaches several of its destinations', () => {
		const graph = btpRowsToGraph(de4Late)
		// Carol lost Winners Finals but later reached Grand Finals (also a WF destination)
		// through Losers Finals; her WF placement must still be 2.
		expect(placements(graph, 'btp:round:103')).toEqual({ Alice: 1, Carol: 2 })
		// eliminated players have no recoverable placement
		expect(placements(graph, 'btp:round:104')).toEqual({ Bob: undefined, Dave: 1 })
		expect(placements(graph, 'btp:round:105')).toEqual({ Carol: 1, Dave: undefined })
	})

	it('drops advancements that point outside the tourney', () => {
		const graph = btpRowsToGraph({
			...de4Midway,
			advancements: [
				...de4Midway.advancements,
				{
					id: 999,
					round_id: 107,
					rank_start: 1,
					rank_end: 1,
					destination_round_id: 12345,
					label: null,
				},
			],
		})
		expect(graph.edges.find((e) => e.key === 'btp:adv:999')).toBeUndefined()
	})

	it('records which advancement each player left by', () => {
		const graph = btpRowsToGraph(de4Late)
		const wf = graph.matches.find((m) => m.key === 'btp:round:103')!
		expect(wf.entrants.map((e) => [e.name, e.advancedVia])).toEqual([
			['Alice', 'btp:adv:205'], // Winner -> Grand Finals
			['Carol', 'btp:adv:206'], // Loser -> Losers Finals
		])
	})

	it("doesn't depend on sort_order, which older Blame the Pads data records differently", () => {
		// Before Blame the Pads' 2026-09-15 rework, sort_order restarted at 1 for each group, so
		// semifinal losers arrived in Losers SF with sort_order 1, and hand-placed players have none.
		const rows = withPlayerRounds(de4Midway, (pr) =>
			pr.round_id === 104 ? { ...pr, sort_order: pr.id === 306 ? 1 : null } : pr
		)
		const graph = btpRowsToGraph(rows)
		expect(placements(graph, 'btp:round:101')).toEqual({ Alice: 1, Bob: 2 })
		expect(placements(graph, 'btp:round:102')).toEqual({ Carol: 1, Dave: 2 })
	})

	it('ignores moves an admin made by hand', () => {
		// Bob is moved by hand from WSF:M1 straight into Losers Finals, which isn't one of its
		// destinations, instead of dropping to Losers SF.
		const rows: BtpTourneyRows = {
			...de4Midway,
			playerRounds: [
				...de4Midway.playerRounds.filter((pr) => pr.id !== 306),
				{
					...de4Midway.playerRounds.find((pr) => pr.id === 306)!,
					id: 320,
					round_id: 105,
					sort_order: null,
				},
			],
		}
		const graph = btpRowsToGraph(rows)
		const wsf1 = graph.matches.find((m) => m.key === 'btp:round:101')!
		expect(wsf1.entrants.map((e) => [e.name, e.advancedVia, e.placement])).toEqual([
			['Alice', 'btp:adv:201', 1],
			['Bob', undefined, undefined],
		])
	})

	it('drops placements the data contradicts, like both players going to a bracket reset', () => {
		const rows = withPlayerRounds(de4Late, (pr) => pr)
		rows.rounds = rows.rounds.map((r) => (r.id === 106 ? { ...r, status: 'Complete' } : r))
		rows.playerRounds.push(
			{ ...rows.playerRounds.find((pr) => pr.id === 309)!, id: 313, round_id: 107, sort_order: 1 },
			{ ...rows.playerRounds.find((pr) => pr.id === 312)!, id: 314, round_id: 107, sort_order: 1 }
		)
		const graph = btpRowsToGraph(rows)
		const gf = graph.matches.find((m) => m.key === 'btp:round:106')!
		expect(gf.entrants.map((e) => [e.name, e.advancedVia, e.placement])).toEqual([
			['Alice', 'btp:adv:209', undefined],
			['Carol', 'btp:adv:209', undefined],
		])
	})
})

function withPlayerRounds(
	rows: BtpTourneyRows,
	map: (pr: BtpTourneyRows['playerRounds'][number]) => BtpTourneyRows['playerRounds'][number]
): BtpTourneyRows {
	return { ...rows, rounds: [...rows.rounds], playerRounds: rows.playerRounds.map(map) }
}
