import type { BtpTourneyRows, PlayerRoundRow } from '../btp/rows'

// Hand-built Blame the Pads rows for a 4-player double elimination bracket, shaped like what its
// bracket generator produces from double-elimination/4-person-bracket.json. Ids are arbitrary but
// player_rounds ids increase in creation order, as the real identity column does.

const tourney = {
	id: 1,
	name: 'Fixture: 4-player double elim',
	type: 'Double Elimination',
	status: 'In Progress',
}

const pools = [
	{ id: 11, name: 'Winners Semi-Finals', sort_order: 0 },
	{ id: 12, name: 'Winners Finals', sort_order: 1 },
	{ id: 13, name: 'Losers Semi-Finals', sort_order: 2 },
	{ id: 14, name: 'Losers Finals', sort_order: 3 },
	{ id: 15, name: 'Grand Finals', sort_order: 4 },
]

const advancements = [
	{
		id: 201,
		round_id: 101,
		rank_start: 1,
		rank_end: 1,
		destination_round_id: 103,
		label: 'Winner',
	},
	{ id: 202, round_id: 101, rank_start: 2, rank_end: 2, destination_round_id: 104, label: 'Loser' },
	{
		id: 203,
		round_id: 102,
		rank_start: 1,
		rank_end: 1,
		destination_round_id: 103,
		label: 'Winner',
	},
	{ id: 204, round_id: 102, rank_start: 2, rank_end: 2, destination_round_id: 104, label: 'Loser' },
	{
		id: 205,
		round_id: 103,
		rank_start: 1,
		rank_end: 1,
		destination_round_id: 106,
		label: 'Winner',
	},
	{ id: 206, round_id: 103, rank_start: 2, rank_end: 2, destination_round_id: 105, label: 'Loser' },
	{
		id: 207,
		round_id: 104,
		rank_start: 1,
		rank_end: 1,
		destination_round_id: 105,
		label: 'Winner',
	},
	{
		id: 208,
		round_id: 105,
		rank_start: 1,
		rank_end: 1,
		destination_round_id: 106,
		label: 'Winner',
	},
	{
		id: 209,
		round_id: 106,
		rank_start: 1,
		rank_end: 1,
		destination_round_id: 107,
		label: 'Winner',
	},
]

const players = {
	alice: { id: 1, player_name: 'Alice', seed: 1, player_img: null },
	carol: { id: 3, player_name: 'Carol', seed: 2, player_img: null },
	dave: { id: 4, player_name: 'Dave', seed: 3, player_img: null },
	bob: { id: 2, player_name: 'Bob', seed: 4, player_img: null },
}

function entry(
	id: number,
	roundId: number,
	player: (typeof players)[keyof typeof players],
	sortOrder: number | null
): PlayerRoundRow {
	const { id: playerTourneyId, ...playerTourney } = player
	return {
		id,
		round_id: roundId,
		player_tourney_id: playerTourneyId,
		sort_order: sortOrder,
		player_tourneys: playerTourney,
	}
}

const seeding = [
	entry(301, 101, players.alice, null),
	entry(302, 101, players.bob, null),
	entry(303, 102, players.carol, null),
	entry(304, 102, players.dave, null),
]
const afterSemis = [
	entry(305, 103, players.alice, 1),
	entry(306, 104, players.bob, 2),
	entry(307, 103, players.carol, 1),
	entry(308, 104, players.dave, 2),
]
const afterFinals = [
	entry(309, 106, players.alice, 1), // Alice wins Winners Finals
	entry(310, 105, players.carol, 2), // Carol drops to Losers Finals
	entry(311, 105, players.dave, 1), // Dave wins Losers SF; Bob is out
	entry(312, 106, players.carol, 1), // Carol wins Losers Finals; Dave is out
]

/** Winners semis done, Winners Finals being played, Losers SF up next. */
export const de4Midway: BtpTourneyRows = {
	tourney,
	pools,
	advancements,
	rounds: [
		{ id: 101, name: 'WSF:M1: Alice vs. Bob', status: 'Complete', round_pool_id: 11 },
		{ id: 102, name: 'WSF:M2: Carol vs. Dave', status: 'Complete', round_pool_id: 11 },
		{ id: 103, name: 'Winners Finals: Alice vs. Carol', status: 'In Progress', round_pool_id: 12 },
		{ id: 104, name: 'Losers SF: Bob vs. Dave', status: 'Ready', round_pool_id: 13 },
		{ id: 105, name: 'Losers Finals', status: 'Not Started', round_pool_id: 14 },
		{ id: 106, name: 'Grand Finals', status: 'Not Started', round_pool_id: 15 },
		{ id: 107, name: 'RESET', status: 'Not Started', round_pool_id: 15 },
	],
	playerRounds: [...seeding, ...afterSemis],
}

/** Everything but Grand Finals done; Carol came back through the losers bracket. */
export const de4Late: BtpTourneyRows = {
	tourney,
	pools,
	advancements,
	rounds: [
		{ id: 101, name: 'WSF:M1: Alice vs. Bob', status: 'Complete', round_pool_id: 11 },
		{ id: 102, name: 'WSF:M2: Carol vs. Dave', status: 'Complete', round_pool_id: 11 },
		{ id: 103, name: 'Winners Finals: Alice vs. Carol', status: 'Complete', round_pool_id: 12 },
		{ id: 104, name: 'Losers SF: Bob vs. Dave', status: 'Complete', round_pool_id: 13 },
		{ id: 105, name: 'Losers Finals: Carol vs. Dave', status: 'Complete', round_pool_id: 14 },
		{ id: 106, name: 'Grand Finals: Alice vs. Carol', status: 'In Progress', round_pool_id: 15 },
		{ id: 107, name: 'RESET', status: 'Not Started', round_pool_id: 15 },
	],
	playerRounds: [...seeding, ...afterSemis, ...afterFinals],
}

export const fixtures: Record<string, BtpTourneyRows> = {
	'de4-midway': de4Midway,
	'de4-late': de4Late,
}
