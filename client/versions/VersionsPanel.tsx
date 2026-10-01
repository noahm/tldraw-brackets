import { FormEvent, useCallback, useEffect, useState } from 'react'
import { diagramExportPath, diagramVersionPath, diagramVersionsPath } from '../../shared/routes'
import { VERSION_LABEL_MAX_LENGTH, type DiagramVersion } from '../../shared/versions'
import { authHeaders } from '../access'

// Saved versions of the diagram: save one, download one, or restore one. Automatic versions are
// saved every 10 minutes while the diagram changes, and when the last editor leaves.

const KIND_LABELS: Record<DiagramVersion['kind'], string> = {
	auto: 'Auto',
	manual: 'Saved',
	'before-restore': 'Before restore',
}

export function VersionsPanel({ diagramId, editToken }: { diagramId: string; editToken: string }) {
	const [open, setOpen] = useState(false)
	const [versions, setVersions] = useState<DiagramVersion[] | null>(null)
	const [label, setLabel] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState<string | null>(null)

	const request = useCallback(
		async (path: string, init: RequestInit = {}) => {
			const response = await fetch(path, {
				...init,
				headers: { ...authHeaders(editToken), ...init.headers },
			})
			if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
			return response
		},
		[editToken]
	)

	const load = useCallback(async () => {
		try {
			setVersions(await (await request(diagramVersionsPath(diagramId))).json())
		} catch (e) {
			setMessage(errorMessage(e))
		}
	}, [diagramId, request])

	useEffect(() => {
		if (open) load()
	}, [open, load])

	async function run(action: () => Promise<string | void>) {
		setBusy(true)
		setMessage(null)
		try {
			const result = await action()
			if (result) setMessage(result)
			await load()
		} catch (e) {
			setMessage(errorMessage(e))
		} finally {
			setBusy(false)
		}
	}

	function save(e: FormEvent) {
		e.preventDefault()
		run(async () => {
			await request(diagramVersionsPath(diagramId), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label }),
			})
			setLabel('')
			return 'Version saved.'
		})
	}

	function restore(version: DiagramVersion) {
		const when = new Date(version.createdAt).toLocaleString()
		if (!window.confirm(`Restore the diagram to ${version.label ?? 'the version'} from ${when}?`)) {
			return
		}
		run(async () => {
			await request(`${diagramVersionPath(diagramId, version.id)}/restore`, { method: 'POST' })
			return 'Restored. The current diagram was saved as a version first, in case you need it back.'
		})
	}

	function download(path: string, filename: string) {
		run(async () => {
			const blob = await (await request(path)).blob()
			const link = document.createElement('a')
			link.href = URL.createObjectURL(blob)
			link.download = filename
			link.click()
			URL.revokeObjectURL(link.href)
		})
	}

	return (
		<div className="HeaderPopover">
			<button
				className="DiagramWrapper-copy"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				Versions
			</button>
			{open && (
				<div className="HeaderPopover-panel VersionsPanel" role="dialog" aria-label="Versions">
					<form onSubmit={save} className="VersionsPanel-save">
						<input
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="Label (optional)"
							maxLength={VERSION_LABEL_MAX_LENGTH}
							aria-label="version label"
							disabled={busy}
						/>
						<button type="submit" disabled={busy}>
							Save version
						</button>
					</form>
					<button
						className="VersionsPanel-link"
						disabled={busy}
						onClick={() => download(diagramExportPath(diagramId), `${diagramId}.json`)}
					>
						Download the diagram as it is now
					</button>
					{message && <p className="VersionsPanel-message">{message}</p>}
					{versions === null ? (
						<p>Loading…</p>
					) : versions.length === 0 ? (
						<p>No versions yet. One is saved automatically every 10 minutes while editing.</p>
					) : (
						<ul className="VersionsPanel-list">
							{versions.map((version) => (
								<li key={version.id} data-testid={`version.${version.id}`}>
									<div>
										<span className="VersionsPanel-kind" data-kind={version.kind}>
											{KIND_LABELS[version.kind]}
										</span>{' '}
										{version.label && <b>{version.label} </b>}
										<span className="VersionsPanel-date">
											{new Date(version.createdAt).toLocaleString()}
										</span>
									</div>
									<div className="VersionsPanel-actions">
										<button
											disabled={busy}
											onClick={() =>
												download(
													diagramVersionPath(diagramId, version.id),
													`${diagramId}-${version.id}.json`
												)
											}
										>
											Download
										</button>
										<button disabled={busy} onClick={() => restore(version)}>
											Restore
										</button>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	)
}

function errorMessage(e: unknown) {
	return `Something went wrong: ${e instanceof Error ? e.message : String(e)}`
}
