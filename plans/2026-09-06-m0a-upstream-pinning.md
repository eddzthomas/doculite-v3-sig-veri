# M0-A Upstream Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the exact initially-supported Paperless-ngx and DocuSeal versions (tag, commit SHA, multi-arch image digest) in a committed machine-readable manifest, with a fetch/validate tool, per the approved spec `specs/2026-09-06-m0a-upstream-pinning-design.md`.

**Architecture:** One pinning tool (`scripts/pin-upstream.mjs`) orchestrating four small libraries under `scripts/lib/upstream-pin/` (schema, drift, GitHub client, registry client). All network clients take an injected `fetch` so tests stay offline. The manifest is generated output, committed as the record.

**Tech Stack:** Node 24, plain `.mjs` modules (no new dependencies), Vitest 5 (existing root config already includes `scripts/test/**`), anonymous GitHub/GHCR/Docker Hub APIs.

**Spec:** `plans/specs/2026-09-06-m0a-upstream-pinning-design.md` (the spec travels with this plan; executors read both).

## Global Constraints

- **No credentials.** All API access anonymous. Never add tokens, `.netrc`, or env-based auth for this tool.
- **Never pin `latest`, drafts, or prereleases** — stable semver tags only.
- **Digest is the multi-arch index digest** (`sha256:` 64 hex), from the `docker-content-digest` response header.
- **Fail loudly:** a component that cannot be fully resolved (tag + commit + digest) aborts the whole fetch — no partial manifests.
- **Conventional commits; no LICENSE; no credentials in commits.**
- **PR flow:** branch protection on `main` now requires `CI / quality`. All work happens on branch `m0a-upstream-pinning` and lands via one PR. No direct pushes to `main` in this plan.
- **Offline tests:** no test may hit the network; network clients receive an injected `fetch`.

---

### Task 1: Branch + manifest schema library (TDD)

**Files:**
- Create: `scripts/lib/upstream-pin/schema.mjs`
- Test: `scripts/test/upstream-pin/schema.test.mjs`

**Interfaces:**
- Consumes: nothing (first code of the plan)
- Produces (used by Tasks 2–4):
  - `COMPONENTS: readonly [{ name, owner, repo, tagPattern, registry, imageRepository, fallbackRegistry?, fallbackImageRepository? }]`
  - `validateManifest(manifest: unknown): string[]` — returns all violation messages; empty array = valid

- [ ] **Step 1: Create the branch**

Run: `git checkout -b m0a-upstream-pinning`
Expected: switched to new branch from current `main` head.

- [ ] **Step 2: Write the failing tests**

`scripts/test/upstream-pin/schema.test.mjs`:
```javascript
import { describe, expect, it } from 'vitest'
import { COMPONENTS, validateManifest } from '../../lib/upstream-pin/schema.mjs'

const validManifest = {
  capturedAt: '2026-09-06',
  components: [
    {
      name: 'paperless-ngx',
      repository: 'https://github.com/paperless-ngx/paperless-ngx',
      tag: 'v3.1.3',
      releaseUrl: 'https://github.com/paperless-ngx/paperless-ngx/releases/tag/v3.1.3',
      releaseDate: '2026-09-04',
      commitSha: 'a'.repeat(40),
      image: {
        registry: 'ghcr.io',
        repository: 'paperless-ngx/paperless-ngx',
        tagRef: 'v3.1.3',
        digest: `sha256:${'b'.repeat(64)}`,
      },
      evidence: {
        githubApi: 'https://api.github.com/repos/paperless-ngx/paperless-ngx/releases',
        registryApi: 'https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/v3.1.3',
      },
    },
  ],
}

describe('COMPONENTS', () => {
  it('declares exactly paperless-ngx and docuseal', () => {
    expect(COMPONENTS.map((c) => c.name)).toEqual(['paperless-ngx', 'docuseal'])
  })

  it('declares stable semver tag patterns only', () => {
    for (const c of COMPONENTS) {
      expect(c.tagPattern.test('latest')).toBe(false)
      expect(c.tagPattern.test('1.2.3-beta.1')).toBe(false)
      expect(c.tagPattern.test('v3.1.3')).toBe(true)
      expect(c.tagPattern.test('3.2.2')).toBe(true)
    }
  })
})

describe('validateManifest', () => {
  it('accepts a fully valid manifest', () => {
    expect(validateManifest(validManifest)).toEqual([])
  })

  it('rejects a non-object manifest', () => {
    expect(validateManifest(null).length).toBeGreaterThan(0)
    expect(validateManifest('nope').length).toBeGreaterThan(0)
  })

  it('requires both components to be present', () => {
    const m = structuredClone(validManifest)
    m.components = m.components.slice(0, 1)
    expect(validateManifest(m).join(' ')).toMatch(/docuseal/)
  })

  it.each([
    ['capturedAt', 'not-a-date'],
    ['capturedAt', '2026-13-99'],
  ])('rejects bad %s value %s', (field, value) => {
    const m = structuredClone(validManifest)
    m[field] = value
    expect(validateManifest(m).join(' ')).toMatch(new RegExp(field))
  })

  it.each([
    ['latest'],
    ['v3.1'],
    ['3.2.2-rc1'],
    [''],
  ])('rejects non-stable tag %s', (tag) => {
    const m = structuredClone(validManifest)
    m.components[0].tag = tag
    expect(validateManifest(m).join(' ')).toMatch(/tag/)
  })

  it('rejects a short commit SHA', () => {
    const m = structuredClone(validManifest)
    m.components[0].commitSha = 'abc123'
    expect(validateManifest(m).join(' ')).toMatch(/commitSha/)
  })

  it('rejects a non-sha256 digest', () => {
    const m = structuredClone(validManifest)
    m.components[0].image.digest = 'md5:deadbeef'
    expect(validateManifest(m).join(' ')).toMatch(/digest/)
  })

  it('rejects an image tagRef that is not a stable semver', () => {
    const m = structuredClone(validManifest)
    m.components[0].image.tagRef = 'main'
    expect(validateManifest(m).join(' ')).toMatch(/tagRef/)
  })

  it('reports every violation, not just the first', () => {
    const m = structuredClone(validManifest)
    m.components[0].commitSha = 'short'
    m.components[0].image.digest = 'oops'
    const errors = validateManifest(m)
    expect(errors.join(' ')).toMatch(/commitSha/)
    expect(errors.join(' ')).toMatch(/digest/)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/schema.test.mjs`
Expected: FAIL — module `../../lib/upstream-pin/schema.mjs` not found.

- [ ] **Step 4: Implement the schema library**

`scripts/lib/upstream-pin/schema.mjs`:
```javascript
/**
 * Manifest schema and component declarations for upstream version pinning.
 * Spec: plans/specs/2026-09-06-m0a-upstream-pinning-design.md
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STABLE_SEMVER = /^(?:v)?\d+\.\d+\.\d+$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const COMPONENTS = Object.freeze([
  Object.freeze({
    name: 'paperless-ngx',
    owner: 'paperless-ngx',
    repo: 'paperless-ngx',
    tagPattern: /^v\d+\.\d+\.\d+$/,
    registry: 'ghcr.io',
    imageRepository: 'paperless-ngx/paperless-ngx',
  }),
  Object.freeze({
    name: 'docuseal',
    owner: 'docusealco',
    repo: 'docuseal',
    tagPattern: /^\d+\.\d+\.\d+$/,
    registry: 'ghcr.io',
    imageRepository: 'docusealco/docuseal',
    fallbackRegistry: 'docker.io',
    fallbackImageRepository: 'docusealco/docuseal',
  }),
])

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function validateComponent(component, name, errors) {
  const prefix = `components[${name}]`
  for (const field of ['name', 'repository', 'tag', 'releaseUrl', 'releaseDate', 'commitSha']) {
    if (!isNonEmptyString(component[field])) errors.push(`${prefix}: missing ${field}`)
  }
  if (isNonEmptyString(component.tag) && !STABLE_SEMVER.test(component.tag)) {
    errors.push(`${prefix}: tag must be a stable semver (got ${JSON.stringify(component.tag)})`)
  }
  if (isNonEmptyString(component.releaseDate) && !ISO_DATE.test(component.releaseDate)) {
    errors.push(`${prefix}: releaseDate must be YYYY-MM-DD`)
  }
  if (isNonEmptyString(component.commitSha) && !COMMIT_SHA.test(component.commitSha)) {
    errors.push(`${prefix}: commitSha must be a 40-hex SHA`)
  }

  const image = component.image
  if (image === null || typeof image !== 'object') {
    errors.push(`${prefix}: missing image object`)
  } else {
    for (const field of ['registry', 'repository', 'tagRef', 'digest']) {
      if (!isNonEmptyString(image[field])) errors.push(`${prefix}: image missing ${field}`)
    }
    if (isNonEmptyString(image.tagRef) && !STABLE_SEMVER.test(image.tagRef)) {
      errors.push(`${prefix}: image.tagRef must be a stable semver`)
    }
    if (isNonEmptyString(image.digest) && !DIGEST.test(image.digest)) {
      errors.push(`${prefix}: image.digest must be sha256:<64 hex>`)
    }
  }

  const evidence = component.evidence
  if (evidence === null || typeof evidence !== 'object') {
    errors.push(`${prefix}: missing evidence object`)
  } else {
    for (const field of ['githubApi', 'registryApi']) {
      if (!isNonEmptyString(evidence[field])) errors.push(`${prefix}: evidence missing ${field}`)
    }
  }
}

export function validateManifest(manifest) {
  const errors = []
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest: must be a JSON object']
  }
  if (!isNonEmptyString(manifest.capturedAt) || !ISO_DATE.test(manifest.capturedAt)) {
    errors.push('manifest: capturedAt must be YYYY-MM-DD')
  }
  if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
    errors.push('manifest: components must be a non-empty array')
    return errors
  }
  const byName = new Map(manifest.components.map((c) => [c?.name, c]))
  for (const expected of COMPONENTS) {
    const component = byName.get(expected.name)
    if (component === undefined || component === null || typeof component !== 'object') {
      errors.push(`manifest: missing component ${expected.name}`)
      continue
    }
    validateComponent(component, expected.name, errors)
  }
  return errors
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/schema.test.mjs`
Expected: PASS (all).

- [ ] **Step 6: Lint, format, commit**

Run: `pnpm format; pnpm lint; pnpm test`
Expected: all exit 0.

```bash
git add scripts/lib/upstream-pin/schema.mjs scripts/test/upstream-pin/schema.test.mjs
git commit -m "feat: add upstream pin manifest schema and component declarations"
```

---

### Task 2: Drift report library (TDD)

**Files:**
- Create: `scripts/lib/upstream-pin/drift.mjs`
- Test: `scripts/test/upstream-pin/drift.test.mjs`

**Interfaces:**
- Consumes: manifest shape from Task 1
- Produces (used by Task 4): `computeDrift(expectedComponents, liveComponents) : Array<{ component, field, expected, actual }>` — compares `tag`, `commitSha`, `image.digest` per component; missing components reported as one drift entry with field `component`

- [ ] **Step 1: Write the failing tests**

`scripts/test/upstream-pin/drift.test.mjs`:
```javascript
import { describe, expect, it } from 'vitest'
import { computeDrift } from '../../lib/upstream-pin/drift.mjs'

function component(name, overrides = {}) {
  return {
    name,
    tag: `1.0.0`,
    commitSha: 'a'.repeat(40),
    image: { registry: 'ghcr.io', repository: `${name}/x`, tagRef: '1.0.0', digest: `sha256:${'b'.repeat(64)}` },
    ...overrides,
  }
}

describe('computeDrift', () => {
  it('returns empty when everything matches', () => {
    const expected = [component('paperless-ngx'), component('docuseal')]
    const live = structuredClone(expected)
    expect(computeDrift(expected, live)).toEqual([])
  })

  it('flags a tag change', () => {
    const expected = [component('paperless-ngx')]
    const live = [component('paperless-ngx', { tag: '1.1.0' })]
    const drift = computeDrift(expected, live)
    expect(drift).toEqual([
      { component: 'paperless-ngx', field: 'tag', expected: '1.0.0', actual: '1.1.0' },
    ])
  })

  it('flags a digest change', () => {
    const expected = [component('docuseal')]
    const live = [component('docuseal', { image: { registry: 'ghcr.io', repository: 'docuseal/x', tagRef: '1.0.0', digest: `sha256:${'c'.repeat(64)}` } })]
    const drift = computeDrift(expected, live)
    expect(drift).toEqual([
      { component: 'docuseal', field: 'image.digest', expected: `sha256:${'b'.repeat(64)}`, actual: `sha256:${'c'.repeat(64)}` },
    ])
  })

  it('flags a component missing from live', () => {
    const expected = [component('paperless-ngx'), component('docuseal')]
    const live = [component('paperless-ngx')]
    const drift = computeDrift(expected, live)
    expect(drift).toContainEqual({ component: 'docuseal', field: 'component', expected: 'present', actual: 'missing' })
  })

  it('flags a component that is new upstream', () => {
    const expected = []
    const live = [component('docuseal')]
    const drift = computeDrift(expected, live)
    expect(drift).toContainEqual({ component: 'docuseal', field: 'component', expected: 'absent', actual: 'present' })
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/drift.test.mjs` → module not found.

- [ ] **Step 3: Implement**

`scripts/lib/upstream-pin/drift.mjs`:
```javascript
/**
 * Computes drift between the committed pin manifest and live-derived facts.
 * Used by `pin-upstream.mjs validate` and future upgrade rehearsals.
 */
const COMPARED_FIELDS = ['tag', 'commitSha']

export function computeDrift(expectedComponents, liveComponents) {
  const drift = []
  const expectedByName = new Map(expectedComponents.map((c) => [c.name, c]))
  const liveByName = new Map(liveComponents.map((c) => [c.name, c]))

  for (const [name, expected] of expectedByName) {
    const live = liveByName.get(name)
    if (live === undefined) {
      drift.push({ component: name, field: 'component', expected: 'present', actual: 'missing' })
      continue
    }
    for (const field of COMPARED_FIELDS) {
      if (expected[field] !== live[field]) {
        drift.push({ component: name, field, expected: expected[field], actual: live[field] })
      }
    }
    const expectedDigest = expected.image?.digest
    const liveDigest = live.image?.digest
    if (expectedDigest !== liveDigest) {
      drift.push({ component: name, field: 'image.digest', expected: expectedDigest, actual: liveDigest })
    }
  }

  for (const name of liveByName.keys()) {
    if (!expectedByName.has(name)) {
      drift.push({ component: name, field: 'component', expected: 'absent', actual: 'present' })
    }
  }
  return drift
}
```

- [ ] **Step 4: Run to verify PASS**, then `pnpm format; pnpm lint`, commit:

```bash
git add scripts/lib/upstream-pin/drift.mjs scripts/test/upstream-pin/drift.test.mjs
git commit -m "feat: add pin drift comparison"
```

---

### Task 3: GitHub + registry clients (TDD, injected fetch)

**Files:**
- Create: `scripts/lib/upstream-pin/github.mjs`
- Create: `scripts/lib/upstream-pin/registry.mjs`
- Test: `scripts/test/upstream-pin/github.test.mjs`
- Test: `scripts/test/upstream-pin/registry.test.mjs`

**Interfaces:**
- Consumes: nothing from Tasks 1–2
- Produces (used by Task 4):
  - `fetchLatestStableRelease(fetchImpl, owner, repo) : { tag, releaseUrl, releaseDate }`
  - `fetchCommitSha(fetchImpl, owner, repo, tag) : string`
  - `fetchImageDigest(fetchImpl, registry, repository, tagRef) : string`
  - Registry dispatch: `ghcr.io` and `docker.io` supported; anything else throws

- [ ] **Step 1: Write the failing GitHub tests**

`scripts/test/upstream-pin/github.test.mjs`:
```javascript
import { describe, expect, it, vi } from 'vitest'
import { fetchCommitSha, fetchLatestStableRelease } from '../../lib/upstream-pin/github.mjs'

function jsonResponse(body, headers = {}) {
  return { ok: true, status: 200, json: async () => body, headers: new Map(Object.entries(headers)) }
}

const releases = [
  { tag_name: 'v3.1.3', draft: false, prerelease: false, published_at: '2026-09-04T10:02:14Z', html_url: 'https://github.com/o/r/releases/tag/v3.1.3' },
  { tag_name: 'v3.1.2', draft: false, prerelease: false, published_at: '2026-09-01T15:28:00Z', html_url: 'https://github.com/o/r/releases/tag/v3.1.2' },
]

describe('fetchLatestStableRelease', () => {
  it('picks the newest non-draft non-prerelease release and returns its facts', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(releases))
    const result = await fetchLatestStableRelease(fetchImpl, 'paperless-ngx', 'paperless-ngx')
    expect(result).toEqual({
      tag: 'v3.1.3',
      releaseUrl: 'https://github.com/o/r/releases/tag/v3.1.3',
      releaseDate: '2026-09-04',
    })
    expect(fetchImpl.mock.calls[0][0]).toContain('https://api.github.com/repos/paperless-ngx/paperless-ngx/releases')
  })

  it('skips drafts and prereleases', async () => {
    const mixed = [
      { tag_name: 'v3.2.0-rc1', draft: false, prerelease: true, published_at: '2026-09-05T00:00:00Z', html_url: 'x' },
      { tag_name: 'v3.1.9', draft: true, prerelease: false, published_at: '2026-09-05T01:00:00Z', html_url: 'x' },
      ...releases,
    ]
    const fetchImpl = vi.fn(async () => jsonResponse(mixed))
    const result = await fetchLatestStableRelease(fetchImpl, 'o', 'r')
    expect(result.tag).toBe('v3.1.3')
  })

  it('throws on a failed response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }))
    await expect(fetchLatestStableRelease(fetchImpl, 'o', 'r')).rejects.toThrow(/403/)
  })

  it('throws when no stable release exists', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ tag_name: 'rc1', draft: false, prerelease: true, published_at: 'x', html_url: 'x' }]))
    await expect(fetchLatestStableRelease(fetchImpl, 'o', 'r')).rejects.toThrow(/no stable release/)
  })
})

describe('fetchCommitSha', () => {
  it('returns the commit SHA for a tag', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ sha: 'a'.repeat(40) }))
    const sha = await fetchCommitSha(fetchImpl, 'o', 'r', 'v1.0.0')
    expect(sha).toBe('a'.repeat(40))
    expect(fetchImpl.mock.calls[0][0]).toContain('/commits/v1.0.0')
  })

  it('throws on failure', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    await expect(fetchCommitSha(fetchImpl, 'o', 'r', 'nope')).rejects.toThrow(/404/)
  })
})
```

- [ ] **Step 2: Write the failing registry tests**

`scripts/test/upstream-pin/registry.test.mjs`:
```javascript
import { describe, expect, it, vi } from 'vitest'
import { fetchImageDigest } from '../../lib/upstream-pin/registry.mjs'

const DIGEST = `sha256:${'b'.repeat(64)}`

function tokenResponse() {
  return { ok: true, status: 200, json: async () => ({ token: 'tok' }), headers: new Map() }
}

function manifestResponse(digest) {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: new Map([['docker-content-digest', digest]]),
  }
}

describe('fetchImageDigest', () => {
  it('uses the GHCR anonymous token then fetches the index manifest', async () => {
    const fetchImpl = vi.fn()
    fetchImpl.mockImplementationOnce(async (url) => {
      expect(url).toBe('https://ghcr.io/token?scope=repository:paperless-ngx/paperless-ngx:pull')
      return tokenResponse()
    })
    fetchImpl.mockImplementationOnce(async (url, init) => {
      expect(url).toBe('https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/v3.1.3')
      expect(init.headers.Authorization).toBe('Bearer tok')
      expect(init.headers.Accept).toContain('application/vnd.oci.image.index.v1+json')
      return manifestResponse(DIGEST)
    })
    const digest = await fetchImageDigest(fetchImpl, 'ghcr.io', 'paperless-ngx/paperless-ngx', 'v3.1.3')
    expect(digest).toBe(DIGEST)
  })

  it('uses Docker Hub auth + registry-1 for docker.io', async () => {
    const fetchImpl = vi.fn()
    fetchImpl.mockImplementationOnce(async (url) => {
      expect(url).toContain('https://auth.docker.io/token')
      expect(url).toContain('scope=repository:docusealco/docuseal:pull')
      return tokenResponse()
    })
    fetchImpl.mockImplementationOnce(async (url) => {
      expect(url).toBe('https://registry-1.docker.io/v2/docusealco/docuseal/manifests/3.2.2')
      return manifestResponse(DIGEST)
    })
    const digest = await fetchImageDigest(fetchImpl, 'docker.io', 'docusealco/docuseal', '3.2.2')
    expect(digest).toBe(DIGEST)
  })

  it('rejects unsupported registries', async () => {
    await expect(fetchImageDigest(vi.fn(), 'example.com', 'a/b', '1.0.0')).rejects.toThrow(/unsupported registry/)
  })

  it('fails loudly when the manifest response carries no digest', async () => {
    const fetchImpl = vi.fn()
    fetchImpl.mockImplementationOnce(async () => tokenResponse())
    fetchImpl.mockImplementationOnce(async () => manifestResponse(null))
    await expect(fetchImageDigest(fetchImpl, 'ghcr.io', 'a/b', '1.0.0')).rejects.toThrow(/digest/)
  })
})
```

- [ ] **Step 3: Run both to verify FAIL** — `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/` → modules not found.

- [ ] **Step 4: Implement the GitHub client**

`scripts/lib/upstream-pin/github.mjs`:
```javascript
/**
 * GitHub API client for upstream pinning. Anonymous — no credentials, ever.
 * All functions take an injected fetch implementation so tests stay offline.
 */
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'doculite-pin-upstream' }
const STABLE = /^(?:v)?\d+\.\d+\.\d+$/

export async function fetchLatestStableRelease(fetchImpl, owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`
  const res = await fetchImpl(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`GitHub releases request failed with status ${res.status} for ${owner}/${repo}`)
  const releases = await res.json()
  const stable = releases.find(
    (r) => r.draft === false && r.prerelease === false && typeof r.tag_name === 'string' && STABLE.test(r.tag_name),
  )
  if (stable === undefined) {
    throw new Error(`no stable release found for ${owner}/${repo} in the latest 30 releases`)
  }
  return {
    tag: stable.tag_name,
    releaseUrl: stable.html_url,
    releaseDate: String(stable.published_at).slice(0, 10),
  }
}

export async function fetchCommitSha(fetchImpl, owner, repo, tag) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(tag)}`
  const res = await fetchImpl(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`GitHub commit request failed with status ${res.status} for ${owner}/${repo}@${tag}`)
  const body = await res.json()
  if (typeof body.sha !== 'string') throw new Error(`GitHub commit response missing sha for ${owner}/${repo}@${tag}`)
  return body.sha
}
```

- [ ] **Step 5: Implement the registry client**

`scripts/lib/upstream-pin/registry.mjs`:
```javascript
/**
 * OCI registry client for multi-arch index digests. Anonymous — no credentials, ever.
 * All functions take an injected fetch implementation so tests stay offline.
 */
const INDEX_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

export async function fetchImageDigest(fetchImpl, registry, repository, tagRef) {
  if (registry === 'ghcr.io') return fetchGhcr(fetchImpl, repository, tagRef)
  if (registry === 'docker.io') return fetchDockerHub(fetchImpl, repository, tagRef)
  throw new Error(`unsupported registry: ${registry}`)
}

async function fetchGhcr(fetchImpl, repository, tagRef) {
  const token = await fetchToken(fetchImpl, `https://ghcr.io/token?scope=repository:${repository}:pull`)
  return fetchDigest(fetchImpl, `https://ghcr.io/v2/${repository}/manifests/${tagRef}`, token)
}

async function fetchDockerHub(fetchImpl, repository, tagRef) {
  const token = await fetchToken(
    fetchImpl,
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,
  )
  return fetchDigest(fetchImpl, `https://registry-1.docker.io/v2/${repository}/manifests/${tagRef}`, token)
}

async function fetchToken(fetchImpl, url) {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`registry token request failed with status ${res.status} for ${url}`)
  const body = await res.json()
  if (typeof body.token !== 'string') throw new Error(`registry token response missing token for ${url}`)
  return body.token
}

async function fetchDigest(fetchImpl, url, token) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: INDEX_ACCEPT } })
  if (!res.ok) throw new Error(`manifest request failed with status ${res.status} for ${url}`)
  const digest = res.headers.get('docker-content-digest')
  if (digest === null || digest === undefined) throw new Error(`manifest response carried no docker-content-digest for ${url}`)
  return digest
}
```

- [ ] **Step 6: Run all pin tests to verify PASS**, then `pnpm format; pnpm lint`, commit:

```bash
git add scripts/lib/upstream-pin/github.mjs scripts/lib/upstream-pin/registry.mjs scripts/test/upstream-pin/github.test.mjs scripts/test/upstream-pin/registry.test.mjs
git commit -m "feat: add anonymous github and oci registry clients for pinning"
```

---

### Task 4: CLI orchestration (TDD)

**Files:**
- Create: `scripts/pin-upstream.mjs`
- Test: `scripts/test/upstream-pin/cli.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1–3
- Produces: `fetchAllComponents(deps) : { manifest }` where `deps = { fetchImpl, components, todayIso }`; and CLI `node scripts/pin-upstream.mjs fetch|validate` with exit 0/1 contract (validate exits 1 on drift or manifest-invalid; fetch exits 1 when any component fails — no partial manifests)

- [ ] **Step 1: Write the failing CLI tests**

`scripts/test/upstream-pin/cli.test.mjs`:
```javascript
import { describe, expect, it, vi } from 'vitest'
import { fetchAllComponents, resolveComponent } from '../../pin-upstream.mjs'

const SHA = 'a'.repeat(40)
const DIGEST = `sha256:${'b'.repeat(64)}`

const paperless = {
  name: 'paperless-ngx',
  owner: 'paperless-ngx',
  repo: 'paperless-ngx',
  tagPattern: /^v\d+\.\d+\.\d+$/,
  registry: 'ghcr.io',
  imageRepository: 'paperless-ngx/paperless-ngx',
}

describe('resolveComponent', () => {
  it('resolves tag, commit, and digest into a manifest component record', async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ tag_name: 'v1.2.3', draft: false, prerelease: false, published_at: '2026-09-01T00:00:00Z', html_url: 'https://github.com/x/r/releases/tag/v1.2.3' }], headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ sha: SHA }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({}), headers: new Map([['docker-content-digest', DIGEST]]) }))

    const record = await resolveComponent(paperless, { fetchImpl, todayIso: '2026-09-06' })
    expect(record).toMatchObject({
      name: 'paperless-ngx',
      tag: 'v1.2.3',
      commitSha: SHA,
      image: { registry: 'ghcr.io', repository: 'paperless-ngx/paperless-ngx', tagRef: 'v1.2.3', digest: DIGEST },
    })
  })

  it('falls back to the declared fallback registry when the primary fails', async () => {
    const withFallback = { ...paperless, fallbackRegistry: 'docker.io', fallbackImageRepository: 'paperless-ngx/paperless-ngx' }
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ tag_name: 'v1.2.3', draft: false, prerelease: false, published_at: '2026-09-01T00:00:00Z', html_url: 'u' }], headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ sha: SHA }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: false, status: 404, json: async () => ({}), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({}), headers: new Map([['docker-content-digest', DIGEST]]) }))

    const record = await resolveComponent(withFallback, { fetchImpl, todayIso: '2026-09-06' })
    expect(record.image.registry).toBe('docker.io')
  })

  it('aborts the component when nothing resolves', async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ tag_name: 'v1.2.3', draft: false, prerelease: false, published_at: '2026-09-01T00:00:00Z', html_url: 'u' }], headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ sha: SHA }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: false, status: 404, json: async () => ({}), headers: new Map() }))

    await expect(resolveComponent(paperless, { fetchImpl, todayIso: '2026-09-06' })).rejects.toThrow(/digest/)
  })
})

describe('fetchAllComponents', () => {
  it('builds a valid manifest for all declared components', async () => {
    const fetchImpl = vi.fn()
      // paperless: releases, commit, token, manifest
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ tag_name: 'v1.2.3', draft: false, prerelease: false, published_at: '2026-09-01T00:00:00Z', html_url: 'u1' }], headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ sha: SHA }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({}), headers: new Map([['docker-content-digest', DIGEST]]) }))
      // docuseal: releases, commit, token, manifest
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ tag_name: '2.0.0', draft: false, prerelease: false, published_at: '2026-08-11T00:00:00Z', html_url: 'u2' }], headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ sha: SHA }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ token: 't' }), headers: new Map() }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({}), headers: new Map([['docker-content-digest', DIGEST]]) }))

    const { manifest, errors } = await fetchAllComponents({ fetchImpl, todayIso: '2026-09-06' })
    expect(errors).toEqual([])
    expect(manifest.capturedAt).toBe('2026-09-06')
    expect(manifest.components.map((c) => c.name)).toEqual(['paperless-ngx', 'docuseal'])
    expect(manifest.components[0].releaseDate).toBe('2026-09-01')
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — module `pin-upstream.mjs` not found.

- [ ] **Step 3: Implement the CLI**

`scripts/pin-upstream.mjs`:
```javascript
#!/usr/bin/env node
/**
 * Upstream version pinning tool.
 *   node scripts/pin-upstream.mjs fetch     — resolve latest stable pins and write deploy/upstream-versions.json
 *   node scripts/pin-upstream.mjs validate  — re-derive live facts and report drift against the manifest
 * Anonymous access only — no credentials, ever. Fails loudly rather than writing partial pins.
 * Spec: plans/specs/2026-09-06-m0a-upstream-pinning-design.md
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeDrift } from './lib/upstream-pin/drift.mjs'
import { fetchCommitSha, fetchLatestStableRelease } from './lib/upstream-pin/github.mjs'
import { fetchImageDigest } from './lib/upstream-pin/registry.mjs'
import { COMPONENTS, validateManifest } from './lib/upstream-pin/schema.mjs'

const MANIFEST_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'upstream-versions.json')

export async function resolveComponent(component, { fetchImpl, todayIso }) {
  const release = await fetchLatestStableRelease(fetchImpl, component.owner, component.repo)
  const commitSha = await fetchCommitSha(fetchImpl, component.owner, component.repo, release.tag)

  const registries = [[component.registry, component.imageRepository]]
  if (component.fallbackRegistry !== undefined) {
    registries.push([component.fallbackRegistry, component.fallbackImageRepository])
  }

  let lastError = null
  let image = null
  for (const [registry, repository] of registries) {
    try {
      const digest = await fetchImageDigest(fetchImpl, registry, repository, release.tag)
      image = { registry, repository, tagRef: release.tag, digest }
      break
    } catch (error) {
      lastError = error
    }
  }
  if (image === null) {
    throw new Error(`could not resolve image digest for ${component.name}: ${lastError?.message ?? 'unknown error'}`)
  }

  return {
    name: component.name,
    repository: `https://github.com/${component.owner}/${component.repo}`,
    tag: release.tag,
    releaseUrl: release.releaseUrl,
    releaseDate: release.releaseDate,
    commitSha,
    image,
    evidence: {
      githubApi: `https://api.github.com/repos/${component.owner}/${component.repo}/releases`,
      registryApi: `https://${image.registry}/v2/${image.repository}/manifests/${image.tagRef}`,
    },
    capturedAt: todayIso,
  }
}

export async function fetchAllComponents({ fetchImpl, todayIso, components = COMPONENTS }) {
  const records = []
  for (const component of components) {
    records.push(await resolveComponent(component, { fetchImpl, todayIso }))
  }
  const manifest = {
    capturedAt: todayIso,
    components: records.map(({ capturedAt, ...rest }) => rest),
  }
  return { manifest, errors: validateManifest(manifest) }
}

async function writeManifest(manifest) {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true })
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function readManifest() {
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  return JSON.parse(raw)
}

async function runFetch() {
  const { manifest, errors } = await fetchAllComponents({ fetchImpl: fetch, todayIso: new Date().toISOString().slice(0, 10) })
  if (errors.length > 0) {
    console.error(`generated manifest is invalid, aborting:`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }
  await writeManifest(manifest)
  for (const c of manifest.components) {
    console.log(`${c.name}: tag=${c.tag} commit=${c.commitSha.slice(0, 12)} digest=${c.image.digest.slice(0, 19)}… (${c.image.registry}/${c.image.repository})`)
  }
  console.log(`wrote ${MANIFEST_PATH}`)
}

async function runValidate() {
  let manifest
  try {
    manifest = await readManifest()
  } catch (error) {
    console.error(`cannot read manifest: ${error.message}`)
    process.exitCode = 1
    return
  }
  const errors = validateManifest(manifest)
  if (errors.length > 0) {
    console.error('manifest is invalid:')
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }

  const live = []
  for (const component of COMPONENTS) {
    const recorded = manifest.components.find((c) => c.name === component.name)
    if (recorded === undefined) continue
    const release = await fetchLatestStableRelease(fetch, component.owner, component.repo)
    const commitSha = await fetchCommitSha(fetch, component.owner, component.repo, recorded.tag)
    const digest = await fetchImageDigest(fetch, recorded.image.registry, recorded.image.repository, recorded.image.tagRef)
    live.push({
      name: recorded.name,
      tag: release.tag,
      commitSha,
      image: { ...recorded.image, digest },
    })
  }

  const drift = computeDrift(manifest.components, live)
  if (drift.length === 0) {
    console.log('no drift: manifest matches live registries')
    return
  }
  console.error(`drift detected (${drift.length}):`)
  for (const d of drift) console.error(`  - ${d.component}.${d.field}: expected ${d.expected}, live ${d.actual}`)
  process.exitCode = 1
}

const mode = process.argv[2]
if (mode === 'fetch') {
  await runFetch()
} else if (mode === 'validate') {
  await runValidate()
} else {
  console.error('usage: node scripts/pin-upstream.mjs <fetch|validate>')
  process.exit(2)
}
```

Note: `capturedAt` is deliberately kept out of per-component records in the written manifest (top-level only); the test at Step 1 asserts the top-level value. If the `components[0].releaseDate` assertion fails because of mock ordering, fix the mock order — not the implementation.

- [ ] **Step 4: Run ALL pin tests to verify PASS** — `pnpm vitest run -c vitest.config.ts scripts/test/upstream-pin/`
Expected: PASS (schema, drift, github, registry, cli suites).

- [ ] **Step 5: Full quality gate, then commit**

Run: `pnpm format; pnpm lint; pnpm test; pnpm validate:docs; pnpm typecheck; pnpm build`
Expected: all exit 0.

```bash
git add scripts/pin-upstream.mjs scripts/test/upstream-pin/cli.test.mjs
git commit -m "feat: add upstream pinning fetch and validate cli"
```

---

### Task 5: Live fetch — the actual pin record

**Files:**
- Create: `deploy/upstream-versions.json` (generated)

**Interfaces:**
- Consumes: the completed tool from Task 4
- Produces: the committed pin manifest — the deliverable itself

- [ ] **Step 1: Run the live fetch**

Run: `node scripts/pin-upstream.mjs fetch`
Expected: exit 0; prints per-component tag/commit/digest lines and `wrote ...deploy/upstream-versions.json`. If GitHub rate-limits (403), wait and retry once; if a registry refuses anonymous access for a component, report BLOCKED with the exact error — do not weaken the fail-loud rule.

- [ ] **Step 2: Inspect the manifest**

Read `deploy/upstream-versions.json`. Verify: both components present; tags are stable semver; commit SHAs are 40-hex; digests are `sha256:` + 64 hex; dates are ISO. Record the resolved tags in the task report (expected: Paperless v3.1.x, DocuSeal 3.2.x — report whatever live returned).

- [ ] **Step 3: Run validate to prove agreement**

Run: `node scripts/pin-upstream.mjs validate`
Expected: exit 0, `no drift`.

- [ ] **Step 4: Commit the record**

```bash
git add deploy/upstream-versions.json
git commit -m "chore: pin paperless-ngx and docuseal upstream versions"
```

---

### Task 6: Doc updates

**Files:**
- Modify: `docs/engineering/upstream-upgrade-policy.md` (add "Current pins" section after "## Policy")
- Modify: `AGENTS.md` (Current state bullet)

**Interfaces:**
- Consumes: the manifest from Task 5
- Produces: docs that point at the manifest; no companion change expected (verified in spec)

- [ ] **Step 1: Add to `docs/engineering/upstream-upgrade-policy.md`** (new section immediately after the `## Policy` section):

```markdown
## Current pins

The authoritative record of pinned upstream versions — tag, commit, container digest, and capture
date — is [`deploy/upstream-versions.json`](../../../deploy/upstream-versions.json). Re-pin only
through the upgrade procedure above; record new evidence with `node scripts/pin-upstream.mjs fetch`
and confirm agreement with `node scripts/pin-upstream.mjs validate`.
```

- [ ] **Step 2: Update `AGENTS.md` Current state** — replace the bullet:

```
- Still docs-only above the scaffold: no product features, no database, no upstream integrations, no pinned upstream versions yet.
```
with:
```
- Upstream versions are pinned in `deploy/upstream-versions.json` (Paperless-ngx, DocuSeal); re-pin only via the upgrade policy. Still no product features, database, or upstream integrations above the scaffold.
```
Keep every other line of AGENTS.md untouched.

- [ ] **Step 3: Validate, commit**

Run: `pnpm validate:docs; pnpm lint; pnpm test`
Expected: all exit 0 (the manifest link in the policy doc must resolve — `pnpm validate:docs` checks it).

```bash
git add docs/engineering/upstream-upgrade-policy.md AGENTS.md
git commit -m "docs: point upgrade policy and agent guide at the upstream pin manifest"
```

---

### Task 7: PR, CI, merge

**Files:**
- Remote-side only

**Interfaces:**
- Consumes: branch `m0a-upstream-pinning` with Tasks 1–6 commits
- Produces: merged `main` with the pin manifest; branch deleted

- [ ] **Step 1: Push the branch**

Run: `git push -u origin m0a-upstream-pinning`

- [ ] **Step 2: Open the PR**

Run: `gh pr create --base main --head m0a-upstream-pinning --title "M0-A: pin Paperless-ngx and DocuSeal upstream versions" --body "Implements plans/specs/2026-09-06-m0a-upstream-pinning-design.md. Adds the pinning tool (offline-tested), runs the live fetch, records deploy/upstream-versions.json, and points the upgrade policy + AGENTS.md at it. Resolved: <paperless tag> and <docuseal tag> from Task 5 report."`

- [ ] **Step 3: Wait for CI, merge**

Run: `gh pr checks --watch` then `gh pr merge --squash --delete-branch`
Expected: `CI / quality` green; PR merged; branch deleted.

- [ ] **Step 4: Verify main**

Run: `git checkout main; git pull; node scripts/pin-upstream.mjs validate`
Expected: exit 0 — the merged manifest matches live registries.

---

## Out of scope

- Compose stack (M0-B), fixtures (M0-C), adapter proof (M0-D)
- DocuSeal license decision (LIC-001) — evidence only
- CI wiring of `validate` mode — deliberately manual per spec (network in CI is flaky; upgrade rehearsals run it)

## Self-review notes

- Spec coverage: manifest schema+file (T1, T5), fetch/validate tool (T3, T4), digest from header (T3), fail-loud + no partial pins (T4 resolveComponent throws; fetch aborts), registry fallback (T4 test), doc updates (T6), offline tests (all tests inject fetch), PR-through-protected-main (T7).
- Placeholder scan: none — every code step is complete; Task 7's `<paperless tag>` is a runtime value from Task 5's report, not an unmade decision.
- Type consistency: `validateManifest`, `COMPONENTS`, `computeDrift`, `fetchLatestStableRelease`, `fetchCommitSha`, `fetchImageDigest`, `resolveComponent`, `fetchAllComponents` signatures match across tasks; test imports match file paths.
