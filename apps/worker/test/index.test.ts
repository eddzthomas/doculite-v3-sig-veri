import { describe, expect, it } from 'vitest'
import { workerInfo } from '../src/index'

describe('workerInfo', () => {
  it('identifies the worker package', () => {
    expect(workerInfo.name).toBe('doculite-worker')
  })

  it('reports a version matching package.json', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } })
    expect(workerInfo.version).toBe(pkg.default.version)
  })
})
