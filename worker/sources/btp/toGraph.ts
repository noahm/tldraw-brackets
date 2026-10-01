import type { BracketGraph, GraphEdge, GraphMatch, MatchStatus } from '../../../shared/bracketGraph'
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
	const advancementsFrom = groupBy(advancements, (a) => a.round_id)
	const advancementsInto = groupBy(advancements, (a) => a.destination_round_id)

	const rounds = [...rows.rounds].sort(
		(a, b) =>
			(poolOrder.get(a.round_pool_id ?? -1) ?? -1) - (poolOrder.get(b.round_pool_id ?? -1) ?? -1) ||
			a.id - b.id
	)

	const matches: GraphMatch[] = rounds.map((round) => {
		const playerRounds = [...(playerRoundsByRound.get(round.id) ?? [])].sort((a, b) => a.id - b.id)
		const incomingWidth = (advancementsInto.get(round.id) ?? []).reduce(
			(sum, a) => sum + (a.rank_end == null ? 1 : a.rank_end - a.rank_start + 1),
			0
		)
		return {
			key: btpKeys.round(round.id),
			phaseKey: round.round_pool_id != null ? btpKeys.pool(round.round_pool_id) : undefined,
			title: roundTitle(round.name) || `Round ${round.id}`,
			status: (round.status && statusMap[round.status]) || 'pending',
			capacity: Math.max(playerRounds.length, incomingWidth, 1),
			entrants: playerRounds.map((pr) => ({
				key: btpKeys.player(pr.player_tourney_id),
				name: pr.player_tourneys.player_name,
				seed: pr.player_tourneys.seed ?? undefined,
				imageUrl: pr.player_tourneys.player_img ?? undefined,
				placement: findPlacement(pr, advancementsFrom.get(round.id) ?? [], playerRoundsByRound),
			})),
		}
	})

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

	return {
		title: rows.tourney.name,
		phases: pools.map((p, i) => ({ key: btpKeys.pool(p.id), name: p.name, order: i })),
		matches,
		edges,
	}
}

/**
 * A player's finishing rank in a round isn't stored, but when they advance, their row in the
 * destination round records that rank as sort_order. So look for the player in this round's
 * destinations.
 *
 * A player can legitimately turn up in more than one destination of the same round (e.g. the
 * Winners Finals loser drops to Losers Finals, wins it, and reaches Grand Finals, which is also a
 * Winners Finals destination). The row this round created is the earliest one made after the
 * player entered this round, so take that. player_rounds ids are an identity column, so they
 * order by creation.
 */
function findPlacement(
	entry: PlayerRoundRow,
	outgoing: RoundAdvancementRow[],
	playerRoundsByRound: Map<number, PlayerRoundRow[]>
): number | undefined {
	let best: PlayerRoundRow | undefined
	for (const advancement of outgoing) {
		for (const candidate of playerRoundsByRound.get(advancement.destination_round_id) ?? []) {
			if (candidate.player_tourney_id !== entry.player_tourney_id) continue
			if (candidate.id <= entry.id || candidate.sort_order == null) continue
			const rank = candidate.sort_order
			const inRange =
				rank >= advancement.rank_start &&
				(advancement.rank_end == null || rank <= advancement.rank_end)
			if (inRange && (!best || candidate.id < best.id)) best = candidate
		}
	}
	return best?.sort_order ?? undefined
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
