import { describe, expect, it } from 'vitest'
import type { BracketGraph } from '../../shared/bracketGraph'
import { btpRowsToGraph } from '../../worker/sources/btp/toGraph'
import { de4Midway } from '../../worker/sources/fixtures/de4'
import { laneOf, layoutBracket, layoutPhaseLabels, type MatchPlacement } from './layout'

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

	it('labels phases, except single matches named after their phase', () => {
		// de4's "Winners Finals" pool holds only the "Winners Finals" match; "Grand Finals" holds
		// two matches, so it keeps its label.
		expect(layoutPhaseLabels(graph, layout).map((l) => l.name)).toEqual([
			'Winners Semi-Finals',
			'Losers Semi-Finals',
			'Grand Finals',
		])
	})

	it('falls back to phase order when there are no advancements', () => {
		const flat: BracketGraph = { ...graph, edges: [] }
		const columns = layoutBracket(flat)
		expect(columns.get('btp:round:101')!.column).toBe(0)
		expect(columns.get('btp:round:103')!.column).toBe(1)
	})
})

describe('layoutBracket for waterfall divisions', () => {
	const match = (key: string, title: string, phaseKey: string, capacity: number) => ({
		key,
		title,
		phaseKey,
		capacity,
		status: 'pending' as const,
		entrants: [],
	})
	const edge = (from: string, to: string, rankStart: number, rankEnd: number) => ({
		key: `${from}>${to}:${rankStart}`,
		from,
		to,
		rankStart,
		rankEnd,
	})
	const waterfall: BracketGraph = {
		title: 'Waterfall',
		format: 'waterfall',
		phases: [
			{ key: 'pink', name: 'Pink Division', order: 0 },
			{ key: 'purple', name: 'Purple Division', order: 1 },
		],
		matches: [
			match('w1', "Winner's A", 'pink', 4),
			match('l1', "Loser's A", 'pink', 2),
			match('w2', "Winner's Pool A", 'purple', 4),
			match('r2', 'Redemption Group A', 'purple', 4),
			match('r2b', 'Redemption Final', 'purple', 2),
		],
		edges: [
			edge('w1', 'w2', 1, 2),
			edge('w1', 'l1', 3, 4),
			edge('l1', 'w2', 1, 1),
			edge('l1', 'r2', 2, 2),
			edge('w2', 'r2', 3, 4),
			edge('r2', 'r2b', 1, 2),
		],
	}
	const placed = layoutBracket(waterfall)
	const at = (key: string) => placed.get(key)!

	it("keeps a division's winners and redemption groups in one column", () => {
		expect(at('w1').column).toBe(0)
		expect(at('l1').column).toBe(0)
		expect(at('l1').y).toBeGreaterThan(at('w1').y + at('w1').h)
		expect(at('w2').column).toBe(1)
		expect(at('r2').column).toBe(1)
	})

	it('gives a chain of rounds within one lane of a division its own columns', () => {
		expect(at('r2b').column).toBe(2)
	})

	it('widens cards for bigger groups, and columns to fit them', () => {
		expect(at('w1').w).toBeGreaterThan(at('l1').w)
		expect(at('w2').x).toBeGreaterThanOrEqual(at('w1').x + at('w1').w)
	})

	it('labels each division above its first card', () => {
		const labels = layoutPhaseLabels(waterfall, placed)
		expect(labels.map((l) => [l.name, l.x, l.y < at('w1').y])).toEqual([
			['Pink Division', at('w1').x, true],
			['Purple Division', at('w2').x, true],
		])
	})

	it('falls back to longest paths when some matches have no phase', () => {
		const unpooled = layoutBracket({
			...waterfall,
			matches: waterfall.matches.map((m) => ({ ...m, phaseKey: undefined })),
		})
		expect(unpooled.get('l1')!.column).toBe(1)
		expect(unpooled.get('w2')!.column).toBe(2)
	})
})
