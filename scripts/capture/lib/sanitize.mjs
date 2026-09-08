import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|x-auth-token|token|password)$/i

// DEV ONLY stack values from deploy/local/.env — redaction/leak-check list
// only, never logged or written. Shared by sanitizeStep and assertRedacted so
// the parse and thresholds stay aligned; guarded so tests stay independent of
// whether the local .env exists.
export function parseEnvSecrets() {
  const envPath = join(import.meta.dirname, '..', '..', '..', 'deploy', 'local', '.env')
  if (!existsSync(envPath)) return []
  const secrets = []
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.+)$/.exec(line)
    if (m && m[2].length > 4) secrets.push({ name: m[1], value: m[2] })
  }
  return secrets
}

// Plain-string view for redaction; the admin username is not a secret and
// appears legitimately in captures, so it is never redacted. Injected
// envSecrets use the same plain-string shape (CI-safe, no .env read).
function redactableEnvValues() {
  return parseEnvSecrets()
    .filter((s) => s.name !== 'PAPERLESS_ADMIN_USER')
    .map((s) => s.value)
}

export function sanitizeStep(step, envSecrets = redactableEnvValues()) {
  const out = structuredClone(step)
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node === null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (SENSITIVE_KEYS.test(key)) {
        node[key] = '<redacted>'
        continue
      }
      if (typeof value === 'string') {
        let s = value
        for (const secret of envSecrets) s = s.split(secret).join('<redacted>')
        // assertRedacted's /Bearer |Token / value regex intentionally over-fires
        // on prose containing these prefixes; step() must redact such values here.
        if (/^(Bearer|Token) /.test(s)) s = '<redacted>'
        node[key] = s
      } else walk(value)
    }
  }
  walk(out)
  return out
}
