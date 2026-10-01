import { FormEvent, useState } from 'react'
import { diagramSourcePath } from '../../shared/routes'
import { describeSource, type DiagramSource } from '../../shared/source'
import { useLiveData } from './liveDataStore'

// Temporary: anyone with the link can change the source until edit links exist (phase 5).

const FIXTURES = ['de4-midway', 'de4-late']

export function SourceControls({ diagramId }: { diagramId: string }) {
	const live = useLiveData()
	const [value, setValue] = useState('')
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState<string | null>(null)

	async function save(source: DiagramSource | null) {
		setSaving(true)
		setSaveError(null)
		try {
			// The new state also arrives over the sync connection, so the response isn't needed.
			const response = await fetch(diagramSourcePath(diagramId), {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(source),
			})
			if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
			setValue('')
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : String(e))
		} finally {
			setSaving(false)
		}
	}

	function onSubmit(e: FormEvent) {
		e.preventDefault()
		const trimmed = value.trim()
		const fixture = trimmed.match(/^fixture:([a-z0-9-]+)$/)
		if (fixture) return save({ kind: 'fixture', name: fixture[1] })
		// accept a bare id, or any pasted Blame the Pads URL within a tourney
		const id = Number((trimmed.match(/\/tourney\/(\d+)/) ?? trimmed.match(/^(\d+)$/))?.[1])
		if (Number.isSafeInteger(id) && id > 0) return save({ kind: 'btp', tourneyId: id })
		setSaveError('Enter a Blame the Pads tourney id or URL, or fixture:<name>')
	}

	return (
		<form className="SourceControls" onSubmit={onSubmit}>
			<span className="SourceControls-current">
				{live === null ? 'Connecting…' : live.source ? describeSource(live.source) : 'No source'}
			</span>
			<input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="tourney id or URL"
				list="source-fixtures"
				aria-label="tournament source"
				disabled={saving}
			/>
			<datalist id="source-fixtures">
				{FIXTURES.map((name) => (
					<option key={name} value={`fixture:${name}`} />
				))}
			</datalist>
			<button type="submit" disabled={saving || !value.trim()}>
				Set source
			</button>
			{saveError && <span className="SourceControls-error">{saveError}</span>}
		</form>
	)
}
