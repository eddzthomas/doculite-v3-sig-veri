import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADAPTER_VERSION } from '../src/result.ts'
import { verifyPdf } from '../src/verify.ts'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SIG = join(ROOT, 'fixtures', 'signatures')
const POLICY = join(ROOT, 'packages', 'verification', 'policies', 'v1.json')

interface ManifestItem {
  id: string
  file: string | null
  expectedOutcome: string
  sha256: string | null
}

const manifest = JSON.parse(readFileSync(join(SIG, 'signatures-manifest.json'), 'utf8')) as {
  items: Array<ManifestItem>
}

const item = (id: string): ManifestItem => {
  const found = manifest.items.find((entry) => entry.id === id)
  if (!found) throw new Error(`manifest is missing ${id}`)
  return found
}

const pdf = (name: string) => new Uint8Array(readFileSync(join(SIG, name)))
const run = (name: string) => verifyPdf(pdf(name), { policyPath: POLICY })

/**
 * Per-fixture dimension matrix (task brief). Every cell is the canonical
 * vocabulary only — no new words, no compliance or legal claims.
 */
const EXPECTED: Record<
  string,
  { status: string; integrity: string; trust: string; provenance: string }
> = {
  'SIG-001': { status: 'unsigned', integrity: 'valid', trust: 'untrusted', provenance: 'none' },
  'SIG-002': {
    status: 'valid_trusted',
    integrity: 'valid',
    trust: 'trusted',
    provenance: 'external',
  },
  'SIG-003': {
    status: 'valid_untrusted',
    integrity: 'valid',
    trust: 'untrusted',
    provenance: 'external',
  },
  'SIG-004': {
    status: 'invalid',
    integrity: 'invalid',
    trust: 'untrusted',
    provenance: 'external',
  },
  'SIG-005': { status: 'error', integrity: 'error', trust: 'error', provenance: 'none' },
  'SIG-006': {
    status: 'valid_untrusted',
    integrity: 'valid',
    trust: 'untrusted',
    provenance: 'external',
  },
  'SIG-007': {
    status: 'valid_untrusted',
    integrity: 'valid',
    trust: 'untrusted',
    provenance: 'docuseal',
  },
  'SIG-008': {
    status: 'valid_untrusted',
    integrity: 'valid',
    trust: 'untrusted',
    provenance: 'external',
  },
}

const PDF_FIXTURES = Object.keys(EXPECTED)

describe('full fixture matrix (verifyPdf, the public API)', () => {
  for (const id of PDF_FIXTURES) {
    it(`${id}: status matches the manifest and the pinned dimensions`, () => {
      const entry = item(id)
      if (!entry.file) throw new Error(`${id} must be a PDF-backed fixture here`)
      const result = run(entry.file)
      const expected = EXPECTED[id]
      if (!expected) throw new Error(`matrix is missing expectations for ${id}`)
      expect(result.status).toBe(entry.expectedOutcome)
      expect(result.status).toBe(expected.status)
      expect(result.integrity).toBe(expected.integrity)
      expect(result.trust).toBe(expected.trust)
      expect(result.provenance).toBe(expected.provenance)
    })
  }

  it('SIG-006: per-signature trust asserts the SET {trusted, untrusted} — not the order', () => {
    const result = run('sig-006.pdf')
    const trusts = new Set(result.perSignature.map((entry) => entry.trust))
    expect(trusts.size).toBe(2)
    expect(trusts.has('trusted')).toBe(true)
    expect(trusts.has('untrusted')).toBe(true)
    // mixed per-sig detail under a valid_untrusted roll-up
    expect(result.status).toBe('valid_untrusted')
    for (const entry of result.perSignature) expect(entry.provenance).toBe('external')
  })

  it('SIG-007: signer subject is the DocuSeal certificate and provenance is docuseal', () => {
    const result = run('sig-007.pdf')
    expect(result.provenance).toBe('docuseal')
    const signer = result.perSignature[0]
    if (!signer) throw new Error('SIG-007 must have one signature summary')
    expect(signer.signerSubject).toContain('CN=DocuSeal')
    expect(signer.provenance).toBe('docuseal')
  })

  it('SIG-001: unsigned document has no per-signature summaries', () => {
    const result = run('sig-001.pdf')
    expect(result.perSignature).toHaveLength(0)
  })
})

describe('evidence record (spec: 8 fields exactly)', () => {
  for (const id of PDF_FIXTURES) {
    it(`${id}: evidence carries the evaluated input hash, adapter and policy versions, and M0-D nulls`, () => {
      const entry = item(id)
      if (!entry.file || !entry.sha256) throw new Error(`${id} must be a PDF-backed fixture here`)
      const result = run(entry.file)
      const evidence = result.evidence
      expect(evidence.evaluatedSha256).toBe(entry.sha256)
      expect(evidence.adapterVersion).toBe(ADAPTER_VERSION)
      expect(evidence.policyVersion).toBe('1')
      expect(evidence.paperlessDocumentId).toBeNull()
      expect(evidence.retrievedAt).toBeNull()
      expect(evidence.rawResultReference).toBeNull()
      expect(evidence.raw).toBeDefined()
    })
  }

  it('errorDetail is present only on error results and names a step, never bytes', () => {
    for (const id of PDF_FIXTURES) {
      const entry = item(id)
      if (!entry.file) throw new Error(`${id} must be a PDF-backed fixture here`)
      const result = run(entry.file)
      if (id === 'SIG-005') {
        expect(result.evidence.errorDetail).toBeDefined()
        expect(result.evidence.errorDetail).not.toMatch(/[0-9a-f]{64}/)
      } else {
        expect(result.evidence.errorDetail).toBeUndefined()
      }
    }
  })
})

describe('SIG-009 scenario: verifier failure paths never produce a validity status', () => {
  it('garbage bytes → error with a step-named errorDetail that carries no input bytes', () => {
    const garbage = new Uint8Array(
      Buffer.from(`%PDF-1.4\nTRANSPORT-FAILURE-MARKER garbage not a pdf`, 'latin1'),
    )
    const result = verifyPdf(garbage, { policyPath: POLICY })
    expect(result.status).toBe('error')
    expect(result.integrity).toBe('error')
    expect(result.trust).toBe('error')
    const detail = result.evidence.errorDetail
    expect(detail).toBeDefined()
    expect(detail).toMatch(/^pdf-structure-check/)
    expect(detail).not.toContain('TRANSPORT-FAILURE-MARKER')
  })

  it('truncated container → error with a step-named errorDetail that carries no input bytes', () => {
    const full = pdf('sig-002.pdf')
    const truncated = full.slice(0, full.length - 200)
    const result = verifyPdf(new Uint8Array(truncated), { policyPath: POLICY })
    expect(result.status).toBe('error')
    expect(result.integrity).toBe('error')
    const detail = result.evidence.errorDetail
    expect(detail).toBeDefined()
    expect(detail).toMatch(/^[a-z-]+:/)
    expect(detail).not.toMatch(/[0-9a-f]{64}/)
  })

  it('defective policy path → error, policyVersion null (fail-safe, never blanket-untrusted)', () => {
    const result = verifyPdf(pdf('sig-002.pdf'), { policyPath: join(SIG, 'no-such-policy.json') })
    expect(result.status).toBe('error')
    expect(result.trust).toBe('error')
    expect(result.evidence.policyVersion).toBeNull()
    expect(result.evidence.errorDetail).toMatch(/^policy-load/)
  })
})
