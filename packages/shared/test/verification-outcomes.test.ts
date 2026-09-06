import { describe, expect, it } from 'vitest'
import {
  isVerificationOutcome,
  VERIFICATION_OUTCOMES,
  type VerificationOutcome,
} from '../src/verification-outcomes'

describe('VERIFICATION_OUTCOMES', () => {
  it('contains exactly the five canonical outcomes in policy order', () => {
    expect([...VERIFICATION_OUTCOMES]).toEqual([
      'unsigned',
      'valid_trusted',
      'valid_untrusted',
      'invalid',
      'error',
    ])
  })

  it('is frozen', () => {
    expect(Object.isFrozen(VERIFICATION_OUTCOMES)).toBe(true)
  })
})

describe('isVerificationOutcome', () => {
  it.each(['unsigned', 'valid_trusted', 'valid_untrusted', 'invalid', 'error'])(
    'accepts %s',
    (value) => {
      expect(isVerificationOutcome(value)).toBe(true)
    },
  )

  it.each(['valid', 'VALID_TRUSTED', 'qes', 'pades-lt', '', null, undefined, 42])(
    'rejects %s',
    (value) => {
      expect(isVerificationOutcome(value)).toBe(false)
    },
  )

  it('narrows the type on accept', () => {
    const value: unknown = 'valid_trusted'
    if (isVerificationOutcome(value)) {
      const narrowed: VerificationOutcome = value
      expect(narrowed).toBe('valid_trusted')
    } else {
      throw new Error('should have narrowed')
    }
  })
})
