#!/usr/bin/env node
/**
 * M0-D verification CLI — a thin, offline viewer over the adapter's public
 * API (`verifyPdf`). Usage:
 *
 *   node packages/verification/bin/verify.mjs <pdf> [--policy <path>] [--raw]
 *
 * By default the printed result STRIPS `evidence.raw` (it embeds /Contents
 * hex blobs — never expose it) and replaces it with a pointer to `--raw`.
 * The `--raw` flag opts in to printing the raw evidence record.
 *
 * Exit codes: 0 = verification ran successfully (ANY normalized outcome,
 * including `invalid`/`error` — this CLI reports results, it does not judge
 * them); 1 = usage error (wrong arguments or unreadable input file) or an
 * unexpected internal failure. The CLI never prints or logs anything
 * beyond the result JSON and its own usage/error messages on stderr.
 */
import { readFileSync } from 'node:fs'
import { verifyPdf } from '../src/index.ts'

const USAGE =
  'usage: node packages/verification/bin/verify.mjs <pdf> [--policy <path>] [--raw]\n' +
  '  <pdf>             path to the exact PDF bytes to verify\n' +
  '  --policy <path>   trust policy JSON (defaults to the bundled policies/v1.json)\n' +
  '  --raw             include evidence.raw in the output (default: omitted)'

function fail(message, { usage = true } = {}) {
  process.stderr.write(usage ? `${message}\n\n${USAGE}\n` : `${message}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const positional = []
let policyPath
let includeRaw = false

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '-h' || arg === '--help') {
    process.stdout.write(`${USAGE}\n`)
    process.exit(0)
  } else if (arg === '--raw') {
    includeRaw = true
  } else if (arg === '--policy') {
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) {
      fail('error: --policy requires a path argument')
    }
    policyPath = next
    i += 1
  } else if (arg.startsWith('--policy=')) {
    policyPath = arg.slice('--policy='.length)
  } else if (arg.startsWith('--')) {
    fail(`error: unknown option ${arg}`)
  } else {
    positional.push(arg)
  }
}

if (positional.length !== 1) {
  fail(`error: expected exactly one <pdf> argument, got ${positional.length}`)
}

let bytes
try {
  bytes = new Uint8Array(readFileSync(positional[0]))
} catch {
  // Coarse reason class only — never echo filesystem internals or env details.
  fail(`error: cannot read PDF file: ${positional[0]}`)
}

let result
try {
  // `await` tolerates both the current synchronous API and a future
  // asynchronous one; verifyPdf never throws for input conditions.
  result = await verifyPdf(bytes, policyPath === undefined ? {} : { policyPath })
} catch (e) {
  // A thrown error here is an adapter bug, not an input condition — report
  // a plain failure (no USAGE block; this is not a usage error).
  fail(`error: verification could not run: internal failure (${e?.name ?? 'unknown'})`, {
    usage: false,
  })
}

// evidence.raw embeds /Contents hex blobs — stripped unless explicitly
// opted in with --raw (SECURITY: never log, persist, or serve it).
if (!includeRaw && result?.evidence && 'raw' in result.evidence) {
  result.evidence.raw = '<omitted — use --raw>'
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
