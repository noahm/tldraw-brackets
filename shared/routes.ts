// URL shapes shared by the worker and the client, so the two can't drift apart.

/** Diagram ids appear in URLs and Durable Object names; keep them boring. */
export const DIAGRAM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function diagramConnectPath(diagramId: string) {
	return `/api/diagrams/${diagramId}/connect`
}
