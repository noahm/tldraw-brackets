import { describe, expect, it } from 'vitest'
import { bearerToken, hashToken, newDiagramId, newEditToken, sameHash } from './access'

describe('edit tokens', () => {
	it('are long, random and URL-safe', () => {
		const a = newEditToken()
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(newEditToken()).not.toBe(a)
		expect(newDiagramId()).toMatch(/^[A-Za-z0-9_-]{12}$/)
	})

	it('hash deterministically, and compare by value', async () => {
		const token = newEditToken()
		const hash = await hashToken(token)
		expect(await hashToken(token)).toBe(hash)
		expect(sameHash(hash, await hashToken(token))).toBe(true)
		expect(sameHash(hash, await hashToken(newEditToken()))).toBe(false)
		expect(sameHash(hash, hash.slice(1))).toBe(false)
	})

	it('are read from bearer authorization headers only', () => {
		const request = (authorization?: string) =>
			new Request('https://x', { headers: authorization ? { authorization } : {} })
		expect(bearerToken(request('Bearer abc-123'))).toBe('abc-123')
		expect(bearerToken(request('bearer abc'))).toBe('abc')
		expect(bearerToken(request('Basic abc'))).toBeNull()
		expect(bearerToken(request())).toBeNull()
	})
})
