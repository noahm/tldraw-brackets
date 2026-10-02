// Where a diagram's tournament data comes from. Stored per diagram by its DiagramRoom.

export type DiagramSource =
	/** a Blame the Pads tourney, read from its Supabase */
	| { kind: 'btp'; tourneyId: number }
	/**
	 * a start.gg event, read from its GraphQL API. Big events have many pools, so a source can be
	 * narrowed to one phase (e.g. "Top 8") or one pool within it.
	 */
	| { kind: 'startgg'; eventSlug: string; phaseId?: number; phaseGroupId?: number }
	/** a bundled snapshot of source rows, for local development and tests */
	| { kind: 'fixture'; name: string }

/** "tournament/<tournament>/event/<event>", the form start.gg's API takes */
const STARTGG_EVENT_SLUG = /^tournament\/[a-z0-9-]{1,128}\/event\/[a-z0-9-]{1,128}$/

const positiveId = (value: unknown): value is number =>
	Number.isSafeInteger(value) && (value as number) > 0

export function parseDiagramSource(value: unknown): DiagramSource | null {
	if (!value || typeof value !== 'object') return null
	const v = value as Record<string, unknown>
	if (v.kind === 'btp' && positiveId(v.tourneyId)) {
		return { kind: 'btp', tourneyId: v.tourneyId }
	}
	if (v.kind === 'startgg' && typeof v.eventSlug === 'string') {
		if (!STARTGG_EVENT_SLUG.test(v.eventSlug)) return null
		if (v.phaseId != null && !positiveId(v.phaseId)) return null
		if (v.phaseGroupId != null && !positiveId(v.phaseGroupId)) return null
		return {
			kind: 'startgg',
			eventSlug: v.eventSlug,
			...(v.phaseId != null && { phaseId: v.phaseId as number }),
			...(v.phaseGroupId != null && { phaseGroupId: v.phaseGroupId as number }),
		}
	}
	if (v.kind === 'fixture' && typeof v.name === 'string' && /^[a-z0-9-]{1,64}$/.test(v.name)) {
		return { kind: 'fixture', name: v.name }
	}
	return null
}

/**
 * A start.gg source from a pasted link (or bare slug). Any page within an event works; a bracket
 * page narrows it to that phase, and to that pool if the link names one:
 * start.gg/tournament/<t>/event/<e>/brackets/<phaseId>/<phaseGroupId>
 */
export function parseStartggUrl(text: string): DiagramSource | null {
	const match = text
		.trim()
		.toLowerCase()
		.match(
			/(?:^|start\.gg\/)(tournament\/[^/?#]+\/event\/[^/?#]+)(?:\/brackets\/(\d+)(?:\/(\d+))?)?/
		)
	if (!match) return null
	return parseDiagramSource({
		kind: 'startgg',
		eventSlug: match[1],
		phaseId: match[2] ? Number(match[2]) : undefined,
		phaseGroupId: match[3] ? Number(match[3]) : undefined,
	})
}

/**
 * A source from what an editor typed: fixture:<name>, a start.gg event or bracket link, or a
 * Blame the Pads tourney id or any link within a tourney.
 */
export function parseSourceInput(text: string): DiagramSource | null {
	const trimmed = text.trim()
	const fixture = trimmed.match(/^fixture:([a-z0-9-]+)$/)
	if (fixture) return { kind: 'fixture', name: fixture[1] }
	const startgg = parseStartggUrl(trimmed)
	if (startgg) return startgg
	const id = Number((trimmed.match(/\/tourney\/(\d+)/) ?? trimmed.match(/^(\d+)$/))?.[1])
	return parseDiagramSource({ kind: 'btp', tourneyId: id })
}

export function describeSource(source: DiagramSource): string {
	switch (source.kind) {
		case 'btp':
			return `Blame the Pads tourney #${source.tourneyId}`
		case 'startgg': {
			const [, tournament, , event] = source.eventSlug.split('/')
			const scope = source.phaseGroupId
				? `, pool ${source.phaseGroupId}`
				: source.phaseId
					? `, phase ${source.phaseId}`
					: ''
			return `start.gg ${tournament} / ${event}${scope}`
		}
		case 'fixture':
			return `Fixture "${source.name}"`
	}
}
