import { readFileSync } from 'node:fs'
import forge from 'node-forge'
import type { Trust } from './types.ts'
import { certificateFingerprint } from './verifier.ts'

export interface TrustAnchor {
  name: string
  sha256: string
}

export interface TrustPolicy {
  version: string
  anchors: Array<TrustAnchor>
}

/** Trust verdict for one signature plus the anchor it terminated at, if any. */
export interface TrustEvaluationResult {
  trust: Trust
  anchoredAt: string | null
}

const SHA256_HEX = /^[0-9a-f]{64}$/

function fail(message: string): never {
  throw new Error(`trust policy: ${message}`)
}

/**
 * Versioned trust-policy loader. Deliberately a throwing API: a policy that
 * is missing, unparseable, or structurally invalid must never degrade to
 * "no anchors" (which would silently blanket-untrust every document). The
 * caller maps the throw to trust `error` (fail-safe), per the orchestration
 * contract — evaluateTrust never loads the policy itself.
 */
export function loadPolicy(path: string): TrustPolicy {
  const text = readFileSync(path, 'utf8')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    fail(`${path} is not valid JSON`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail('top-level value must be an object')
  }
  const record = raw as { version?: unknown; anchors?: unknown }
  if (typeof record.version !== 'string' || record.version.length === 0) {
    fail('version must be a non-empty string')
  }
  if (!Array.isArray(record.anchors)) fail('anchors must be an array')
  const anchors = record.anchors.map((anchor) => {
    if (typeof anchor !== 'object' || anchor === null) fail('each anchor must be an object')
    const { name, sha256 } = anchor as { name?: unknown; sha256?: unknown }
    if (typeof name !== 'string' || name.length === 0) {
      fail('anchor name must be a non-empty string')
    }
    if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) {
      fail('anchor sha256 must be a lowercase 64-hex SHA-256 fingerprint')
    }
    return { name, sha256 }
  })
  return { version: record.version, anchors }
}

/**
 * Trust evaluation for one signature's certificate chain (leaf-first,
 * root-last, exact DER bytes — the contract of extractSignerChain). Trust
 * iff the chain terminates at a self-signed root whose certificate
 * fingerprint (SHA-256 over the exact DER bytes, the single shared
 * convention with signer-cert facts) matches a configured anchor.
 *
 * Fail-safe rules:
 * - empty chain, unparseable root, or a chain that does not terminate at a
 *   self-signed root → `error` (never a validity status);
 * - a policy without anchors cannot express any trust decision → `error`
 *   for every chain (never blanket-untrusted).
 *
 * M0-D decision: the certificate validity window is recorded evidence in
 * the integrity summary only — expired/not-yet-valid certificates do NOT
 * change the trust verdict (no revocation or time claims at M0-D; spec
 * Decision/Limits).
 */
export function evaluateTrust(
  chain: Array<Uint8Array>,
  policy: TrustPolicy,
): TrustEvaluationResult {
  if (chain.length === 0 || policy.anchors.length === 0) {
    return { trust: 'error', anchoredAt: null }
  }
  const rootDer = chain[chain.length - 1]
  if (!rootDer) return { trust: 'error', anchoredAt: null }
  if (!isSelfSigned(rootDer)) return { trust: 'error', anchoredAt: null }
  const fingerprint = certificateFingerprint(rootDer)
  const anchor = policy.anchors.find((candidate) => candidate.sha256 === fingerprint)
  return anchor
    ? { trust: 'trusted', anchoredAt: anchor.name }
    : { trust: 'untrusted', anchoredAt: null }
}

/**
 * Self-signed check: issuer DN equals subject DN. Unparseable root
 * certificates count as not self-signed so evaluateTrust fails safe to
 * `error` rather than guessing.
 */
function isSelfSigned(der: Uint8Array): boolean {
  try {
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(Buffer.from(der).toString('binary')),
    )
    return JSON.stringify(cert.subject.attributes) === JSON.stringify(cert.issuer.attributes)
  } catch {
    return false
  }
}
