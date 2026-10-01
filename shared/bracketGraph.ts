// The source-agnostic shape of a bracket. Every source adapter produces one of these, and
// everything downstream (layout, cards, styling) is keyed by the stable string keys in it.

export type MatchStatus = 'pending' | 'ready' | 'live' | 'complete'

export interface GraphPhase {
	key: string
	name: string
	order: number
}

export interface GraphEntrant {
	key: string
	name: string
	seed?: number
	imageUrl?: string
	/** key of the edge this entrant left the match by, once they've moved on */
	advancedVia?: string
	/** exact finishing position within this match, when the source pins it down */
	placement?: number
}

export interface GraphMatch {
	key: string
	phaseKey?: string
	title: string
	status: MatchStatus
	/** expected number of entrants, so a card can be sized before anyone has arrived */
	capacity: number
	entrants: GraphEntrant[]
}

export interface GraphEdge {
	key: string
	from: string
	to: string
	rankStart: number
	/** undefined means open-ended: this rank and everyone below it */
	rankEnd?: number
	label?: string
}

export interface BracketGraph {
	title: string
	phases: GraphPhase[]
	matches: GraphMatch[]
	edges: GraphEdge[]
}
