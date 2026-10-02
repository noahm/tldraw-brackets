import { z } from 'zod'
import { SourceError } from '../read'
import { eventRow, setPage, type EventRow, type SetRow, type StartggEventRows } from './rows'
import { daysUntilTokenExpires, STARTGG_TOKEN_EXPIRES } from './token'

export interface StartggScope {
	/** "tournament/<tournament>/event/<event>" */
	eventSlug: string
	phaseId?: number
	phaseGroupId?: number
}

export interface StartggRead {
	rows: StartggEventRows
	/** API requests this read made, which the caller paces itself by */
	requests: number
}

// Read-only by construction: this module only ever sends queries, never mutations.

const API_URL = 'https://api.start.gg/gql/alpha'

/**
 * start.gg rejects requests that could return more than 1000 objects, counting nested ones. A
 * set here is about eight (itself, two slots, their entrants and seeds), so 50 a page leaves room.
 */
const SETS_PER_PAGE = 50
/** Pools listed per phase. A phase with more than this must be narrowed to one pool. */
const GROUPS_PER_PHASE = 64
/**
 * Each pool is at least one request per read, and a token gets 80 a minute across every diagram,
 * so a source covering more pools than this is turned away with a request to narrow it down.
 */
export const MAX_PHASE_GROUPS = 16
/** How long an event's phases and pools are reused before being read again. */
const STRUCTURE_TTL_MS = 5 * 60_000
const RATE_LIMITED_BACKOFF_MS = 60_000

const structureCache = new Map<string, { at: number; event: EventRow }>()

export async function fetchEventRows(token: string, scope: StartggScope): Promise<StartggRead> {
	let requests = 0
	const query = async <T extends z.ZodType>(
		document: string,
		variables: object,
		schema: T
	): Promise<z.infer<T>> => {
		requests++
		return graphql(token, document, variables, schema)
	}

	const cacheKey = `${scope.eventSlug}#${scope.phaseId ?? ''}`
	let event = structureCache.get(cacheKey)
	if (!event || Date.now() - event.at > STRUCTURE_TTL_MS) {
		const data = await query(
			eventQuery(scope.phaseId != null),
			{ slug: scope.eventSlug, phaseId: scope.phaseId, perPage: GROUPS_PER_PHASE },
			z.object({ event: eventRow.nullable() })
		)
		if (!data.event) throw new SourceError(`start.gg event "${scope.eventSlug}" not found`)
		event = { at: Date.now(), event: data.event }
		structureCache.set(cacheKey, event)
	}

	const phases = event.event.phases ?? []
	if (scope.phaseId != null && !phases.length) {
		throw new SourceError(`start.gg event "${scope.eventSlug}" has no phase ${scope.phaseId}`)
	}
	const groups = phases.flatMap(({ phaseGroups, ...phase }) =>
		(phaseGroups.nodes ?? []).map((group) => ({ phase, group }))
	)
	const groupTotal = phases.reduce(
		(sum, p) =>
			sum + Math.max(p.phaseGroups.pageInfo?.total ?? 0, p.phaseGroups.nodes?.length ?? 0),
		0
	)

	let selected = groups
	if (scope.phaseGroupId != null) {
		selected = groups.filter((g) => g.group.id === String(scope.phaseGroupId))
		if (!selected.length) {
			throw new SourceError(
				`start.gg event "${scope.eventSlug}" has no pool ${scope.phaseGroupId}` +
					(scope.phaseId != null ? ` in phase ${scope.phaseId}` : '')
			)
		}
	} else if (groupTotal > MAX_PHASE_GROUPS) {
		throw new SourceError(
			`This start.gg ${scope.phaseId != null ? 'phase' : 'event'} has ${groupTotal} pools, ` +
				`more than the ${MAX_PHASE_GROUPS} a diagram can follow. Paste a link to one ` +
				`${scope.phaseId != null ? 'pool' : 'phase or pool'} from its Brackets page instead.`
		)
	}

	const results = await mapWithConcurrency(selected, 4, async ({ phase, group }) => {
		const sets: SetRow[] = []
		for (let page = 1; ; page++) {
			const data = await query(
				SETS_QUERY,
				{ id: group.id, page, perPage: SETS_PER_PAGE },
				z.object({ phaseGroup: z.object({ sets: setPage.nullable() }).nullable() })
			)
			const result = data.phaseGroup?.sets
			sets.push(...(result?.nodes ?? []))
			if (page >= (result?.pageInfo?.totalPages ?? 1)) break
		}
		return { phase, group, sets }
	})

	return {
		rows: {
			event: { name: event.event.name, tournamentName: event.event.tournament?.name ?? null },
			groups: results,
		},
		requests,
	}
}

function eventQuery(narrowToPhase: boolean) {
	// An explicit null phaseId isn't documented to mean "every phase", so leave the argument out.
	return `
		query EventStructure($slug: String!, $perPage: Int!${narrowToPhase ? ', $phaseId: ID' : ''}) {
			event(slug: $slug) {
				id
				name
				tournament { name }
				phases${narrowToPhase ? '(phaseId: $phaseId)' : ''} {
					id
					name
					phaseOrder
					groupCount
					bracketType
					phaseGroups(query: { page: 1, perPage: $perPage }) {
						pageInfo { total }
						nodes { id displayIdentifier bracketType }
					}
				}
			}
		}`
}

const SETS_QUERY = `
	query PhaseGroupSets($id: ID!, $page: Int!, $perPage: Int!) {
		phaseGroup(id: $id) {
			sets(page: $page, perPage: $perPage, sortType: STANDARD, filters: { showByes: false }) {
				pageInfo { totalPages }
				nodes {
					id
					identifier
					fullRoundText
					round
					state
					winnerId
					slots {
						slotIndex
						prereqId
						prereqType
						prereqPlacement
						entrant { id name }
						seed { seedNum }
					}
				}
			}
		}
	}`

async function graphql<T extends z.ZodType>(
	token: string,
	document: string,
	variables: object,
	schema: T
): Promise<z.infer<T>> {
	const response = await fetch(API_URL, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json',
			accept: 'application/json',
		},
		body: JSON.stringify({ query: document, variables }),
	})
	if (response.status === 401 || response.status === 403) {
		throw new SourceError(`start.gg rejected the API token (${response.status}). ${tokenHint()}`)
	}
	if (response.status === 429) {
		throw new SourceError('start.gg rate limit reached; waiting a minute', RATE_LIMITED_BACKOFF_MS)
	}
	const body = (await response.json().catch(() => null)) as {
		data?: unknown
		errors?: { message?: string }[]
		success?: boolean
		message?: string
	} | null
	if (!response.ok || !body) {
		throw new SourceError(`start.gg request failed: ${response.status} ${body?.message ?? ''}`)
	}
	// Rate limiting and complexity errors come back as 200s with an error message. Partial data
	// would draw a bracket with pieces missing, so any error fails the read.
	const messages = [body.message, ...(body.errors ?? []).map((e) => e.message)].filter(Boolean)
	if (body.success === false || body.errors?.length) {
		const message = messages.join('; ') || 'unknown error'
		const rateLimited = /rate limit/i.test(message)
		throw new SourceError(
			`start.gg request failed: ${message}`,
			rateLimited ? RATE_LIMITED_BACKOFF_MS : undefined
		)
	}
	const parsed = schema.safeParse(body.data)
	if (!parsed.success) {
		throw new SourceError(
			`start.gg response didn't match the expected schema: ${parsed.error.message}`
		)
	}
	return parsed.data
}

function tokenHint() {
	const days = daysUntilTokenExpires()
	if (days == null) return 'Check STARTGG_TOKEN.'
	if (days < 0) {
		return `It expired on ${STARTGG_TOKEN_EXPIRES}; run scripts/rotate-startgg-token.sh.`
	}
	return `It should be valid until ${STARTGG_TOKEN_EXPIRES}; check STARTGG_TOKEN.`
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next = 0
	const worker = async () => {
		while (next < items.length) {
			const i = next++
			results[i] = await fn(items[i])
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
	return results
}
