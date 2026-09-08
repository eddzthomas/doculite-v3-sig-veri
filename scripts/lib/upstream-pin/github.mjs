/**
 * GitHub API client for upstream pinning. Anonymous — no credentials, ever.
 * All functions take an injected fetch implementation so tests stay offline.
 */
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'doculite-pin-upstream' }
const STABLE = /^(?:v)?\d+\.\d+\.\d+$/

export async function fetchLatestStableRelease(fetchImpl, owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`
  const res = await fetchImpl(url, { headers: HEADERS })
  if (!res.ok)
    throw new Error(`GitHub releases request failed with status ${res.status} for ${owner}/${repo}`)
  const releases = await res.json()
  const stable = releases.find(
    (r) =>
      r.draft === false &&
      r.prerelease === false &&
      typeof r.tag_name === 'string' &&
      STABLE.test(r.tag_name),
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
  if (!res.ok)
    throw new Error(
      `GitHub commit request failed with status ${res.status} for ${owner}/${repo}@${tag}`,
    )
  const body = await res.json()
  if (typeof body.sha !== 'string')
    throw new Error(`GitHub commit response missing sha for ${owner}/${repo}@${tag}`)
  return body.sha
}

// Numeric segment comparison so REL_17_10 sorts above REL_17_9; a plain string
// sort would pick the alphabetically-greatest tag instead of the newest one.
function compareNumericSegments(a, b) {
  const pa = a.match(/^(\D*)(\d+(?:[_-]\d+)*)$/)
  const pb = b.match(/^(\D*)(\d+(?:[_-]\d+)*)$/)
  if (pa === null || pb === null) return a < b ? -1 : a > b ? 1 : 0
  const na = pa[2].split(/[-_.]+/).map(Number)
  const nb = pb[2].split(/[-_.]+/).map(Number)
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
    if (!res.ok)
      throw new Error(`GitHub tags request failed with status ${res.status} for ${owner}/${repo}`)
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
    // tags API carries no date; the CLI records null for tags-source components
    // and validation excludes the field for them.
    releaseDate: '',
  }
}
