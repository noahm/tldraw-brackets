import { getLocalStorageItem, setLocalStorageItem } from './localStorage'

// Edit tokens this browser holds, and the diagrams it has seen. An edit link (/d/:id/edit#token)
// is remembered here and then dropped from the address bar, so it isn't left on screen (or on
// stream) and plain /d/:id links keep working as edit links in this browser.

const STORAGE_KEY = 'tldraw-brackets:diagrams'

export interface KnownDiagram {
	id: string
	title?: string
	editToken?: string
	lastOpened: number
}

function load(): Record<string, KnownDiagram> {
	try {
		return JSON.parse(getLocalStorageItem(STORAGE_KEY) ?? '{}')
	} catch {
		return {}
	}
}

function update(id: string, change: Partial<KnownDiagram>) {
	const all = load()
	all[id] = { ...all[id], ...change, id, lastOpened: Date.now() }
	setLocalStorageItem(STORAGE_KEY, JSON.stringify(all))
}

export function knownDiagrams(): KnownDiagram[] {
	return Object.values(load()).sort((a, b) => b.lastOpened - a.lastOpened)
}

export function editTokenFor(id: string): string | null {
	return load()[id]?.editToken ?? null
}

export function rememberDiagram(id: string, change: Partial<KnownDiagram> = {}) {
	update(id, change)
}

/** Stop treating this browser as an editor of the diagram (e.g. its token was rejected). */
export function forgetEditToken(id: string) {
	update(id, { editToken: undefined })
}

export function viewLink(id: string) {
	return `${window.location.origin}/d/${id}`
}

export function editLink(id: string, token: string) {
	return `${window.location.origin}/d/${id}/edit#${token}`
}

export function obsLink(id: string, frameName?: string) {
	const query = frameName ? `?frame=${encodeURIComponent(frameName)}` : ''
	return `${window.location.origin}/d/${id}/obs${query}`
}

export function authHeaders(token: string | null): Record<string, string> {
	return token ? { authorization: `Bearer ${token}` } : {}
}
