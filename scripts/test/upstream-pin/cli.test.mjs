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
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'https://github.com/x/r/releases/tag/v1.2.3',
          },
        ],
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: SHA }),
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
        headers: new Map([['docker-content-digest', DIGEST]]),
      }))

    const record = await resolveComponent(paperless, { fetchImpl, todayIso: '2026-09-06' })
    expect(record).toMatchObject({
      name: 'paperless-ngx',
      tag: 'v1.2.3',
      commitSha: SHA,
      image: {
        registry: 'ghcr.io',
        repository: 'paperless-ngx/paperless-ngx',
        tagRef: 'v1.2.3',
        digest: DIGEST,
      },
    })
  })

  it('falls back to the declared fallback registry when the primary fails', async () => {
    const withFallback = {
      ...paperless,
      fallbackRegistry: 'docker.io',
      fallbackImageRepository: 'paperless-ngx/paperless-ngx',
    }
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u',
          },
        ],
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: SHA }),
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ token: 't' }),
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
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
        headers: new Map([['docker-content-digest', DIGEST]]),
      }))

    const record = await resolveComponent(withFallback, { fetchImpl, todayIso: '2026-09-06' })
    expect(record.image.registry).toBe('docker.io')
  })

  it('aborts the component when nothing resolves', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u',
          },
        ],
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: SHA }),
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ token: 't' }),
        headers: new Map(),
      }))
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
})

describe('fetchAllComponents', () => {
  it('builds a valid manifest for all declared components', async () => {
    const fetchImpl = vi
      .fn()
      // paperless: releases, commit, token, manifest
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: 'v1.2.3',
            draft: false,
            prerelease: false,
            published_at: '2026-09-01T00:00:00Z',
            html_url: 'u1',
          },
        ],
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: SHA }),
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
        headers: new Map([['docker-content-digest', DIGEST]]),
      }))
      // docuseal: releases, commit, token, manifest
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: '2.0.0',
            draft: false,
            prerelease: false,
            published_at: '2026-08-11T00:00:00Z',
            html_url: 'u2',
          },
        ],
        headers: new Map(),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ sha: SHA }),
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
        headers: new Map([['docker-content-digest', DIGEST]]),
      }))

    const { manifest, errors } = await fetchAllComponents({ fetchImpl, todayIso: '2026-09-06' })
    expect(errors).toEqual([])
    expect(manifest.capturedAt).toBe('2026-09-06')
    expect(manifest.components.map((c) => c.name)).toEqual(['paperless-ngx', 'docuseal'])
    expect(manifest.components[0].releaseDate).toBe('2026-09-01')
  })
})
