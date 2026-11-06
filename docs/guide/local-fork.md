This checkout carries local security fixes on `local/security-hardening`, based
on upstream HAPI 0.34.3. The build identifies itself as
`0.34.3+local.security.1`; its runtime assets have a separate version directory.
The `upstream` remote points to `https://github.com/tiann/hapi.git`, with pushes
disabled. The `origin` remote points to the hosted fork at
`git@github.com:hychowah/hapi.git`. Local Git history retains the patch set and
can merge upstream updates.

The local launcher keeps runtime settings and logs in `~/.hapi-local` and runs
the binary selected by `~/.local/share/hapi-local/current`. The user service is
`hapi-local.service`. Use `hapi` to run this installed build.

The patches authenticate every local MCP request with a per-bridge capability
stored in an owner-only temporary file, reject browser origins and foreign Host
headers, and limit MCP request size and tool-input elements. Native clients use
the authenticated stdio bridge. The capability is absent from URLs, command-line
arguments and hub metadata. Web terminal environments do not inherit its file
location.

HTTP access logs omit query strings and authorization headers. Diagrams use
updated Mermaid dependencies and display the resulting SVG as an inert image in
both the chat and the zoomable viewer. Build downloads pin the tunnel release
and check SHA-256 digests, including cached copies. These changes do not turn
the developer account into an operating-system sandbox: an authenticated HAPI
client can still use the terminal and operate on your files.

The hosted fork is <https://github.com/hychowah/hapi>. To set up another computer:

```bash
git clone --branch local/security-hardening git@github.com:hychowah/hapi.git
cd hapi
git remote add upstream https://github.com/tiann/hapi.git
git remote set-url --push upstream DISABLED
```

SSH authentication for Git is separate from GitHub API authentication. Do not
replace the `upstream` remote with the fork URL, reset the local branch to
upstream, or choose an option that discards local commits when syncing the fork.

For an upstream update, fetch first and choose the release tag to review:

```bash
git switch local/security-hardening
git status --short
git fetch upstream --tags
git log --oneline HEAD..upstream/main
# Replace vX.Y.Z with the chosen upstream release tag.
git merge --no-commit --no-ff vX.Y.Z
```

Start the merge only with a clean working tree. Resolve conflicts while keeping
the security boundaries above. Update the local build suffix in
`cli/package.json` and `shared/src/buildInfo.ts` to match the new upstream base.
If package manifests conflict, resolve them before regenerating `bun.lock`.
Use the official npm registry and keep dependency install scripts disabled:

```bash
bun install --ignore-scripts --registry=https://registry.npmjs.org
bun typecheck
VITEST_MAX_WORKERS=2 bun run test
bun audit
```

Inspect advisory applicability rather than treating the raw count as a list of
reachable exploits. On the initial patched lockfile, `bun audit --production`
reports one low-severity KaTeX advisory that requires pre-existing prototype
pollution. No such entry point was established in this review. The full
workspace audit additionally includes development tooling for the separate
marketing website. These are residual findings, not a claim of a zero-advisory
dependency tree. Rerun the browser diagram tests when the renderer, its
dependencies or the viewer changes:

```bash
bun run --cwd web test:mermaid-lightbox:e2e
```

For a new tunnel version, review its release, pin its tag, and replace the asset
and license digests in `hub/scripts/download-tunwg.ts`. A changed cached file
fails the build; remove the stale generated file and retry. The updater never
trusts a mutable `latest` URL.

After review and verification, commit the merge and rebuild the local binary:

```bash
git diff --check
git commit
bun run build:single-exe
```

For the Linux/WSL installation, wait until agent jobs are idle, then replace the
installed build and restart the hub and runner:

```bash
hapi runner stop
systemctl --user stop hapi-local.service
hapi_build_revision=$(git rev-parse --short=12 HEAD)
hapi_build_dir="$HOME/.local/share/hapi-local/releases/$hapi_build_revision"
mkdir -p "$hapi_build_dir"
install -m 755 cli/dist-exe/bun-linux-x64-baseline/hapi "$hapi_build_dir/hapi"
ln -sfn "$hapi_build_dir" "$HOME/.local/share/hapi-local/current"
systemctl --user start hapi-local.service
hapi runner start --workspace-root "$HOME/projects"
```

The hub/runner restart can interrupt connected clients. Reconnect and check
pending work after the update.

Do not use the upstream npm installer to update this fork: it installs the
upstream binary without these local patches. Keep updates explicit so the
patches and verification stay part of the merge.

For personal device access, serve the hub on loopback through Tailscale HTTPS,
with the HTTPS origin included in `HAPI_PUBLIC_URL` / `CORS_ORIGINS`. Use locally
served web assets and leave the optional hosted relay, voice and push services
off unless you want them. Keep the hub access token private and enter it on the
login page instead of putting it in a URL. Session content remains in local
SQLite storage; file permissions do not provide encryption at rest.
