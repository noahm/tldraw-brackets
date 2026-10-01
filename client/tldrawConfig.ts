import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { MatchCardShapeUtil } from './bracket/MatchCardShapeUtil'

// What every page rendering a diagram gives tldraw.

// Unset in local dev, where tldraw needs no key. Production builds require one
// (a free hobby key is fine) or the editor stops rendering after a few seconds.
export const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY

// tldraw's fonts, icons and translations, bundled by Vite and served from our own worker rather
// than cdn.tldraw.com. Keeps them in lockstep with the SDK version and works without the CDN.
export const assetUrls = getAssetUrlsByImport()

export const shapeUtils = [MatchCardShapeUtil]
