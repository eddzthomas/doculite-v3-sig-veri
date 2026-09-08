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
    registry: 'ghcr.io',
    imageRepository: 'paperless-ngx/paperless-ngx',
  }),
  Object.freeze({
    name: 'docuseal',
    owner: 'docusealco',
    repo: 'docuseal',
    tagPattern: /^(?:v)?\d+\.\d+\.\d+$/,
    registry: 'ghcr.io',
    imageRepository: 'docusealco/docuseal',
    fallbackRegistry: 'docker.io',
    fallbackImageRepository: 'docusealco/docuseal',
  }),
])

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
  for (const field of ['name', 'repository', 'tag', 'releaseUrl', 'releaseDate', 'commitSha']) {
    if (!isNonEmptyString(component[field])) errors.push(`${prefix}: missing ${field}`)
  }
  if (isNonEmptyString(component.tag) && !STABLE_SEMVER.test(component.tag)) {
    errors.push(`${prefix}: tag must be a stable semver (got ${JSON.stringify(component.tag)})`)
  }
  if (isNonEmptyString(component.releaseDate) && !isRealIsoDate(component.releaseDate)) {
    errors.push(`${prefix}: releaseDate must be YYYY-MM-DD`)
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
    if (isNonEmptyString(image.tagRef) && !STABLE_SEMVER.test(image.tagRef)) {
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

export function validateManifest(manifest) {
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
  for (const expected of COMPONENTS) {
    const component = byName.get(expected.name)
    if (component === undefined || component === null || typeof component !== 'object') {
      errors.push(`manifest: missing component ${expected.name}`)
      continue
    }
    validateComponent(component, expected.name, errors)
  }
  return errors
}
