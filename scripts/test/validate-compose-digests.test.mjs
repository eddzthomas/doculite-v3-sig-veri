import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateComposeDigests } from '../validate-compose-digests.mjs'

let dir
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'compose-digests-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const D1 = `sha256:${'a'.repeat(64)}`
const D2 = `sha256:${'b'.repeat(64)}`
const D3 = `sha256:${'c'.repeat(64)}`

async function writeFiles(manifestComponents, composeText) {
  const manifestPath = join(dir, 'manifest.json')
  const composePath = join(dir, 'compose.yaml')
  await writeFile(
    manifestPath,
    JSON.stringify({ capturedAt: '2026-09-06', components: manifestComponents }),
  )
  await writeFile(composePath, composeText)
  return validateComposeDigests(manifestPath, composePath)
}

const comp = (name, repo, digest) => ({ name, image: { repository: repo, digest } })

describe('validateComposeDigests', () => {
  it('passes when every manifest image is referenced by digest in compose', async () => {
    const result = await writeFiles(
      [
        comp('paperless-ngx', 'paperless-ngx/paperless-ngx', D1),
        comp('docuseal', 'docuseal/docuseal', D2),
      ],
      `services:\n  paperless:\n    image: ghcr.io/paperless-ngx/paperless-ngx@${D1}\n  docuseal:\n    image: docker.io/docuseal/docuseal@${D2}\n`,
    )
    expect(result.missing).toEqual([])
    expect(result.stale).toEqual([])
  })

  it('flags a manifest component missing from compose', async () => {
    const result = await writeFiles(
      [comp('postgres', 'library/postgres', D3)],
      `services:\n  paperless:\n    image: ghcr.io/paperless-ngx/paperless-ngx@${D1}\n`,
    )
    expect(result.missing).toEqual(['postgres'])
  })

  it('flags a compose digest that does not match the manifest (stale)', async () => {
    const result = await writeFiles(
      [comp('docuseal', 'docuseal/docuseal', D2)],
      `services:\n  docuseal:\n    image: docker.io/docuseal/docuseal@${D1}\n`,
    )
    expect(result.stale).toEqual(['docuseal'])
  })

  it('matches repositories by suffix so registry hostnames do not break comparison', async () => {
    const result = await writeFiles(
      [comp('paperless-ngx', 'paperless-ngx/paperless-ngx', D1)],
      `services:\n  paperless:\n    image: paperless-ngx/paperless-ngx@${D1}\n`,
    )
    expect(result.missing).toEqual([])
    expect(result.stale).toEqual([])
  })
})
