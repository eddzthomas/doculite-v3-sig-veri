// Manifest integrity for the M0-C signature fixture catalog. Asserts the
// committed manifest against the files on disk — sha256 bindings, PDF magic
// bytes, the normalized outcome vocabulary, and the SIG-009 scenario pointer.
// Adjusted from the capture brief per captured reality:
// - SIG-007 carries a real PKCS#7 detached signature (adbe.pkcs7.detached,
//   ByteRange, self-signed DocuSeal cert embedded); the brief expected a bare
//   PDF. Cert extraction/verification is M0-D work — this suite asserts only
//   the manifest-level structural facts.
// - SIG-009 is a scenario fixture pointing at the recorded verifier-error
//   exchanges; the pointer must reference the actual committed recording.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SIG = join(ROOT, 'fixtures', 'signatures')
const manifest = JSON.parse(readFileSync(join(SIG, 'signatures-manifest.json'), 'utf8'))

const OUTCOMES = ['unsigned', 'valid_trusted', 'valid_untrusted', 'invalid', 'error']

describe('signature fixture manifest integrity', () => {
  it('every pdf-backed item matches its committed sha256', () => {
    for (const item of manifest.items) {
      if (!item.file) continue
      const bytes = readFileSync(join(SIG, item.file))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256)
    }
  })

  it('every pdf-backed item references an existing file', () => {
    for (const item of manifest.items) {
      if (!item.file) continue
      expect(existsSync(join(SIG, item.file))).toBe(true)
    }
  })

  it('sig-007 is present after capture (file + sha256 filled, %PDF header)', () => {
    const sig7 = manifest.items.find((i) => i.id === 'SIG-007')
    expect(sig7.file).toBe('sig-007.pdf')
    expect(sig7.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(readFileSync(join(SIG, 'sig-007.pdf')).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('sig-007 carries a real PKCS#7 detached signature container', () => {
    // contract note: the brief expected sig-007 to lack a signature; capture
    // reality is a live DocuSeal completion with an embedded self-signed cert.
    // Only structural facts are asserted here — cert trust extraction and
    // cryptographic verification are M0-D verifier work.
    const text = readFileSync(join(SIG, 'sig-007.pdf')).toString('latin1')
    expect(text).toContain('/ByteRange')
    expect(text).toContain('/adbe.pkcs7.detached')
  })

  it('sig-009 is a scenario fixture pointing at the committed verifier-error recording', () => {
    const sig9 = manifest.items.find((i) => i.id === 'SIG-009')
    expect(sig9.file).toBeNull()
    expect(sig9.sha256).toBeNull()
    // contract note: manifest originally pointed at recordings/docuseal/
    // verifier-error (capture-internal path); the real committed fixture is
    // fixtures/docuseal/verifier-error.json.
    expect(sig9.scenario).toBe('fixtures/docuseal/verifier-error.json')
    expect(existsSync(join(ROOT, sig9.scenario))).toBe(true)
    const recording = JSON.parse(readFileSync(join(ROOT, sig9.scenario), 'utf8'))
    expect(recording.journey).toBe('verifier-error')
    expect(recording.upstream.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('no item invents a vocabulary word outside the normalized set', () => {
    for (const item of manifest.items) {
      expect(OUTCOMES).toContain(item.expectedOutcome)
    }
  })
})
