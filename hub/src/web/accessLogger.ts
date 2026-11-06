import type { MiddlewareHandler } from 'hono'

/** Query strings can contain login capabilities and SSE JWTs. Never log them. */
export const accessLogger: MiddlewareHandler = async (c, next) => {
    const startedAt = Date.now()
    await next()
    console.log(JSON.stringify({
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        elapsedMs: Date.now() - startedAt,
    }))
}
