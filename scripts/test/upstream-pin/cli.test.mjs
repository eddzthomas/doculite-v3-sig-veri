import { describe, expect, it, vi } from 'vitest'
import { fetchAllComponents, resolveComponent } from '../../pin-upstream.mjs'

const SHA = 'a'.repeat(40)
const DIGEST = `sha256:${'b'.repeat(64)}`

const paperless = {
  name: 'paperless-ngx',
  owner: 'paperless-ngx',
  repo: 'paperless-ngx',
  tagPattern: /^v\d+\.\d+\.\d+$/,
  tagSource: 'releases',
  imageTagTransform: 'strip-v',
  registry: 'ghcr.io',
  imageRepository: 'paperless-ngx/paperless-ngx',
}

const docusealMock = {
  name: 'docuseal',
  owner: 'docusealco',
  repo: 'docuseal',
  tagPattern: /^(?:v)?\d+\.\d+\.\d+$/,
  tagSource: 'releases',
  imageTagTransform: 'identity',
  registry: 'docker.io',
  imageRepository: 'docuseal/docuseal',
}

const ok =
  (json, headers = new Map()) =>
  async () => ({ ok: true, status: 200, json: async () => json, headers })

describe('resolveComponent', () => {
  it('resolves tag, commit, and digest into a manifest component record', async () => {
    let manifestUrl = null
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        ok([
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'https://github.com/x/r/releases/tag/v1.2.3',
          },
        ]),
      )
      .mockImplementationOnce(ok({ sha: SHA }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(async (url) => {
        manifestUrl = url
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          headers: new Map([['docker-content-digest', DIGEST]]),
        }
      })

    const record = await resolveComponent(paperless, { fetchImpl, todayIso: '2026-09-06' })
    expect(record).toMatchObject({
      name: 'paperless-ngx',
      tag: 'v1.2.3',
      commitSha: SHA,
      image: {
        registry: 'ghcr.io',
        repository: 'paperless-ngx/paperless-ngx',
        tagRef: '1.2.3',
        digest: DIGEST,
      },
    })
    // ghcr serves paperless images under the bare semver tag, not the v-prefixed release tag.
    expect(manifestUrl).toBe('https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/1.2.3')
    expect(record.evidence.registryApi).toBe(
      'https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/1.2.3',
    )
  })

  it('falls back to the declared fallback registry when the primary fails', async () => {
    const withFallback = {
      ...paperless,
      fallbackRegistry: 'docker.io',
      fallbackImageRepository: 'paperless-ngx/paperless-ngx',
    }
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        ok([
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u',
          },
        ]),
      )
      .mockImplementationOnce(ok({ sha: SHA }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
        headers: new Map(),
      }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(async (url) => {
        expect(url).toBe(
          'https://registry-1.docker.io/v2/paperless-ngx/paperless-ngx/manifests/1.2.3',
        )
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          headers: new Map([['docker-content-digest', DIGEST]]),
        }
      })

    const record = await resolveComponent(withFallback, { fetchImpl, todayIso: '2026-09-06' })
    expect(record.image.registry).toBe('docker.io')
    expect(record.image.tagRef).toBe('1.2.3')
  })

  it('aborts the component when nothing resolves', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        ok([
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u',
          },
        ]),
      )
      .mockImplementationOnce(ok({ sha: SHA }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
        headers: new Map(),
      }))

    await expect(
      resolveComponent(paperless, { fetchImpl, todayIso: '2026-09-06' }),
    ).rejects.toThrow(/digest/)
  })

  it('aborts loudly when a component has no fallback and its primary registry fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        ok([
          {
            tag_name: '3.2.4',
            draft: false,
            prerelease: false,
            published_at: '2026-09-05T00:00:00Z',
            html_url: 'u',
          },
        ]),
      )
      .mockImplementationOnce(ok({ sha: SHA }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
        headers: new Map(),
      }))

    await expect(
      resolveComponent(docusealMock, { fetchImpl, todayIso: '2026-09-06' }),
    ).rejects.toThrow(/digest/)
  })
})

describe('image-tag transforms', () => {
  // REL-style tags cannot arrive via the releases API (it only returns stable
  // semver), so the identity/postgres-rel cases exercise the tags API path.
  it.each([
    ['strip-v', 'releases', 'v17.5.1', '17.5.1'],
    ['identity', 'tags', 'REL_17_5', 'REL_17_5'],
    ['postgres-rel', 'tags', 'REL_17_5', '17.5'],
  ])('maps %s tag %s to image tag %s', async (transform, tagSource, ghTag, imageTag) => {
    const component = {
      name: 'x',
      owner: 'o',
      repo: 'r',
      tagPattern: /^\w[\w.]*$/,
      tagSource,
      imageTagTransform: transform,
      registry: 'ghcr.io',
      imageRepository: 'o/r',
    }
    const fetchImpl = vi.fn()
    if (tagSource === 'releases') {
      fetchImpl.mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: ghTag,
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u',
          },
        ],
        headers: new Map(),
      }))
    } else {
      fetchImpl.mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          { ref: `refs/tags/${ghTag}`, object: { sha: 'a'.repeat(40), type: 'commit' } },
        ],
        headers: new Map(),
      }))
    }
    fetchImpl
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: 'a'.repeat(40) }),
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ token: 't' }),
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: new Map([['docker-content-digest', `sha256:${'b'.repeat(64)}`]]),
      }))
    const record = await resolveComponent(component, { fetchImpl, todayIso: '2026-09-06' })
    expect(record.tag).toBe(ghTag)
    expect(record.image.tagRef).toBe(imageTag)
  })
})

describe('fetchAllComponents', () => {
  it('builds a valid manifest for all declared components', async () => {
    const manifestUrls = []
    const captureManifest = (headers) => async (url) => {
      manifestUrls.push(url)
      return { ok: true, status: 200, json: async () => ({}), headers }
    }
    const fetchImpl = vi
      .fn()
      // paperless: releases, commit, ghcr token, ghcr manifest (stripped tag)
      .mockImplementationOnce(
        ok([
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u1',
          },
        ]),
      )
      .mockImplementationOnce(ok({ sha: SHA }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(captureManifest(new Map([['docker-content-digest', DIGEST]])))
      // docuseal: releases, commit, docker.io token, docker.io manifest (own org, bare tag)
      .mockImplementationOnce(
        ok([
          {
            tag_name: '2.0.0',
            draft: false,
            prerelease: false,
            published_at: '2026-08-11T00:00:00Z',
            html_url: 'u2',
          },
        ]),
      )
      .mockImplementationOnce(ok({ sha: SHA }))
      .mockImplementationOnce(ok({ token: 't' }))
      .mockImplementationOnce(captureManifest(new Map([['docker-content-digest', DIGEST]])))

    const { manifest, errors } = await fetchAllComponents({
      fetchImpl,
      todayIso: '2026-09-06',
      components: [paperless, docusealMock],
    })
    expect(errors).toEqual([])
    expect(manifest.capturedAt).toBe('2026-09-06')
    expect(manifest.components.map((c) => c.name)).toEqual(['paperless-ngx', 'docuseal'])
    expect(manifest.components[0].releaseDate).toBe('2026-09-01')
    expect(manifest.components[0].tag).toBe('v1.2.3')
    expect(manifest.components[0].image.tagRef).toBe('1.2.3')
    expect(manifest.components[1].image).toMatchObject({
      registry: 'docker.io',
      repository: 'docuseal/docuseal',
      tagRef: '2.0.0',
    })
    expect(manifestUrls[0]).toBe('https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/1.2.3')
    expect(manifestUrls[1]).toBe(
      'https://registry-1.docker.io/v2/docuseal/docuseal/manifests/2.0.0',
    )
  })
})
