import { useEditor, useValue } from 'tldraw'
import { useLiveData } from '../live/liveDataStore'
import { placeMatches, unplacedMatches } from './placeMatches'

// Offers to put the bracket on the canvas: all of it for a fresh diagram, or just the matches
// that appeared in the source since.

export function BracketPanel() {
	const editor = useEditor()
	const graph = useLiveData()?.graph
	const isReadonly = useValue('readonly', () => editor.getIsReadonly(), [editor])
	const unplaced = useValue('unplaced', () => (graph ? unplacedMatches(editor, graph).length : 0), [
		editor,
		graph,
	])

	if (!graph || isReadonly || !unplaced) return null
	const fresh = unplaced === graph.matches.length

	return (
		<div className="BracketPanel">
			<span>
				{fresh
					? `${graph.title}: ${plural(unplaced, 'match', 'matches')}`
					: `${plural(unplaced, 'match isn’t', 'matches aren’t')} on the diagram yet`}
			</span>
			<button onClick={() => placeMatches(editor, graph)}>
				{fresh ? 'Generate layout' : 'Place them'}
			</button>
		</div>
	)
}

function plural(n: number, one: string, many: string) {
	return `${n} ${n === 1 ? one : many}`
}
