import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  aggregateProvenance,
  determineProvenance,
  PROVENANCE_HEURISTIC_NOTE,
} from '../src/provenance.ts'
import { verifyPdf } from '../src/verify.ts'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SIG = join(ROOT, 'fixtures', 'signatures')
const POLICY = join(ROOT, 'packages', 'verification', 'policies', 'v1.json')
const pdf = (name: string) => new Uint8Array(readFileSync(join(SIG, name)))

describe('determineProvenance (M0-D signer-cert subject CN heuristic)', () => {
  it('the live SIG-007 capture subject (C=AT, O=DocuSeal, CN=DocuSeal) → docuseal', () => {
    expect(determineProvenance('C=AT, O=DocuSeal, CN=DocuSeal')).toBe('docuseal')
  })

  it('fixture signer subject → external', () => {
    expect(determineProvenance('CN=Doculite Fixture Signer A')).toBe('external')
    expect(determineProvenance('CN=Doculite Fixture Root A')).toBe('external')
  })

  it('no signer identified (empty subject) → none', () => {
    expect(determineProvenance('')).toBe('none')
  })

  it('only the CN attribute drives the match — an O=DocuSeal organization alone does not', () => {
    expect(determineProvenance('O=DocuSeal, CN=External Signer')).toBe('external')
  })
})

describe('aggregateProvenance (doc-level roll-up)', () => {
  it('no signatures → none', () => {
    expect(aggregateProvenance([])).toBe('none')
  })

  it('all none → none', () => {
    expect(aggregateProvenance(['none', 'none'])).toBe('none')
  })

  it('any docuseal → docuseal', () => {
    expect(aggregateProvenance(['none', 'docuseal', 'external'])).toBe('docuseal')
  })

  it('external without docuseal → external', () => {
    expect(aggregateProvenance(['none', 'external'])).toBe('external')
  })
})

describe('provenance surfaced through verifyPdf', () => {
  it('SIG-007 result is docuseal and every summary carries the M0-D heuristic note', () => {
    const result = verifyPdf(pdf('sig-007.pdf'), { policyPath: POLICY })
    expect(result.provenance).toBe('docuseal')
    for (const entry of result.perSignature) {
      expect(entry.provenance).toBe('docuseal')
      expect(entry.notes).toContain(PROVENANCE_HEURISTIC_NOTE)
    }
  })

  it('SIG-001 unsigned result has provenance none and no per-signature summaries', () => {
    const result = verifyPdf(pdf('sig-001.pdf'), { policyPath: POLICY })
    expect(result.provenance).toBe('none')
    expect(result.perSignature).toHaveLength(0)
  })
})
