import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadPolicy } from '../src/policy.ts'

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'signatures')
const POLICIES = join(import.meta.dirname, '..', 'policies')

const pemToDer = (pem: string): Uint8Array =>
  new Uint8Array(
    Buffer.from(pem.replace(/-----[A-Z ]*CERTIFICATE-----/g, '').replace(/\s+/g, ''), 'base64'),
  )

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const fingerprintOf = (name: string): string =>
  sha256Hex(pemToDer(readFileSync(join(FIXTURES, name), 'utf8')))

describe('loadPolicy (versioned trust policy)', () => {
  const tempDirs: Array<string> = []
  const tempPolicy = (content: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'doculite-policy-'))
    tempDirs.push(dir)
    const file = join(dir, 'policy.json')
    writeFileSync(file, content)
    return file
  }
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('v1 anchors exactly root-a by the recomputed PEM fingerprint (drift-proof)', () => {
    const policy = loadPolicy(join(POLICIES, 'v1.json'))
    expect(policy.version).toBe('1')
    expect(policy.anchors).toEqual([{ name: 'root-a', sha256: fingerprintOf('root-a.pem') }])
  })

  it('root-b is deliberately absent from v1 (SIG-003/SIG-008 must not anchor)', () => {
    const policy = loadPolicy(join(POLICIES, 'v1.json'))
    expect(policy.anchors.map((a) => a.sha256)).not.toContain(fingerprintOf('root-b.pem'))
  })

  it('corrupt policy JSON → loadPolicy throws', () => {
    expect(() => loadPolicy(tempPolicy('{ not valid json'))).toThrow()
  })

  it('missing policy file → loadPolicy throws', () => {
    expect(() => loadPolicy(join(tmpdir(), 'doculite-policy-does-not-exist.json'))).toThrow()
  })

  it('structurally invalid policy (anchors not an array) → loadPolicy throws', () => {
    expect(() => loadPolicy(tempPolicy('{"version":"1","anchors":"root-a"}'))).toThrow()
  })
})
