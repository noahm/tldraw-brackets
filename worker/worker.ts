import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import { AutoRouter, error, IRequest, json } from 'itty-router'
import { DIAGRAM_ID_PATTERN } from '../shared/routes'
import { bearerToken, hashToken, newDiagramId, newEditToken } from './access'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'

// make sure our sync durable object is made available to cloudflare
export { DiagramRoom } from './DiagramRoom'

// we use itty-router (https://itty.dev/) to handle routing. the client is served from this same
// worker (see [assets] in wrangler.toml), so no CORS handling is needed.
const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	// create a diagram: the response carries its edit token, the only time it's ever revealed
	.post('/api/diagrams', createDiagram)

	// trade an edit token (in the Authorization header) for a single-use connection ticket
	.post('/api/diagrams/:diagramId/tickets', async (request, env) => {
		const ticket = await diagramRoom(request, env).issueTicket(bearerToken(request))
		return ticket ? { ticket } : error(403, 'Edit link required')
	})

	// each diagram's realtime websocket sync is handled by its own Durable Object
	.get('/api/diagrams/:diagramId/connect', forwardToDiagramRoom)

	// which tournament a diagram shows, and the live data read from it
	.get('/api/diagrams/:diagramId/source', forwardToDiagramRoom)
	.put('/api/diagrams/:diagramId/source', forwardToDiagramRoom)

	// editors can upload images and videos to the bucket...
	.post('/api/diagrams/:diagramId/uploads/:uploadId', requireEditor, handleAssetUpload)
	// ...which anyone can then fetch, as diagrams are public to view
	.get('/api/uploads/:uploadId', handleAssetDownload)

	// editors' pasted links get bookmark previews (editor-only: it fetches arbitrary URLs)
	.get('/api/diagrams/:diagramId/unfurl', requireEditor, handleUnfurlRequest)

	.all('*', () => {
		return new Response('Not found', { status: 404 })
	})

async function createDiagram(_request: IRequest, env: Env) {
	const editToken = newEditToken()
	const tokenHash = await hashToken(editToken)
	// Ids are random enough that a collision is all but impossible, but never hand out a
	// diagram someone else already owns.
	for (let attempt = 0; attempt < 3; attempt++) {
		const diagramId = newDiagramId()
		if (await env.DIAGRAM_ROOM.get(env.DIAGRAM_ROOM.idFromName(diagramId)).claim(tokenHash)) {
			return json({ diagramId, editToken }, { status: 201 })
		}
	}
	return error(500, 'Could not allocate a diagram id')
}

function diagramRoom(request: IRequest, env: Env) {
	const { diagramId } = request.params
	if (!DIAGRAM_ID_PATTERN.test(diagramId)) throw error(400, 'Invalid diagram id')
	return env.DIAGRAM_ROOM.get(env.DIAGRAM_ROOM.idFromName(diagramId))
}

/** Route middleware: continue only for requests carrying the diagram's edit token. */
async function requireEditor(request: IRequest, env: Env) {
	if (!(await diagramRoom(request, env).isEditToken(bearerToken(request)))) {
		return error(403, 'Edit link required')
	}
}

function forwardToDiagramRoom(request: IRequest, env: Env) {
	return diagramRoom(request, env).fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body,
	})
}

export default {
	fetch: router.fetch,
}
