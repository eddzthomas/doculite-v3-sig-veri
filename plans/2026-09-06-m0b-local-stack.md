# M0-B Local Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A disposable Docker Compose stack running the pinned Paperless-ngx, DocuSeal, Postgres, and Redis — images consumed by digest from the pin manifest — with health verification, restart persistence, and a guaranteed-clean teardown, proving the M0 Phase-0 exit-gate condition.

**Architecture:** The pin tool generalizes (per-component tag source + image-tag transform) to add Postgres and Redis as full manifest components. `deploy/local/` holds compose + env template + a Node `stack.mjs` CLI (start/health/stop/nuke). CI stays daemon-free: an offline digest-consistency validator proves compose ↔ manifest agreement.

**Tech Stack:** Node 24 (no new runtime deps), Docker Compose v2, pinned images by digest, Vitest (existing root config).

**Spec:** `plans/specs/2026-09-06-m0b-local-stack-design.md` (spec travels with this plan).

## Global Constraints

- **Images by digest only** in compose — `repo@sha256:…` from the manifest, never tags, never `latest`.
- **Localhost-only publishing** (`127.0.0.1:`) and dev-only credentials, marked as such; `.env` never committed.
- **Fail loud:** a service that never becomes healthy fails `start` with the service named; no partial-success output.
- **Anonymous access only** for pin fetches; **no credentials in commits**; conventional commits; no LICENSE.
- **Offline tests** — every test injects its fetch/runner; no test may require the daemon or network.
- **PR flow:** feature branch `m0b-local-stack`, one PR, `quality` check must pass, squash-merge to protected `main` (PR title carries a conventional prefix — lesson from M0-A).

---

### Task 1: Branch + pin-tool generalization and hardening (TDD)

**Files:**
- Modify: `scripts/lib/upstream-pin/schema.mjs` (COMPONENTS: 4 entries; `imageTagStripV` → `imageTagTransform`; new `tagSource`)
- Modify: `scripts/lib/upstream-pin/github.mjs` (add `fetchLatestStableTag`)
- Modify: `scripts/pin-upstream.mjs` (transform dispatch, tagSource dispatch, atomic write, runValidate try/catch)
- Test: modify `scripts/test/upstream-pin/schema.test.mjs`, `github.test.mjs`, `cli.test.mjs`
- Create: `scripts/test/upstream-pin/tags.test.mjs`

**Interfaces:**
- Consumes: M0-A tool as merged at `dd3902e`
- Produces (used by Tasks 2–4):
  - `COMPONENTS` — exactly `paperless-ngx`, `docuseal`, `postgres`, `redis`, each with `tagSource: 'releases' | 'tags'` and `imageTagTransform: 'strip-v' | 'identity' | 'postgres-rel'`
  - `fetchLatestStableTag(fetchImpl, owner, repo, tagPattern) : { tag, releaseUrl, releaseDate }` (tags API + numeric sort; used when `tagSource === 'tags'`)
  - `resolveComponent` applies the per-component image-tag transform

- [ ] **Step 1: Create branch**

Run: `git checkout -b m0b-local-stack`

- [ ] **Step 2: Update schema tests first (RED)**

In `scripts/test/upstream-pin/schema.test.mjs`:
1. The `COMPONENTS` names assertion becomes `['paperless-ngx', 'docuseal', 'postgres', 'redis']`.
2. Per-component declaration tests (new):
```javascript
  it('declares tag sources and image transforms per component', () => {
    const byName = new Map(COMPONENTS.map((c) => [c.name, c]))
    expect(byName.get('paperless-ngx').tagSource).toBe('releases')
    expect(byName.get('paperless-ngx').imageTagTransform).toBe('strip-v')
    expect(byName.get('docuseal').tagSource).toBe('releases')
    expect(byName.get('docuseal').imageTagTransform).toBe('identity')
    expect(byName.get('postgres').tagSource).toBe('tags')
    expect(byName.get('postgres').imageTagTransform).toBe('postgres-rel')
    expect(byName.get('postgres').imageRepository).toBe('library/postgres')
    expect(byName.get('redis').tagSource).toBe('releases')
    expect(byName.get('redis').imageTagTransform).toBe('identity')
    expect(byName.get('redis').imageRepository).toBe('library/redis')
    for (const name of ['postgres', 'redis']) {
      const c = byName.get(name)
      expect(c.registry).toBe('docker.io')
      expect(c.fallbackRegistry).toBeUndefined()
    }
  })

  it('accepts postgres REL_ tags and rejects others', () => {
    const byName = new Map(COMPONENTS.map((c) => [c.name, c]))
    expect(byName.get('postgres').tagPattern.test('REL_17_5')).toBe(true)
    expect(byName.get('postgres').tagPattern.test('v17.5')).toBe(false)
  })
```
3. The existing `validManifest` fixture gains `postgres` and `redis` components (same shape; `tag: 'REL_17_5'` / `tag: '8.2.0'`, images `library/postgres` / `library/redis` on docker.io) so it stays valid — `validateManifest` now requires all four.

- [ ] **Step 3: Add `fetchLatestStableTag` tests (RED)**

`scripts/test/upstream-pin/tags.test.mjs`:
```javascript
import { describe, expect, it, vi } from 'vitest'
import { fetchLatestStableTag } from '../../lib/upstream-pin/github.mjs'

function ref(name) {
  return { ref: `refs/tags/${name}`, object: { sha: 'a'.repeat(40), type: 'commit' } }
}

function pageResponse(refs) {
  return { ok: true, status: 200, json: async () => refs, headers: new Map() }
}

describe('fetchLatestStableTag', () => {
  it('picks the numerically greatest matching tag, not the alphabetically greatest', async () => {
    const fetchImpl = vi.fn(async () => pageResponse([ref('REL_17_9'), ref('REL_17_10'), ref('REL_16_9')]))
    const result = await fetchLatestStableTag(fetchImpl, 'postgres', 'postgres', /^REL_\d+_\d+$/)
    expect(result.tag).toBe('REL_17_10')
    expect(fetchImpl.mock.calls[0][0]).toContain('/repos/postgres/postgres/git/matching-refs/tags/')
  })

  it('paginates until the tag list is exhausted', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ref(`REL_16_${i + 1}`))
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => pageResponse(fullPage))
      .mockImplementationOnce(async () => pageResponse([ref('REL_17_5')]))
    const result = await fetchLatestStableTag(fetchImpl, 'postgres', 'postgres', /^REL_\d+_\d+$/)
    expect(result.tag).toBe('REL_17_5')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws when no tag matches the pattern', async () => {
    const fetchImpl = vi.fn(async () => pageResponse([ref('alpha')]))
    await expect(fetchLatestStableTag(fetchImpl, 'o', 'r', /^REL_\d+_\d+$/)).rejects.toThrow(/no matching tag/)
  })

  it('throws on failure', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}), headers: new Map() }))
    await expect(fetchLatestStableTag(fetchImpl, 'o', 'r', /^x$/)).rejects.toThrow(/403/)
  })
})
```

- [ ] **Step 4: Update CLI tests (RED)**

In `scripts/test/upstream-pin/cli.test.mjs`:
1. Replace the mock component objects' `imageTagStripV` with `imageTagTransform` (`paperless` → `'strip-v'`; add `tagSource: 'releases'` to all mock components).
2. The paperless resolve test is unchanged except the field rename (tagRef `1.2.3` from tag `v1.2.3`).
3. New test:
```javascript
describe('image-tag transforms', () => {
  it.each([
    ['strip-v', 'v17.5.1', '17.5.1'],
    ['identity', 'REL_17_5', 'REL_17_5'],
    ['postgres-rel', 'REL_17_5', '17.5'],
  ])('maps %s tag %s to image tag %s', async (transform, ghTag, imageTag) => {
    const component = {
      name: 'x', owner: 'o', repo: 'r', tagPattern: /^\w[\w.]*$/,
      tagSource: 'releases', imageTagTransform: transform,
      registry: 'ghcr.io', imageRepository: 'o/r',
    }
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ tag_name: ghTag, draft: false, prerelease: false, published_at: '2026-09-01T00:00:00Z', html_url: 'u' }], headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ sha: 'a'.repeat(40) }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({}), headers: new Map([['docker-content-digest', `sha256:${'b'.repeat(64)}`]]) }))
    const record = await resolveComponent(component, { fetchImpl, todayIso: '2026-09-06' })
    expect(record.tag).toBe(ghTag)
    expect(record.image.tagRef).toBe(imageTag)
  })
})
```

- [ ] **Step 5: Run all pin tests to verify RED** — `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/`
Expected: FAIL (missing postgres/redis declarations, missing fetchLatestStableTag, missing transform dispatch).

- [ ] **Step 6: Implement**

`schema.mjs` COMPONENTS (replace the two existing entries' `imageTagStripV` and append):
```javascript
export const COMPONENTS = Object.freeze([
  Object.freeze({
    name: 'paperless-ngx', owner: 'paperless-ngx', repo: 'paperless-ngx',
    tagPattern: /^v\d+\.\d+\.\d+$/, tagSource: 'releases',
    imageTagTransform: 'strip-v',
    registry: 'ghcr.io', imageRepository: 'paperless-ngx/paperless-ngx',
  }),
  Object.freeze({
    name: 'docuseal', owner: 'docusealco', repo: 'docuseal',
    tagPattern: /^\d+\.\d+\.\d+$/, tagSource: 'releases',
    imageTagTransform: 'identity',
    registry: 'docker.io', imageRepository: 'docuseal/docuseal',
  }),
  Object.freeze({
    name: 'postgres', owner: 'postgres', repo: 'postgres',
    tagPattern: /^REL_\d+_\d+$/, tagSource: 'tags',
    imageTagTransform: 'postgres-rel',
    registry: 'docker.io', imageRepository: 'library/postgres',
  }),
  Object.freeze({
    name: 'redis', owner: 'redis', repo: 'redis',
    tagPattern: /^\d+\.\d+\.\d+$/, tagSource: 'releases',
    imageTagTransform: 'identity',
    registry: 'docker.io', imageRepository: 'library/redis',
  }),
])
```

`github.mjs` — add:
```javascript
function compareNumericSegments(a, b) {
  const pa = a.match(/^(\D*)(\d+(?:[_-]\d+)*)$/)
  const pb = b.match(/^(\D*)(\d+(?:[_-]\d+)*)$/)
  if (pa === null || pb === null) return a < b ? -1 : a > b ? 1 : 0
  const na = pa[2].split(/[_-.]+/).map(Number)
  const nb = pb[2].split(/[_-.]+/).map(Number)
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const da = na[i] ?? 0
    const db = nb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

/**
 * Resolves the greatest tag matching tagPattern via the git tags API,
 * which works for repositories that publish tags without GitHub release
 * objects (e.g. postgres). Paginates up to 5 pages of 100.
 */
export async function fetchLatestStableTag(fetchImpl, owner, repo, tagPattern) {
  const collected = []
  for (let page = 1; page <= 5; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/matching-refs/tags/?per_page=100&page=${page}`
    const res = await fetchImpl(url, { headers: HEADERS })
    if (!res.ok) throw new Error(`GitHub tags request failed with status ${res.status} for ${owner}/${repo}`)
    const refs = await res.json()
    for (const r of refs) {
      const name = typeof r.ref === 'string' ? r.ref.replace(/^refs\/tags\//, '') : null
      if (name !== null && tagPattern.test(name)) collected.push(name)
    }
    if (refs.length < 100) break
  }
  if (collected.length === 0) throw new Error(`no matching tag found for ${owner}/${repo}`)
  collected.sort(compareNumericSegments)
  const tag = collected[collected.length - 1]
  return {
    tag,
    releaseUrl: `https://github.com/${owner}/${repo}/releases/tag/${tag}`,
    releaseDate: '', // tags API carries no date; recorded as empty and excluded from validation
  }
}
```
Note: `releaseDate: ''` breaks `validateManifest` (non-empty ISO required). The CLI must therefore tolerate empty `releaseDate` **only when** `tagSource === 'tags'`: relax `validateComponent` to allow an empty `releaseDate` and have `runValidate`/`fetchAllComponents` record `releaseDate: release.releaseDate || null` → schema allows `null` for tags-source components only. Implement precisely this: in `validateComponent`, `releaseDate` must be ISO **or** `null`; in the CLI, tags-source records get `releaseDate: null`. Update the `validManifest` fixture accordingly (`postgres` component has `releaseDate: null`). Add one schema test: `releaseDate: null` accepted, `releaseDate: 'not-a-date'` rejected, `releaseDate: ''` rejected.

`pin-upstream.mjs` — changes:
1. `resolveComponent`: choose fetcher by `component.tagSource`:
```javascript
const release = component.tagSource === 'tags'
  ? await fetchLatestStableTag(fetchImpl, component.owner, component.repo, component.tagPattern)
  : await fetchLatestStableRelease(fetchImpl, component.owner, component.repo)
const imageTagRef = transformImageTag(component.imageTagTransform, release.tag)
```
2. Transform dispatch (top-level export):
```javascript
export function transformImageTag(transform, tag) {
  if (transform === 'strip-v') return tag.replace(/^v/, '')
  if (transform === 'postgres-rel') return tag.replace(/^REL_/, '').replace(/_/g, '.')
  if (transform === 'identity') return tag
  throw new Error(`unknown imageTagTransform: ${transform}`)
}
```
3. Records for tags-source components: `releaseDate: release.releaseDate || null`.
4. `runValidate`: same tagSource dispatch; re-derive the recorded tag's commit + digest as before.
5. Atomic write:
```javascript
async function writeManifest(manifest) {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true })
  const tmp = `${MANIFEST_PATH}.tmp`
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(tmp, MANIFEST_PATH)
}
```
6. `runValidate`: wrap the live-derivation loop in try/catch → `console.error('live validation failed: ' + error.message)`, `process.exitCode = 1`.
7. Import `fetchLatestStableTag` alongside the existing import.

- [ ] **Step 7: Run all pin tests to verify GREEN** — `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/` — all pass. Full gate: `pnpm format; pnpm lint; pnpm test; pnpm validate:docs; pnpm typecheck; pnpm build`.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/upstream-pin scripts/pin-upstream.mjs scripts/test/upstream-pin
git commit -m "feat: generalize pin tool for backing services and harden writes"
```

---

### Task 2: Regenerate the manifest live (4 components)

**Files:**
- Modify: `deploy/upstream-versions.json` (generated)

**Interfaces:**
- Consumes: Task 1 tool
- Produces: the 4-component pin record

- [ ] **Step 1: `node scripts/pin-upstream.mjs fetch`** — expected exit 0, four components resolved (paperless-ngx, docuseal, postgres, redis). Rate-limit/retry and fail-loud rules identical to M0-A.
- [ ] **Step 2: `node scripts/pin-upstream.mjs validate`** — expected `no drift`, exit 0. If drift (new release published mid-run), re-fetch and re-commit.
- [ ] **Step 3: Commit** — `chore: pin postgres and redis backing services`
- [ ] **Step 4: Record** resolved tags/digests (abbreviated) in the task report.

---

### Task 3: Compose stack files + digest validator (TDD, offline)

**Files:**
- Create: `deploy/local/compose.yaml`
- Create: `deploy/local/.env.example`
- Create: `deploy/local/initdb/01-docuseal-db.sh`
- Create: `scripts/validate-compose-digests.mjs`
- Test: `scripts/test/validate-compose-digests.test.mjs`
- Modify: root `package.json` scripts — add `"validate:compose": "node scripts/validate-compose-digests.mjs deploy/upstream-versions.json deploy/local/compose.yaml"`

**Interfaces:**
- Consumes: the 4-component manifest from Task 2
- Produces: `validateComposeDigests(manifestPath, composePath): Promise<{ missing: string[], stale: string[] }>` — `missing` = manifest components whose image is not referenced (repo+digest) in compose; `stale` = compose digests that do not match the manifest for that repository. CLI exits 0 when both empty.

- [ ] **Step 1: Write failing validator tests**

`scripts/test/validate-compose-digests.test.mjs`:
```javascript
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateComposeDigests } from '../validate-compose-digests.mjs'

let dir
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'compose-digests-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const D1 = `sha256:${'a'.repeat(64)}`
const D2 = `sha256:${'b'.repeat(64)}`
const D3 = `sha256:${'c'.repeat(64)}`

async function writeFiles(manifestComponents, composeText) {
  const manifestPath = join(dir, 'manifest.json')
  const composePath = join(dir, 'compose.yaml')
  await writeFile(manifestPath, JSON.stringify({ capturedAt: '2026-09-06', components: manifestComponents }))
  await writeFile(composePath, composeText)
  return validateComposeDigests(manifestPath, composePath)
}

const comp = (name, repo, digest) => ({ name, image: { repository: repo, digest } })

describe('validateComposeDigests', () => {
  it('passes when every manifest image is referenced by digest in compose', async () => {
    const result = await writeFiles(
      [comp('paperless-ngx', 'paperless-ngx/paperless-ngx', D1), comp('docuseal', 'docuseal/docuseal', D2)],
      `services:\n  paperless:\n    image: ghcr.io/paperless-ngx/paperless-ngx@${D1}\n  docuseal:\n    image: docker.io/docuseal/docuseal@${D2}\n`,
    )
    expect(result.missing).toEqual([])
    expect(result.stale).toEqual([])
  })

  it('flags a manifest component missing from compose', async () => {
    const result = await writeFiles(
      [comp('postgres', 'library/postgres', D3)],
      `services:\n  paperless:\n    image: ghcr.io/paperless-ngx/paperless-ngx@${D1}\n`,
    )
    expect(result.missing).toEqual(['postgres'])
  })

  it('flags a compose digest that does not match the manifest (stale)', async () => {
    const result = await writeFiles(
      [comp('docuseal', 'docuseal/docuseal', D2)],
      `services:\n  docuseal:\n    image: docker.io/docuseal/docuseal@${D1}\n`,
    )
    expect(result.stale).toEqual(['docuseal'])
  })

  it('matches repositories by suffix so registry hostnames do not break comparison', async () => {
    const result = await writeFiles(
      [comp('paperless-ngx', 'paperless-ngx/paperless-ngx', D1)],
      `services:\n  paperless:\n    image: paperless-ngx/paperless-ngx@${D1}\n`,
    )
    expect(result.missing).toEqual([])
    expect(result.stale).toEqual([])
  })
})
```

- [ ] **Step 2: Verify RED** — `pnpm vitest run -c vitest.config.ts scripts/test/validate-compose-digests.test.mjs` — module not found.

- [ ] **Step 3: Implement `scripts/validate-compose-digests.mjs`**

```javascript
import { readFile } from 'node:fs/promises'

const IMAGE_PATTERN = /^\s*image:\s*(\S+)@?(sha256:[0-9a-f]{64})?\s*$/gm

function repoKey(repository) {
  // Compare on the repository path so `ghcr.io/x/y` and `x/y` match.
  const withoutHost = repository.replace(/^[^/]+\.(?:io|com)\//, '').replace(/^docker\.io\//, '')
  return withoutHost.replace(/^library\//, 'library/')
}

export async function validateComposeDigests(manifestPath, composePath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const compose = await readFile(composePath, 'utf8')

  const composeImages = new Map()
  for (const match of compose.matchAll(/image:\s*(\S+)/g)) {
    const ref = match[1]
    const digestMatch = ref.match(/^(.+)@(sha256:[0-9a-f]{64})$/)
    if (digestMatch === null) continue
    composeImages.set(repoKey(digestMatch[1]), { fullRef: digestMatch[1], digest: digestMatch[2] })
  }

  const missing = []
  const stale = []
  for (const component of manifest.components) {
    const key = repoKey(component.image.repository)
    const found = composeImages.get(key)
    if (found === undefined) {
      missing.push(component.name)
      continue
    }
    if (found.digest !== component.image.digest) stale.push(component.name)
  }
  return { missing, stale }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [manifestPath, composePath] = process.argv.slice(2)
  if (!manifestPath || !composePath) {
    console.error('usage: node scripts/validate-compose-digests.mjs <manifest> <compose>')
    process.exit(2)
  }
  const { missing, stale } = await validateComposeDigests(manifestPath, composePath)
  for (const m of missing) console.error(`missing from compose: ${m}`)
  for (const s of stale) console.error(`digest does not match manifest: ${s}`)
  if (missing.length > 0 || stale.length > 0) process.exit(1)
  console.log('compose digests match manifest')
}
```
(Add `import { resolve } from 'node:path'` at the top; adapt the CLI-guard style already used in `pin-upstream.mjs` if the tests require import-safety.)

- [ ] **Step 4: Verify GREEN**, then create the stack files.

`deploy/local/compose.yaml` — digests below are placeholders to be replaced in Step 5 with the actual values from `deploy/upstream-versions.json`:
```yaml
# DEV ONLY local stack. Images pinned by digest to deploy/upstream-versions.json.
# Never referenced by customer deployment tooling; no real customer data, ever.
services:
  postgres:
    image: docker.io/library/postgres@sha256:REPLACE_FROM_MANIFEST
    environment:
      POSTGRES_USER: doculite
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: paperless
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./initdb:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-8101}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U doculite -d paperless"]
      interval: 5s
      timeout: 3s
      retries: 60

  redis:
    image: docker.io/library/redis@sha256:REPLACE_FROM_MANIFEST
    ports:
      - "127.0.0.1:${REDIS_PORT:-8102}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 60

  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx@sha256:REPLACE_FROM_MANIFEST
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      PAPERLESS_DBHOST: postgres
      PAPERLESS_DBNAME: paperless
      PAPERLESS_DBUSER: doculite
      PAPERLESS_DBPASS: ${POSTGRES_PASSWORD}
      PAPERLESS_REDIS: redis://redis:6379
      PAPERLESS_SECRET_KEY: ${PAPERLESS_SECRET_KEY}
      PAPERLESS_TIME_ZONE: UTC
      PAPERLESS_CONSUMER_POLLING: "5"
    ports:
      - "127.0.0.1:${PAPERLESS_PORT:-8100}:8000"
    volumes:
      - paperless-data:/usr/src/paperless/data
      - paperless-media:/usr/src/paperless/media
      - paperless-export:/usr/src/paperless/export
      - paperless-consume:/usr/src/paperless/consume
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS -o /dev/null http://localhost:8000/api/ || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 60
      start_period: 60s

  docuseal:
    image: docker.io/docuseal/docuseal@sha256:REPLACE_FROM_MANIFEST
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://doculite:${POSTGRES_PASSWORD}@postgres:5432/docuseal
    ports:
      - "127.0.0.1:${DOCUSEAL_PORT:-8200}:3000"
    volumes:
      - docuseal-data:/data
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://localhost:3000/up || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 60
      start_period: 60s

volumes:
  pgdata:
  paperless-data:
  paperless-media:
  paperless-export:
  paperless-consume:
  docuseal-data:
```

`deploy/local/.env.example`:
```bash
# DEV ONLY — copy to .env and adjust ports if they collide.
# NEVER use these values in production; production secrets live in a secret manager.
POSTGRES_PASSWORD=devonly-postgres-password
PAPERLESS_SECRET_KEY=devonly-paperless-secret-key
PAPERLESS_PORT=8100
DOCUSEAL_PORT=8200
POSTGRES_PORT=8101
REDIS_PORT=8102
```

`deploy/local/initdb/01-docuseal-db.sh`:
```bash
#!/bin/bash
# DEV ONLY: creates the second logical database for the local stack.
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE docuseal;
EOSQL
```

- [ ] **Step 5: Replace the four `REPLACE_FROM_MANIFEST` digests** with the digests from `deploy/upstream-versions.json` (read the file; substitute exactly; repositories must match the manifest's `image.repository` values).

- [ ] **Step 6: Run the real validator + full gate**

Run: `pnpm validate:compose` (expect `compose digests match manifest`), `pnpm format; pnpm lint; pnpm test; pnpm validate:docs`
Expected: all exit 0. Add `validate:compose` to the CI workflow's Validate step? NO — CI gets it in Task 6's commit only if green locally; do not modify the workflow in this task (kept minimal; the validator runs locally and in Task 7's CI as part of `pnpm test`? It is NOT in `pnpm test` — leave CI workflow untouched in this plan; the validator is a local/runbook gate. State this in the task report.)

- [ ] **Step 7: Commit**

```bash
git add deploy/local scripts/validate-compose-digests.mjs scripts/test/validate-compose-digests.test.mjs package.json
git commit -m "feat: add digest-pinned local compose stack and offline digest validator"
```

---

### Task 4: `stack.mjs` lifecycle CLI (TDD, offline)

**Files:**
- Create: `deploy/local/stack.mjs`
- Test: `scripts/test/stack.test.mjs`

**Interfaces:**
- Consumes: compose.yaml (by name only — tests inject the runner)
- Produces:
  - `waitForHealthy(runner, { services, timeoutMs, intervalMs })` — polls `docker compose ps --format json` until every service reports `healthy`; throws naming the failing services on timeout.
  - CLI: `node stack.mjs start|health|stop|nuke` — runs compose from `deploy/local/` (`--env-file .env`), `start` waits for healthy then prints the health table.

- [ ] **Step 1: Write failing tests**

`scripts/test/stack.test.mjs`:
```javascript
import { describe, expect, it, vi } from 'vitest'
import { parseComposePs, waitForHealthy } from '../../deploy/local/stack.mjs'

function psLine(service, health) {
  return JSON.stringify({ Service: service, State: 'running', Health: health })
}

describe('parseComposePs', () => {
  it('parses newline-delimited json output', () => {
    const services = parseComposePs([psLine('postgres', 'healthy'), psLine('redis', 'starting')].join('\n'))
    expect(services.get('postgres')).toBe('healthy')
    expect(services.get('redis')).toBe('starting')
  })

  it('treats a missing service as no-health', () => {
    const services = parseComposePs([psLine('postgres', 'healthy')].join('\n'))
    expect(services.has('redis')).toBe(false)
  })
})

describe('waitForHealthy', () => {
  it('resolves when every service is healthy', async () => {
    let calls = 0
    const runner = vi.fn(async () => {
      calls += 1
      return calls < 3
        ? [psLine('postgres', 'starting'), psLine('docuseal', 'starting')].join('\n')
        : [psLine('postgres', 'healthy'), psLine('docuseal', 'healthy')].join('\n')
    })
    await waitForHealthy(runner, { services: ['postgres', 'docuseal'], timeoutMs: 5000, intervalMs: 1 })
    expect(calls).toBe(3)
  })

  it('throws naming the unhealthy services on timeout', async () => {
    const runner = vi.fn(async () => [psLine('postgres', 'healthy'), psLine('docuseal', 'unhealthy')].join('\n'))
    await expect(
      waitForHealthy(runner, { services: ['postgres', 'docuseal'], timeoutMs: 30, intervalMs: 1 }),
    ).rejects.toThrow(/docuseal/)
  })

  it('throws naming a service that vanished from compose ps', async () => {
    const runner = vi.fn(async () => [psLine('postgres', 'healthy')].join('\n'))
    await expect(
      waitForHealthy(runner, { services: ['postgres', 'redis'], timeoutMs: 30, intervalMs: 1 }),
    ).rejects.toThrow(/redis/)
  })
})
```

- [ ] **Step 2: Verify RED** — module not found.

- [ ] **Step 3: Implement `deploy/local/stack.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Local stack lifecycle (DEV ONLY). Runs docker compose from this directory.
 *   node stack.mjs start  — up -d and wait until every service is healthy
 *   node stack.mjs health — print the current health table
 *   node stack.mjs stop   — stop (data preserved)
 *   node stack.mjs nuke   — down -v (destroys volumes; the disposable guarantee)
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SERVICES = ['postgres', 'redis', 'paperless', 'docuseal']

export function parseComposePs(stdout) {
  const services = new Map()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const row = JSON.parse(trimmed)
    if (typeof row.Service === 'string') services.set(row.Service, row.Health ?? 'none')
  }
  return services
}

export async function waitForHealthy(runner, { services, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const out = await runner(['ps', '--format', 'json'])
    const status = parseComposePs(out)
    const unhealthy = services.filter((s) => status.get(s) !== 'healthy')
    if (unhealthy.length === 0) return status
    if (Date.now() >= deadline) {
      throw new Error(`services not healthy after timeout: ${unhealthy.join(', ')} (status: ${[...status].map(([s, h]) => `${s}=${h}`).join(' ')})`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

function compose(args, { capture } = {}) {
  const full = ['compose', '--env-file', '.env', ...args]
  if (capture) {
    return execFileSync('docker', full, { cwd: HERE, encoding: 'utf8' })
  }
  execFileSync('docker', full, { cwd: HERE, stdio: 'inherit' })
  return null
}

async function main() {
  const mode = process.argv[2]
  if (mode === 'start') {
    compose(['up', '-d', '--wait'], { capture: false })
    const status = await waitForHealthy(
      (args) => compose(args, { capture: true }),
      { services: SERVICES, timeoutMs: 300000, intervalMs: 2000 },
    )
    for (const [service, health] of status) console.log(`${service}: ${health}`)
    console.log('stack is healthy')
  } else if (mode === 'health') {
    const status = parseComposePs(compose(['ps', '--format', 'json'], { capture: true }))
    for (const service of SERVICES) console.log(`${service}: ${status.get(service) ?? 'not running'}`)
    process.exitCode = [...status.values()].every((h) => h === 'healthy') && SERVICES.every((s) => status.get(s) === 'healthy') ? 0 : 1
  } else if (mode === 'stop') {
    compose(['stop'])
  } else if (mode === 'nuke') {
    compose(['down', '-v', '--remove-orphans'])
    console.log('stack destroyed (volumes removed)')
  } else {
    console.error('usage: node stack.mjs <start|health|stop|nuke>')
    process.exit(2)
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain) {
  await main()
}
```
Note: the `isMain` guard must survive Windows paths (`process.argv[1]` is a Windows path; normalize as shown or use `pathToFileURL` from `node:url` — prefer `import.meta.url === pathToFileURL(process.argv[1]).href`, the pattern already proven in `pin-upstream.mjs`). Tests import only the exported pure functions.

- [ ] **Step 4: Verify GREEN + full gate** — `pnpm vitest run -c vitest.config.ts scripts/test/stack.test.mjs`, then `pnpm format; pnpm lint; pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add deploy/local/stack.mjs scripts/test/stack.test.mjs
git commit -m "feat: add local stack lifecycle cli with health waiting"
```

---

### Task 5: Live bring-up, persistence, teardown (daemon required)

**Files:**
- Create: `deploy/local/.env` (gitignored — NEVER committed)
- Possibly Modify: `deploy/local/compose.yaml` (only if live behavior forces a fix — e.g., wrong health endpoint, missing env; commit any fix with a clear message)

**Interfaces:**
- Consumes: Tasks 3–4
- Produces: evidence the exit-gate condition holds; a possibly-corrected compose

- [ ] **Step 1: Confirm daemon** — `docker info` (if unreachable: report NEEDS_CONTEXT — do not work around).
- [ ] **Step 2: `cp .env.example .env`** (from `deploy/local/`) then `node stack.mjs start` — expected: all four services healthy within the timeout. First pull of digest-pinned images may take minutes.
- [ ] **Step 3: Probe services live** and record in the report: Paperless HTTP status on `http://127.0.0.1:8100/api/` (401 without token proves the API serves; a 200 on `/` proves the UI), DocuSeal on `http://127.0.0.1:8200/up` (or `/` if `/up` is absent — record which worked and fix the compose healthcheck accordingly), Postgres `pg_isready` output, Redis PING.
- [ ] **Step 4: Restart persistence** — `node stack.mjs stop` → `node stack.mjs start` → all healthy again; `docker volume ls` shows the six named volumes across the restart.
- [ ] **Step 5: Teardown** — `node stack.mjs nuke` → `docker volume ls` shows none of the six; `docker ps -a` shows no doculite containers. Record output.
- [ ] **Step 6:** If Step 3–5 forced compose changes: `git add deploy/local/compose.yaml` + `git commit -m "fix: correct local stack health or env for live behavior"`. If no changes: no commit.
- [ ] **Step 7: Clean .env** — verify `git status` never lists `.env` (gitignored). Leave `.env` on disk for M0-C.

---

### Task 6: Doc updates

**Files:**
- Modify: `docs/operations/deployment-runbook.md` (new "Local M0 stack" section)
- Check: `docs/nontechnical/operations/deployment-runbook.md` — update the matching sentence if it mirrors runbook operations content (read it first; no blind edit)

**Interfaces:**
- Consumes: everything above
- Produces: documented operator workflow

- [ ] **Step 1:** Add to `docs/operations/deployment-runbook.md` (place after any prerequisites section; read the doc first and match its structure):

```markdown
## Local M0 stack

The disposable local stack (DEV ONLY — never for customer deployments) runs the pinned
Paperless-ngx, DocuSeal, Postgres, and Redis images by digest, from
`deploy/local/compose.yaml`. Pin authority: `deploy/upstream-versions.json`;
digest agreement is checked by `pnpm validate:compose`.

- Start: `node deploy/local/stack.mjs start` (waits for health)
- Status: `node deploy/local/stack.mjs health`
- Stop (data preserved): `node deploy/local/stack.mjs stop`
- Destroy (volumes removed): `node deploy/local/stack.mjs nuke`

Requires Docker Desktop with the daemon running. Copy `deploy/local/.env.example`
to `deploy/local/.env` first. Never put real customer documents in this stack;
fixtures are created only by the M0-C fixture work. Re-pin backing services only
via the upstream upgrade policy.
```

- [ ] **Step 2:** Read the nontechnical companion; if it describes runbook operations, add one plain-language sentence noting a dev-only local stack exists for testing pinned versions. If it does not mirror this content, no change (record the decision).
- [ ] **Step 3:** `pnpm validate:docs; pnpm lint; pnpm test` — all exit 0.
- [ ] **Step 4: Commit** — `docs: document the disposable local m0 stack`

---

### Task 7: PR, CI, merge

**Files:** remote-side only.

- [ ] **Step 1:** `git log origin/main..HEAD --oneline` — sanity-check the commit list (expect 5–6 commits from Tasks 1–6); push: `git push -u origin m0b-local-stack`
- [ ] **Step 2:** `gh pr create --base main --head m0b-local-stack --title "feat: add disposable local stack for pinned upstream services" --body "..."` (body: spec path, plan path, resolved backing-service pins from Task 2, live-verification evidence summary from Task 5)
- [ ] **Step 3:** `gh pr checks` until `quality` completes; expected green; if red, capture logs, report BLOCKED (no fix-pushes without a new ruling)
- [ ] **Step 4:** `gh pr merge --squash --delete-branch`; `git checkout main; git pull`
- [ ] **Step 5:** Verify: `pnpm validate:compose` on main (expect match); record final state in the report.

---

## Out of scope

- Product web/API/worker containers, reverse proxy, TLS, malware scanning, monitoring, backups (M1)
- Fixture documents (M0-C)
- Wiring `validate:compose` into CI (deferred — runs locally; add with the M1 deployment tooling if wanted)

## Self-review notes

- Spec coverage: digest-pinned compose (T3), env template (T3), lifecycle scripts with health waiting + named-failure timeouts (T4), pin extension via generalized transforms + tags source (T1), manifest regeneration (T2), offline digest validator (T3), runbook docs (T6), live start/persistence/teardown evidence (T5). M0-A's two pre-M0-B hardening recommendations (atomic write, runValidate try/catch) are folded into T1.
- Placeholder scan: compose digests are explicit `REPLACE_FROM_MANIFEST` tokens with a dedicated substitution step (T3 S5) — a mechanical copy from a committed file, not an unmade decision. `postgres` GitHub releases may not exist (hence the tags API path with numeric sort).
- Type consistency: `imageTagTransform`/`tagSource` naming consistent across schema/github/cli/tests; `validateComposeDigests` return shape matches tests; `SERVICES` list matches compose service names; CLI test imports match export paths (`../../deploy/local/stack.mjs` from `scripts/test/` — correct relative depth).
