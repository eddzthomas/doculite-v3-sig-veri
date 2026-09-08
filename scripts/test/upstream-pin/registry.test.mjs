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
    const digest = await fetchImageDigest(
      fetchImpl,
      'ghcr.io',
      'paperless-ngx/paperless-ngx',
      'v3.1.3',
    )
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
    await expect(fetchImageDigest(vi.fn(), 'example.com', 'a/b', '1.0.0')).rejects.toThrow(
      /unsupported registry/,
    )
  })

  it('fails loudly when the manifest response carries no digest', async () => {
    const fetchImpl = vi.fn()
    fetchImpl.mockImplementationOnce(async () => tokenResponse())
    fetchImpl.mockImplementationOnce(async () => manifestResponse(null))
    await expect(fetchImageDigest(fetchImpl, 'ghcr.io', 'a/b', '1.0.0')).rejects.toThrow(/digest/)
  })
})
