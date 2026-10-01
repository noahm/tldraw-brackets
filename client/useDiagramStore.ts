import { useSync } from '@tldraw/sync'
import { useCallback, useMemo } from 'react'
import { diagramConnectPath, diagramTicketPath } from '../shared/routes'
import { diagramSchema } from '../shared/schema'
import { authHeaders } from './access'
import type { LiveDataStore } from './live/liveDataStore'
import { createAssetStore } from './multiplayerAssetStore'
import { initialThemes } from './palette/paletteTheme'

interface DiagramStoreOptions {
	diagramId: string
	/** null to connect read-only, as everyone without the edit link does */
	editToken: string | null
	liveData: LiveDataStore
	/** The server said no to the edit token; the connection falls back to read-only. */
	onEditTokenRejected?(): void
}

/** A tldraw store synced with the diagram's DiagramRoom. */
export function useDiagramStore({
	diagramId,
	editToken,
	liveData,
	onEditTokenRejected,
}: DiagramStoreOptions) {
	// Both are effect dependencies inside useSync, so they must be stable or it would reconnect
	// on every render.
	const assets = useMemo(() => createAssetStore(diagramId, editToken), [diagramId, editToken])
	const uri = useCallback(async () => {
		const connect = `${window.location.origin}${diagramConnectPath(diagramId)}`
		if (!editToken) return connect
		// Called again for every reconnect, so each connection gets a fresh single-use ticket.
		const response = await fetch(diagramTicketPath(diagramId), {
			method: 'POST',
			headers: authHeaders(editToken),
		})
		if (response.status === 403) {
			onEditTokenRejected?.()
			return connect
		}
		if (!response.ok) throw new Error(`Couldn't get an editing ticket: ${response.status}`)
		const { ticket } = (await response.json()) as { ticket: string }
		return `${connect}?ticket=${encodeURIComponent(ticket)}`
		// onEditTokenRejected is a notification only; a new one shouldn't force a reconnect.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [diagramId, editToken])

	return useSync({
		uri,
		assets,
		// Tournament data the server pushes alongside the document.
		onCustomMessageReceived: liveData.receive,
		// The exact schema the server validates against, custom shapes included.
		schema: diagramSchema,
		// Registers the palette's color names before the document (and shapes using them) loads.
		themes: initialThemes,
		// Viewers (and OBS) watch without showing a cursor of their own to editors.
		getUserPresence: editToken ? undefined : () => null,
	})
}
