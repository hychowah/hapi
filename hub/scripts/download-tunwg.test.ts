import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadVerifiedFile } from './download-tunwg'

describe('verified build downloads', () => {
    const directories: string[] = []
    afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

    it('checks downloaded and cached content before accepting it', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-download-test-'))
        directories.push(dir)
        const path = join(dir, 'tool')
        const checksum = createHash('sha256').update('fixture').digest('hex')
        await downloadVerifiedFile('data:,fixture', path, checksum)
        expect(readFileSync(path, 'utf8')).toBe('fixture')
        await downloadVerifiedFile('data:,should-not-be-fetched', path, checksum)
        writeFileSync(path, 'tampered')
        await expect(downloadVerifiedFile('data:,fixture', path, checksum)).rejects.toThrow('Cached file checksum mismatch')
    })

    it('does not persist a download with the wrong digest', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-download-test-'))
        directories.push(dir)
        const path = join(dir, 'tool')
        await expect(downloadVerifiedFile('data:,untrusted', path, '0'.repeat(64))).rejects.toThrow('Downloaded file checksum mismatch')
        expect(existsSync(path)).toBe(false)
    })
})
