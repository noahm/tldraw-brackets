import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DIAGRAMS_PATH } from '../../shared/routes'
import { knownDiagrams, rememberDiagram } from '../access'
import lockupDark from '../brand/lockup-horizontal-dark.svg'
import lockupLight from '../brand/lockup-horizontal-light.svg'

const MATCHES = [
	{
		x: 0,
		y: 14,
		title: 'Semifinal 1',
		status: 'complete',
		a: ['Starlight', '3', true],
		b: ['Kestrel', '1', false],
	},
	{
		x: 0,
		y: 134,
		title: 'Semifinal 2',
		status: 'complete',
		a: ['Juno', '2', false],
		b: ['Nova', '3', true],
	},
	{
		x: 290,
		y: 74,
		title: 'Final',
		status: 'live',
		a: ['Starlight', '1', false],
		b: ['Nova', '0', false],
	},
] as const

// A static picture of what a diagram looks like, drawn with the page's own theme colors.
function ExampleBracket() {
	return (
		<figure className="Home-example">
			<svg
				viewBox="0 0 490 230"
				role="img"
				aria-label="Example bracket: two semifinals feeding a live final"
			>
				<defs>
					<marker
						id="Home-example-arrowhead"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="8"
						markerHeight="8"
						orient="auto"
					>
						<path className="Home-example-arrowhead" d="M 1 1 L 9 5 L 1 9" />
					</marker>
				</defs>
				<path
					className="Home-example-edge"
					markerEnd="url(#Home-example-arrowhead)"
					d="M 200 52 Q 233 86 279 100"
				/>
				<path
					className="Home-example-edge"
					markerEnd="url(#Home-example-arrowhead)"
					d="M 200 172 Q 233 138 279 124"
				/>
				{MATCHES.map((m) => (
					<g key={m.title} transform={`translate(${m.x} ${m.y})`}>
						<rect className="Home-example-card" width="200" height="76" rx="8" />
						<text className="Home-example-title" x="12" y="20">
							{m.title}
						</text>
						<text
							className="Home-example-status"
							data-status={m.status}
							x="188"
							y="20"
							textAnchor="end"
						>
							{m.status === 'live' ? '● live' : 'complete'}
						</text>
						{[m.a, m.b].map(([name, score, won], i) => (
							<g key={i} className="Home-example-row" data-won={won}>
								<text x="12" y={44 + i * 22}>
									{name}
								</text>
								<text x="188" y={44 + i * 22} textAnchor="end">
									{score}
								</text>
							</g>
						))}
					</g>
				))}
			</svg>
			<figcaption>
				A simulated example. You may manually lay out, colorize, and annotate yours however you
				please. For a complete example, see this{' '}
				<Link to="/d/8qJNGnlEykZC">hand-crafted Redshift Encore SMX Full bracket</Link>.
			</figcaption>
		</figure>
	)
}

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
		<div className="Home">
			<h1 className="Home-wordmark">
				<picture>
					<source srcSet={lockupDark} media="(prefers-color-scheme: dark)" />
					<img src={lockupLight} alt="DDR Tools Brackets" width="249" height="87" />
				</picture>
			</h1>
			<p className="Home-lead">
				Turn your tournament's bracket into a <a href="https://www.tldraw.com/">tldraw</a> diagram
				you can lay out and style however you like, effortlessly show them off on stream, and have
				them stay updated live as matches are played.
			</p>
			<p>
				This tool can visualize brackets on either{' '}
				<a href="https://www.blamethepads.com/">Blame the Pads</a> or{' '}
				<a href="https://www.start.gg/">start.gg</a>. Provide a link to a tournament and have its
				matches, players, scores and statuses stay up to date even as you manually adjust layout and
				styles.
			</p>
			<button className="Home-create" onClick={create} disabled={creating}>
				Create diagram
			</button>
			<ExampleBracket />
			<h2>Made with streaming in mind</h2>
			<p>
				Every diagram provides an OBS link: a transparent, interface-free view you can drop into OBS
				as a browser source. OBS links use dark-mode by default, and update in real time along with
				any changes. Add frames to your diagram to create additional "local" OBS links constrained
				to just that area.
			</p>
			{error && <p className="Home-error">{error}</p>}
			{diagrams.length > 0 && (
				<>
					<h2>Your recently visited diagrams</h2>
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
			<footer>
				Yet another project of Noah "Cathadan" Manneschmidt, with brainstorming support from
				ZephyrGlaze
				<br />
				<a href="https://github.com/noahm/tldraw-brackets">source</a>
			</footer>
		</div>
	)
}
