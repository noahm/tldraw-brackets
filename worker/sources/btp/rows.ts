import { z } from 'zod'

// The slice of Blame the Pads' Supabase schema this adapter reads. There's no agreed contract
// with that schema, so every row is validated here: if it drifts, we fail loudly with a message
// naming the field instead of drawing a quietly wrong bracket.

const id = z.number().int()

export const tourneyRow = z.object({
	id,
	name: z.string(),
	type: z.string().nullable(),
	status: z.string().nullable(),
})

export const roundPoolRow = z.object({
	id,
	name: z.string(),
	sort_order: z.number().nullable(),
})

export const roundRow = z.object({
	id,
	name: z.string(),
	status: z.string().nullable(),
	round_pool_id: id.nullable(),
})

export const roundAdvancementRow = z.object({
	id,
	round_id: id,
	rank_start: z.number().int(),
	rank_end: z.number().int().nullable(),
	destination_round_id: id,
	label: z.string().nullable(),
})

export const playerRoundRow = z.object({
	id,
	round_id: id,
	player_tourney_id: id,
	/**
	 * The rank this player finished with in the round that sent them here (null for initial
	 * seeding). Blame the Pads doesn't store a round's results directly, so this is how we
	 * recover placements for completed rounds.
	 */
	sort_order: z.number().int().nullable(),
	player_tourneys: z.object({
		player_name: z.string(),
		seed: z.number().nullable(),
		player_img: z.string().nullable(),
	}),
})

export type TourneyRow = z.infer<typeof tourneyRow>
export type RoundPoolRow = z.infer<typeof roundPoolRow>
export type RoundRow = z.infer<typeof roundRow>
export type RoundAdvancementRow = z.infer<typeof roundAdvancementRow>
export type PlayerRoundRow = z.infer<typeof playerRoundRow>

/** Everything about one tourney that the graph is built from. */
export const btpTourneyRows = z.object({
	tourney: tourneyRow,
	pools: z.array(roundPoolRow),
	rounds: z.array(roundRow),
	advancements: z.array(roundAdvancementRow),
	playerRounds: z.array(playerRoundRow),
})

export type BtpTourneyRows = z.infer<typeof btpTourneyRows>
