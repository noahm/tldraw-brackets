// Where a diagram's tournament data comes from. Stored per diagram by its DiagramRoom.

export type DiagramSource =
	/** a Blame the Pads tourney, read from its Supabase */
	| { kind: 'btp'; tourneyId: number }
	/** a bundled snapshot of source rows, for local development and tests */
	| { kind: 'fixture'; name: string }

export function parseDiagramSource(value: unknown): DiagramSource | null {
	if (!value || typeof value !== 'object') return null
	const v = value as Record<string, unknown>
	if (v.kind === 'btp' && Number.isSafeInteger(v.tourneyId) && (v.tourneyId as number) > 0) {
		return { kind: 'btp', tourneyId: v.tourneyId as number }
	}
	if (v.kind === 'fixture' && typeof v.name === 'string' && /^[a-z0-9-]{1,64}$/.test(v.name)) {
		return { kind: 'fixture', name: v.name }
	}
	return null
}

export function describeSource(source: DiagramSource): string {
	switch (source.kind) {
		case 'btp':
			return `Blame the Pads tourney #${source.tourneyId}`
		case 'fixture':
			return `Fixture "${source.name}"`
	}
}
