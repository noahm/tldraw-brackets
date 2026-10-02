import { z } from 'zod'

// The slice of start.gg's GraphQL schema this adapter reads, validated the same way as the btp
// rows: if start.gg changes something, we fail with a message naming the field instead of
// drawing a quietly wrong bracket.

/**
 * start.gg sends ids as numbers, except for sets in brackets that haven't started, which have
 * temporary string ids like "preview_123_1_0". Normalize all of them to strings.
 */
const id = z.union([z.number().int(), z.string()]).transform(String)

export const phaseGroupRow = z.object({
	id,
	/** the pool's name within its phase, e.g. "A1" */
	displayIdentifier: z.string().nullable(),
	bracketType: z.string().nullable(),
})

export const phaseRow = z.object({
	id,
	name: z.string().nullable(),
	phaseOrder: z.number().int().nullable(),
	/** how many pools the phase has; one-pool phases are named for the phase alone */
	groupCount: z.number().int().nullable(),
	bracketType: z.string().nullable(),
	phaseGroups: z.object({
		pageInfo: z.object({ total: z.number().int().nullable() }).nullable(),
		nodes: z.array(phaseGroupRow).nullable(),
	}),
})

export const eventRow = z.object({
	id,
	name: z.string(),
	tournament: z.object({ name: z.string() }).nullable(),
	phases: z.array(phaseRow).nullable(),
})

export const setSlotRow = z.object({
	slotIndex: z.number().int().nullable(),
	/** with prereqType "set", the id of the set this slot's entrant comes from */
	prereqId: id.nullable(),
	prereqType: z.string().nullable(),
	/** with prereqType "set", the placement in that set that sends an entrant here */
	prereqPlacement: z.number().int().nullable(),
	entrant: z.object({ id, name: z.string().nullable() }).nullable(),
	seed: z.object({ seedNum: z.number().int().nullable() }).nullable(),
})

export const setRow = z.object({
	id,
	/** letters naming the set within its pool, e.g. "A", "AT"; stable once the bracket is drawn */
	identifier: z.string().nullable(),
	fullRoundText: z.string().nullable(),
	/** negative in the losers bracket */
	round: z.number().int().nullable(),
	/** an ActivityState, as a number: 1 created … 7 queued */
	state: z.number().int().nullable(),
	winnerId: z.number().int().nullable(),
	slots: z.array(setSlotRow).nullable(),
})

export const setPage = z.object({
	pageInfo: z.object({ totalPages: z.number().int().nullable() }).nullable(),
	nodes: z.array(setRow).nullable(),
})

export type PhaseGroupRow = z.infer<typeof phaseGroupRow>
export type PhaseRow = z.infer<typeof phaseRow>
export type EventRow = z.infer<typeof eventRow>
export type SetSlotRow = z.infer<typeof setSlotRow>
export type SetRow = z.infer<typeof setRow>

/** Everything about one event (or the part of it a source narrows to) that the graph is built from. */
export interface StartggEventRows {
	event: { name: string; tournamentName: string | null }
	/** the phase groups the source covers, each with its phase and all of its sets */
	groups: { phase: Omit<PhaseRow, 'phaseGroups'>; group: PhaseGroupRow; sets: SetRow[] }[]
}
