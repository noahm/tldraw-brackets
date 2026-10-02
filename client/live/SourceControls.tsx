import { startTransition, useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { LiveDataState } from '../../shared/liveData'
import { diagramSourcePath } from '../../shared/routes'
import { describeSource, parseSourceInput } from '../../shared/source'
import { authHeaders } from '../access'
import { useLiveData } from './liveDataStore'

// Where the diagram's tournament data comes from. Editors only: the server checks the token.

const FIXTURES = ['de4-midway', 'de4-late', 'startgg-de4']

export function SourceControls({ diagramId, editToken }: { diagramId: string; editToken: string }) {
	const [value, setValue] = useState('')

	// The server reads the new source before replying, which can take a few seconds.
	const [error, setSource, saving] = useActionState(
		async (_previous: string | null, form: FormData): Promise<string | null> => {
			const source = parseSourceInput(String(form.get('source') ?? ''))
			if (!source) {
				return 'Enter a Blame the Pads tourney id or URL, a start.gg event or bracket URL, or fixture:<name>'
			}
			// An action that throws reaches the nearest error boundary, so every failure is caught here.
			try {
				// The new state also arrives over the sync connection, but the reply says whether the
				// first read worked, which otherwise only shows in the data panel.
				const response = await fetch(diagramSourcePath(diagramId), {
					method: 'PUT',
					headers: { 'content-type': 'application/json', ...authHeaders(editToken) },
					body: JSON.stringify(source),
				})
				if (!response.ok) return `${response.status} ${await response.text()}`
				const state = (await response.json()) as LiveDataState
				if (state.error) return `Couldn't read the source: ${state.error.message}`
			} catch (e) {
				return e instanceof Error ? e.message : String(e)
			}
			// Updates after an await aren't part of the action unless wrapped again.
			startTransition(() => setValue(''))
			return null
		},
		null
	)

	return (
		<form className="SourceControls" action={setSource} aria-busy={saving}>
			<SourceStatus />
			<input
				name="source"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="tourney id, BTP or start.gg URL"
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
				{saving ? 'Loading…' : 'Set source'}
			</button>
			{/* the last attempt's error stays in state until the next one finishes */}
			{error && !saving && <span className="SourceControls-error">{error}</span>}
		</form>
	)
}

/** The current source, or the one being set while the form is submitting. */
function SourceStatus() {
	const live = useLiveData()
	const { pending, data } = useFormStatus()
	const loading = pending && data ? parseSourceInput(String(data.get('source') ?? '')) : null

	const label = loading
		? `Loading ${describeSource(loading)}…`
		: live === null
			? 'Connecting…'
			: live.source
				? describeSource(live.source)
				: 'No source'

	return (
		<span className="SourceControls-current" role="status">
			{pending && <span className="Spinner" aria-hidden="true" />}
			<span className="SourceControls-label" title={label}>
				{label}
			</span>
		</span>
	)
}
