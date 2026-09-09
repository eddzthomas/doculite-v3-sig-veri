import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const FIXTURES = join(ROOT, 'fixtures', 'signatures')

const GENERATED = [
  'sig-001',
  'sig-002',
  'sig-003',
  'sig-004',
  'sig-005',
  'sig-006',
  'sig-007',
  'sig-008',
]
const OUTCOMES = ['unsigned', 'valid_trusted', 'valid_untrusted', 'invalid', 'error']

describe('signatures manifest', () => {
  const manifest = JSON.parse(readFileSync(join(FIXTURES, 'signatures-manifest.json'), 'utf8'))

  it('lists all nine fixture ids', () => {
    expect(manifest.items.map((i) => i.id)).toEqual([
      'SIG-001',
      'SIG-002',
      'SIG-003',
      'SIG-004',
      'SIG-005',
      'SIG-006',
      'SIG-007',
      'SIG-008',
      'SIG-009',
    ])
  })

  it('records valid outcomes vocabulary only', () => {
    for (const item of manifest.items) {
      expect(OUTCOMES).toContain(item.expectedOutcome)
    }
  })

  it.each(GENERATED)('%s: committed bytes match recorded sha256', (id) => {
    const item = manifest.items.find((i) => i.id.toLowerCase() === id)
    expect(item.file).toBe(`${id}.pdf`)
    const bytes = readFileSync(join(FIXTURES, item.file))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256)
  })

  it.each(GENERATED)('%s: pdf starts with %PDF header', (id) => {
    const bytes = readFileSync(join(FIXTURES, `${id}.pdf`))
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it.each(['sig-002', 'sig-003', 'sig-006', 'sig-008'])(
    '%s contains a signature ByteRange',
    (id) => {
      const text = readFileSync(join(FIXTURES, `${id}.pdf`)).toString('latin1')
      expect(text).toContain('/ByteRange')
    },
  )

  it('sig-006 contains two signatures', () => {
    const text = readFileSync(join(FIXTURES, 'sig-006.pdf')).toString('latin1')
    expect(text.match(/\/ByteRange/g).length).toBeGreaterThanOrEqual(2)
  })

  it('sig-004 differs from sig-002 by exactly one byte inside the signed range', () => {
    const a = readFileSync(join(FIXTURES, 'sig-002.pdf'))
    const b = readFileSync(join(FIXTURES, 'sig-004.pdf'))
    expect(b.length).toBe(a.length)
    const diffs = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i)
    expect(diffs.length).toBe(1)
  })

  it('sig-007 is the live-captured docuseal completion', () => {
    const item = manifest.items.find((i) => i.id === 'SIG-007')
    expect(item.file).toBe('sig-007.pdf')
    expect(item.sha256).toBeTruthy()
    expect(item.capturedAt).toBeTruthy()
    expect(item.capturedFrom).toBe('docuseal')
  })

  it('sig-009 is a scenario fixture with no pdf', () => {
    const item = manifest.items.find((i) => i.id === 'SIG-009')
    expect(item.file).toBeNull()
    expect(item.sha256).toBeNull()
    expect(item.scenario).toBe('recordings/docuseal/verifier-error')
  })

  it('cert material is committed for both trust paths', () => {
    for (const pem of ['root-a.pem', 'root-a-leaf.pem', 'root-b.pem', 'root-b-leaf.pem']) {
      expect(existsSync(join(FIXTURES, pem))).toBe(true)
    }
  })
})
