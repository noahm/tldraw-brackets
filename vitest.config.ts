import { defineConfig } from 'vitest/config'

// Unit tests are plain Node. Kept separate from vite.config.ts so the Cloudflare plugin
// (which runs the worker in workerd) isn't involved.
export default defineConfig({
	test: {
		include: ['{client,shared,worker}/**/*.test.ts'],
	},
})
