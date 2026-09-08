import { describe, expect, it } from 'vitest'
import { sanitizeStep } from '../../capture/lib/sanitize.mjs'

describe('sanitizeStep', () => {
  it('redacts auth-sensitive headers and body keys', () => {
    const out = sanitizeStep({
      request: {
        method: 'POST',
        headers: { Authorization: 'Token abc123', 'Content-Type': 'application/json' },
        body: { username: 'capture-admin', password: 'hunter2' },
      },
      response: { status: 200, headers: { 'Set-Cookie': 'sessionid=x' }, body: { token: 't0k3n' } },
    })
    expect(out.request.headers.Authorization).toBe('<redacted>')
    expect(out.request.headers['Content-Type']).toBe('application/json')
    expect(out.request.body.password).toBe('<redacted>')
    expect(out.request.body.username).toBe('capture-admin')
    expect(out.response.headers['Set-Cookie']).toBe('<redacted>')
    expect(out.response.body.token).toBe('<redacted>')
  })

  it('redacts .env secret values appearing anywhere', () => {
    const out = sanitizeStep({ notes: 'uses devonly-paperless-secret-key in body' })
    expect(out.notes).toContain('<redacted>')
    expect(out.notes).not.toContain('devonly-paperless-secret-key')
  })

  it('does not mutate its input', () => {
    const input = { headers: { Authorization: 'Token abc' } }
    sanitizeStep(input)
    expect(input.headers.Authorization).toBe('Token abc')
  })
})
