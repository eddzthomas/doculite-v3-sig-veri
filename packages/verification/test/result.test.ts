import { describe, expect, it } from 'vitest'
import { ADAPTER_VERSION, deriveStatus } from '../src/result.ts'

describe('deriveStatus', () => {
  it('unsigned: not signed and nothing failed', () => {
    expect(deriveStatus({ signed: false, integrity: 'valid', trust: 'untrusted' })).toBe('unsigned')
  })
  it('valid_trusted / valid_untrusted', () => {
    expect(deriveStatus({ signed: true, integrity: 'valid', trust: 'trusted' })).toBe(
      'valid_trusted',
    )
    expect(deriveStatus({ signed: true, integrity: 'valid', trust: 'untrusted' })).toBe(
      'valid_untrusted',
    )
  })
  it('integrity invalid → never valid_*', () => {
    expect(deriveStatus({ signed: true, integrity: 'invalid', trust: 'trusted' })).toBe('invalid')
    expect(deriveStatus({ signed: true, integrity: 'invalid', trust: 'untrusted' })).toBe('invalid')
  })
  it('error anywhere → error (never a validity status)', () => {
    expect(deriveStatus({ signed: true, integrity: 'error', trust: 'trusted' })).toBe('error')
    expect(deriveStatus({ signed: true, integrity: 'valid', trust: 'error' })).toBe('error')
    expect(deriveStatus({ signed: false, integrity: 'valid', trust: 'error' })).toBe('error')
  })
  it('unsigned with integrity error still surfaces error', () => {
    expect(deriveStatus({ signed: false, integrity: 'error', trust: 'untrusted' })).toBe('error')
  })
  it('exports the adapter version', () => {
    expect(ADAPTER_VERSION).toBe('1.0.0')
  })
})
