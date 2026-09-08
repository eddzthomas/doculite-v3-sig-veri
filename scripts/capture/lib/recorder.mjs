import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnvSecrets, sanitizeStep } from './sanitize.mjs'

const MANIFEST = join(import.meta.dirname, '..', '..', '..', 'deploy', 'upstream-versions.json')

export function digestFor(service) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const entry = manifest.components.find((c) => c.name === service)
  if (!entry?.image?.digest) throw new Error(`no pinned digest for ${service}`)
  return entry.image.digest
}

// Records one API journey: ordered steps, sanitized at capture time,
// stamped with the pinned upstream digest (the drift anchor, per spec).
export class JourneyRecorder {
  constructor({ journeysDir, journey, service }) {
    this.journeysDir = journeysDir
    this.journey = journey
    this.service = service
    this.steps = []
    this.imageDigest = digestFor(service)
  }

  step({ name, request, response, notes }) {
    this.steps.push(sanitizeStep({ name, request, response, notes: notes ?? null }))
  }

  document() {
    return {
      journey: this.journey,
      capturedAt: new Date().toISOString(),
      upstream: { service: this.service, imageDigest: this.imageDigest },
      steps: this.steps,
    }
  }

  assertRedacted() {
    const text = JSON.stringify(this.steps)
    if (/Token (?!<redacted>)[^\s"]+/.test(text) || /Bearer (?!<redacted>)[^\s"]+/.test(text)) {
      throw new Error('recording contains unredacted credential header — refusing to write')
    }
    // DEV ONLY stack values from deploy/local/.env — leak check only.
    // Threshold (>4) and parse are shared with sanitizeStep (parseEnvSecrets)
    // so the two layers stay aligned; this check is intentionally stricter
    // than redaction (no PAPERLESS_ADMIN_USER exclusion).
    for (const { name, value } of parseEnvSecrets()) {
      if (text.includes(value)) {
        throw new Error(`recording contains unredacted ${name} value — refusing to write`)
      }
    }
  }

  write() {
    this.assertRedacted()
    mkdirSync(this.journeysDir, { recursive: true })
    const file = join(this.journeysDir, `${this.journey}.json`)
    writeFileSync(file, `${JSON.stringify(this.document(), null, 2)}\n`)
    return file
  }
}
