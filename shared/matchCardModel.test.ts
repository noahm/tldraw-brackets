import { describe, expect, it } from 'vitest'
import { btpRowsToGraph } from '../worker/sources/btp/toGraph'
import { de4Late, de4Midway } from '../worker/sources/fixtures/de4'
import { matchCardModel, ordinal } from './matchCardModel'

function rowText(graph: ReturnType<typeof btpRowsToGraph>, matchKey: string) {
	return matchCardModel(graph, matchKey)!.rows.map((row) =>
		row.kind === 'entrant'
			? `${row.entrant.name}${row.result ? ` (${row.result})` : ''}`
			: row.kind === 'placeholder'
				? `[${row.label}]`
				: '—'
	)
}

describe('matchCardModel', () => {
	it('lists entrants with their results', () => {
		const graph = btpRowsToGraph(de4Midway)
		expect(rowText(graph, 'btp:round:101')).toEqual(['Alice (1st)', 'Bob (2nd)'])
		expect(rowText(graph, 'btp:round:103')).toEqual(['Alice', 'Carol'])
	})

	it('labels slots still waiting on other matches', () => {
		const graph = btpRowsToGraph(de4Midway)
		expect(rowText(graph, 'btp:round:105')).toEqual([
			'[Loser of Winners Finals]',
			'[Winner of Losers SF]',
		])
		expect(rowText(graph, 'btp:round:106')).toEqual([
			'[Winner of Winners Finals]',
			'[Winner of Losers Finals]',
		])
	})

	it('fills in arrivals as they happen, keeping placeholders for the rest', () => {
		const graph = btpRowsToGraph(de4Late)
		expect(rowText(graph, 'btp:round:105')).toEqual(['Carol (1st)', 'Dave'])
		expect(rowText(graph, 'btp:round:107')).toEqual(['[Winner of Grand Finals]'])
	})

	it('sizes open-ended advancements by the match they come from', () => {
		// "2nd and below" out of a 1v1 is just the loser; out of a 4-player group it's three players.
		const openEnded = {
			...de4Midway,
			advancements: de4Midway.advancements.map((a) =>
				a.id === 202 || a.id === 204 ? { ...a, rank_end: null, label: 'Loser' } : a
			),
		}
		const graph = btpRowsToGraph(openEnded)
		expect(graph.matches.find((m) => m.key === 'btp:round:104')!.capacity).toBe(2)

		const fourPlayers = {
			...openEnded,
			playerRounds: [
				...openEnded.playerRounds.filter((pr) => pr.round_id !== 104),
				...['Erin', 'Frank'].map((name, i) => ({
					id: 290 + i,
					round_id: 101,
					player_tourney_id: 90 + i,
					sort_order: null,
					player_tourneys: { player_name: name, seed: null, player_img: null },
				})),
			],
		}
		const bigger = btpRowsToGraph(fourPlayers)
		expect(bigger.matches.find((m) => m.key === 'btp:round:104')!.capacity).toBe(4)
		expect(rowText(bigger, 'btp:round:104')).toEqual([
			'[2nd+ of WSF:M1]',
			'[2nd+ of WSF:M1]',
			'[2nd+ of WSF:M1]',
			'[Loser of WSF:M2]',
		])
	})

	it('returns null for a match the source no longer has', () => {
		expect(matchCardModel(btpRowsToGraph(de4Midway), 'btp:round:999')).toBeNull()
	})
})

describe('ordinal', () => {
	it('handles the teens', () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
			'1st',
			'2nd',
			'3rd',
			'4th',
			'11th',
			'12th',
			'13th',
			'21st',
			'22nd',
			'101st',
			'111th',
		])
	})
})
