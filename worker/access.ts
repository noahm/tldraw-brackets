// Edit links: each diagram has one secret edit token, handed out once when the diagram is
// created. The diagram's DiagramRoom keeps only its SHA-256 hash.
//
// Browsers can't put headers on a WebSocket, so to keep tokens out of request URLs (and logs),
// an editor first trades its token (sent in a header) for a short-lived, single-use ticket, and
// connects with that instead.

export const TICKET_TTL_MS = 60_000

/** 32 random bytes, base64url: unguessable and safe in a URL fragment. */
export function newEditToken(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

/** Short, URL-friendly, and random enough that ids can't be enumerated. */
export function newDiagramId(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(9)))
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
	return base64url(new Uint8Array(digest))
}

/** Compares two hashes in time independent of where they differ. */
export function sameHash(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	let difference = 0
	for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return difference === 0
}

/** The token from an `Authorization: Bearer <token>` header, if there is one. */
export function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? ''
	const match = header.match(/^Bearer\s+(\S+)$/i)
	return match ? match[1] : null
}

function base64url(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
