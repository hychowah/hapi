import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { Hono } from 'hono'
import { accessLogger } from './accessLogger'

describe('HTTP access logging', () => {
    afterEach(() => { log.mockRestore() })
    let log: ReturnType<typeof spyOn>

    it('never logs login, SSE, or header credentials', async () => {
        log = spyOn(console, 'log').mockImplementation(() => {})
        const app = new Hono()
        app.use('*', accessLogger)
        app.get('*', c => c.text('ok'))
        for (const path of ['/?token=login-secret', '/api/events?token=jwt-secret&sessionId=123']) {
            expect((await app.request(path, { headers: { Authorization: 'Bearer header-secret' } })).status).toBe(200)
        }
        const output = JSON.stringify(log.mock.calls)
        expect(output).toContain('/api/events')
        expect(output).not.toContain('login-secret')
        expect(output).not.toContain('jwt-secret')
        expect(output).not.toContain('header-secret')
        expect(output).not.toContain('sessionId')
    })
})
