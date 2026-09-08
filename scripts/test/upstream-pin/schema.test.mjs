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
    {
      name: 'docuseal',
      repository: 'https://github.com/docusealco/docuseal',
      tag: '3.2.2',
      releaseUrl: 'https://github.com/docusealco/docuseal/releases/tag/3.2.2',
      releaseDate: '2026-09-01',
      commitSha: 'c'.repeat(40),
      image: {
        registry: 'docker.io',
        repository: 'docuseal/docuseal',
        tagRef: '3.2.2',
        digest: `sha256:${'d'.repeat(64)}`,
      },
      evidence: {
        githubApi: 'https://api.github.com/repos/docusealco/docuseal/releases',
        registryApi: 'https://registry-1.docker.io/v2/docuseal/docuseal/manifests/3.2.2',
      },
    },
    {
      name: 'postgres',
      repository: 'https://github.com/postgres/postgres',
      tag: 'REL_17_5',
      releaseUrl: 'https://github.com/postgres/postgres/releases/tag/REL_17_5',
      releaseDate: null,
      commitSha: 'e'.repeat(40),
      image: {
        registry: 'docker.io',
        repository: 'library/postgres',
        tagRef: '17.5',
        digest: `sha256:${'f'.repeat(64)}`,
      },
      evidence: {
        githubApi: 'https://api.github.com/repos/postgres/postgres/git/matching-refs/tags/',
        registryApi: 'https://registry-1.docker.io/v2/library/postgres/manifests/17.5',
      },
    },
    {
      name: 'redis',
      repository: 'https://github.com/redis/redis',
      tag: '8.2.0',
      releaseUrl: 'https://github.com/redis/redis/releases/tag/8.2.0',
      releaseDate: '2026-08-20',
      commitSha: '1'.repeat(40),
      image: {
        registry: 'docker.io',
        repository: 'library/redis',
        tagRef: '8.2.0',
        digest: `sha256:${'2'.repeat(64)}`,
      },
      evidence: {
        githubApi: 'https://api.github.com/repos/redis/redis/releases',
        registryApi: 'https://registry-1.docker.io/v2/library/redis/manifests/8.2.0',
      },
    },
  ],
}

describe('COMPONENTS', () => {
  it('declares exactly paperless-ngx, docuseal, postgres, and redis', () => {
    expect(COMPONENTS.map((c) => c.name)).toEqual([
      'paperless-ngx',
      'docuseal',
      'postgres',
      'redis',
    ])
  })

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

  it('requires v-prefix tags for paperless-ngx and bare or v-prefixed for docuseal', () => {
    const byName = new Map(COMPONENTS.map((c) => [c.name, c]))
    expect(byName.get('paperless-ngx').tagPattern.test('v3.1.3')).toBe(true)
    expect(byName.get('paperless-ngx').tagPattern.test('3.2.2')).toBe(false)
    expect(byName.get('docuseal').tagPattern.test('3.2.2')).toBe(true)
    expect(byName.get('docuseal').tagPattern.test('v3.2.2')).toBe(true)
  })

  it('accepts postgres REL_ tags and rejects others', () => {
    const byName = new Map(COMPONENTS.map((c) => [c.name, c]))
    expect(byName.get('postgres').tagPattern.test('REL_17_5')).toBe(true)
    expect(byName.get('postgres').tagPattern.test('v17.5')).toBe(false)
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

  it('requires all declared components to be present', () => {
    const m = structuredClone(validManifest)
    m.components = m.components.slice(0, 1)
    expect(validateManifest(m).join(' ')).toMatch(/docuseal/)
  })

  it('validates only the components it is given when an explicit expected list is passed', () => {
    const m = structuredClone(validManifest)
    m.components = m.components.slice(0, 2)
    expect(
      validateManifest(m, { expected: [{ name: 'paperless-ngx' }, { name: 'docuseal' }] }),
    ).toEqual([])
    expect(validateManifest(m).length).toBeGreaterThan(0)
  })

  it('accepts a null releaseDate and rejects empty or non-date values', () => {
    const m = structuredClone(validManifest)
    m.components[2].releaseDate = null
    expect(validateManifest(m)).toEqual([])
    m.components[2].releaseDate = ''
    expect(validateManifest(m).join(' ')).toMatch(/releaseDate/)
    m.components[2].releaseDate = 'not-a-date'
    expect(validateManifest(m).join(' ')).toMatch(/releaseDate/)
  })

  it.each([
    ['capturedAt', 'not-a-date'],
    ['capturedAt', '2026-13-99'],
  ])('rejects bad %s value %s', (field, value) => {
    const m = structuredClone(validManifest)
    m[field] = value
    expect(validateManifest(m).join(' ')).toMatch(new RegExp(field))
  })

  it.each([['latest'], ['v3.1'], ['3.2.2-rc1'], ['']])('rejects non-stable tag %s', (tag) => {
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
