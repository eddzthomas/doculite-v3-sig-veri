/**
 * Canonical verification outcomes for V1.
 * Source of truth: docs/signatures/verification-policy.md and root AGENTS.md.
 * These are the ONLY values V1 may report — do not add statuses such as
 * eIDAS/QES or PAdES-LT/LTA claims (prohibited by the verification policy).
 */
export const VERIFICATION_OUTCOMES = Object.freeze([
  'unsigned',
  'valid_trusted',
  'valid_untrusted',
  'invalid',
  'error',
] as const)

export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number]

const OUTCOME_SET: ReadonlySet<string> = new Set(VERIFICATION_OUTCOMES)

export function isVerificationOutcome(value: unknown): value is VerificationOutcome {
  return typeof value === 'string' && OUTCOME_SET.has(value)
}
