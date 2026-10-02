import type { SetRow, SetSlotRow, StartggEventRows } from '../startgg/rows'

// A hand-built start.gg response for a 4-player double elimination pool, partway through:
// both winners semis are done, Winners Final is being played and the losers semi has been called.
// Set identifiers and prereqs follow start.gg's own 4-player bracket.

const entrants = {
	alice: { id: '1001', name: 'Alice' },
	bob: { id: '1002', name: 'Bob' },
	carol: { id: '1003', name: 'Carol' },
	dave: { id: '1004', name: 'Dave' },
}

function slot(
	slotIndex: number,
	entrant: { id: string; name: string } | null,
	prereq: { setId: string; placement: number } | { seed: number }
): SetSlotRow {
	const fromSet = 'setId' in prereq
	return {
		slotIndex,
		prereqId: fromSet ? prereq.setId : null,
		prereqType: fromSet ? 'set' : 'seed',
		prereqPlacement: fromSet ? prereq.placement : null,
		entrant,
		seed: fromSet ? null : { seedNum: prereq.seed },
	}
}

function set(fields: Partial<SetRow> & Pick<SetRow, 'id' | 'identifier' | 'slots'>): SetRow {
	return { fullRoundText: null, round: null, state: 1, winnerId: null, ...fields }
}

export const startggDe4Midway: StartggEventRows = {
	event: { name: 'Singles', tournamentName: 'Fixture: start.gg 4-player double elim' },
	groups: [
		{
			phase: {
				id: '70',
				name: 'Bracket',
				phaseOrder: 1,
				groupCount: 1,
				bracketType: 'DOUBLE_ELIMINATION',
			},
			group: { id: '700', displayIdentifier: '1', bracketType: 'DOUBLE_ELIMINATION' },
			sets: [
				set({
					id: '501',
					identifier: 'A',
					fullRoundText: 'Winners Semi-Final',
					round: 1,
					state: 3,
					winnerId: 1001,
					slots: [slot(0, entrants.alice, { seed: 1 }), slot(1, entrants.dave, { seed: 4 })],
				}),
				set({
					id: '502',
					identifier: 'B',
					fullRoundText: 'Winners Semi-Final',
					round: 1,
					state: 3,
					winnerId: 1003,
					slots: [slot(0, entrants.bob, { seed: 2 }), slot(1, entrants.carol, { seed: 3 })],
				}),
				set({
					id: '503',
					identifier: 'C',
					fullRoundText: 'Winners Final',
					round: 2,
					state: 2,
					slots: [
						slot(0, entrants.alice, { setId: '501', placement: 1 }),
						slot(1, entrants.carol, { setId: '502', placement: 1 }),
					],
				}),
				set({
					id: '504',
					identifier: 'D',
					fullRoundText: 'Losers Semi-Final',
					round: -1,
					state: 6,
					slots: [
						slot(0, entrants.dave, { setId: '501', placement: 2 }),
						slot(1, entrants.bob, { setId: '502', placement: 2 }),
					],
				}),
				set({
					id: '505',
					identifier: 'E',
					fullRoundText: 'Losers Final',
					round: -2,
					slots: [
						slot(0, null, { setId: '503', placement: 2 }),
						slot(1, null, { setId: '504', placement: 1 }),
					],
				}),
				set({
					id: '506',
					identifier: 'F',
					fullRoundText: 'Grand Final',
					round: 3,
					slots: [
						slot(0, null, { setId: '503', placement: 1 }),
						slot(1, null, { setId: '505', placement: 1 }),
					],
				}),
				set({
					id: '507',
					identifier: 'G',
					fullRoundText: 'Grand Final Reset',
					round: 4,
					slots: [
						slot(0, null, { setId: '506', placement: 1 }),
						slot(1, null, { setId: '506', placement: 2 }),
					],
				}),
			],
		},
	],
}
