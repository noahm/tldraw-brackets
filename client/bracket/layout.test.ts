import { describe, expect, it } from 'vitest'
import type { BracketGraph } from '../../shared/bracketGraph'
import { btpRowsToGraph } from '../../worker/sources/btp/toGraph'
import { de4Midway } from '../../worker/sources/fixtures/de4'
import { laneOf, layoutBracket, type MatchPlacement } from './layout'

const graph = btpRowsToGraph(de4Midway)
const layout = layoutBracket(graph)
const at = (key: string) => layout.get(key)!
const centerY = (p: MatchPlacement) => p.y + p.h / 2

describe('laneOf', () => {
	const match = (title: string) => ({
		key: 'k',
		title,
		status: 'pending' as const,
		capacity: 2,
		entrants: [],
	})
	it('recognizes Blame the Pads naming', () => {
		expect(laneOf(match('WR1:M1'), 'Winners Round 1 (Top 16)')).toBe('main')
		expect(laneOf(match('Winners Finals'), 'Winners Finals')).toBe('main')
		expect(laneOf(match('LR2:M1'), 'Losers Round 2 (Top 12)')).toBe('losers')
		expect(laneOf(match('LQF'), 'Losers Quarter-Finals')).toBe('losers')
		expect(laneOf(match('Losers Finals'), 'Losers Finals')).toBe('losers')
		expect(laneOf(match('Grand Finals'), 'Grand Finals')).toBe('finals')
		expect(laneOf(match('RESET'), 'Grand Finals')).toBe('finals')
		expect(laneOf(match('Redemption Group A'), 'Purple Division')).toBe('losers')
		expect(laneOf(match("Loser's A"), 'Pink Division')).toBe('losers')
		expect(laneOf(match('Finals'), 'Finals')).toBe('main') // single elimination
	})
})

describe('layoutBracket', () => {
	it('places every match', () => {
		expect([...layout.keys()].sort()).toEqual(graph.matches.map((m) => m.key).sort())
	})

	it('moves left to right along every advancement', () => {
		for (const edge of graph.edges) {
			expect(at(edge.to).column, `${edge.from} -> ${edge.to}`).toBeGreaterThan(at(edge.from).column)
		}
	})

	it('puts the losers bracket below the main one', () => {
		const mainBottom = Math.max(
			...[...layout.values()].filter((p) => p.lane === 'main').map((p) => p.y + p.h)
		)
		for (const p of layout.values())
			if (p.lane === 'losers') expect(p.y).toBeGreaterThan(mainBottom)
	})

	it('centers a match on the matches feeding it', () => {
		const expected = (centerY(at('btp:round:101')) + centerY(at('btp:round:102'))) / 2
		expect(centerY(at('btp:round:103'))).toBeCloseTo(expected)
	})

	it('never overlaps cards', () => {
		const all = [...layout.values()]
		for (const a of all) {
			for (const b of all) {
				if (a === b) continue
				const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
				expect(overlap).toBe(false)
			}
		}
	})

	it('falls back to phase order when there are no advancements', () => {
		const flat: BracketGraph = { ...graph, edges: [] }
		const columns = layoutBracket(flat)
		expect(columns.get('btp:round:101')!.column).toBe(0)
		expect(columns.get('btp:round:103')!.column).toBe(1)
	})
})
