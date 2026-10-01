import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import { AutoRouter, error, IRequest } from 'itty-router'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'

import { DIAGRAM_ID_PATTERN } from '../shared/routes'

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
	// each diagram's realtime websocket sync is handled by its own Durable Object
	.get('/api/diagrams/:diagramId/connect', forwardToDiagramRoom)

	// which tournament a diagram shows, and the live data read from it
	.get('/api/diagrams/:diagramId/source', forwardToDiagramRoom)
	.put('/api/diagrams/:diagramId/source', forwardToDiagramRoom)

	// assets can be uploaded to the bucket under /uploads:
	.post('/api/uploads/:uploadId', handleAssetUpload)

	// they can be retrieved from the bucket too:
	.get('/api/uploads/:uploadId', handleAssetDownload)

	// bookmarks need to extract metadata from pasted URLs:
	.get('/api/unfurl', handleUnfurlRequest)
	.all('*', () => {
		return new Response('Not found', { status: 404 })
	})

function forwardToDiagramRoom(request: IRequest, env: Env) {
	const { diagramId } = request.params
	if (!DIAGRAM_ID_PATTERN.test(diagramId)) return error(400, 'Invalid diagram id')
	const room = env.DIAGRAM_ROOM.get(env.DIAGRAM_ROOM.idFromName(diagramId))
	return room.fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body,
	})
}

export default {
	fetch: router.fetch,
}
