import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateTrust, loadPolicy } from '../src/policy.ts'
import type { ScannedSignature } from '../src/types.ts'
import { certificateFingerprint, extractSignerChain, scanSignatures } from '../src/verifier.ts'

const SIG = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'signatures')
const POLICIES = join(import.meta.dirname, '..', 'policies')

const pdf = (name: string) => new Uint8Array(readFileSync(join(SIG, name)))
const pem = (name: string) => readFileSync(join(SIG, name), 'utf8')
const pemToDer = (text: string): Uint8Array =>
  new Uint8Array(
    Buffer.from(text.replace(/-----[A-Z ]*CERTIFICATE-----/g, '').replace(/\s+/g, ''), 'base64'),
  )
const v1 = () => loadPolicy(join(POLICIES, 'v1.json'))

// Known-root store: both fixture roots, as Task 4 will supply them. The
// store is a superset of the v1 policy anchors — the policy, not candidate
// availability, decides trust.
const knownRoots = (): Array<Uint8Array> => [
  pemToDer(pem('root-a.pem')),
  pemToDer(pem('root-b.pem')),
]

const chainOf = (name: string): Array<Uint8Array> => {
  const scanned = scanSignatures(pdf(name))
  const sig = scanned.find((s): s is ScannedSignature => !('malformed' in s))
  if (!sig) throw new Error(`fixture ${name} must contain a usable signature`)
  return extractSignerChain(sig, knownRoots())
}

describe('trust chain extraction (verifier pieces, reused by trust evaluation)', () => {
  it('SIG-002 embeds only the leaf — with no candidates the chain cannot reach a root (throws)', () => {
    const scanned = scanSignatures(pdf('sig-002.pdf'))
    const sig = scanned.find((s): s is ScannedSignature => !('malformed' in s))
    if (!sig) throw new Error('fixture sig-002 must contain a usable signature')
    expect(() => extractSignerChain(sig)).toThrow(/issuer certificate missing/)
  })

  it('SIG-002 chain (leaf + root-a) ends in a root matching the PEM-derived anchor fingerprint', () => {
    const chain = chainOf('sig-002.pdf')
    expect(chain).toHaveLength(2)
    const rootDer = chain[chain.length - 1]
    if (!rootDer) throw new Error('chain must terminate at a root')
    expect(certificateFingerprint(rootDer)).toBe(
      certificateFingerprint(pemToDer(pem('root-a.pem'))),
    )
  })

  it('an issuer outside the candidate store → chain cannot be built (throws, fail-safe)', () => {
    const scanned = scanSignatures(pdf('sig-002.pdf'))
    const sig = scanned.find((s): s is ScannedSignature => !('malformed' in s))
    if (!sig) throw new Error('fixture sig-002 must contain a usable signature')
    expect(() => extractSignerChain(sig, [pemToDer(pem('root-b.pem'))])).toThrow()
  })
})

describe('evaluateTrust (trust dimension)', () => {
  it('SIG-002 chain terminates at anchored root-a → trusted, anchoredAt root-a', () => {
    expect(evaluateTrust(chainOf('sig-002.pdf'), v1())).toEqual({
      trust: 'trusted',
      anchoredAt: 'root-a',
    })
  })

  it('SIG-003 chain terminates at unanchored root-b → untrusted, anchoredAt null', () => {
    expect(evaluateTrust(chainOf('sig-003.pdf'), v1())).toEqual({
      trust: 'untrusted',
      anchoredAt: null,
    })
  })

  it('SIG-008 external root-b signature → untrusted (unknown root is never trusted)', () => {
    expect(evaluateTrust(chainOf('sig-008.pdf'), v1())).toEqual({
      trust: 'untrusted',
      anchoredAt: null,
    })
  })

  it('a bare self-signed anchored root chain → trusted', () => {
    expect(evaluateTrust([pemToDer(pem('root-a.pem'))], v1())).toEqual({
      trust: 'trusted',
      anchoredAt: 'root-a',
    })
  })

  it('chain that does not terminate at a self-signed root → error (never a validity status)', () => {
    expect(evaluateTrust([pemToDer(pem('root-a-leaf.pem'))], v1())).toEqual({
      trust: 'error',
      anchoredAt: null,
    })
  })

  it('empty chain → error (fail-safe)', () => {
    expect(evaluateTrust([], v1())).toEqual({ trust: 'error', anchoredAt: null })
  })

  it('policy without anchors → error for every chain (never blanket-untrusted)', () => {
    for (const chain of [chainOf('sig-002.pdf'), chainOf('sig-003.pdf')]) {
      expect(evaluateTrust(chain, { version: '1', anchors: [] })).toEqual({
        trust: 'error',
        anchoredAt: null,
      })
    }
  })
})
