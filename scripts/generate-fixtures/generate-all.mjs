#!/usr/bin/env node
import { createHash } from 'node:crypto'
// Generates fixtures/signatures/* — synthetic, self-signed, shareable.
// Keys are NOT committed; artifacts are one-shot, checksums in the manifest.
// NEVER regenerate after a capture session begins: a re-run swaps the
// certificate roots out from under the captured fixtures (re-capture ordering:
// docs/operations/deployment-runbook.md, "Re-capture on re-pin").
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateTrustPath } from './lib/certs.mjs'
import { buildDocument } from './lib/pdf.mjs'
import { corruptContainer, sign, tamperOneByte } from './lib/signing.mjs'

export const GENERATOR_VERSION = '1.0.0'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '..', 'fixtures', 'signatures')

async function main() {
  mkdirSync(OUT, { recursive: true })
  const pathA = generateTrustPath('A')
  const pathB = generateTrustPath('B')
  writeFileSync(join(OUT, 'root-a.pem'), pathA.rootPem)
  writeFileSync(join(OUT, 'root-a-leaf.pem'), pathA.leafPem)
  writeFileSync(join(OUT, 'root-b.pem'), pathB.rootPem)
  writeFileSync(join(OUT, 'root-b-leaf.pem'), pathB.leafPem)

  const sha = (b) => createHash('sha256').update(b).digest('hex')
  const items = []

  const put = (id, file, bytes, condition, expectedOutcome, construction, certs = []) => {
    writeFileSync(join(OUT, file), bytes)
    items.push({
      id,
      file,
      sha256: sha(bytes),
      condition,
      expectedOutcome,
      construction,
      certs,
      capturedFrom: 'generator',
    })
  }

  const unsigned = await buildDocument('Fixture SIG-001 (unsigned)')
  put('SIG-001', 'sig-001.pdf', unsigned, 'Unsigned PDF', 'unsigned', 'pdf-lib only')

  const trusted = await buildDocument('Fixture SIG-002 (trusted)')
  const trustedSigned = sign(trusted, pathA.pkcs12)
  put(
    'SIG-002',
    'sig-002.pdf',
    trustedSigned,
    'Valid signature, root-A in candidate policy',
    'valid_trusted',
    'leaf(A) over pdf-lib document',
    ['root-a'],
  )

  const untrusted = await buildDocument('Fixture SIG-003 (untrusted)')
  put(
    'SIG-003',
    'sig-003.pdf',
    sign(untrusted, pathB.pkcs12),
    'Valid signature, root-B not in policy',
    'valid_untrusted',
    'leaf(B) over pdf-lib document',
    ['root-b'],
  )

  put(
    'SIG-004',
    'sig-004.pdf',
    tamperOneByte(trustedSigned),
    'Content altered after signing',
    'invalid',
    'single-byte mutation of sig-002 inside signed range',
  )

  put(
    'SIG-005',
    'sig-005.pdf',
    corruptContainer(trustedSigned),
    'Malformed signature container',
    'error',
    'PKCS#7 hex corruption of sig-002',
  )

  const dual = await buildDocument('Fixture SIG-006 (dual signatures)')
  put(
    'SIG-006',
    'sig-006.pdf',
    sign(sign(dual, pathA.pkcs12), pathB.pkcs12),
    'Multiple signatures with mixed trust',
    'valid_untrusted',
    'leaf(A) then leaf(B) incremental signatures',
    ['root-a', 'root-b'],
  )

  // SIG-007 placeholder stays in id order; filled during the capture session.
  items.push({
    id: 'SIG-007',
    file: null,
    sha256: null,
    condition: 'Completed DocuSeal document',
    expectedOutcome: 'valid_untrusted',
    construction: 'live-captured from pinned docuseal during capture session',
    certs: [],
    capturedFrom: 'docuseal',
  })

  const external = await buildDocument('Fixture SIG-008 (external signer)')
  put(
    'SIG-008',
    'sig-008.pdf',
    sign(external, pathB.pkcs12),
    'Valid external signature',
    'valid_untrusted',
    'leaf(B) over distinct document',
    ['root-b'],
  )

  items.push({
    id: 'SIG-009',
    file: null,
    sha256: null,
    condition: 'Verifier transport/service failure',
    expectedOutcome: 'error',
    construction: 'scenario fixture: recorded verifier-unreachable exchanges',
    scenario: 'fixtures/docuseal/verifier-error.json',
    capturedFrom: 'generator',
  })

  const manifestPath = join(OUT, 'signatures-manifest.json')
  const existingSig7 = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')).items.find((i) => i.id === 'SIG-007')
    : null
  if (existingSig7?.file) items[items.findIndex((i) => i.id === 'SIG-007')] = existingSig7

  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), generatorVersion: GENERATOR_VERSION, items },
      null,
      2,
    )}\n`,
  )
  console.log(`wrote ${items.filter((i) => i.file).length} pdfs + 4 pems + manifest to ${OUT}`)
}

// Windows path separators — resolve the CLI entry robustly.
export function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) await main()
