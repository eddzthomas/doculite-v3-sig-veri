import { describe, expect, it, vi } from 'vitest'
import { parseComposePs, waitForHealthy } from '../../deploy/local/stack.mjs'

function psLine(service, health) {
  return JSON.stringify({ Service: service, State: 'running', Health: health })
}

describe('parseComposePs', () => {
  it('parses newline-delimited json output', () => {
    const services = parseComposePs(
      [psLine('postgres', 'healthy'), psLine('redis', 'starting')].join('\n'),
    )
    expect(services.get('postgres')).toBe('healthy')
    expect(services.get('redis')).toBe('starting')
  })

  it('parses a json array (docker compose v2.21+ / v5 shape)', () => {
    const services = parseComposePs(
      JSON.stringify([
        { Service: 'postgres', State: 'running', Health: 'healthy' },
        { Service: 'redis', State: 'running', Health: 'starting' },
      ]),
    )
    expect(services.get('postgres')).toBe('healthy')
    expect(services.get('redis')).toBe('starting')
  })

  it('treats a missing service as no-health', () => {
    const services = parseComposePs([psLine('postgres', 'healthy')].join('\n'))
    expect(services.has('redis')).toBe(false)
  })
})

describe('waitForHealthy', () => {
  it('resolves when every service is healthy', async () => {
    let calls = 0
    const runner = vi.fn(async () => {
      calls += 1
      return calls < 3
        ? [psLine('postgres', 'starting'), psLine('docuseal', 'starting')].join('\n')
        : [psLine('postgres', 'healthy'), psLine('docuseal', 'healthy')].join('\n')
    })
    await waitForHealthy(runner, {
      services: ['postgres', 'docuseal'],
      timeoutMs: 5000,
      intervalMs: 1,
    })
    expect(calls).toBe(3)
  })

  it('throws naming the unhealthy services on timeout', async () => {
    const runner = vi.fn(async () =>
      [psLine('postgres', 'healthy'), psLine('docuseal', 'unhealthy')].join('\n'),
    )
    await expect(
      waitForHealthy(runner, { services: ['postgres', 'docuseal'], timeoutMs: 30, intervalMs: 1 }),
    ).rejects.toThrow(/docuseal/)
  })

  it('throws naming a service that vanished from compose ps', async () => {
    const runner = vi.fn(async () => [psLine('postgres', 'healthy')].join('\n'))
    await expect(
      waitForHealthy(runner, { services: ['postgres', 'redis'], timeoutMs: 30, intervalMs: 1 }),
    ).rejects.toThrow(/redis/)
  })
})
