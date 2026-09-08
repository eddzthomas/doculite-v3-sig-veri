import { describe, expect, it } from 'vitest'
import { computeDrift } from '../../lib/upstream-pin/drift.mjs'

function component(name, overrides = {}) {
  return {
    name,
    tag: `1.0.0`,
    commitSha: 'a'.repeat(40),
    image: {
      registry: 'ghcr.io',
      repository: `${name}/x`,
      tagRef: '1.0.0',
      digest: `sha256:${'b'.repeat(64)}`,
    },
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
    const live = [
      component('docuseal', {
        image: {
          registry: 'ghcr.io',
          repository: 'docuseal/x',
          tagRef: '1.0.0',
          digest: `sha256:${'c'.repeat(64)}`,
        },
      }),
    ]
    const drift = computeDrift(expected, live)
    expect(drift).toEqual([
      {
        component: 'docuseal',
        field: 'image.digest',
        expected: `sha256:${'b'.repeat(64)}`,
        actual: `sha256:${'c'.repeat(64)}`,
      },
    ])
  })

  it('flags a component missing from live', () => {
    const expected = [component('paperless-ngx'), component('docuseal')]
    const live = [component('paperless-ngx')]
    const drift = computeDrift(expected, live)
    expect(drift).toContainEqual({
      component: 'docuseal',
      field: 'component',
      expected: 'present',
      actual: 'missing',
    })
  })

  it('flags a component that is new upstream', () => {
    const expected = []
    const live = [component('docuseal')]
    const drift = computeDrift(expected, live)
    expect(drift).toContainEqual({
      component: 'docuseal',
      field: 'component',
      expected: 'absent',
      actual: 'present',
    })
  })
})
