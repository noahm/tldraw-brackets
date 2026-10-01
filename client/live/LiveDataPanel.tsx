import type { GraphMatch } from '../../shared/bracketGraph'
import { useLiveData } from './liveDataStore'

// A debug view of the live graph, until cards on the canvas render it (phase 3).

export function LiveDataPanel() {
	const live = useLiveData()
	if (!live) return <div className="LiveDataPanel">Waiting for live data…</div>
	if (!live.source) return <div className="LiveDataPanel">This diagram has no source yet.</div>

	const { graph, error, updatedAt } = live
	const matchesByPhase = new Map<string | undefined, GraphMatch[]>()
	for (const match of graph?.matches ?? []) {
		const list = matchesByPhase.get(match.phaseKey) ?? []
		list.push(match)
		matchesByPhase.set(match.phaseKey, list)
	}
	const titleOf = (key: string) => graph?.matches.find((m) => m.key === key)?.title ?? key

	return (
		<div className="LiveDataPanel" data-testid="live-data-panel">
			{error && (
				<p className="LiveDataPanel-error">
					Source error ({new Date(error.at).toLocaleTimeString()}): {error.message}
				</p>
			)}
			{graph && (
				<>
					<h2>{graph.title}</h2>
					<p className="LiveDataPanel-meta">
						{graph.matches.length} matches · {graph.edges.length} advancements
						{updatedAt && ` · changed ${new Date(updatedAt).toLocaleTimeString()}`}
					</p>
					{[...matchesByPhase].map(([phaseKey, matches]) => (
						<section key={phaseKey ?? 'none'}>
							<h3>{graph.phases.find((p) => p.key === phaseKey)?.name ?? 'Ungrouped'}</h3>
							{matches.map((match) => (
								<div key={match.key} className="LiveDataPanel-match" data-status={match.status}>
									<div className="LiveDataPanel-matchTitle">
										{match.title} <span>{match.status}</span>
									</div>
									<ol>
										{match.entrants.map((entrant) => (
											<li key={entrant.key}>
												{entrant.name}
												{entrant.seed != null && <small> (seed {entrant.seed})</small>}
												{entrant.placement != null && <b> → #{entrant.placement}</b>}
											</li>
										))}
										{Array.from(
											{ length: Math.max(0, match.capacity - match.entrants.length) },
											(_, i) => (
												<li key={`empty-${i}`} className="LiveDataPanel-empty">
													—
												</li>
											)
										)}
									</ol>
									{graph.edges
										.filter((edge) => edge.from === match.key)
										.map((edge) => (
											<div key={edge.key} className="LiveDataPanel-edge">
												{edge.label ?? 'Advance'} ({edge.rankStart}
												{edge.rankEnd !== edge.rankStart && `–${edge.rankEnd ?? ''}`}) →{' '}
												{titleOf(edge.to)}
											</div>
										))}
								</div>
							))}
						</section>
					))}
				</>
			)}
		</div>
	)
}
