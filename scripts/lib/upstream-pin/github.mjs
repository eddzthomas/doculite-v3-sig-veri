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
