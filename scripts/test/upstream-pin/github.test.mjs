import { describe, expect, it, vi } from 'vitest'
import { fetchCommitSha, fetchLatestStableRelease } from '../../lib/upstream-pin/github.mjs'

function jsonResponse(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Map(Object.entries(headers)),
  }
}

const releases = [
  {
    tag_name: 'v3.1.3',
    draft: false,
    prerelease: false,
    published_at: '2026-09-04T10:02:14Z',
    html_url: 'https://github.com/o/r/releases/tag/v3.1.3',
  },
  {
    tag_name: 'v3.1.2',
    draft: false,
    prerelease: false,
    published_at: '2026-09-01T15:28:00Z',
    html_url: 'https://github.com/o/r/releases/tag/v3.1.2',
  },
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
    expect(fetchImpl.mock.calls[0][0]).toContain(
      'https://api.github.com/repos/paperless-ngx/paperless-ngx/releases',
    )
  })

  it('skips drafts and prereleases', async () => {
    const mixed = [
      {
        tag_name: 'v3.2.0-rc1',
        draft: false,
        prerelease: true,
        published_at: '2026-09-05T00:00:00Z',
        html_url: 'x',
      },
      {
        tag_name: 'v3.1.9',
        draft: true,
        prerelease: false,
        published_at: '2026-09-05T01:00:00Z',
        html_url: 'x',
      },
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
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { tag_name: 'rc1', draft: false, prerelease: true, published_at: 'x', html_url: 'x' },
      ]),
    )
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
