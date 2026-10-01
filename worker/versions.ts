import type { DiagramVersion, DiagramVersionKind } from '../shared/versions'

// Diagram versions in R2, one JSON object per version under the diagram's own prefix. The
// bucket also holds uploads, but those are served from `uploads/` only, so versions are never
// public.

/** Automatic versions kept per diagram; manual ones (and pre-restore copies) are never pruned. */
export const AUTO_VERSIONS_KEPT = 50

export class VersionStore {
	private readonly prefix: string

	constructor(
		private readonly bucket: R2Bucket,
		/** unique per diagram, e.g. its durable object id */
		diagramPrefix: string
	) {
		this.prefix = `versions/${diagramPrefix}/`
	}

	async list(): Promise<DiagramVersion[]> {
		const versions: DiagramVersion[] = []
		let cursor: string | undefined
		do {
			const page = await this.bucket.list({
				prefix: this.prefix,
				cursor,
				include: ['customMetadata'],
			})
			for (const object of page.objects) versions.push(toVersion(object, this.prefix))
			cursor = page.truncated ? page.cursor : undefined
		} while (cursor)
		return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	}

	async save(json: string, kind: DiagramVersionKind, label?: string): Promise<DiagramVersion> {
		const createdAt = new Date()
		// Time first, so ids sort chronologically; the random suffix keeps same-millisecond saves apart.
		const id = `${createdAt.getTime().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
		const object = await this.bucket.put(this.prefix + id + '.json', json, {
			httpMetadata: { contentType: 'application/json' },
			customMetadata: {
				kind,
				createdAt: createdAt.toISOString(),
				...(label ? { label } : {}),
			},
		})
		if (kind === 'auto') await this.pruneAuto()
		return toVersion(object, this.prefix)
	}

	async get(id: string): Promise<string | null> {
		const object = await this.bucket.get(this.prefix + id + '.json')
		return object ? object.text() : null
	}

	private async pruneAuto() {
		const autos = (await this.list()).filter((v) => v.kind === 'auto')
		const stale = autos.slice(AUTO_VERSIONS_KEPT).map((v) => this.prefix + v.id + '.json')
		if (stale.length) await this.bucket.delete(stale)
	}
}

function toVersion(object: R2Object, prefix: string): DiagramVersion {
	const meta = object.customMetadata ?? {}
	return {
		id: object.key.slice(prefix.length).replace(/\.json$/, ''),
		kind: (meta.kind as DiagramVersionKind) ?? 'manual',
		label: meta.label || undefined,
		createdAt: meta.createdAt ?? object.uploaded.toISOString(),
		size: object.size,
	}
}
