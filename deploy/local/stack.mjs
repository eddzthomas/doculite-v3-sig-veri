#!/usr/bin/env node
/**
 * Local stack lifecycle (DEV ONLY). Runs docker compose from this directory.
 *   node stack.mjs start  — up -d and wait until every service is healthy
 *   node stack.mjs health — print the current health table
 *   node stack.mjs stop   — stop (data preserved)
 *   node stack.mjs nuke   — down -v (destroys volumes; the disposable guarantee)
 */
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SERVICES = ['postgres', 'redis', 'paperless', 'docuseal']

export function parseComposePs(stdout) {
  const services = new Map()
  // Docker Compose emits either a JSON array (v2.21+/v5) or line-delimited
  // JSON objects depending on version; accept both shapes.
  const trimmed = stdout.trim()
  if (trimmed === '') return services
  let rows
  try {
    rows = JSON.parse(trimmed)
  } catch {
    rows = trimmed.split('\n')
  }
  if (!Array.isArray(rows)) return services
  for (const raw of rows) {
    let row = raw
    if (typeof row === 'string') {
      const line = row.trim()
      if (line === '') continue
      row = JSON.parse(line)
    }
    if (typeof row.Service === 'string') services.set(row.Service, row.Health ?? 'none')
  }
  return services
}

export async function waitForHealthy(runner, { services, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const out = await runner(['ps', '--format', 'json'])
    const status = parseComposePs(out)
    const unhealthy = services.filter((s) => status.get(s) !== 'healthy')
    if (unhealthy.length === 0) return status
    if (Date.now() >= deadline) {
      throw new Error(
        `services not healthy after timeout: ${unhealthy.join(', ')} (status: ${[...status]
          .map(([s, h]) => `${s}=${h}`)
          .join(' ')})`,
      )
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

function compose(args, { capture } = {}) {
  const full = ['compose', '--env-file', '.env', ...args]
  if (capture) {
    return execFileSync('docker', full, { cwd: HERE, encoding: 'utf8' })
  }
  execFileSync('docker', full, { cwd: HERE, stdio: 'inherit' })
  return null
}

async function main() {
  const mode = process.argv[2]
  if (mode === 'start') {
    compose(['up', '-d', '--wait'], { capture: false })
    const status = await waitForHealthy((args) => compose(args, { capture: true }), {
      services: SERVICES,
      timeoutMs: 300000,
      intervalMs: 2000,
    })
    for (const [service, health] of status) console.log(`${service}: ${health}`)
    console.log('stack is healthy')
  } else if (mode === 'health') {
    const status = parseComposePs(compose(['ps', '--format', 'json'], { capture: true }))
    for (const service of SERVICES)
      console.log(`${service}: ${status.get(service) ?? 'not running'}`)
    process.exitCode =
      [...status.values()].every((h) => h === 'healthy') &&
      SERVICES.every((s) => status.get(s) === 'healthy')
        ? 0
        : 1
  } else if (mode === 'stop') {
    compose(['stop'])
  } else if (mode === 'nuke') {
    compose(['down', '-v', '--remove-orphans'])
    console.log('stack destroyed (volumes removed)')
  } else {
    console.error('usage: node stack.mjs <start|health|stop|nuke>')
    process.exit(2)
  }
}

// CLI dispatch must only run when this file is the entry point, so importing
// the module (e.g. from tests) never triggers process.exit or docker calls.
// pathToFileURL normalizes Windows drive letters/paths correctly.
function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) {
  await main()
}
