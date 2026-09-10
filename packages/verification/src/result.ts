import type { VerificationStatus } from './types.ts'

export const ADAPTER_VERSION = '1.0.0'

export interface Dimensions {
  signed: boolean
  integrity: 'valid' | 'invalid' | 'error'
  trust: 'trusted' | 'untrusted' | 'error'
}

// Total, pure status derivation. Typed invariants (each tested):
// - error anywhere → 'error' (never displayed as unsigned or valid)
// - integrity invalid → 'invalid', never 'valid_*'
// - unsigned + nothing failed → 'unsigned'
export function deriveStatus(d: Dimensions): VerificationStatus {
  if (d.integrity === 'error' || d.trust === 'error') return 'error'
  if (!d.signed) return 'unsigned'
  if (d.integrity === 'invalid') return 'invalid'
  return d.trust === 'trusted' ? 'valid_trusted' : 'valid_untrusted'
}
