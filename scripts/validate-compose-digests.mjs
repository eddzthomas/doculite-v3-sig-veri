#!/usr/bin/env node
/**
 * Offline digest validator: confirms deploy/local/compose.yaml references every
 * manifest image (repo+digest) from deploy/upstream-versions.json and that the
 * pinned digests are not stale. No network, no docker daemon — pure file reads.
 *   node scripts/validate-compose-digests.mjs <manifest> <compose>
 */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

function repoKey(repository) {
  // Compare on the repository path so `ghcr.io/x/y` and `x/y` match.
  return repository.replace(/^[^/]+\.(?:io|com)\//, '').replace(/^docker\.io\//, '')
}

export async function validateComposeDigests(manifestPath, composePath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const compose = await readFile(composePath, 'utf8')

  const composeImages = new Map()
  for (const match of compose.matchAll(/image:\s*(\S+)/g)) {
    const ref = match[1]
    const digestMatch = ref.match(/^(.+)@(sha256:[0-9a-f]{64})$/)
    if (digestMatch === null) continue
    composeImages.set(repoKey(digestMatch[1]), { fullRef: digestMatch[1], digest: digestMatch[2] })
  }

  const missing = []
  const stale = []
  for (const component of manifest.components) {
    const key = repoKey(component.image.repository)
    const found = composeImages.get(key)
    if (found === undefined) {
      missing.push(component.name)
      continue
    }
    if (found.digest !== component.image.digest) stale.push(component.name)
  }
  return { missing, stale }
}

// CLI dispatch must only run when this file is the entry point, so importing
// the module (e.g. from tests) never triggers process.exit.
function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) {
  const [manifestPath, composePath] = process.argv.slice(2)
  if (!manifestPath || !composePath) {
    console.error('usage: node scripts/validate-compose-digests.mjs <manifest> <compose>')
    process.exit(2)
  }
  const { missing, stale } = await validateComposeDigests(manifestPath, composePath)
  for (const m of missing) console.error(`missing from compose: ${m}`)
  for (const s of stale) console.error(`digest does not match manifest: ${s}`)
  if (missing.length > 0 || stale.length > 0) process.exit(1)
  console.log('compose digests match manifest')
}
