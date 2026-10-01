import { useSync } from '@tldraw/sync'
import { ReactNode, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Tldraw } from 'tldraw'
import { diagramConnectPath } from '../../shared/routes'
import { getBookmarkPreview } from '../getBookmarkPreview'
import { multiplayerAssetStore } from '../multiplayerAssetStore'

// Unset in local dev, where tldraw needs no key. Production builds require one
// (a free hobby key is fine) or the editor stops rendering after a few seconds.
const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY

export function Diagram() {
	const { diagramId = '' } = useParams<{ diagramId: string }>()

	// Create a store connected to multiplayer.
	const store = useSync({
		// We need to know the websockets URI...
		uri: `${window.location.origin}${diagramConnectPath(diagramId)}`,
		// ...and how to handle static assets like images & videos
		assets: multiplayerAssetStore,
	})

	return (
		<DiagramWrapper diagramId={diagramId}>
			<Tldraw
				licenseKey={licenseKey}
				// we can pass the connected store into the Tldraw component which will handle
				// loading states & enable multiplayer UX like cursors & a presence menu
				store={store}
				options={{ deepLinks: true }}
				onMount={(editor) => {
					// when the editor is ready, we need to register our bookmark unfurling service
					editor.registerExternalAssetHandler('url', getBookmarkPreview)
				}}
			/>
		</DiagramWrapper>
	)
}

function DiagramWrapper({ children, diagramId }: { children: ReactNode; diagramId: string }) {
	const [didCopy, setDidCopy] = useState(false)

	useEffect(() => {
		if (!didCopy) return
		const timeout = setTimeout(() => setDidCopy(false), 3000)
		return () => clearTimeout(timeout)
	}, [didCopy])

	return (
		<div className="DiagramWrapper">
			<div className="DiagramWrapper-header">
				<WifiIcon />
				<div>{diagramId}</div>
				<button
					className="DiagramWrapper-copy"
					onClick={() => {
						navigator.clipboard.writeText(window.location.href)
						setDidCopy(true)
					}}
					aria-label="copy diagram link"
				>
					Copy link
					{didCopy && <div className="DiagramWrapper-copied">Copied!</div>}
				</button>
			</div>
			<div className="DiagramWrapper-content">{children}</div>
		</div>
	)
}

function WifiIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			strokeWidth="1.5"
			stroke="currentColor"
			width={16}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"
			/>
		</svg>
	)
}
