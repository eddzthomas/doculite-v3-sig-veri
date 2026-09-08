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
        registry: 'ghcr.io',
        repository: 'docusealco/docuseal',
        tagRef: '3.2.2',
        digest: `sha256:${'d'.repeat(64)}`,
      },
      evidence: {
        githubApi: 'https://api.github.com/repos/docusealco/docuseal/releases',
        registryApi: 'https://ghcr.io/v2/docusealco/docuseal/manifests/3.2.2',
      },
    },
  ],
}

describe('COMPONENTS', () => {
  it('declares exactly paperless-ngx and docuseal', () => {
    expect(COMPONENTS.map((c) => c.name)).toEqual(['paperless-ngx', 'docuseal'])
  })

  it('requires v-prefix tags for paperless-ngx and bare or v-prefixed for docuseal', () => {
    const byName = new Map(COMPONENTS.map((c) => [c.name, c]))
    expect(byName.get('paperless-ngx').tagPattern.test('v3.1.3')).toBe(true)
    expect(byName.get('paperless-ngx').tagPattern.test('3.2.2')).toBe(false)
    expect(byName.get('docuseal').tagPattern.test('3.2.2')).toBe(true)
    expect(byName.get('docuseal').tagPattern.test('v3.2.2')).toBe(true)
  })

  it('declares paperless-ngx strips the v prefix for its ghcr image tag', () => {
    const paperless = COMPONENTS.find((c) => c.name === 'paperless-ngx')
    expect(paperless.imageTagStripV).toBe(true)
    expect(paperless.registry).toBe('ghcr.io')
    expect(paperless.imageRepository).toBe('paperless-ngx/paperless-ngx')
  })

  it('declares docuseal on docker.io under the docuseal org with no dead fallback', () => {
    const docuseal = COMPONENTS.find((c) => c.name === 'docuseal')
    expect(docuseal.imageTagStripV).toBe(false)
    expect(docuseal.registry).toBe('docker.io')
    expect(docuseal.imageRepository).toBe('docuseal/docuseal')
    expect(docuseal.fallbackRegistry).toBeUndefined()
    expect(docuseal.fallbackImageRepository).toBeUndefined()
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
