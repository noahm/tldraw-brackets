import { AssetRecordType, TLAsset, TLBookmarkAsset, getHashForString } from 'tldraw'
import { diagramUnfurlPath } from '../shared/routes'
import { authHeaders } from './access'

// How does our server handle bookmark unfurling? Only editors can ask, as it makes the server
// fetch arbitrary URLs.
export function createBookmarkPreviewer(diagramId: string, editToken: string | null) {
	return ({ url }: { url: string }) => getBookmarkPreview(url, diagramId, editToken)
}

async function getBookmarkPreview(
	url: string,
	diagramId: string,
	editToken: string | null
): Promise<TLAsset> {
	// we start with an empty asset record
	const asset: TLBookmarkAsset = {
		id: AssetRecordType.createId(getHashForString(url)),
		typeName: 'asset',
		type: 'bookmark',
		meta: {},
		props: {
			src: url,
			description: '',
			image: '',
			favicon: '',
			title: '',
		},
	}

	try {
		// try to fetch the preview data from the server
		const response = await fetch(diagramUnfurlPath(diagramId, url), {
			headers: authHeaders(editToken),
		})
		const data: any = await response.json()

		// fill in our asset with whatever info we found
		asset.props.description = data?.description ?? ''
		asset.props.image = data?.image ?? ''
		asset.props.favicon = data?.favicon ?? ''
		asset.props.title = data?.title ?? ''

		// carry the social image's dimensions on `meta` so embeds (e.g. Vimeo/YouTube) can size
		// themselves to the content's real aspect ratio instead of staying letterboxed
		if (typeof data?.imageWidth === 'number') asset.meta.imageWidth = data.imageWidth
		if (typeof data?.imageHeight === 'number') asset.meta.imageHeight = data.imageHeight
	} catch (e) {
		console.error(e)
	}

	return asset
}
