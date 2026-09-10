import type { VerificationOutcome } from '@doculite/shared'

/**
 * Canonical five-word verification status vocabulary.
 * Single source of truth is @doculite/shared's VerificationOutcome
 * (packages/shared/src/verification-outcomes.ts) — re-exported here under
 * the adapter's name so the words can never drift between packages.
 */
export type VerificationStatus = VerificationOutcome

/** Cryptographic fact only — never influenced by trust or provenance. */
export type Integrity = 'valid' | 'invalid' | 'error'

/** Configured-policy fact only — never influenced by integrity or provenance. */
export type Trust = 'trusted' | 'untrusted' | 'error'

/** Origin fact only — never changes integrity or trust (AGENTS.md invariant). */
export type Provenance = 'docuseal' | 'external' | 'none'

/** Byte range covered by a signature's /ByteRange entry (inclusive offsets). */
export interface CoveredRange {
  start: number
  end: number
}

/** Certificate validity window as recorded evidence (no revocation/time claims at M0-D). */
export interface CertValidityWindow {
  notBefore: string | null
  notAfter: string | null
}

export interface PerSignatureSummary {
  coveredRanges: Array<CoveredRange>
  digestAlgorithm: string
  signatureAlgorithm: string
  signerSubject: string
  signerCertFingerprint: string
  chainAnchoredAt: string | null
  certValidityWindow: CertValidityWindow
  integrity: Integrity
  trust: Trust
  provenance: Provenance
  notes: Array<string>
}

export interface EvidenceRecord {
  /** SHA-256 of the exact input bytes that were evaluated. */
  evaluatedSha256: string
  /** Constant, e.g. '1.0.0'. */
  adapterVersion: string
  /** Version of the loaded trust policy; null when policy failed to load. */
  policyVersion: string | null
  /** M0-D: no Paperless wiring yet. */
  paperlessDocumentId: null
  /** M0-D: bytes are provided directly. */
  retrievedAt: null
  /** M0-D: full raw summary lives in perSignature/raw field. */
  rawResultReference: null
  /** Controlled raw verifier output (offline proof only; M1+ replaces with a reference). */
  raw: unknown
  /** When applicable — never contains document bytes or signer PII. */
  errorDetail?: string
}

export interface VerificationResult {
  status: VerificationStatus
  integrity: Integrity
  trust: Trust
  provenance: Provenance
  perSignature: Array<PerSignatureSummary>
  evidence: EvidenceRecord
}
