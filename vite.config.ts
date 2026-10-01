import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		plugins: [cloudflare(), react()],
		optimizeDeps: {
			// @tldraw/assets is a list of `?url` imports of its font/icon/translation files. The dev
			// dependency pre-bundler can't resolve those, so let Vite serve the package as-is.
			exclude: ['@tldraw/assets'],
		},
	}
})
