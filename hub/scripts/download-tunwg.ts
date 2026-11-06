/**
 * Download tunwg binaries for all platforms
 *
 * Downloads pre-built tunwg binaries from GitHub releases.
 * Output directory: shared/tools/tunwg/
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';

const TUNWG_VERSION = 'v26.08.03+122a6d0';
const RELEASE_URL = `https://github.com/tiann/tunwg/releases/download/${encodeURIComponent(TUNWG_VERSION)}`;
const TUNWG_RELEASES = {
    'x64-linux': { asset: 'tunwg', sha256: 'c1a7e08d956d9ee1087b8bf3b651d5dc32aee80eee1052c11218189fd5635768' },
    'arm64-linux': { asset: 'tunwg-arm64', sha256: 'd2d29afda075e26bb70140184b5ee6c8a8cf56b18f1fe56db3c002d7dbe5eef9' },
    'x64-darwin': { asset: 'tunwg-darwin', sha256: '5b354c7d071cf7c5346f446fbbec8f4fe218278c6d1d9c6dca217dcdd0b96c22' },
    'arm64-darwin': { asset: 'tunwg-darwin-arm64', sha256: '4ff96e3ff7271a1bb940c8e7e071900d2135b483baab387d4f8ba8dc2ddd333a' },
    'x64-win32': { asset: 'tunwg.exe', sha256: 'abb6538ee38a23353fe5e5a4ba74a9d597ef1ebacdbf147df2e19325ccb8c7e8' },
};

const LICENSE_URL = `https://raw.githubusercontent.com/tiann/tunwg/${encodeURIComponent(TUNWG_VERSION)}/LICENSE`;
const LICENSE_SHA256 = 'd8ac11fb1304443975a04293266bc30227d0dbf01a44f9d51d9ece096aadbe36';

function digest(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

export async function downloadVerifiedFile(url: string, destPath: string, sha256: string): Promise<void> {
    if (existsSync(destPath)) {
        if (digest(readFileSync(destPath)) !== sha256) {
            throw new Error(`Cached file checksum mismatch: ${destPath}. Remove it and retry.`);
        }
        console.log(`Verified cached ${destPath}`);
        return;
    }
    console.log(`Downloading ${url}...`);

    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (digest(bytes) !== sha256) throw new Error(`Downloaded file checksum mismatch: ${destPath}`);
    mkdirSync(dirname(destPath), { recursive: true });
    const temporaryPath = `${destPath}.${randomUUID()}.tmp`;
    try {
        writeFileSync(temporaryPath, bytes, { mode: 0o600, flag: 'wx' });
        renameSync(temporaryPath, destPath);
    } finally {
        rmSync(temporaryPath, { force: true });
    }
}

async function main(): Promise<void> {
    let scriptDir: string;
    if (isWindows) {
        const __filename = fileURLToPath(import.meta.url);
        scriptDir = dirname(__filename);
    } else {
        scriptDir = dirname(new URL(import.meta.url).pathname);
    }
    const toolsDir = join(scriptDir, '..', '..', 'shared', 'tools', 'tunwg');

    console.log('Downloading tunwg binaries...\n');

    // Download all platform binaries
    for (const [platform, release] of Object.entries(TUNWG_RELEASES)) {
        const filename = `tunwg-${platform}${platform.includes('win32') ? '.exe' : ''}`;
        const destPath = join(toolsDir, filename);

        await downloadVerifiedFile(`${RELEASE_URL}/${release.asset}`, destPath, release.sha256);

        // Make executable on Unix
        if (!platform.includes('win32')) {
            chmodSync(destPath, 0o755);
        }
    }

    // Download LICENSE
    const licensePath = join(toolsDir, 'LICENSE');
    await downloadVerifiedFile(LICENSE_URL, licensePath, LICENSE_SHA256);

    console.log('\nDone!');
}

if (import.meta.main) {
    main().catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
}
