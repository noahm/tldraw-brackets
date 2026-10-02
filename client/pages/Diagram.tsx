import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Tldraw, useValue, type Editor, type TLComponents } from 'tldraw'
import { diagramSourcePath } from '../../shared/routes'
import {
	editLink,
	editTokenFor,
	forgetEditToken,
	obsLink,
	rememberDiagram,
	viewLink,
} from '../access'
import { BracketPanel } from '../bracket/BracketPanel'
import { BracketStylePanel } from '../bracket/PlayerColorsSection'
import { createBookmarkPreviewer } from '../getBookmarkPreview'
import { LiveDataPanel } from '../live/LiveDataPanel'
import { LiveDataProvider, useLiveData, useNewLiveDataStore } from '../live/liveDataStore'
import { SourceControls } from '../live/SourceControls'
import { PaletteEditor } from '../palette/PaletteEditor'
import { initialThemes } from '../palette/paletteTheme'
import { usePalette } from '../palette/usePalette'
import { assetUrls, licenseKey, shapeUtils } from '../tldrawConfig'
import { useDiagramStore } from '../useDiagramStore'
import { VersionsPanel } from '../versions/VersionsPanel'

const components: TLComponents = { TopPanel: BracketPanel, StylePanel: BracketStylePanel }

/**
 * /d/:id (view, or edit if this browser holds the edit token) and /d/:id/edit#token (an edit
 * link: the token is remembered, then dropped from the address bar).
 */
export function Diagram() {
	const { diagramId = '' } = useParams<{ diagramId: string }>()
	// The router keeps this page mounted when only the id changes; start fresh for each diagram so
	// one diagram's edit token can never be used for another.
	return <DiagramPage key={diagramId} diagramId={diagramId} />
}

function DiagramPage({ diagramId }: { diagramId: string }) {
	const location = useLocation()
	const navigate = useNavigate()
	const [editToken, setEditToken] = useState(() => {
		const fromLink = location.pathname.endsWith('/edit') ? location.hash.slice(1) : ''
		if (fromLink) rememberDiagram(diagramId, { editToken: fromLink })
		return fromLink || editTokenFor(diagramId)
	})
	const exists = useDiagramExists(diagramId)

	useEffect(() => {
		if (location.pathname.endsWith('/edit')) navigate(`/d/${diagramId}`, { replace: true })
	}, [diagramId, location.pathname, navigate])

	if (exists === null) return null
	if (!exists) return <DiagramNotFound />
	return (
		<DiagramEditor
			diagramId={diagramId}
			editToken={editToken}
			onEditTokenRejected={() => {
				forgetEditToken(diagramId)
				setEditToken(null)
			}}
		/>
	)
}

function useDiagramExists(diagramId: string) {
	const [exists, setExists] = useState<boolean | null>(null)
	useEffect(() => {
		let cancelled = false
		fetch(diagramSourcePath(diagramId)).then(
			(response) => !cancelled && setExists(response.status !== 404),
			// Offline or similar: let the sync client deal with it rather than claiming "not found".
			() => !cancelled && setExists(true)
		)
		return () => {
			cancelled = true
		}
	}, [diagramId])
	return exists
}

function DiagramEditor({
	diagramId,
	editToken,
	onEditTokenRejected,
}: {
	diagramId: string
	editToken: string | null
	onEditTokenRejected(): void
}) {
	const liveData = useNewLiveDataStore()
	const [editor, setEditor] = useState<Editor | null>(null)
	const { palette, overrides } = usePalette(editor)
	const store = useDiagramStore({ diagramId, editToken, liveData, onEditTokenRejected })
	const bookmarkPreviewer = useMemo(
		() => createBookmarkPreviewer(diagramId, editToken),
		[diagramId, editToken]
	)

	return (
		<LiveDataProvider store={liveData}>
			<RememberDiagram diagramId={diagramId} />
			<DiagramWrapper
				diagramId={diagramId}
				editor={editor}
				editToken={editToken}
				toolbar={
					editor &&
					editToken && (
						<>
							<PaletteEditor editor={editor} palette={palette} />
							<VersionsPanel diagramId={diagramId} editToken={editToken} />
						</>
					)
				}
			>
				<Tldraw
					licenseKey={licenseKey}
					assetUrls={assetUrls}
					// we can pass the connected store into the Tldraw component which will handle
					// loading states & enable multiplayer UX like cursors & a presence menu
					store={store}
					shapeUtils={shapeUtils}
					components={components}
					themes={initialThemes}
					colorScheme="system"
					overrides={overrides}
					options={{ deepLinks: true }}
					onMount={(editor) => {
						// when the editor is ready, we need to register our bookmark unfurling service
						editor.registerExternalAssetHandler('url', bookmarkPreviewer)
						// handy for poking at the editor from devtools (and browser tests)
						if (import.meta.env.DEV) Object.assign(window, { editor })
						setEditor(editor)
						return () => setEditor(null)
					}}
				/>
			</DiagramWrapper>
		</LiveDataProvider>
	)
}

/** Keeps this browser's list of diagrams up to date, titled after their tournaments. */
function RememberDiagram({ diagramId }: { diagramId: string }) {
	const title = useLiveData()?.graph?.title
	useEffect(() => rememberDiagram(diagramId, title ? { title } : {}), [diagramId, title])
	return null
}

function DiagramWrapper({
	children,
	diagramId,
	editor,
	editToken,
	toolbar,
}: {
	children: ReactNode
	diagramId: string
	editor: Editor | null
	editToken: string | null
	toolbar?: ReactNode
}) {
	const [showLiveData, setShowLiveData] = useState(false)
	const title = useLiveData()?.graph?.title

	return (
		<div className="DiagramWrapper">
			<div className="DiagramWrapper-header">
				<Link to="/" className="DiagramWrapper-home" aria-label="all diagrams">
					<BrandMark />
				</Link>
				<div className="DiagramWrapper-title">{title ?? diagramId}</div>
				{!editToken && <span className="DiagramWrapper-badge">View only</span>}
				<CopyButton text={viewLink(diagramId)}>View link</CopyButton>
				{editToken && (
					<>
						<CopyButton text={editLink(diagramId, editToken)}>Edit link</CopyButton>
						{editor && <ObsLinkButton editor={editor} diagramId={diagramId} />}
						<SourceControls diagramId={diagramId} editToken={editToken} />
					</>
				)}
				{toolbar}
				<button
					className="DiagramWrapper-copy"
					aria-pressed={showLiveData}
					onClick={() => setShowLiveData((v) => !v)}
				>
					{showLiveData ? 'Hide data' : 'Show data'}
				</button>
			</div>
			<div className="DiagramWrapper-content">
				{children}
				{showLiveData && <LiveDataPanel />}
			</div>
		</div>
	)
}

/** OBS link for the selected frame, or for the whole diagram when no frame is selected. */
function ObsLinkButton({ editor, diagramId }: { editor: Editor; diagramId: string }) {
	const frameName = useValue(
		'selected frame name',
		() => {
			const shape = editor.getOnlySelectedShape()
			return shape?.type === 'frame'
				? (shape.props as { name: string }).name || undefined
				: undefined
		},
		[editor]
	)
	return (
		<CopyButton text={obsLink(diagramId, frameName)}>
			{frameName ? `OBS link: “${frameName}”` : 'OBS link'}
		</CopyButton>
	)
}

function CopyButton({ text, children }: { text: string; children: ReactNode }) {
	const [didCopy, setDidCopy] = useState(false)
	useEffect(() => {
		if (!didCopy) return
		const timeout = setTimeout(() => setDidCopy(false), 2000)
		return () => clearTimeout(timeout)
	}, [didCopy])

	return (
		<button
			className="DiagramWrapper-copy"
			data-copy-text={text}
			onClick={() => {
				navigator.clipboard.writeText(text)
				setDidCopy(true)
			}}
		>
			{children}
			{didCopy && <div className="DiagramWrapper-copied">Copied!</div>}
		</button>
	)
}

function DiagramNotFound() {
	return (
		<div className="Message">
			<h1>Diagram not found</h1>
			<p>
				Check the link, or <Link to="/">start a new diagram</Link>.
			</p>
		</div>
	)
}

// The brand mark (client/brand), inlined so its strokes follow the header's text color.
function BrandMark() {
	return (
		<svg viewBox="0 0 64 64" width={20} height={20} aria-hidden="true">
			<g
				fill="none"
				stroke="currentColor"
				strokeWidth="4"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M4 9C7 8 10 10 14 9C15 12 13 16 14 19C10 18 7 20 4 19" />
				<path d="M4 45C7 46 10 44 14 45C15 48 13 52 14 55C10 54 7 56 4 55" />
				<path d="M14 14C18 13 22 15 26 14C27 24 25 40 26 50C22 51 18 49 14 50" />
				<path d="M26 32C28 31 30 33 33 32" />
				<path
					d="M33 26C36 25 39 27 43 26C43 22 42 19 43 16C49 21 56 27 61 32C55 37 49 43 43 48C42 45 43 42 43 38C39 39 36 37 33 38C34 34 32 30 33 26Z"
					fill="#7F77DD"
				/>
			</g>
		</svg>
	)
}
