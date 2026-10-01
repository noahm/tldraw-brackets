import type { BracketGraph } from './bracketGraph'
import type { DiagramSource } from './source'

// Everything a client needs to know about a diagram's tournament data. The DiagramRoom sends
// the whole thing as a tldraw sync custom message whenever any part of it changes; a bracket
// graph is small enough that diffing isn't worth the complexity.
export interface LiveDataState {
	source: DiagramSource | null
	graph: BracketGraph | null
	/** ISO time the graph last changed (sources are polled more often than that) */
	updatedAt: string | null
	/** the most recent fetch failure; graph keeps its last good value meanwhile */
	error: { message: string; at: string } | null
}

export interface LiveDataMessage {
	type: 'live-data'
	state: LiveDataState
}

export function isLiveDataMessage(data: unknown): data is LiveDataMessage {
	return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'live-data'
}
