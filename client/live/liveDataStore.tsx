import { createContext, ReactNode, useContext, useState, useSyncExternalStore } from 'react'
import { isLiveDataMessage, type LiveDataState } from '../../shared/liveData'

// Holds the tournament data the DiagramRoom pushes over the sync connection. Kept outside the
// tldraw store on purpose: live data isn't part of the document.

export class LiveDataStore {
	private state: LiveDataState | null = null
	private readonly listeners = new Set<() => void>()

	/** Pass to useSync's onCustomMessageReceived. */
	receive = (data: unknown) => {
		if (!isLiveDataMessage(data)) return
		this.state = data.state
		for (const listener of this.listeners) listener()
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	getSnapshot = () => this.state
}

const LiveDataContext = createContext<LiveDataStore | null>(null)

export function LiveDataProvider({
	store,
	children,
}: {
	store: LiveDataStore
	children: ReactNode
}) {
	return <LiveDataContext.Provider value={store}>{children}</LiveDataContext.Provider>
}

/** One store per mounted diagram, so switching diagrams never shows the previous one's data. */
export function useNewLiveDataStore() {
	const [store] = useState(() => new LiveDataStore())
	return store
}

/** null until the first message arrives after connecting */
export function useLiveData(): LiveDataState | null {
	const store = useContext(LiveDataContext)
	if (!store) throw new Error('useLiveData must be used inside a LiveDataProvider')
	return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
