import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateIntegrity } from '../src/verifier.ts'

const SIG = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'signatures')
const pdf = (name: string) => new Uint8Array(readFileSync(join(SIG, name)))

describe('evaluateIntegrity (integrity dimension only)', () => {
  it('SIG-001 unsigned pdf → no signatures', () => {
    const r = evaluateIntegrity(pdf('sig-001.pdf'))
    expect(r.integrity).toBe('valid')
    expect(r.perSignature).toHaveLength(0)
  })
  it('SIG-002 valid PKCS#7 over covered ranges → integrity valid', () => {
    const r = evaluateIntegrity(pdf('sig-002.pdf'))
    expect(r.integrity).toBe('valid')
    expect(r.perSignature[0]?.signatureAlgorithm).toMatch(/RSA/i)
    expect(r.perSignature[0]?.signerCertFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
  it('SIG-004 one-byte tamper → integrity invalid', () => {
    expect(evaluateIntegrity(pdf('sig-004.pdf')).integrity).toBe('invalid')
  })
  it('SIG-005 corrupted container → error', () => {
    expect(evaluateIntegrity(pdf('sig-005.pdf')).integrity).toBe('error')
  })
  it('SIG-006 two signatures, both integrity-valid', () => {
    const r = evaluateIntegrity(pdf('sig-006.pdf'))
    expect(r.integrity).toBe('valid')
    expect(r.perSignature).toHaveLength(2)
  })
  it('SIG-007 real docuseal PKCS#7 → integrity valid', () => {
    expect(evaluateIntegrity(pdf('sig-007.pdf')).integrity).toBe('valid')
  })
  it('garbage input → error (never a validity status)', () => {
    expect(
      evaluateIntegrity(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0x01])).integrity,
    ).toBe('error')
  })
})
