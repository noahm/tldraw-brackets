// URL shapes shared by the worker and the client, so the two can't drift apart.

/** Diagram ids appear in URLs and Durable Object names; keep them boring. */
export const DIAGRAM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function diagramConnectPath(diagramId: string) {
	return `/api/diagrams/${diagramId}/connect`
}

/** GET the current LiveDataState; PUT a DiagramSource to change where data comes from */
export function diagramSourcePath(diagramId: string) {
	return `/api/diagrams/${diagramId}/source`
}

/** POST to create a diagram; the response has its id and edit token */
export const DIAGRAMS_PATH = '/api/diagrams'

/** POST with the edit token as a bearer token for a single-use editing connection ticket */
export function diagramTicketPath(diagramId: string) {
	return `/api/diagrams/${diagramId}/tickets`
}

export function diagramUploadPath(diagramId: string, uploadId: string) {
	return `/api/diagrams/${diagramId}/uploads/${uploadId}`
}

/** Where uploaded assets are served from, publicly */
export function uploadDownloadPath(uploadId: string) {
	return `/api/uploads/${uploadId}`
}

export function diagramUnfurlPath(diagramId: string, url: string) {
	return `/api/diagrams/${diagramId}/unfurl?url=${encodeURIComponent(url)}`
}

/** GET to list a diagram's saved versions, POST ({ label? }) to save one; editors only */
export function diagramVersionsPath(diagramId: string) {
	return `/api/diagrams/${diagramId}/versions`
}

/** GET to download a saved version as JSON; POST to `${path}/restore` to restore it */
export function diagramVersionPath(diagramId: string, versionId: string) {
	return `/api/diagrams/${diagramId}/versions/${versionId}`
}

/** GET to download the diagram as it is now, as JSON */
export function diagramExportPath(diagramId: string) {
	return `/api/diagrams/${diagramId}/export`
}
