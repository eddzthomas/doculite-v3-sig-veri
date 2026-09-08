/**
 * Manifest schema and component declarations for upstream version pinning.
 * Spec: plans/specs/2026-09-06-m0a-upstream-pinning-design.md
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STABLE_SEMVER = /^(?:v)?\d+\.\d+\.\d+$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const COMPONENTS = Object.freeze([
  Object.freeze({
    name: 'paperless-ngx',
    owner: 'paperless-ngx',
    repo: 'paperless-ngx',
    tagPattern: /^v\d+\.\d+\.\d+$/,
    // ghcr.io serves paperless-ngx images under the bare semver tag (v3.1.3 release → 3.1.3 image tag).
    tagSource: 'releases',
    imageTagTransform: 'strip-v',
    registry: 'ghcr.io',
    imageRepository: 'paperless-ngx/paperless-ngx',
  }),
  Object.freeze({
    name: 'docuseal',
    owner: 'docusealco',
    repo: 'docuseal',
    tagPattern: /^(?:v)?\d+\.\d+\.\d+$/,
    // Real-world probe: ghcr.io/docusealco/docuseal is anonymously denied and
    // docker.io/docusealco/docuseal does not exist; the pullable image lives
    // under the `docuseal` Docker Hub org. No fallback — a dead end invites partial pins.
    tagSource: 'releases',
    imageTagTransform: 'identity',
    registry: 'docker.io',
    imageRepository: 'docuseal/docuseal',
  }),
  Object.freeze({
    name: 'postgres',
    owner: 'postgres',
    repo: 'postgres',
    // postgres publishes tags without GitHub release objects; resolved via the
    // git tags API with numeric comparison (REL_17_10 > REL_17_9).
    tagPattern: /^REL_\d+_\d+$/,
    tagSource: 'tags',
    imageTagTransform: 'postgres-rel',
    registry: 'docker.io',
    imageRepository: 'library/postgres',
  }),
  Object.freeze({
    name: 'redis',
    owner: 'redis',
    repo: 'redis',
    tagPattern: /^\d+\.\d+\.\d+$/,
    tagSource: 'releases',
    imageTagTransform: 'identity',
    registry: 'docker.io',
    imageRepository: 'library/redis',
  }),
])

// Manifest records carry the full GitHub tag (REL_17_5 for postgres) and the
// registry's own image tag convention (17.5 after the postgres-rel transform),
// so both validations accept those shapes alongside stable semver.
const MANIFEST_TAG = new RegExp(`${STABLE_SEMVER.source}|^REL_\\d+_\\d+$`)
const MANIFEST_IMAGE_TAG_REF = new RegExp(`${STABLE_SEMVER.source}|^\\d+\\.\\d+$`)

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

// Format alone is not enough (e.g. '2026-13-99' matches ISO_DATE); require a real calendar date.
function isRealIsoDate(value) {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateComponent(component, name, errors) {
  const prefix = `components[${name}]`
  for (const field of ['name', 'repository', 'tag', 'releaseUrl', 'commitSha']) {
    if (!isNonEmptyString(component[field])) errors.push(`${prefix}: missing ${field}`)
  }
  // tags-source components have no release date from the git tags API; the CLI
  // records null for them. Any other value must be a real calendar date ('' and
  // non-dates are rejected — a silently missing date would hide provenance gaps).
  if (component.releaseDate !== null && !isRealIsoDate(component.releaseDate)) {
    errors.push(`${prefix}: releaseDate must be YYYY-MM-DD or null`)
  }
  if (isNonEmptyString(component.tag) && !MANIFEST_TAG.test(component.tag)) {
    errors.push(
      `${prefix}: tag must be a stable semver or REL_<major>_<minor> (got ${JSON.stringify(component.tag)})`,
    )
  }
  if (isNonEmptyString(component.commitSha) && !COMMIT_SHA.test(component.commitSha)) {
    errors.push(`${prefix}: commitSha must be a 40-hex SHA`)
  }

  const image = component.image
  if (image === null || typeof image !== 'object') {
    errors.push(`${prefix}: missing image object`)
  } else {
    for (const field of ['registry', 'repository', 'tagRef', 'digest']) {
      if (!isNonEmptyString(image[field])) errors.push(`${prefix}: image missing ${field}`)
    }
    if (isNonEmptyString(image.tagRef) && !MANIFEST_IMAGE_TAG_REF.test(image.tagRef)) {
      errors.push(`${prefix}: image.tagRef must be a stable semver`)
    }
    if (isNonEmptyString(image.digest) && !DIGEST.test(image.digest)) {
      errors.push(`${prefix}: image.digest must be sha256:<64 hex>`)
    }
  }

  const evidence = component.evidence
  if (evidence === null || typeof evidence !== 'object') {
    errors.push(`${prefix}: missing evidence object`)
  } else {
    for (const field of ['githubApi', 'registryApi']) {
      if (!isNonEmptyString(evidence[field])) errors.push(`${prefix}: evidence missing ${field}`)
    }
  }
}

export function validateManifest(manifest, { expected = COMPONENTS } = {}) {
  const errors = []
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest: must be a JSON object']
  }
  if (!isNonEmptyString(manifest.capturedAt) || !isRealIsoDate(manifest.capturedAt)) {
    errors.push('manifest: capturedAt must be YYYY-MM-DD')
  }
  if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
    errors.push('manifest: components must be a non-empty array')
    return errors
  }
  const byName = new Map(manifest.components.map((c) => [c?.name, c]))
  for (const expectedComponent of expected) {
    const component = byName.get(expectedComponent.name)
    if (component === undefined || component === null || typeof component !== 'object') {
      errors.push(`manifest: missing component ${expectedComponent.name}`)
      continue
    }
    validateComponent(component, expectedComponent.name, errors)
  }
  return errors
}
