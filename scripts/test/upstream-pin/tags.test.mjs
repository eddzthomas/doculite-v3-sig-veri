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
    const fetchImpl = vi.fn(async () =>
      pageResponse([ref('REL_17_9'), ref('REL_17_10'), ref('REL_16_9')]),
    )
    const result = await fetchLatestStableTag(fetchImpl, 'postgres', 'postgres', /^REL_\d+_\d+$/)
    expect(result.tag).toBe('REL_17_10')
    expect(fetchImpl.mock.calls[0][0]).toContain('/repos/postgres/postgres/git/matching-refs/tags/')
  })

  it('paginates until the tag list is exhausted', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ref(`REL_16_${i + 1}`))
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => pageResponse(fullPage))
      .mockImplementationOnce(async () => pageResponse([ref('REL_17_5')]))
    const result = await fetchLatestStableTag(fetchImpl, 'postgres', 'postgres', /^REL_\d+_\d+$/)
    expect(result.tag).toBe('REL_17_5')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws loudly when the pagination cap is exhausted', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ref(`REL_16_${i + 1}`))
    const fetchImpl = vi.fn(async () => pageResponse(fullPage))
    await expect(
      fetchLatestStableTag(fetchImpl, 'postgres', 'postgres', /^REL_\d+_\d+$/),
    ).rejects.toThrow(/pagination cap/)
  })

  it('throws when no tag matches the pattern', async () => {
    const fetchImpl = vi.fn(async () => pageResponse([ref('alpha')]))
    await expect(fetchLatestStableTag(fetchImpl, 'o', 'r', /^REL_\d+_\d+$/)).rejects.toThrow(
      /no matching tag/,
    )
  })

  it('throws on failure', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      headers: new Map(),
    }))
    await expect(fetchLatestStableTag(fetchImpl, 'o', 'r', /^x$/)).rejects.toThrow(/403/)
  })
})
