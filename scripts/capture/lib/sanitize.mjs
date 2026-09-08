import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|x-auth-token|token|password)$/i

function loadEnvSecrets() {
  // DEV ONLY stack values from deploy/local/.env — redaction list only.
  const envPath = join(import.meta.dirname, '..', '..', '..', 'deploy', 'local', '.env')
  if (!existsSync(envPath)) return []
  const values = []
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.+)$/.exec(line)
    if (m && m[1] !== 'PAPERLESS_ADMIN_USER' && m[2].length > 4) values.push(m[2])
  }
  return values
}

export function sanitizeStep(step, envSecrets = loadEnvSecrets()) {
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
        node[key] = s
      } else walk(value)
    }
  }
  walk(out)
  return out
}
