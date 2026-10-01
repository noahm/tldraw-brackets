import {
	DurableObjectSqliteSyncWrapper,
	type SessionStateSnapshot,
	SQLiteSyncStorage,
	TLSocketRoom,
} from '@tldraw/sync-core'
import type { TLRecord } from '@tldraw/tlschema'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import type { LiveDataMessage, LiveDataState } from '../shared/liveData'
import { diagramSchema } from '../shared/schema'
import { type DiagramSource, parseDiagramSource } from '../shared/source'
import { bearerToken, hashToken, sameHash, TICKET_TTL_MS } from './access'
import { fetchGraph } from './sources'

/** How often to re-read the source while anyone has the diagram open. */
const POLL_INTERVAL_MS = 5_000
const SOURCE_STORAGE_KEY = 'source'
const EDIT_TOKEN_HASH_KEY = 'editTokenHash'
const TICKET_KEY_PREFIX = 'ticket:'

interface SocketAttachment {
	sessionId: string
	snapshot: SessionStateSnapshot | null
}

function getAttachment(ws: WebSocket): SocketAttachment | null {
	const attachment = ws.deserializeAttachment() as SocketAttachment | null
	return attachment?.sessionId ? attachment : null
}

// Each diagram is hosted in its own Durable Object with WebSocket Hibernation.
// https://developers.cloudflare.com/durable-objects/
//
// There's only ever one durable object instance per diagram. Room state is
// persisted automatically to SQLite via ctx.storage. When all clients are
// idle, the DO hibernates (freeing memory) while WebSocket connections
// stay alive at the Cloudflare layer.
//
// The DO is also the only thing that reads the diagram's tournament source. It polls the
// source on an alarm while anyone is connected, and pushes changes to every session as a
// custom message. Live data never enters the tldraw document.
//
// Access: a diagram exists once it's been claimed with an edit token (see ./access.ts).
// Anyone may view it; only connections opened with a ticket bought by that token may edit.
export class DiagramRoom extends DurableObject<Env> {
	private room: TLSocketRoom<TLRecord, void> | null = null
	/** Map sessionId → ws so onSessionSnapshot can serialize to the right socket. */
	private readonly sessionIdToWs = new Map<string, WebSocket>()
	/** In memory only; rebuilt from the source after the DO wakes from hibernation. */
	private liveData: LiveDataState | null = null
	private refreshing: Promise<LiveDataState> | null = null

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		// Respond to ping messages at the platform level without waking the DO.
		// The TLSyncClient sends {"type":"ping"} every 5s; without this, each
		// ping would wake the DO from hibernation.
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
		)
	}

	private getOrCreateRoom(): TLSocketRoom<TLRecord, void> {
		if (!this.room) {
			const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
			const storage = new SQLiteSyncStorage<TLRecord>({ sql })

			this.room = new TLSocketRoom<TLRecord, void>({
				schema: diagramSchema,
				storage,
				// Disable idle timeout since Cloudflare handles keep-alive via auto-response.
				// Without this, sessions would be pruned after 20s of no "real" messages
				// even though the client is still connected and being auto-ponged.
				clientTimeout: Infinity,
				onSessionSnapshot: (sessionId, snapshot) => {
					const ws = this.sessionIdToWs.get(sessionId)
					if (ws) ws.serializeAttachment({ sessionId, snapshot })
				},
				onAfterReceiveMessage: ({ sessionId, stringified }) => {
					// Custom messages only reach a session once its sync handshake is done, so
					// wait for the client's connect message before sending it live data.
					if (isConnectMessage(stringified)) this.onSessionConnected(sessionId)
				},
			})

			// Resume any sessions that survived hibernation
			for (const ws of this.ctx.getWebSockets()) {
				const attachment = getAttachment(ws)
				if (!attachment?.snapshot) continue
				this.room.handleSocketResume({
					sessionId: attachment.sessionId,
					socket: ws,
					snapshot: attachment.snapshot,
				})
			}
		}
		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) })
		.get('/api/diagrams/:diagramId/connect', (request) => this.handleConnect(request))
		.get('/api/diagrams/:diagramId/source', async () =>
			(await this.exists()) ? this.getLiveData() : error(404, 'No such diagram')
		)
		.put('/api/diagrams/:diagramId/source', (request) => this.handleSetSource(request))

	// Entry point for all requests to the Durable Object
	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	// --- Access (called over RPC from the worker) ---

	/** Makes this diagram exist, owned by whoever holds the token. False if already claimed. */
	async claim(tokenHash: string): Promise<boolean> {
		if (await this.ctx.storage.get(EDIT_TOKEN_HASH_KEY)) return false
		await this.ctx.storage.put(EDIT_TOKEN_HASH_KEY, tokenHash)
		return true
	}

	async exists(): Promise<boolean> {
		return !!(await this.ctx.storage.get(EDIT_TOKEN_HASH_KEY))
	}

	async isEditToken(token: string | null): Promise<boolean> {
		const stored = await this.ctx.storage.get<string>(EDIT_TOKEN_HASH_KEY)
		return !!token && !!stored && sameHash(await hashToken(token), stored)
	}

	/** A single-use ticket to open one editing connection, or null for a wrong token. */
	async issueTicket(token: string | null): Promise<string | null> {
		if (!(await this.isEditToken(token))) return null
		// Tickets from connections that never happened would otherwise pile up.
		const now = Date.now()
		const tickets = await this.ctx.storage.list<number>({ prefix: TICKET_KEY_PREFIX })
		const expired = [...tickets].filter(([, expiresAt]) => expiresAt <= now).map(([key]) => key)
		if (expired.length) await this.ctx.storage.delete(expired)

		const ticket = crypto.randomUUID()
		await this.ctx.storage.put(TICKET_KEY_PREFIX + ticket, now + TICKET_TTL_MS)
		return ticket
	}

	private async redeemTicket(ticket: string | undefined): Promise<boolean> {
		if (!ticket) return false
		const key = TICKET_KEY_PREFIX + ticket
		const expiresAt = await this.ctx.storage.get<number>(key)
		if (expiresAt == null) return false
		await this.ctx.storage.delete(key)
		return Date.now() < expiresAt
	}

	// Handle new WebSocket connection requests
	async handleConnect(request: IRequest) {
		const sessionId = request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')
		if (!(await this.exists())) return error(404, 'No such diagram')
		const isReadonly = !(await this.redeemTicket(request.query.ticket as string | undefined))

		// Create the websocket pair for the client
		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		// Use hibernation API instead of serverWebSocket.accept()
		this.ctx.acceptWebSocket(serverWebSocket)

		// Store sessionId in attachment immediately so we can identify this socket
		// after hibernation, before the connect handshake completes.
		const attachment: SocketAttachment = { sessionId, snapshot: null }
		serverWebSocket.serializeAttachment(attachment)

		// Connect to the room. The first webSocketMessage from the client will
		// complete the handshake and trigger debounced snapshot storage.
		this.getOrCreateRoom().handleSocketConnect({ sessionId, socket: serverWebSocket, isReadonly })

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	// --- Live tournament data ---

	private async handleSetSource(request: IRequest) {
		if (!(await this.isEditToken(bearerToken(request)))) return error(403, 'Edit link required')
		const body = await request.json().catch(() => undefined)
		const source = parseDiagramSource(body)
		if (body !== null && !source) return error(400, 'Invalid source')

		// Let any fetch of the old source finish first, so refresh() below can't hand back its result.
		await this.refreshing?.catch(() => {})

		if (source) await this.ctx.storage.put(SOURCE_STORAGE_KEY, source)
		else await this.ctx.storage.delete(SOURCE_STORAGE_KEY)

		// Start over: the old graph belongs to the old source.
		this.liveData = null
		const state = await this.refresh()
		await this.ensurePolling()
		return state
	}

	private onSessionConnected(sessionId: string) {
		this.ctx.waitUntil(
			(async () => {
				const state = await this.getLiveData()
				this.room?.sendCustomMessage(sessionId, liveDataMessage(state))
				await this.ensurePolling()
			})()
		)
	}

	private async getLiveData(): Promise<LiveDataState> {
		return this.liveData ?? (await this.refresh())
	}

	/** Re-reads the source, and tells every session if anything changed. */
	private refresh(): Promise<LiveDataState> {
		// Overlapping callers (a poll and a new session, say) share one fetch.
		this.refreshing ??= this.fetchLiveData()
			.then((next) => {
				const changed = !this.liveData || !sameLiveData(this.liveData, next)
				if (changed) {
					this.liveData = next
					this.broadcast(liveDataMessage(next))
				}
				return this.liveData!
			})
			.finally(() => {
				this.refreshing = null
			})
		return this.refreshing
	}

	private async fetchLiveData(): Promise<LiveDataState> {
		const source = parseDiagramSource(await this.ctx.storage.get<DiagramSource>(SOURCE_STORAGE_KEY))
		const previous = this.liveData
		if (!source) return { source: null, graph: null, updatedAt: null, error: null }

		try {
			const graph = await fetchGraph(source, this.env)
			const graphChanged = JSON.stringify(graph) !== JSON.stringify(previous?.graph)
			return {
				source,
				graph,
				updatedAt: graphChanged ? new Date().toISOString() : previous!.updatedAt,
				error: null,
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			console.error(`Failed to read ${source.kind} source:`, message)
			// Keep showing the last good graph while the source is failing.
			const keepError = previous?.error?.message === message
			return {
				source,
				graph: previous?.graph ?? null,
				updatedAt: previous?.updatedAt ?? null,
				error: keepError ? previous!.error : { message, at: new Date().toISOString() },
			}
		}
	}

	private broadcast(message: LiveDataMessage) {
		if (!this.room) return
		for (const session of this.room.getSessions()) {
			if (session.isConnected) this.room.sendCustomMessage(session.sessionId, message)
		}
	}

	private async ensurePolling() {
		if ((await this.ctx.storage.getAlarm()) == null) {
			await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS)
		}
	}

	override async alarm() {
		// Stop polling once nobody is watching; the next connection starts it again.
		if (this.ctx.getWebSockets().length === 0) return
		if (!(await this.ctx.storage.get(SOURCE_STORAGE_KEY))) return

		// Make sure sessions that survived hibernation are back in the room to receive updates.
		this.getOrCreateRoom()
		await this.refresh()
		await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS)
	}

	// --- WebSocket Hibernation API handlers ---

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const attachment = getAttachment(ws)
		if (!attachment) return

		this.sessionIdToWs.set(attachment.sessionId, ws)
		this.getOrCreateRoom().handleSocketMessage(attachment.sessionId, message)
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const attachment = getAttachment(ws)
		if (!attachment) return

		this.sessionIdToWs.delete(attachment.sessionId)

		const room = this.getOrCreateRoom()

		// If the DO was hibernating, this session was never re-added to the room
		// (ctx.getWebSockets() doesn't include the disconnecting socket). Resume it
		// briefly so the room can broadcast presence removal to other clients.
		if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionId)) {
			room.handleSocketResume({
				sessionId: attachment.sessionId,
				socket: ws,
				snapshot: attachment.snapshot,
			})
		}

		room[method](attachment.sessionId)
	}
}

function liveDataMessage(state: LiveDataState): LiveDataMessage {
	return { type: 'live-data', state }
}

/** True if the two states would look the same to a client. */
function sameLiveData(a: LiveDataState, b: LiveDataState) {
	return JSON.stringify(a) === JSON.stringify(b)
}

function isConnectMessage(stringified: string) {
	// Cheap pre-check so ordinary document pushes aren't parsed twice.
	if (!stringified.includes('"connect"')) return false
	try {
		return JSON.parse(stringified)?.type === 'connect'
	} catch {
		return false
	}
}
