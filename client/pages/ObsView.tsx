import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
	CollaboratorBrushOverlayUtil,
	CollaboratorHintOverlayUtil,
	CollaboratorScribbleOverlayUtil,
	CollaboratorShapeIndicatorOverlayUtil,
	Tldraw,
	useValue,
	type Editor,
	type TLComponents,
	type TLFrameShape,
} from 'tldraw'
import { LiveDataProvider, useNewLiveDataStore } from '../live/liveDataStore'
import { initialThemes } from '../palette/paletteTheme'
import { usePalette } from '../palette/usePalette'
import { assetUrls, licenseKey, shapeUtils } from '../tldrawConfig'
import { useDiagramStore } from '../useDiagramStore'

// Editors' cursors, selections, brushes and scribbles have no place on stream. Each of these
// replaces tldraw's overlay util of the same type, and is never active.
class HiddenCollaboratorBrush extends CollaboratorBrushOverlayUtil {
	override isActive() {
		return false
	}
}
class HiddenCollaboratorHint extends CollaboratorHintOverlayUtil {
	override isActive() {
		return false
	}
}
class HiddenCollaboratorScribble extends CollaboratorScribbleOverlayUtil {
	override isActive() {
		return false
	}
}
class HiddenCollaboratorShapeIndicator extends CollaboratorShapeIndicatorOverlayUtil {
	override isActive() {
		return false
	}
}
const hiddenCollaboratorOverlays = [
	HiddenCollaboratorBrush,
	HiddenCollaboratorHint,
	HiddenCollaboratorScribble,
	HiddenCollaboratorShapeIndicator,
]
const components: TLComponents = { CollaboratorCursor: null }

/**
 * /d/:id/obs?frame=<frame name>: the diagram for an OBS browser source. Read-only, no UI, a
 * transparent background, and the camera locked onto the named frame (or the whole diagram),
 * following it if editors move or resize it.
 */
export function ObsView() {
	const { diagramId = '' } = useParams<{ diagramId: string }>()
	const [searchParams] = useSearchParams()
	const frameName = searchParams.get('frame')
	const liveData = useNewLiveDataStore()
	const store = useDiagramStore({ diagramId, editToken: null, liveData })
	const [editor, setEditor] = useState<Editor | null>(null)
	usePalette(editor)

	useEffect(() => {
		document.documentElement.classList.add('obs')
		return () => document.documentElement.classList.remove('obs')
	}, [])

	return (
		<LiveDataProvider store={liveData}>
			<div className="ObsView">
				<Tldraw
					hideUi
					licenseKey={licenseKey}
					assetUrls={assetUrls}
					store={store}
					shapeUtils={shapeUtils}
					themes={initialThemes}
					components={components}
					overlayUtils={hiddenCollaboratorOverlays}
					onMount={(editor) => {
						if (import.meta.env.DEV) Object.assign(window, { editor })
						setEditor(editor)
						return () => setEditor(null)
					}}
				/>
				{editor && <FollowFrame editor={editor} frameName={frameName} />}
			</div>
		</LiveDataProvider>
	)
}

function FollowFrame({ editor, frameName }: { editor: Editor; frameName: string | null }) {
	// As a string, so moving anything else on the canvas doesn't re-zoom.
	const target = useValue(
		'obs target bounds',
		() => {
			const frame = frameName
				? editor
						.getCurrentPageShapes()
						.find(
							(s): s is TLFrameShape =>
								s.type === 'frame' && (s as TLFrameShape).props.name === frameName
						)
				: undefined
			const bounds = frame ? editor.getShapePageBounds(frame) : editor.getCurrentPageBounds()
			return bounds ? JSON.stringify(bounds.toJson()) : null
		},
		[editor, frameName]
	)

	useEffect(() => {
		if (!target) return
		const fit = () => {
			editor.setCameraOptions({ isLocked: false })
			editor.zoomToBounds(JSON.parse(target), { inset: 0, immediate: true })
			editor.setCameraOptions({ isLocked: true })
		}
		fit()
		window.addEventListener('resize', fit)
		return () => window.removeEventListener('resize', fit)
	}, [editor, target])

	return null
}
