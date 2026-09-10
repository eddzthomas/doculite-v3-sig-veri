import { createHash } from 'node:crypto'
import { ADAPTER_VERSION } from './result.ts'
import type { EvidenceRecord } from './types.ts'

export interface EvidenceInput {
  /** Exact input bytes that were evaluated (hashed, never embedded). */
  bytes: Uint8Array
  /** Loaded policy version; null when the policy failed to load. */
  policyVersion: string | null
  /**
   * Controlled raw output (offline proof only; M1+ replaces with a
   * reference). SECURITY: the integrity `raw` embeds /Contents hex blobs —
   * never log it, never persist it, never return it to a browser.
   */
  raw: unknown
  /** Step-named failure detail; never contains document bytes or signer PII. */
  errorDetail?: string
}

/**
 * The spec's evidence record — exactly these 8 fields, no extras:
 * evaluatedSha256, adapterVersion, policyVersion, paperlessDocumentId,
 * retrievedAt, rawResultReference, raw, errorDetail?. M0-D values:
 * paperlessDocumentId/retrievedAt/rawResultReference are always null
 * (no Paperless wiring; bytes are provided directly; raw lives in `raw`).
 */
export function buildEvidence(input: EvidenceInput): EvidenceRecord {
  return {
    evaluatedSha256: createHash('sha256').update(input.bytes).digest('hex'),
    adapterVersion: ADAPTER_VERSION,
    policyVersion: input.policyVersion,
    paperlessDocumentId: null,
    retrievedAt: null,
    rawResultReference: null,
    raw: input.raw,
    ...(input.errorDetail === undefined ? {} : { errorDetail: input.errorDetail }),
  }
}
