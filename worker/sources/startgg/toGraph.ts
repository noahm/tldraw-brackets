import type {
	BracketFormat,
	BracketGraph,
	GraphEdge,
	GraphMatch,
	GraphPhase,
	MatchStatus,
} from '../../../shared/bracketGraph'
import type { SetRow, SetSlotRow, StartggEventRows } from './rows'

/**
 * Sets are keyed by pool and identifier ("A", "AT"), not by set id: until a bracket starts,
 * start.gg gives its sets temporary "preview_…" ids that change when it does, while the
 * identifiers stay put. Card layout and styling hang off these keys, so they must not move.
 */
export const startggKeys = {
	group: (groupId: string) => `startgg:group:${groupId}`,
	set: (groupId: string, identifier: string) => `startgg:set:${groupId}:${identifier}`,
	slot: (setKey: string, slotIndex: number) => `${setKey.replace(':set:', ':slot:')}:${slotIndex}`,
	entrant: (entrantId: string) => `startgg:entrant:${entrantId}`,
}

const formatMap: Record<string, BracketFormat> = {
	DOUBLE_ELIMINATION: 'double-elimination',
	SINGLE_ELIMINATION: 'single-elimination',
}

/** Set.state is an ActivityState sent as its number. */
const statusByState: Record<number, MatchStatus> = {
	1: 'pending', // created
	2: 'live', // active
	3: 'complete',
	4: 'ready',
	5: 'pending', // invalid
	6: 'ready', // called
	7: 'ready', // queued
}

/**
 * A short round name in the style of bracket shorthand ("Winners Round 1" → "WR1", "Losers
 * Semi-Final" → "LSF"), which is also what the layout recognizes losers-bracket matches by.
 * Grand finals keep their full name, which the layout looks for too.
 */
export function shortRoundName(fullRoundText: string | null, round: number | null): string {
	const text = (fullRoundText ?? '').trim()
	if (/^grand finals?( reset)?$/i.test(text)) return text
	const match = text.match(
		/^(winners |losers )?(?:round (\d+)|(quarter|semi)-?\s?finals?|finals?)$/i
	)
	if (match) {
		const side = match[1] ? match[1][0].toUpperCase() : ''
		const stage = match[2] ? `R${match[2]}` : match[3] ? `${match[3][0].toUpperCase()}F` : 'F'
		return side || stage !== 'F' ? side + stage : 'Final'
	}
	if (text) return text
	if (round == null) return ''
	return round < 0 ? `LR${-round}` : `R${round}`
}

/** e.g. "WR1:A", like Blame the Pads' "WR1:M1"; grand finals are unique, so they go without. */
export function setTitle(set: Pick<SetRow, 'fullRoundText' | 'round' | 'identifier'>): string {
	const round = shortRoundName(set.fullRoundText, set.round)
	if (/^grand final/i.test(round)) return round
	return [round, set.identifier].filter(Boolean).join(':') || 'Set'
}

export function startggRowsToGraph(rows: StartggEventRows): BracketGraph {
	const groups = [...rows.groups].sort(
		(a, b) =>
			(a.phase.phaseOrder ?? Infinity) - (b.phase.phaseOrder ?? Infinity) ||
			(a.group.displayIdentifier ?? '').localeCompare(b.group.displayIdentifier ?? '', 'en', {
				numeric: true,
			})
	)

	const phases: GraphPhase[] = groups.map(({ phase, group }, order) => ({
		key: startggKeys.group(group.id),
		name:
			(phase.groupCount ?? 1) > 1 && group.displayIdentifier
				? `${phase.name ?? 'Phase'}: Pool ${group.displayIdentifier}`
				: (phase.name ?? `Pool ${group.displayIdentifier ?? group.id}`),
		order,
	}))

	// Slots name the set their entrant comes from by set id, so map ids to keys first.
	const keyBySetId = new Map<string, string>()
	const sets = groups.flatMap(({ group, sets }) =>
		[...withoutDeadSets(sets)].sort(bracketOrder).map((set) => {
			const key = startggKeys.set(group.id, set.identifier ?? set.id)
			keyBySetId.set(set.id, key)
			return { set, key, phaseKey: startggKeys.group(group.id) }
		})
	)

	const edges: GraphEdge[] = sets.flatMap(({ set, key }) =>
		(set.slots ?? []).flatMap((slot, i) => {
			const from = slot.prereqType === 'set' && slot.prereqId && keyBySetId.get(slot.prereqId)
			const placement = slot.prereqPlacement
			if (!from || placement == null) return []
			return [
				{
					key: startggKeys.slot(key, slot.slotIndex ?? i),
					from,
					to: key,
					rankStart: placement,
					rankEnd: placement,
					label: placement === 1 ? 'Winner' : placement === 2 ? 'Loser' : undefined,
				},
			]
		})
	)

	const entrantIdsByKey = new Map(
		sets.map(({ set, key }) => [
			key,
			new Set((set.slots ?? []).flatMap((s) => (s.entrant ? [s.entrant.id] : []))),
		])
	)

	const liveSetIds = new Set(sets.map(({ set }) => set.id))
	const matches: GraphMatch[] = sets.map(({ set, key, phaseKey }) => {
		const slots = (set.slots ?? [])
			.filter((slot) => !isDeadSlot(slot, liveSetIds))
			.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
		const filled = slots.filter((s) => s.entrant)
		const complete = set.state === 3 && set.winnerId != null
		const outgoing = edges.filter((e) => e.from === key)

		return {
			key,
			phaseKey,
			title: setTitle(set),
			status: (set.state != null && statusByState[set.state]) || 'pending',
			capacity: Math.max(slots.length, 1),
			entrants: filled.map(({ entrant, seed }) => {
				const id = entrant!.id
				// Placements only mean something in a two-entrant set with a recorded winner.
				const placement =
					complete && filled.length === 2 ? (id === String(set.winnerId) ? 1 : 2) : undefined
				// Like the btp adapter, an entrant has left by an edge only once they've turned up in
				// the set it leads to. Before that, the card shows where they're expected instead.
				const via =
					placement != null &&
					outgoing.find((e) => e.rankStart === placement && entrantIdsByKey.get(e.to)?.has(id))
				return {
					key: startggKeys.entrant(id),
					name: entrant!.name ?? `Entrant ${id}`,
					seed: seed?.seedNum ?? undefined,
					advancedVia: via ? via.key : undefined,
					placement,
				}
			}),
		}
	})

	const formats = new Set(
		groups.map(({ phase, group }) => formatMap[group.bracketType ?? phase.bracketType ?? ''])
	)

	return {
		title: rows.event.tournamentName
			? `${rows.event.tournamentName}: ${rows.event.name}`
			: rows.event.name,
		format: formats.size === 1 ? ([...formats][0] ?? 'other') : 'other',
		phases,
		matches,
		edges,
	}
}

/**
 * A slot nobody will ever fill: a bye, or an empty slot waiting on a set that isn't there (start.gg
 * leaves out sets with a bye) or will never be played. A bye's winner is placed straight into the
 * next set, so an empty slot fed by a missing set is waiting for a bye's loser: nobody.
 */
function isDeadSlot(slot: SetSlotRow, liveSetIds: Set<string>) {
	if (slot.prereqType === 'bye') return true
	return slot.prereqType === 'set' && !slot.entrant && !liveSetIds.has(slot.prereqId ?? '')
}

/**
 * start.gg pads brackets to a power of two, and keeps sets that byes mean will never be played.
 * Drops sets with no live slots, repeatedly, since a dropped set's winner was going somewhere too.
 */
function withoutDeadSets(sets: SetRow[]): SetRow[] {
	let live = sets
	for (;;) {
		const ids = new Set(live.map((set) => set.id))
		const next = live.filter((set) => (set.slots ?? []).some((slot) => !isDeadSlot(slot, ids)))
		if (next.length === live.length) return live
		live = next
	}
}

/** Winners bracket first, then losers, each by round, then by identifier (A … Z, AA …). */
function bracketOrder(a: SetRow, b: SetRow) {
	const side = (s: SetRow) => ((s.round ?? 0) < 0 ? 1 : 0)
	const round = (s: SetRow) => Math.abs(s.round ?? 0)
	const id = (s: SetRow) => s.identifier ?? ''
	return (
		side(a) - side(b) ||
		round(a) - round(b) ||
		id(a).length - id(b).length ||
		id(a).localeCompare(id(b))
	)
}
