/**
 * OCI registry client for multi-arch index digests. Anonymous — no credentials, ever.
 * All functions take an injected fetch implementation so tests stay offline.
 */
const INDEX_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

export async function fetchImageDigest(fetchImpl, registry, repository, tagRef) {
  if (registry === 'ghcr.io') return fetchGhcr(fetchImpl, repository, tagRef)
  if (registry === 'docker.io') return fetchDockerHub(fetchImpl, repository, tagRef)
  throw new Error(`unsupported registry: ${registry}`)
}

async function fetchGhcr(fetchImpl, repository, tagRef) {
  const token = await fetchToken(
    fetchImpl,
    `https://ghcr.io/token?scope=repository:${repository}:pull`,
  )
  return fetchDigest(fetchImpl, `https://ghcr.io/v2/${repository}/manifests/${tagRef}`, token)
}

async function fetchDockerHub(fetchImpl, repository, tagRef) {
  const token = await fetchToken(
    fetchImpl,
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,
  )
  return fetchDigest(
    fetchImpl,
    `https://registry-1.docker.io/v2/${repository}/manifests/${tagRef}`,
    token,
  )
}

async function fetchToken(fetchImpl, url) {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`registry token request failed with status ${res.status} for ${url}`)
  const body = await res.json()
  if (typeof body.token !== 'string')
    throw new Error(`registry token response missing token for ${url}`)
  return body.token
}

async function fetchDigest(fetchImpl, url, token) {
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: INDEX_ACCEPT },
  })
  if (!res.ok) throw new Error(`manifest request failed with status ${res.status} for ${url}`)
  const digest = res.headers.get('docker-content-digest')
  if (digest === null || digest === undefined)
    throw new Error(`manifest response carried no docker-content-digest for ${url}`)
  return digest
}
