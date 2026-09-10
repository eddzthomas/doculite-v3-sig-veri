import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { determineProvenance } from '../src/provenance.ts'
import { deriveStatus } from '../src/result.ts'
import type { Trust } from '../src/types.ts'
import { aggregateTrust, verifyPdf } from '../src/verify.ts'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SIG = join(ROOT, 'fixtures', 'signatures')
const POLICY = join(ROOT, 'packages', 'verification', 'policies', 'v1.json')
const pdf = (name: string) => new Uint8Array(readFileSync(join(SIG, name)))
const run = (name: string) => verifyPdf(pdf(name), { policyPath: POLICY })

const FIXTURES = [
  'sig-001.pdf',
  'sig-002.pdf',
  'sig-003.pdf',
  'sig-004.pdf',
  'sig-005.pdf',
  'sig-006.pdf',
  'sig-007.pdf',
  'sig-008.pdf',
]

const rollUpIntegrity = (values: Array<'valid' | 'invalid' | 'error'>) => {
  if (values.includes('error')) return 'error'
  if (values.includes('invalid')) return 'invalid'
  return 'valid'
}

describe('three-dimension invariants across every fixture', () => {
  it('no valid_* status unless integrity is valid (provenance never upgrades integrity)', () => {
    for (const name of FIXTURES) {
      const result = run(name)
      if (result.status.startsWith('valid_')) {
        expect(result.integrity).toBe('valid')
      }
    }
  })

  it('any per-signature error propagates to a document-level error status', () => {
    for (const name of FIXTURES) {
      const result = run(name)
      const hasPerSignatureError = result.perSignature.some((entry) => entry.integrity === 'error')
      if (hasPerSignatureError) expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.integrity === 'error' || result.trust === 'error').toBe(true)
      }
    }
  })

  it('provenance matches the independent per-signature subject facts', () => {
    for (const name of FIXTURES) {
      const result = run(name)
      for (const entry of result.perSignature) {
        expect(entry.provenance).toBe(determineProvenance(entry.signerSubject))
      }
      const perSignature = result.perSignature.map((entry) => entry.provenance)
      const expected = perSignature.includes('docuseal')
        ? 'docuseal'
        : perSignature.includes('external')
          ? 'external'
          : 'none'
      expect(result.provenance).toBe(expected)
    }
  })

  it('provenance never changes integrity or trust: doc dimensions are pure roll-ups and status derives without provenance', () => {
    for (const name of FIXTURES) {
      const result = run(name)
      const integrityRollUp = rollUpIntegrity(result.perSignature.map((entry) => entry.integrity))
      const trustRollUp = aggregateTrust(result.perSignature.map((entry) => entry.trust))
      expect(result.integrity).toBe(integrityRollUp)
      expect(result.trust).toBe(trustRollUp)
      expect(result.status).toBe(
        deriveStatus({
          signed: result.perSignature.length > 0,
          integrity: result.integrity,
          trust: result.trust,
        }),
      )
    }
  })
})

describe('fail-safe roll-up functions', () => {
  it('aggregateTrust: any error → error, else any untrusted → untrusted, else trusted', () => {
    expect(aggregateTrust(['trusted'])).toBe('trusted')
    expect(aggregateTrust(['trusted', 'untrusted'])).toBe('untrusted')
    expect(aggregateTrust(['trusted', 'error'])).toBe('error')
    expect(aggregateTrust(['untrusted', 'error'] as Array<Trust>)).toBe('error')
  })

  it('aggregateTrust: no signatures → untrusted (nothing is trusted, never error)', () => {
    expect(aggregateTrust([])).toBe('untrusted')
  })

  it('the signed:false + integrity:invalid edge (cannot occur per spec; Task 1 review deferred item) is pinned deliberately: unsigned precedes invalid', () => {
    expect(deriveStatus({ signed: false, integrity: 'invalid', trust: 'untrusted' })).toBe(
      'unsigned',
    )
  })
})
