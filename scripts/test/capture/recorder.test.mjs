import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { digestFor, JourneyRecorder } from '../../capture/lib/recorder.mjs'

describe('digestFor', () => {
  it('resolves the pinned digest for a component', () => {
    expect(digestFor('paperless-ngx')).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
  it('throws for an unknown component', () => {
    expect(() => digestFor('not-a-service')).toThrow()
  })
})

describe('JourneyRecorder', () => {
  it('writes the recorded shape and stamps the digest', async () => {
    const journeysDir = await mkdtemp(join(tmpdir(), 'm0c-'))
    const rec = new JourneyRecorder({ journeysDir, journey: 'demo', service: 'paperless-ngx' })
    rec.step({
      name: 'step-1',
      request: { method: 'GET', path: '/api/', headers: {}, body: null },
      response: { status: 200, headers: {}, body: {} },
    })
    expect(rec.document()).toMatchObject({
      journey: 'demo',
      upstream: { service: 'paperless-ngx', imageDigest: digestFor('paperless-ngx') },
    })
    expect(rec.document().steps).toHaveLength(1)
    expect(rec.document().steps[0].name).toBe('step-1')
  })

  it('write() rejects steps containing unredacted token headers', async () => {
    const journeysDir = await mkdtemp(join(tmpdir(), 'm0c-'))
    const rec = new JourneyRecorder({ journeysDir, journey: 'demo', service: 'paperless-ngx' })
    // Pushed raw (bypassing step(), which sanitizes Authorization headers):
    // emulates a capture path that forgot to sanitize — write() must refuse.
    rec.steps.push({
      name: 'bad',
      request: { method: 'GET', headers: { Authorization: 'Token real-secret-value' } },
      response: { status: 200 },
    })
    expect(() => rec.write()).toThrow(/unredacted/)
  })
})
