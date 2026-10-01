import { TLAssetStore, uniqueId } from 'tldraw'
import { diagramUploadPath, uploadDownloadPath } from '../shared/routes'
import { authHeaders } from './access'

// How does our server handle assets like images and videos? Uploading needs the diagram's edit
// token; the uploaded files are public, like the diagrams that show them.
export function createAssetStore(diagramId: string, editToken: string | null): TLAssetStore {
	return {
		// to upload an asset, we...
		async upload(_asset, file) {
			// ...create a unique name...
			const objectName = `${uniqueId()}-${file.name}`.replace(/[^a-zA-Z0-9.]/g, '-')

			// ...POST it to our worker to upload it...
			const response = await fetch(diagramUploadPath(diagramId, objectName), {
				method: 'POST',
				headers: authHeaders(editToken),
				body: file,
			})

			if (!response.ok) {
				throw new Error(`Failed to upload asset: ${response.statusText}`)
			}

			// ...and return the URL to be stored with the asset record.
			return { src: uploadDownloadPath(objectName) }
		},

		// to retrieve an asset, we can just use the same URL. you could customize this to add extra
		// auth, or to serve optimized versions / sizes of the asset.
		resolve(asset) {
			return asset.props.src
		},
	}
}
