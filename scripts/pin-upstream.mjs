#!/usr/bin/env node
/**
 * Upstream version pinning tool.
 *   node scripts/pin-upstream.mjs fetch     — resolve latest stable pins and write deploy/upstream-versions.json
 *   node scripts/pin-upstream.mjs validate  — re-derive live facts and report drift against the manifest
 * Anonymous access only — no credentials, ever. Fails loudly rather than writing partial pins.
 * Spec: plans/specs/2026-09-06-m0a-upstream-pinning-design.md
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { computeDrift } from './lib/upstream-pin/drift.mjs'
import {
  fetchCommitSha,
  fetchLatestStableRelease,
  fetchLatestStableTag,
} from './lib/upstream-pin/github.mjs'
import { fetchImageDigest } from './lib/upstream-pin/registry.mjs'
import { COMPONENTS, validateManifest } from './lib/upstream-pin/schema.mjs'

const MANIFEST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'deploy',
  'upstream-versions.json',
)

// Registries tag images by their own convention; the GitHub release tag does not
// always match (e.g. ghcr serves paperless-ngx under the bare semver, postgres
// images use the REL_ tag's numeric version). The GitHub `tag` field stays the
// full release/tag name — only the image tagRef is mapped.
export function transformImageTag(transform, tag) {
  if (transform === 'strip-v') return tag.replace(/^v/, '')
  if (transform === 'postgres-rel') return tag.replace(/^REL_/, '').replace(/_/g, '.')
  if (transform === 'identity') return tag
  throw new Error(`unknown imageTagTransform: ${transform}`)
}

export async function resolveComponent(component, { fetchImpl, todayIso }) {
  const release =
    component.tagSource === 'tags'
      ? await fetchLatestStableTag(fetchImpl, component.owner, component.repo, component.tagPattern)
      : await fetchLatestStableRelease(fetchImpl, component.owner, component.repo)
  const commitSha = await fetchCommitSha(fetchImpl, component.owner, component.repo, release.tag)
  const imageTagRef = transformImageTag(component.imageTagTransform, release.tag)

  const registries = [[component.registry, component.imageRepository]]
  if (component.fallbackRegistry !== undefined) {
    registries.push([component.fallbackRegistry, component.fallbackImageRepository])
  }

  let lastError = null
  let image = null
  for (const [registry, repository] of registries) {
    try {
      const digest = await fetchImageDigest(fetchImpl, registry, repository, imageTagRef)
      image = { registry, repository, tagRef: imageTagRef, digest }
      break
    } catch (error) {
      lastError = error
    }
  }
  if (image === null) {
    throw new Error(
      `could not resolve image digest for ${component.name}: ${lastError?.message ?? 'unknown error'}`,
    )
  }

  return {
    name: component.name,
    repository: `https://github.com/${component.owner}/${component.repo}`,
    tag: release.tag,
    releaseUrl: release.releaseUrl,
    // tags-source components have no release date from the tags API; null is the
    // explicit "no date recorded" marker the schema accepts.
    releaseDate: release.releaseDate || null,
    commitSha,
    image,
    evidence: {
      githubApi:
        component.tagSource === 'tags'
          ? `https://api.github.com/repos/${component.owner}/${component.repo}/git/matching-refs/tags/`
          : `https://api.github.com/repos/${component.owner}/${component.repo}/releases`,
      registryApi: `https://${image.registry}/v2/${image.repository}/manifests/${image.tagRef}`,
    },
    capturedAt: todayIso,
  }
}

export async function fetchAllComponents({ fetchImpl, todayIso, components = COMPONENTS }) {
  const records = []
  for (const component of components) {
    records.push(await resolveComponent(component, { fetchImpl, todayIso }))
  }
  const manifest = {
    capturedAt: todayIso,
    components: records.map(({ capturedAt, ...rest }) => rest),
  }
  return { manifest, errors: validateManifest(manifest, { expected: components }) }
}

async function writeManifest(manifest) {
  // Write to a temp file then rename so a crash mid-write can never leave a
  // truncated or partially written manifest on disk.
  await mkdir(dirname(MANIFEST_PATH), { recursive: true })
  const tmp = `${MANIFEST_PATH}.tmp`
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(tmp, MANIFEST_PATH)
}

async function readManifest() {
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  return JSON.parse(raw)
}

async function runFetch() {
  const { manifest, errors } = await fetchAllComponents({
    fetchImpl: fetch,
    todayIso: new Date().toISOString().slice(0, 10),
  })
  if (errors.length > 0) {
    console.error(`generated manifest is invalid, aborting:`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }
  await writeManifest(manifest)
  for (const c of manifest.components) {
    console.log(
      `${c.name}: tag=${c.tag} commit=${c.commitSha.slice(0, 12)} digest=${c.image.digest.slice(0, 19)}… (${c.image.registry}/${c.image.repository})`,
    )
  }
  console.log(`wrote ${MANIFEST_PATH}`)
}

async function runValidate() {
  let manifest
  try {
    manifest = await readManifest()
  } catch (error) {
    console.error(`cannot read manifest: ${error.message}`)
    process.exitCode = 1
    return
  }
  const errors = validateManifest(manifest)
  if (errors.length > 0) {
    console.error('manifest is invalid:')
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }

  const live = []
  try {
    for (const component of COMPONENTS) {
      const recorded = manifest.components.find((c) => c.name === component.name)
      if (recorded === undefined) continue
      const release =
        component.tagSource === 'tags'
          ? await fetchLatestStableTag(fetch, component.owner, component.repo, component.tagPattern)
          : await fetchLatestStableRelease(fetch, component.owner, component.repo)
      const commitSha = await fetchCommitSha(fetch, component.owner, component.repo, recorded.tag)
      const digest = await fetchImageDigest(
        fetch,
        recorded.image.registry,
        recorded.image.repository,
        recorded.image.tagRef,
      )
      live.push({
        name: recorded.name,
        tag: release.tag,
        commitSha,
        image: { ...recorded.image, digest },
      })
    }
  } catch (error) {
    // Network/API failures during live derivation must not look like drift —
    // abort with a distinct message instead of comparing against partial data.
    console.error(`live validation failed: ${error.message}`)
    process.exitCode = 1
    return
  }

  const drift = computeDrift(manifest.components, live)
  if (drift.length === 0) {
    console.log('no drift: manifest matches live registries')
    return
  }
  console.error(`drift detected (${drift.length}):`)
  for (const d of drift)
    console.error(`  - ${d.component}.${d.field}: expected ${d.expected}, live ${d.actual}`)
  process.exitCode = 1
}

// CLI dispatch must only run when this file is the entry point, so importing
// the module (e.g. from tests) never triggers process.exit or network calls.
function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) {
  const mode = process.argv[2]
  if (mode === 'fetch') {
    await runFetch()
  } else if (mode === 'validate') {
    await runValidate()
  } else {
    console.error('usage: node scripts/pin-upstream.mjs <fetch|validate>')
    process.exit(2)
  }
}
