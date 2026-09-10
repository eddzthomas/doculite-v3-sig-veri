import type { Provenance } from './types.ts'

/**
 * M0-D provenance heuristic, recorded verbatim in every evaluated summary
 * (and in the evidence `raw` of every result): origin is decided by a
 * signer-cert subject CN match only. M1+ replaces it with submission
 * correlation against the product database. Provenance NEVER changes
 * integrity or trust — it is an independent origin fact.
 */
export const PROVENANCE_HEURISTIC_NOTE =
  'provenance: M0-D heuristic — signer-cert subject CN match (submission correlation deferred to M1+). ' +
  'An attacker-controlled CN containing DocuSeal can claim docuseal provenance; this is acceptable ' +
  'because provenance is an origin fact that cannot affect integrity, trust, or status (invariant tested).'

// Calibrated against the live SIG-007 capture: its signer subject is
// 'C=AT, O=DocuSeal, CN=DocuSeal', so the CN value contains 'DocuSeal'.
// Only the CN attribute drives the match — an O= or other attribute naming
// DocuSeal does not make a signature product-origin.
const CN_PATTERN = /(?:^|,\s*)CN=([^,]*)/

/**
 * Origin fact for one signature from its signer-cert subject string
 * (the `CN=<value>, ...` convention of the integrity summary):
 * CN contains 'DocuSeal' → 'docuseal'; any other identified signer →
 * 'external'; no signer identified (empty subject) → 'none'.
 */
export function determineProvenance(signerSubject: string): Provenance {
  if (signerSubject.length === 0) return 'none'
  const cn = CN_PATTERN.exec(signerSubject)?.[1] ?? ''
  return cn.includes('DocuSeal') ? 'docuseal' : 'external'
}

/**
 * Document-level provenance roll-up: any 'docuseal' → 'docuseal' (the
 * product-origin signature dominates), else any 'external' → 'external',
 * else 'none'. The choice cannot affect integrity, trust, or status.
 */
export function aggregateProvenance(values: Array<Provenance>): Provenance {
  if (values.includes('docuseal')) return 'docuseal'
  if (values.includes('external')) return 'external'
  return 'none'
}
