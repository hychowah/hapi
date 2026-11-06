import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export const HAPI_MCP_TOKEN_FILE_ENV = 'HAPI_HTTP_MCP_TOKEN_FILE'

/** Keep the per-bridge capability out of URLs, process arguments and hub metadata. */
export function createMcpAuth() {
    const directory = mkdtempSync(join(tmpdir(), 'hapi-mcp-auth-'))
    const tokenFile = join(directory, 'token')
    const token = randomBytes(32).toString('base64url')
    const expected = Buffer.from(`Bearer ${token}`)
    try {
        chmodSync(directory, 0o700)
        writeFileSync(tokenFile, token, { mode: 0o600, flag: 'wx' })
    } catch (error) {
        rmSync(directory, { recursive: true, force: true })
        throw error
    }

    return {
        tokenFile,
        accepts(authorization: string | undefined): boolean {
            if (!authorization) return false
            const actual = Buffer.from(authorization)
            return actual.length === expected.length && timingSafeEqual(actual, expected)
        },
        dispose() {
            rmSync(directory, { recursive: true, force: true })
        },
    }
}

export function readMcpAuthorization(tokenFile: string | undefined): string {
    if (!tokenFile) throw new Error('Missing HAPI MCP credential file')
    const info = statSync(tokenFile)
    if (!info.isFile() || info.size > 128 || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) {
        throw new Error('HAPI MCP credential file must be a private regular file')
    }
    const token = readFileSync(tokenFile, 'utf8').trim()
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid HAPI MCP credential file')
    return `Bearer ${token}`
}

/** Both stdio and source-checkout clients use the same private HTTP boundary. */
export async function connectMcpClient(
    endpoint: string,
    tokenFile: string | undefined,
    identity: { name: string; version: string },
): Promise<Client> {
    const url = new URL(endpoint)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
        throw new Error('HAPI MCP bridge requires a loopback HTTP endpoint')
    }
    const authorization = readMcpAuthorization(tokenFile)
    const client = new Client(identity, { capabilities: {} })
    try {
        await client.connect(new StreamableHTTPClientTransport(url, {
            requestInit: { headers: { Authorization: authorization }, redirect: 'error' },
        }))
        return client
    } catch (error) {
        await client.close()
        throw error
    }
}
