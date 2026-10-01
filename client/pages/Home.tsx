import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DIAGRAMS_PATH } from '../../shared/routes'
import { knownDiagrams, rememberDiagram } from '../access'

export function Home() {
	const navigate = useNavigate()
	const [creating, setCreating] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const diagrams = knownDiagrams()

	async function create() {
		setCreating(true)
		setError(null)
		try {
			const response = await fetch(DIAGRAMS_PATH, { method: 'POST' })
			if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
			const { diagramId, editToken } = (await response.json()) as {
				diagramId: string
				editToken: string
			}
			rememberDiagram(diagramId, { editToken })
			navigate(`/d/${diagramId}`)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
			setCreating(false)
		}
	}

	return (
		<div className="Message">
			<h1>tldraw brackets</h1>
			<p>Live tournament brackets you can lay out and style by hand.</p>
			<button className="Home-create" onClick={create} disabled={creating}>
				New diagram
			</button>
			{error && <p className="Home-error">{error}</p>}
			{diagrams.length > 0 && (
				<>
					<h2>Your diagrams</h2>
					<ul className="Home-list">
						{diagrams.map((d) => (
							<li key={d.id}>
								<Link to={`/d/${d.id}`}>{d.title ?? d.id}</Link>
								<span>{d.editToken ? 'can edit' : 'view only'}</span>
							</li>
						))}
					</ul>
					<p className="Home-note">
						Kept in this browser only. Save each diagram's edit link somewhere safe: it's the only
						way to edit from another browser.
					</p>
				</>
			)}
		</div>
	)
}
