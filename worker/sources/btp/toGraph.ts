import {
	edgeSlots,
	type BracketGraph,
	type GraphEdge,
	type GraphMatch,
	type MatchStatus,
} from '../../../shared/bracketGraph'
import type { BtpTourneyRows, PlayerRoundRow, RoundAdvancementRow } from './rows'

export const btpKeys = {
	pool: (id: number) => `btp:pool:${id}`,
	round: (id: number) => `btp:round:${id}`,
	advancement: (id: number) => `btp:adv:${id}`,
	player: (playerTourneyId: number) => `btp:player:${playerTourneyId}`,
}

const statusMap: Record<string, MatchStatus> = {
	'Not Started': 'pending',
	'Pick Ban': 'ready',
	Ready: 'ready',
	'In Progress': 'live',
	Complete: 'complete',
}

/**
 * Blame the Pads renames bracket rounds as players arrive ("WR1:M1" → "WR1:M1: Alice vs. Bob"),
 * keeping the template id as a prefix. The prefix is the stable part, so that's the title.
 */
export function roundTitle(name: string): string {
	return name.split(': ')[0].trim() || name
}

export function btpRowsToGraph(rows: BtpTourneyRows): BracketGraph {
	const pools = [...rows.pools].sort(
		(a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.id - b.id
	)
	const poolOrder = new Map(pools.map((p, i) => [p.id, i]))

	const roundIds = new Set(rows.rounds.map((r) => r.id))
	const advancements = rows.advancements.filter(
		(a) => roundIds.has(a.round_id) && roundIds.has(a.destination_round_id)
	)

	const playerRoundsByRound = groupBy(rows.playerRounds, (pr) => pr.round_id)
	const playerRoundsByPlayer = groupBy(
		[...rows.playerRounds].sort((a, b) => a.id - b.id),
		(pr) => pr.player_tourney_id
	)
	const advancementsFrom = groupBy(advancements, (a) => a.round_id)
	const advancementsInto = groupBy(advancements, (a) => a.destination_round_id)

	const rounds = [...rows.rounds].sort(
		(a, b) =>
			(poolOrder.get(a.round_pool_id ?? -1) ?? -1) - (poolOrder.get(b.round_pool_id ?? -1) ?? -1) ||
			a.id - b.id
	)

	const edges: GraphEdge[] = [...advancements]
		.sort((a, b) => a.round_id - b.round_id || a.rank_start - b.rank_start || a.id - b.id)
		.map((a) => ({
			key: btpKeys.advancement(a.id),
			from: btpKeys.round(a.round_id),
			to: btpKeys.round(a.destination_round_id),
			rankStart: a.rank_start,
			rankEnd: a.rank_end ?? undefined,
			label: a.label ?? undefined,
		}))

	// How many players a round expects: whoever's there already, or everyone its incoming
	// advancements will bring, whichever is more. Open-ended advancements ("3rd and below")
	// depend on the size of the round they come from, so this works back through the bracket.
	const capacities = new Map<number, number>()
	const capacity = (roundId: number, visiting = new Set<number>()): number => {
		const known = capacities.get(roundId)
		if (known != null) return known
		const present = playerRoundsByRound.get(roundId)?.length ?? 0
		if (visiting.has(roundId)) return Math.max(present, 1) // a cycle; brackets shouldn't have one
		visiting.add(roundId)
		const arriving = (advancementsInto.get(roundId) ?? []).reduce(
			(sum, a) =>
				sum +
				edgeSlots(
					{ rankStart: a.rank_start, rankEnd: a.rank_end ?? undefined },
					capacity(a.round_id, visiting)
				),
			0
		)
		visiting.delete(roundId)
		const result = Math.max(present, arriving, 1)
		capacities.set(roundId, result)
		return result
	}

	const matches: GraphMatch[] = rounds.map((round) => {
		const playerRounds = [...(playerRoundsByRound.get(round.id) ?? [])].sort((a, b) => a.id - b.id)
		const outgoing = advancementsFrom.get(round.id) ?? []
		const exits = playerRounds.map((pr) => findExit(pr, outgoing, playerRoundsByPlayer))
		const placements = consistentPlacements(exits, playerRounds.length)
		return {
			key: btpKeys.round(round.id),
			phaseKey: round.round_pool_id != null ? btpKeys.pool(round.round_pool_id) : undefined,
			title: roundTitle(round.name) || `Round ${round.id}`,
			status: (round.status && statusMap[round.status]) || 'pending',
			capacity: capacity(round.id),
			entrants: playerRounds.map((pr, i) => ({
				key: btpKeys.player(pr.player_tourney_id),
				name: pr.player_tourneys.player_name,
				seed: pr.player_tourneys.seed ?? undefined,
				imageUrl: pr.player_tourneys.player_img ?? undefined,
				advancedVia: exits[i] && btpKeys.advancement(exits[i].advancement.id),
				placement: placements[i],
			})),
		}
	})

	return {
		title: rows.tourney.name,
		phases: pools.map((p, i) => ({ key: btpKeys.pool(p.id), name: p.name, order: i })),
		matches,
		edges,
	}
}

interface Exit {
	advancement: RoundAdvancementRow
	/** the player's row in the destination round */
	arrival: PlayerRoundRow
}

/**
 * Which advancement a player took out of a round, found by where they turned up next.
 *
 * Blame the Pads doesn't store a round's results (it computes them from scores), so this is
 * the most reliable record of them. Only the player's very next row counts (player_rounds ids
 * are an identity column, so they order by creation): a player can later reach another of this
 * round's destinations by a different route (e.g. lose Winners Finals, win Losers Finals, reach
 * Grand Finals), and admins sometimes move players between rounds by hand. If the next row isn't
 * in one of this round's destinations, the player didn't leave by an advancement.
 */
function findExit(
	entry: PlayerRoundRow,
	outgoing: RoundAdvancementRow[],
	playerRoundsByPlayer: Map<number, PlayerRoundRow[]>
): Exit | undefined {
	const arrival = playerRoundsByPlayer
		.get(entry.player_tourney_id)
		?.find((candidate) => candidate.id > entry.id)
	if (!arrival) return undefined

	const candidates = outgoing.filter((a) => a.destination_round_id === arrival.round_id)
	if (candidates.length === 1) return { advancement: candidates[0], arrival }
	// Several rank ranges lead to the same round; only sort_order can tell them apart.
	const matching = candidates.filter((a) => inRange(arrival.sort_order, a))
	return matching.length === 1 ? { advancement: matching[0], arrival } : undefined
}

/**
 * The exact rank, when the advancement taken pins it down.
 *
 * sort_order on the arrival row can't be trusted on its own: before Blame the Pads' 2026-09-15
 * advancement rework it was the position within the advancing (or non-advancing) group rather
 * than the absolute rank, and players placed by hand have none. The two conventions agree only
 * for a range starting at rank 1.
 */
function placementFromExit({ advancement, arrival }: Exit, entrantCount: number) {
	const { rank_start, rank_end } = advancement
	if (rank_end === rank_start) return rank_start
	if (rank_end == null && rank_start === entrantCount) return rank_start
	if (rank_start === 1 && inRange(arrival.sort_order, advancement)) return arrival.sort_order!
	return undefined
}

/**
 * Placements for a round's entrants, dropping any the data contradicts: more players leaving by
 * an advancement than it has places (a bracket reset, or a hand-made move), or two players with
 * the same rank.
 */
function consistentPlacements(exits: (Exit | undefined)[], entrantCount: number) {
	const exitCounts = new Map<RoundAdvancementRow, number>()
	for (const exit of exits) {
		if (exit) exitCounts.set(exit.advancement, (exitCounts.get(exit.advancement) ?? 0) + 1)
	}
	const placements = exits.map((exit) => {
		if (!exit) return undefined
		const { rank_start, rank_end } = exit.advancement
		const places = rank_end == null ? Infinity : rank_end - rank_start + 1
		if (exitCounts.get(exit.advancement)! > places) return undefined
		return placementFromExit(exit, entrantCount)
	})
	return placements.map((p) =>
		p != null && placements.filter((other) => other === p).length > 1 ? undefined : p
	)
}

function inRange(rank: number | null, advancement: RoundAdvancementRow) {
	return (
		rank != null &&
		rank >= advancement.rank_start &&
		(advancement.rank_end == null || rank <= advancement.rank_end)
	)
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
	const map = new Map<K, T[]>()
	for (const item of items) {
		const k = key(item)
		const group = map.get(k)
		if (group) group.push(item)
		else map.set(k, [item])
	}
	return map
}
