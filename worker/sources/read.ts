import type { BracketGraph } from '../../shared/bracketGraph'

// What reading a source gives the DiagramRoom. Sources differ in how often they may be read:
// Blame the Pads' Supabase doesn't mind a read every few seconds, but start.gg allows each API
// token 80 requests a minute, shared by every diagram using it.

export interface SourceRead {
	graph: BracketGraph
	/** how long to wait before reading the source again */
	nextReadMs: number
}

/** A failed read, optionally saying how long to back off before trying again. */
export class SourceError extends Error {
	constructor(
		message: string,
		readonly retryAfterMs?: number
	) {
		super(message)
	}
}
