import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { createMcpAuth, readMcpAuthorization } from './mcpAuth'

describe('per-bridge MCP capability', () => {
    const capabilities: ReturnType<typeof createMcpAuth>[] = []
    afterEach(() => capabilities.splice(0).forEach(auth => auth.dispose()))

    it('accepts only its own capability and keeps the file private', () => {
        const first = createMcpAuth()
        const second = createMcpAuth()
        capabilities.push(first, second)
        const authorization = readMcpAuthorization(first.tokenFile)
        expect(first.accepts(authorization)).toBe(true)
        expect(first.accepts(undefined)).toBe(false)
        expect(first.accepts('Bearer wrong')).toBe(false)
        expect(second.accepts(authorization)).toBe(false)
        if (process.platform !== 'win32') {
            expect(statSync(first.tokenFile).mode & 0o777).toBe(0o600)
        }
        first.dispose()
        expect(existsSync(first.tokenFile)).toBe(false)
        expect(() => readMcpAuthorization(first.tokenFile)).toThrow()
    })

    it('fails closed when no credential file is supplied', () => {
        expect(() => readMcpAuthorization(undefined)).toThrow('Missing HAPI MCP credential file')
    })
})
