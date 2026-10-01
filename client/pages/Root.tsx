import { Navigate } from 'react-router-dom'
import { uniqueId } from 'tldraw'
import { getLocalStorageItem, setLocalStorageItem } from '../localStorage'

// Placeholder until diagrams are created through /api/diagrams (with edit links):
// reopen the last diagram this browser used, or start a new one.
const myLocalDiagramId = getLocalStorageItem('my-local-diagram-id') ?? uniqueId()
setLocalStorageItem('my-local-diagram-id', myLocalDiagramId)

export function Root() {
	return <Navigate to={`/d/${myLocalDiagramId}`} />
}
