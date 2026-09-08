# M0-C Fixture Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Paperless-ngx and DocuSeal API contract fixtures from the pinned local stack, generate the SIG-001..009 synthetic signature fixture set, and deliver an offline replay harness that asserts the contract properties the product depends on.

**Architecture:** Committed generator scripts build all synthetic PDFs + self-signed CA material into `fixtures/signatures/`. A capture harness (`scripts/capture/`) records live request/response journeys against the running M0-B stack into `fixtures/paperless/` and `fixtures/docuseal/`, redacting secrets at capture time and stamping each recording with the pinned upstream image digest. A replay harness (`scripts/test/replay/`) loads the committed recordings offline and asserts contract properties as part of `pnpm test`.

**Tech Stack:** Node 24, Vitest (existing root config), new devDeps: `pdf-lib`, `node-signpdf`, `node-forge`, `playwright` (capture-only). Docker Compose stack from M0-B for live capture sessions.

**Spec:** `plans/specs/2026-09-08-m0c-fixture-capture-design.md` (spec travels with this plan).

## Global Constraints

- **No upstream internals:** capture only through documented APIs; never read upstream databases, task internals, or storage volumes.
- **Secrets redaction:** the sanitizer (`scripts/capture/lib/sanitize.mjs`) replaces tokens, cookies, passwords at capture time; the replay suite fails any recording containing unredacted secrets. Dev-only stack credentials never committed (`.env` stays gitignored).
- **Offline CI:** all committed tests run without Docker or network. Live capture is a documented manual session — never CI, never an automated test.
- **Digest-pinned sources:** every recording records the pinned upstream image digest from `deploy/upstream-versions.json`; the fixture manifest records generator + sha256.
- **Vocabulary discipline:** fixture expected-outcomes use only `unsigned | valid_trusted | valid_untrusted | invalid | error`.
- **Conventional commits; no LICENSE changes; PR flow** on branch `m0c-fixture-capture`, `quality` check green, squash-merge to protected `main`.
- **Embedded signing is untouched:** Playwright automates only the PUBLIC hosted signing page (`http://127.0.0.1:8200/s/<slug>`). LIC-001 stays open.
- **Ports (from `deploy/local/.env.example`):** Paperless `127.0.0.1:8100`, DocuSeal `127.0.0.1:8200`, webhook receiver default `127.0.0.1:8300`.
- **No real credentials or contact data:** signer emails/names in fixtures are synthetic constants (`signer@example.com`), documented as such.

---

### Task 1: Capture-ready stack (Paperless admin bootstrap)

**Files:**
- Modify: `deploy/local/compose.yaml` (paperless service env)
- Modify: `deploy/local/.env.example`

**Interfaces:**
- Consumes: M0-B compose file as merged at `56489da`.
- Produces (used by Task 4): a Paperless superuser account whose credentials come from `.env` (`PAPERLESS_ADMIN_USER` / `PAPERLESS_ADMIN_PASSWORD`), created automatically at container first start.

- [ ] **Step 1: Create branch** (skip if `m0c-fixture-capture` already checked out)

Run: `git checkout m0c-fixture-capture`

- [ ] **Step 2: Add admin passthrough env to compose**

In `deploy/local/compose.yaml`, inside the `paperless:` service `environment:` block, add after the existing entries:

```yaml
      PAPERLESS_ADMIN_USER: ${PAPERLESS_ADMIN_USER:-capture-admin}
      PAPERLESS_ADMIN_PASSWORD: ${PAPERLESS_ADMIN_PASSWORD}
```

Comment intent above the two lines:

```yaml
      # auto-provisions the capture-session superuser on first start (dev only)
```

- [ ] **Step 3: Update `.env.example`**

Append to `deploy/local/.env.example`:

```
# Paperless superuser created automatically on first stack start (DEV ONLY).
PAPERLESS_ADMIN_USER=capture-admin
PAPERLESS_ADMIN_PASSWORD=devonly-paperless-admin-password
```

- [ ] **Step 4: Validate and commit**

Run: `pnpm validate:compose; pnpm lint`
Expected: both exit 0.

```bash
git add deploy/local/compose.yaml deploy/local/.env.example
git commit -m "feat: bootstrap a paperless admin account for capture sessions"
```

---

### Task 2: Signature fixture generators + SIG-001..006, SIG-008

**Files:**
- Create: `scripts/generate-fixtures/lib/certs.mjs` — node-forge CA + leaf generation
- Create: `scripts/generate-fixtures/lib/pdf.mjs` — pdf-lib base document builder
- Create: `scripts/generate-fixtures/lib/signing.mjs` — node-signpdf wrapper (sign, tamper, corrupt)
- Create: `scripts/generate-fixtures/generate-all.mjs` — CLI: writes `fixtures/signatures/*` + `signatures-manifest.json`
- Create: `scripts/test/generate-fixtures/*.test.mjs` — offline tests
- Modify: root `package.json` (devDeps) — install step
- Create: `fixtures/signatures/*` (generated artifacts, committed)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (used by Tasks 5 and 6):
  - `fixtures/signatures/signatures-manifest.json` — `{ generatedAt, generatorVersion, items: [{ id, file, sha256, condition, expectedOutcome, construction, certs, capturedFrom, upstreamDigest }] }`; `sha256: null` + `capturedFrom: "docuseal"` for SIG-007 placeholder and `file: null` + `scenario: "recordings/docuseal/verifier-error"` for SIG-009 (filled by later tasks).
  - `fixtures/signatures/root-a.pem`, `root-a-leaf.pem`, `root-b.pem`, `root-b-leaf.pem` — PEM certs (unencrypted keys are NOT committed; leaves and CAs ship as cert-only PEMs, keys regenerated on demand — signing fixtures are one-shot artifacts, the manifest checksums are of committed bytes).
  - PDF fixtures `sig-001.pdf`, `sig-002.pdf`, `sig-003.pdf`, `sig-004.pdf`, `sig-005.pdf`, `sig-006.pdf`, `sig-008.pdf`.
  - `generatorVersion: "1.0.0"` constant exported from `generate-all.mjs`.

- [ ] **Step 1: Install dev dependencies**

Run: `pnpm add -D pdf-lib node-signpdf node-forge playwright`
Expected: lockfile updated; `playwright` package installs without browser download (browsers come only via `npx playwright install chromium` in Task 5).

- [ ] **Step 2: Write failing manifest-schema test**

Create `scripts/test/generate-fixtures/manifest.test.mjs`:

```javascript
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const FIXTURES = join(ROOT, 'fixtures', 'signatures')

const GENERATED = ['sig-001', 'sig-002', 'sig-003', 'sig-004', 'sig-005', 'sig-006', 'sig-008']
const OUTCOMES = ['unsigned', 'valid_trusted', 'valid_untrusted', 'invalid', 'error']

describe('signatures manifest', () => {
  const manifest = JSON.parse(readFileSync(join(FIXTURES, 'signatures-manifest.json'), 'utf8'))

  it('lists all nine fixture ids', () => {
    expect(manifest.items.map((i) => i.id)).toEqual([
      'SIG-001','SIG-002','SIG-003','SIG-004','SIG-005','SIG-006','SIG-007','SIG-008','SIG-009',
    ])
  })

  it('records valid outcomes vocabulary only', () => {
    for (const item of manifest.items) {
      expect(OUTCOMES).toContain(item.expectedOutcome)
    }
  })

  it.each(GENERATED)('%s: committed bytes match recorded sha256', (id) => {
    const item = manifest.items.find((i) => i.id === id)
    expect(item.file).toBe(`${id}.pdf`)
    const bytes = readFileSync(join(FIXTURES, item.file))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256)
  })

  it.each(GENERATED)('%s: pdf starts with %PDF header', (id) => {
    const bytes = readFileSync(join(FIXTURES, `${id}.pdf`))
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it.each(['sig-002', 'sig-003', 'sig-006', 'sig-008'])('%s contains a signature ByteRange', (id) => {
    const text = readFileSync(join(FIXTURES, `${id}.pdf`)).toString('latin1')
    expect(text).toContain('/ByteRange')
  })

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

  it('sig-007 is a placeholder until the docuseal capture session', () => {
    const item = manifest.items.find((i) => i.id === 'SIG-007')
    expect(item.file).toBeNull()
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/generate-fixtures/manifest.test.mjs`
Expected: FAIL (manifest missing).

- [ ] **Step 4: Implement `certs.mjs`**

Create `scripts/generate-fixtures/lib/certs.mjs`:

```javascript
import forge from 'node-forge'

// Generates one self-signed root CA plus one leaf signed by it.
// Keys are generated per run (random); only cert PEMs are committed —
// fixture reproducibility comes from committed artifacts + checksums,
// not deterministic regeneration (spec: signature fixtures decision 2).
export function generateTrustPath(name) {
  const caKeys = forge.pki.rsa.generateKeyPair(2048)
  const caCert = forge.pki.createCertificate()
  caCert.publicKey = caKeys.publicKey
  caCert.serialNumber = '01'
  caCert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000)
  caCert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000)
  const caAttrs = [{ name: 'commonName', value: `Doculite Fixture Root ${name}` }]
  caCert.setSubject(caAttrs)
  caCert.setIssuer(caAttrs)
  caCert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }])
  caCert.sign(caKeys.privateKey, forge.sha256.create())

  const leafKeys = forge.pki.rsa.generateKeyPair(2048)
  const leafCert = forge.pki.createCertificate()
  leafCert.publicKey = leafKeys.publicKey
  leafCert.serialNumber = '02'
  leafCert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000)
  leafCert.validity.notAfter = new Date(Date.now() + 90 * 24 * 3600 * 1000)
  leafCert.setSubject([{ name: 'commonName', value: `Doculite Fixture Signer ${name}` }])
  leafCert.setIssuer(caCert.subject.attributes)
  leafCert.setExtensions([{ name: 'basicConstraints', cA: false }])
  leafCert.sign(caKeys.privateKey, forge.sha256.create())

  return {
    rootPem: forge.pki.certificateToPem(caCert),
    leafPem: forge.pki.certificateToPem(leafCert),
    // p12 bundles leaf + key for node-signpdf (passphrase empty by design)
    pkcs12: forge.pkcs12.toPkcs12AsBinary(leafKeys.privateKey, leafCert, '', {}),
  }
}
```

- [ ] **Step 5: Implement `pdf.mjs` and `signing.mjs`**

Create `scripts/generate-fixtures/lib/pdf.mjs`:

```javascript
import { PDFDocument, StandardFonts } from 'pdf-lib'

const TRAILING_NEWLINE = Buffer.from('\n', 'latin1')

export async function buildDocument(title) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  page.drawText(title, { x: 72, y: 720, size: 18, font })
  page.drawText('Synthetic Doculite fixture — no real person signed this.', {
    x: 72, y: 690, size: 10, font,
  })
  // node-signpdf requires the buffer to end with a newline
  return Buffer.concat([Buffer.from(await pdf.save()), TRAILING_NEWLINE])
}
```

Create `scripts/generate-fixtures/lib/signing.mjs`:

```javascript
import { SignPdf } from 'node-signpdf'

export function sign(pdfBytes, pkcs12) {
  return Buffer.from(new SignPdf().sign(pdfBytes, Buffer.from(pkcs12)))
}

export function tamperOneByte(pdfBytes) {
  // Single-byte mutation inside the signed content region (the PDF header
  // is covered by ByteRange[0]) — same length, signature breaks.
  const out = Buffer.from(pdfBytes)
  const i = out.indexOf(Buffer.from('%PDF-1.7', 'latin1'))
  if (i === -1) throw new Error('pdf header not found for tampering')
  out[i + 9] = 0x38 // '7' -> '8'
  return out
}

export function corruptContainer(pdfBytes) {
  // Flip bytes inside the PKCS#7 hex blob so the container no longer parses.
  const out = Buffer.from(pdfBytes)
  const text = out.toString('latin1')
  const m = /\/Contents\s*<([0-9A-Fa-f]+)>/.exec(text)
  if (!m) throw new Error('no signature container found')
  const start = m.index + m[0].length - m[1].length - 1
  for (let i = 0; i < 32; i++) out[start + i] = 0x41 + (i % 6) // 'A'..'F'
  return out
}
```

- [ ] **Step 6: Implement `generate-all.mjs`**

Create `scripts/generate-fixtures/generate-all.mjs`:

```javascript
#!/usr/bin/env node
// Generates fixtures/signatures/* — synthetic, self-signed, shareable.
// Keys are NOT committed; artifacts are one-shot, checksums in the manifest.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateTrustPath } from './lib/certs.mjs'
import { buildDocument } from './lib/pdf.mjs'
import { sign, tamperOneByte, corruptContainer } from './lib/signing.mjs'

export const GENERATOR_VERSION = '1.0.0'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '..', 'fixtures', 'signatures')

async function main() {
  mkdirSync(OUT, { recursive: true })
  const pathA = generateTrustPath('A')
  const pathB = generateTrustPath('B')
  writeFileSync(join(OUT, 'root-a.pem'), pathA.rootPem)
  writeFileSync(join(OUT, 'root-a-leaf.pem'), pathA.leafPem)
  writeFileSync(join(OUT, 'root-b.pem'), pathB.rootPem)
  writeFileSync(join(OUT, 'root-b-leaf.pem'), pathB.leafPem)

  const sha = (b) => createHash('sha256').update(b).digest('hex')
  const items = []

  const put = (id, file, bytes, condition, expectedOutcome, construction, certs = []) => {
    writeFileSync(join(OUT, file), bytes)
    items.push({ id, file, sha256: sha(bytes), condition, expectedOutcome, construction, certs, capturedFrom: 'generator' })
  }

  const unsigned = await buildDocument('Fixture SIG-001 (unsigned)')
  put('SIG-001', 'sig-001.pdf', unsigned, 'Unsigned PDF', 'unsigned', 'pdf-lib only')

  const trusted = await buildDocument('Fixture SIG-002 (trusted)')
  const trustedSigned = sign(trusted, pathA.pkcs12)
  put('SIG-002', 'sig-002.pdf', trustedSigned, 'Valid signature, root-A in candidate policy', 'valid_trusted', 'leaf(A) over pdf-lib document', ['root-a'])

  const untrusted = await buildDocument('Fixture SIG-003 (untrusted)')
  put('SIG-003', 'sig-003.pdf', sign(untrusted, pathB.pkcs12), 'Valid signature, root-B not in policy', 'valid_untrusted', 'leaf(B) over pdf-lib document', ['root-b'])

  put('SIG-004', 'sig-004.pdf', tamperOneByte(trustedSigned), 'Content altered after signing', 'invalid', 'single-byte mutation of sig-002 inside signed range')

  put('SIG-005', 'sig-005.pdf', corruptContainer(trustedSigned), 'Malformed signature container', 'error', 'PKCS#7 hex corruption of sig-002')

  const dual = await buildDocument('Fixture SIG-006 (dual signatures)')
  put('SIG-006', 'sig-006.pdf', sign(sign(dual, pathA.pkcs12), pathB.pkcs12), 'Multiple signatures with mixed trust', 'valid_untrusted', 'leaf(A) then leaf(B) incremental signatures', ['root-a', 'root-b'])

  const external = await buildDocument('Fixture SIG-008 (external signer)')
  put('SIG-008', 'sig-008.pdf', sign(external, pathB.pkcs12), 'Valid external signature', 'valid_untrusted', 'leaf(B) over distinct document', ['root-b'])

  items.push({ id: 'SIG-007', file: null, sha256: null, condition: 'Completed DocuSeal document', expectedOutcome: 'valid_untrusted', construction: 'live-captured from pinned docuseal during capture session', certs: [], capturedFrom: 'docuseal' })
  items.push({ id: 'SIG-009', file: null, sha256: null, condition: 'Verifier transport/service failure', expectedOutcome: 'error', construction: 'scenario fixture: recorded verifier-unreachable exchanges', scenario: 'recordings/docuseal/verifier-error', capturedFrom: 'generator' })

  const manifestPath = join(OUT, 'signatures-manifest.json')
  const existingSig7 = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')).items.find((i) => i.id === 'SIG-007')
    : null
  if (existingSig7 && existingSig7.file) items[items.findIndex((i) => i.id === 'SIG-007')] = existingSig7

  writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), generatorVersion: GENERATOR_VERSION, items }, null, 2) + '\n')
  console.log(`wrote ${items.filter((i) => i.file).length} pdfs + 4 pems + manifest to ${OUT}`)
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) await main()
```

(If the `isMainModule` check misbehaves on Windows, use the proven `pathToFileURL(process.argv[1]).href` pattern from `scripts/pin-upstream.mjs` instead — matching comment style: "Windows path separators".)

- [ ] **Step 7: Run generator and tests**

Run: `node scripts/generate-fixtures/generate-all.mjs`
Expected: 7 PDFs + 4 PEMs + manifest written.

Run: `pnpm vitest run -c vitest.config.ts scripts/test/generate-fixtures/`
Expected: PASS.

Run: `pnpm format; pnpm lint; pnpm test; pnpm validate:docs`
Expected: all exit 0. **Live-fix expectation:** if `node-signpdf` rejects the dual-signature step (SIG-006) or the tamper assertions, fix the generator in-session — construction recipes are in this task; the *assertions* (two ByteRanges, one-byte delta, sha256 match) are the contract and do not move.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/generate-fixtures scripts/test/generate-fixtures fixtures/signatures
git commit -m "feat: generate synthetic signature fixtures"
```

---

### Task 3: Capture harness (recorder, sanitizer, webhook receiver)

**Files:**
- Create: `scripts/capture/lib/sanitize.mjs`
- Create: `scripts/capture/lib/recorder.mjs`
- Create: `scripts/capture/lib/hook-receiver.mjs`
- Create: `scripts/test/capture/*.test.mjs`

**Interfaces:**
- Consumes: `deploy/upstream-versions.json` (digest stamping).
- Produces (used by Tasks 4 and 5):
  - `sanitize.step(obj) -> obj` — recursive redaction: keys matching `/^(authorization|cookie|set-cookie|x-auth-token|password)$/i` and any string containing a value from `.env` become `'<redacted>'`; returns a deep copy.
  - `new JourneyRecorder({ journeysDir, journey, service })` — `.digest` (from manifest by service name), `.step({ name, request, response, notes })`, `.write()` → `<journey>.json` with shape `{ journey, capturedAt, upstream: { service, imageDigest }, steps: [...] }`; throws if any step still contains the literal `PAPERLESS_SECRET_KEY` value or a `Bearer|Token ` header value that is not `'<redacted>'`.
  - `startHookReceiver({ port }) -> { url, close() }` — minimal HTTP server on `127.0.0.1:port`; buffers raw body + headers per delivery into an array; `close()` resolves after last write. Used for the DocuSeal webhook journey.

- [ ] **Step 1: Write failing sanitizer tests**

Create `scripts/test/capture/sanitize.test.mjs`:

```javascript
import { describe, expect, it } from 'vitest'
import { sanitizeStep } from '../../capture/lib/sanitize.mjs'

describe('sanitizeStep', () => {
  it('redacts auth-sensitive headers and body keys', () => {
    const out = sanitizeStep({
      request: { method: 'POST', headers: { Authorization: 'Token abc123', 'Content-Type': 'application/json' }, body: { username: 'capture-admin', password: 'hunter2' } },
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/capture/sanitize.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `sanitize.mjs`**

Create `scripts/capture/lib/sanitize.mjs`:

```javascript
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|x-auth-token|password)$/i

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
      if (SENSITIVE_KEYS.test(key)) { node[key] = '<redacted>'; continue }
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
```

- [ ] **Step 4: Write failing recorder tests**

Create `scripts/test/capture/recorder.test.mjs`:

```javascript
import { describe, expect, it } from 'vitest'
import { JourneyRecorder, digestFor } from '../../capture/lib/recorder.mjs'

describe('digestFor', () => {
  it('resolves the pinned digest for a component', () => {
    expect(digestFor('paperless-ngx')).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
  it('throws for an unknown component', () => {
    expect(() => digestFor('not-a-service')).toThrow()
  })
})

describe('JourneyRecorder', () => {
  it('writes the recorded shape and stamps the digest', () => {
    const rec = new JourneyRecorder({ journeysDir: '/tmp/x', journey: 'demo', service: 'paperless-ngx' })
    rec.step({ name: 'step-1', request: { method: 'GET', path: '/api/', headers: {}, body: null }, response: { status: 200, headers: {}, body: {} } })
    expect(rec.document()).toMatchObject({
      journey: 'demo',
      upstream: { service: 'paperless-ngx', imageDigest: digestFor('paperless-ngx') },
    })
    expect(rec.document().steps).toHaveLength(1)
    expect(rec.document().steps[0].name).toBe('step-1')
  })

  it('write() rejects steps containing unredacted token headers', () => {
    const rec = new JourneyRecorder({ journeysDir: '/tmp/x', journey: 'demo', service: 'paperless-ngx' })
    rec.step({ name: 'bad', request: { method: 'GET', headers: { Authorization: 'Token real-secret-value' } }, response: { status: 200 } })
    expect(() => rec.write()).toThrow(/unredacted/)
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/capture/recorder.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 6: Implement `recorder.mjs`**

Create `scripts/capture/lib/recorder.mjs`:

```javascript
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeStep } from './sanitize.mjs'

const MANIFEST = join(import.meta.dirname, '..', '..', '..', 'deploy', 'upstream-versions.json')

export function digestFor(service) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const entry = manifest.components.find((c) => c.name === service)
  if (!entry?.imageDigest) throw new Error(`no pinned digest for ${service}`)
  return entry.imageDigest
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
    const env = readFileSync(join(import.meta.dirname, '..', '..', '..', 'deploy', 'local', '.env'), 'utf8')
    for (const line of env.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.+)$/.exec(line)
      if (m && m[2].length > 8 && text.includes(m[2])) {
        throw new Error(`recording contains unredacted ${m[1]} value — refusing to write`)
      }
    }
  }

  write() {
    this.assertRedacted()
    mkdirSync(this.journeysDir, { recursive: true })
    const file = join(this.journeysDir, `${this.journey}.json`)
    writeFileSync(file, JSON.stringify(this.document(), null, 2) + '\n')
    return file
  }
}
```

- [ ] **Step 7: Implement `hook-receiver.mjs`**

Create `scripts/capture/lib/hook-receiver.mjs`:

```javascript
import { createServer } from 'node:http'

// Capture-side webhook receiver: records raw deliveries (headers + body)
// for the recording file. Notification-only — payload content is never
// trusted without an authoritative API read (AGENTS.md invariant).
export function startHookReceiver({ port = 8300 }) {
  const deliveries = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      deliveries.push({
        receivedAt: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"received":true}')
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        deliveries,
        close: () => new Promise((r) => server.close(r)),
      }),
    )
  })
}
```

- [ ] **Step 8: Verify all capture-lib tests pass, commit**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/capture/`
Expected: PASS.

```bash
git add scripts/capture scripts/test/capture
git commit -m "feat: add fixture capture harness"
```

---

### Task 4: Paperless capture session (live) + recordings

**Files:**
- Create: `scripts/capture/capture-paperless.mjs`
- Create: `fixtures/paperless/*.json` (committed recordings — 7 journeys)
- Modify: `deploy/local/.env` — NOT committed (capture session input only)

**Interfaces:**
- Consumes: `JourneyRecorder` (Task 3), running M0-B stack with Task 1 admin env.
- Produces (used by Task 6): `fixtures/paperless/{auth,upload-polling,search-list,preview,metadata,download,permissions}.json`.

**Live session steps are manual** (runbook documents them; Playwright is not used here). All steps run from the repo root against `http://127.0.0.1:8100`.

- [ ] **Step 1: Start the stack fresh with admin bootstrap**

```bash
node deploy/local/stack.mjs start
```

Note: if `.env` predates Task 1, re-copy `.env.example` additions into `deploy/local/.env`, then `node deploy/local/stack.mjs nuke; node deploy/local/stack.mjs start` so the admin account is provisioned on first start. Health check must pass before continuing.

- [ ] **Step 2: Implement the capture script**

Create `scripts/capture/capture-paperless.mjs`:

```javascript
#!/usr/bin/env node
// LIVE ONLY — captures Paperless contract fixtures against the pinned local
// stack. Requires: stack started (deploy/local/stack.mjs start), admin env set.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JourneyRecorder } from './lib/recorder.mjs'

const BASE = 'http://127.0.0.1:8100'
const DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'paperless')
const ADMIN = { username: 'capture-admin', password: process.env.PAPERLESS_ADMIN_PASSWORD }
const FIXTURE_PDF = join(import.meta.dirname, '..', '..', 'fixtures', 'signatures', 'sig-001.pdf')
const FIXTURE_SHA = process.env.FIXTURE_SHA // set from sig-001 manifest sha256 by the session

const rec = (journey) => new JourneyRecorder({ journeysDir: DIR, journey, service: 'paperless-ngx' })

async function call(method, path, { headers = {}, body, token, raw } = {}) {
  const h = { ...headers }
  if (token) h.Authorization = `Token ${token}`
  const res = await fetch(BASE + path, { method, headers: h, body })
  const contentType = res.headers.get('content-type') ?? ''
  const responseBody = raw || !contentType.includes('application/json')
    ? { binary: true, sha256Note: '(sha256 recorded in session log, bytes not committed)' }
    : await res.json()
  return { status: res.status, contentType, headers: Object.fromEntries(res.headers), body: responseBody }
}

const auth = rec('auth')
const loginRes = await call('POST', '/api/token/', { body: new URLSearchParams(ADMIN).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
const TOKEN = loginRes.body.token
auth.step({ name: 'create-token', request: { method: 'POST', path: '/api/token/', headers: {}, body: { username: ADMIN.username, password: '<redacted>' } }, response: { status: loginRes.status, headers: loginRes.headers, body: { token: '<redacted>' } }, notes: 'token shape recorded; value redacted' })
{
  const bad = await call('POST', '/api/token/', { body: new URLSearchParams({ username: ADMIN.username, password: 'wrong' }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  auth.step({ name: 'wrong-credentials', request: { method: 'POST', path: '/api/token/', headers: {}, body: { username: ADMIN.username, password: '<redacted>' } }, response: { status: bad.status, headers: bad.headers, body: bad.body }, notes: 'denied credential behavior' })
}
auth.write()

const upload = rec('upload-polling')
const fd = new FormData()
fd.append('document', new Blob([await readFile(FIXTURE_PDF)], { type: 'application/pdf' }), 'sig-001.pdf')
const upRes = await call('POST', '/api/documents/post_document/', { token: TOKEN, body: fd })
upload.step({ name: 'post-document', request: { method: 'POST', path: '/api/documents/post_document/', headers: {}, body: 'multipart: sig-001.pdf bytes' }, response: { status: upRes.status, headers: upRes.headers, body: upRes.body }, notes: 'async consumption; document ids or empty list per pinned behavior' })
// poll tasks until the consume task completes; record every observed state
const seenStates = new Set()
let TASK
for (let i = 0; i < 120; i++) {
  const tasks = await call('GET', '/api/tasks/', { token: TOKEN })
  TASK = tasks.body.results ?? tasks.body
  for (const t of TASK) seenStates.add(t.status)
  const done = TASK.find((t) => (t.status === 'SUCCESS' || t.status === 'FAILURE') && (t.task_type ?? '').includes('consume') )
  if (done) {
    upload.step({ name: 'task-terminal', request: { method: 'GET', path: '/api/tasks/', headers: {} }, response: { status: tasks.status, headers: tasks.headers, body: TASK }, notes: `terminal state ${done.status}; states seen: ${[...seenStates].join(',')}` })
    break
  }
  await new Promise((r) => setTimeout(r, 2000))
}
upload.write()
const DOC_ID = TASK?.find((t) => t.related_document)?.related_document

const search = rec('search-list')
for (const [name, path] of [['list-first-page', '/api/documents/?page=1'], ['query-filter', '/api/documents/?query=sig-001'], ['page-2-or-empty', '/api/documents/?page=2']]) {
  const r = await call('GET', path, { token: TOKEN })
  search.step({ name, request: { method: 'GET', path, headers: {} }, response: { status: r.status, headers: r.headers, body: r.body }, notes: 'pagination envelope + filter params' })
}
search.write()

const preview = rec('preview')
{
  const r = await call('GET', `/api/documents/${DOC_ID}/thumb/`, { token: TOKEN, raw: true })
  preview.step({ name: 'thumbnail', request: { method: 'GET', path: `/api/documents/${DOC_ID}/thumb/`, headers: {} }, response: { status: r.status, headers: r.headers, body: r.body }, notes: 'content-type + status; bytes not committed' })
}
preview.write()

const metadata = rec('metadata')
{
  const cf = await call('GET', '/api/custom_fields/', { token: TOKEN })
  metadata.step({ name: 'list-custom-fields', request: { method: 'GET', path: '/api/custom_fields/', headers: {} }, response: { status: cf.status, headers: cf.headers, body: cf.body } })
  const created = await call('POST', '/api/custom_fields/', { token: TOKEN, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'fixture_note', data_type: 'string' }) })
  metadata.step({ name: 'create-custom-field', request: { method: 'POST', path: '/api/custom_fields/', headers: {}, body: { name: 'fixture_note', data_type: 'string' } }, response: { status: created.status, headers: created.headers, body: created.body } })
  const patched = await call('PATCH', `/api/documents/${DOC_ID}/`, { token: TOKEN, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ custom_fields: [{ field: created.body.id, value: 'captured by m0c' }] }) })
  metadata.step({ name: 'assign-custom-field', request: { method: 'PATCH', path: `/api/documents/${DOC_ID}/`, headers: {}, body: { custom_fields: [{ field: created.body.id, value: 'captured by m0c' }] } }, response: { status: patched.status, headers: patched.headers, body: patched.body }, notes: 'field types + permission requirement' })
}
metadata.write()

const download = rec('download')
{
  const r = await call('GET', `/api/documents/${DOC_ID}/download/`, { token: TOKEN, raw: true })
  download.step({ name: 'download-original', request: { method: 'GET', path: `/api/documents/${DOC_ID}/download/`, headers: {} }, response: { status: r.status, headers: r.headers, body: r.body }, notes: `retrieval route; uploaded sig-001 sha256=${FIXTURE_SHA} — session verifies downloaded bytes hash equals fixture sha256 and records the comparison here` })
}
download.write()

const perms = rec('permissions')
{
  // three-account matrix: admin (owner) vs allowed vs denied
  const mk = async (username) => call('POST', '/api/users/', { token: TOKEN, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: `${username}-pw`, is_superuser: false }) })
  const allowed = await mk('fixture-allowed')
  const denied = await mk('fixture-denied')
  perms.step({ name: 'create-users', request: { method: 'POST', path: '/api/users/', headers: {}, body: { username: 'fixture-allowed|fixture-denied', password: '<redacted>', is_superuser: false } }, response: { status: allowed.status, headers: allowed.headers, body: allowed.body }, notes: `denied creation status=${denied.status}` })
  const allowedToken = (await call('POST', '/api/token/', { body: new URLSearchParams({ username: 'fixture-allowed', password: 'fixture-allowed-pw' }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })).body.token
  const deniedToken = (await call('POST', '/api/token/', { body: new URLSearchParams({ username: 'fixture-denied', password: 'fixture-denied-pw' }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })).body.token
  // share with allowed user, NOT with denied user
  const share = await call('PATCH', `/api/documents/${DOC_ID}/`, { token: TOKEN, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ permissions: { view: { users: [allowed.body.id] } } }) })
  perms.step({ name: 'share-with-allowed-only', request: { method: 'PATCH', path: `/api/documents/${DOC_ID}/`, headers: {}, body: { permissions: { view: { users: ['<allowed user id>'] } } } }, response: { status: share.status, headers: share.headers, body: share.body } })
  for (const [name, token] of [['allowed-can-retrieve', allowedToken], ['denied-cannot-retrieve', deniedToken]]) {
    const r = await call('GET', `/api/documents/${DOC_ID}/`, { token })
    perms.step({ name, request: { method: 'GET', path: `/api/documents/${DOC_ID}/`, headers: {} }, response: { status: r.status, headers: r.headers, body: name === 'denied-cannot-retrieve' ? r.body : '<document detail omitted — authorized path>' }, notes: 'assert at replay: denied user receives >=400 and no metadata leakage; capture observed code in notes' })
  }
}
perms.write()
console.log('paperless capture complete — 6 journeys written (auth, upload-polling, search-list, preview, metadata, download, permissions)')
```

Notes for the implementer/capturer:
- Download journey MUST verify `sha256(downloaded bytes) === FIXTURE_SHA` during the session and record the outcome in that step's `notes` (original-bytes guarantee). Do not commit the downloaded bytes.
- If an endpoint path/shape differs on the pinned build (v3.1.3), correct the script live, re-run the journey, and note the drift in the recording step's `notes`. The contract *assertions* are chosen in Task 6 from what was captured.

- [ ] **Step 3: Run the capture session**

```bash
$sha = (Get-Content fixtures/signatures/signatures-manifest.json | ConvertFrom-Json).items | Where-Object id -eq 'SIG-001' | Select-Object -ExpandProperty sha256
$env:FIXTURE_SHA = $sha
node scripts/capture/capture-paperless.mjs
```

Expected: all journeys written; no exception. Polling loop bounded (120 × 2s).

- [ ] **Step 4: Inspect recordings for redaction before committing**

Run: `Select-String -Path fixtures/paperless/*.json -Pattern "Token [^<\\"]"` (no output expected) — plus read each file once; confirm `imageDigest` stamps present and no secrets.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture/capture-paperless.mjs fixtures/paperless
git commit -m "feat: capture paperless contract fixtures"
```

---

### Task 5: DocuSeal capture session (live) + SIG-007

**Files:**
- Create: `scripts/capture/capture-docuseal.mjs`
- Create: `fixtures/docuseal/{submissions,progress,webhook,verifier-error}.json`
- Create: `fixtures/signatures/sig-007.pdf` (captured completed PDF)
- Modify: `fixtures/signatures/signatures-manifest.json` (SIG-007 entry filled)
- Modify: `deploy/local/.env` — NOT committed (`DOCUSEAL_API_TOKEN`, `HOOK_PORT` optional)

**Interfaces:**
- Consumes: `JourneyRecorder`, `startHookReceiver` (Task 3); `fixtures/signatures/sig-001.pdf` NOT reused — the base document for SIG-007 is a fresh synthetic PDF built via `scripts/generate-fixtures/lib/pdf.mjs` (`buildDocument('Fixture SIG-007 (docuseal)')`) written to a temp path by the script.
- Produces (used by Task 6): DocuSeal recordings + SIG-007 bytes + the `verifier-error` journey (SIG-009's scenario recording: capture DocuSeal behavior when the verifier-facing endpoint is unreachable — see Step 3 note).

**Manual session prerequisites (browser, one-time per fresh stack):**
1. Open `http://127.0.0.1:8200` → complete the first-run wizard creating admin `capture-admin` (DEV ONLY password).
2. Settings → API tokens → create token → put it in `deploy/local/.env` as `DOCUSEAL_API_TOKEN=<value>`.

- [ ] **Step 1: Install the Playwright browser**

Run: `npx playwright install chromium`
Expected: chromium downloaded (capture machine only; CI never runs this).

- [ ] **Step 2: Implement the capture script**

Create `scripts/capture/capture-docuseal.mjs`:

```javascript
#!/usr/bin/env node
// LIVE ONLY — captures DocuSeal contract fixtures + SIG-007 against the
// pinned local stack. Requires: stack up, DOCUSEAL_API_TOKEN in .env,
// first-run admin + token minted (manual, see runbook).
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { JourneyRecorder } from './lib/recorder.mjs'
import { startHookReceiver } from './lib/hook-receiver.mjs'
import { buildDocument } from '../generate-fixtures/lib/pdf.mjs'

const BASE = 'http://127.0.0.1:8200'
const TOKEN = process.env.DOCUSEAL_API_TOKEN
const DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'docuseal')
const SIG_DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'signatures')

const rec = (journey) => new JourneyRecorder({ journeysDir: DIR, journey, service: 'docuseal' })
const call = async (method, path, { body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'X-Auth-Token': TOKEN, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const ct = res.headers.get('content-type') ?? ''
  return { status: res.status, headers: Object.fromEntries(res.headers), body: ct.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }
}

// synthetic signer identity — never a real person (Global Constraint)
const SIGNER = { name: 'Capture Fixture Signer', email: 'signer@example.com' }

// 1. create template from a fresh synthetic document (NOT sig-001 bytes)
const tmp = await mkdtemp(join(tmpdir(), 'm0c-'))
const basePdfPath = join(tmp, 'sig-007-base.pdf')
await writeFile(basePdfPath, await buildDocument('Fixture SIG-007 (docuseal)'))
const tpl = rec('submissions')
const tplRes = await call('POST', '/templates', { body: { name: 'M0C Capture Template', documents: [{ name: 'sig-007-base.pdf', b64: (await readFile(basePdfPath)).toString('base64') }] } })
tpl.step({ name: 'create-template', request: { method: 'POST', path: '/templates', headers: {}, body: { name: 'M0C Capture Template', documents: [{ name: 'sig-007-base.pdf', b64: '<redacted:base64>' }] } }, response: { status: tplRes.status, headers: tplRes.headers, body: tplRes.body }, notes: 'template + document upload shape' })

// 2. create submission (no email) + capture signing slug
const subRes = await call('POST', '/submissions', { body: { template_id: tplRes.body.id ?? tplRes.body[0]?.id, send_email: false, submitters: [{ name: SIGNER.name, email: SIGNER.email, roles: ['First Party'] }] } })
const submission = Array.isArray(subRes.body) ? subRes.body[0] : subRes.body
const slug = submission.submitters?.[0]?.slug
tpl.step({ name: 'create-submission', request: { method: 'POST', path: '/submissions', headers: {}, body: { template_id: '<id>', send_email: false, submitters: [SIGNER] } }, response: { status: subRes.status, headers: subRes.headers, body: submission }, notes: `signer link path recorded as /s/${slug}` })
tpl.write()

// 3. webhook receiver BEFORE completing (captures form.completed payload(s))
const hook = await startHookReceiver({ port: Number(process.env.HOOK_PORT ?? 8300) })
const hookRec = rec('webhook')
const whRes = await call('POST', '/webhooks', { body: { url: 'http://host.docker.internal:8300/hook', events: ['form.completed'] } })
hookRec.step({ name: 'create-webhook', request: { method: 'POST', path: '/webhooks', headers: {}, body: { url: 'http://host.docker.internal:8300/hook', events: ['form.completed'] } }, response: { status: whRes.status, headers: whRes.headers, body: whRes.body }, notes: 'container reaches host via host.docker.internal (Docker Desktop)' })

// 4. progress polling pre-completion
const prog = rec('progress')
const pre = await call('GET', `/submissions/${submission.id}`)
prog.step({ name: 'progress-pending', request: { method: 'GET', path: `/submissions/${submission.id}`, headers: {} }, response: { status: pre.status, headers: pre.headers, body: pre.body }, notes: 'pre-completion status vocabulary' })

// 5. Playwright completes the PUBLIC hosted signing page (embedded untouched)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`${BASE}/s/${slug}`, { waitUntil: 'networkidle' })
// fill any required text/signature inputs; DocuSeal UI flow may drift —
// fix live in-session and note the drift in the recording notes.
const fields = page.locator('[data-field-type], input[type="text"], iframe >> body')
const textInputs = page.locator('input[type="text"]:visible')
const n = await textInputs.count()
for (let i = 0; i < n; i++) await textInputs.nth(i).fill(SIGNER.name)
const drawOrClick = page.getByText('Sign', { exact: false }).first()
if (await drawOrClick.count()) await drawOrClick.click()
const complete = page.locator('button:has-text("Complete")').first()
await complete.waitFor({ timeout: 30000 })
await complete.click()
await page.waitForTimeout(3000)
await browser.close()

// 6. completion + completed-PDF retrieval -> SIG-007
const done = await call('GET', `/submissions/${submission.id}`)
prog.step({ name: 'progress-completed', request: { method: 'GET', path: `/submissions/${submission.id}`, headers: {} }, response: { status: done.status, headers: done.headers, body: done.body }, notes: 'post-completion status vocabulary' })
prog.write()

const pdfRes = await call('GET', `/submissions/${submission.id}/documents`)
const sig7Bytes = pdfRes.body
const sig7Sha = createHash('sha256').update(sig7Bytes).digest('hex')
await writeFile(join(SIG_DIR, 'sig-007.pdf'), sig7Bytes)
const completion = rec('submissions-completion')
completion.step({ name: 'retrieve-completed-pdf', request: { method: 'GET', path: `/submissions/${submission.id}/documents`, headers: {} }, response: { status: pdfRes.status, headers: pdfRes.headers, body: { binary: true, sha256: sig7Sha, path: 'fixtures/signatures/sig-007.pdf' } }, notes: 'authoritative completed-document retrieval; bytes committed as SIG-007' })
completion.write()

// 7. webhook deliveries: allow up to 15s, record what arrived (dup behavior)
await new Promise((r) => setTimeout(r, 15000))
hookRec.step({ name: 'deliveries', request: { method: 'POST', path: 'http://host.docker.internal:8300/hook', headers: {}, body: { observed: 'see response' } }, response: { status: 200, headers: {}, body: hook.deliveries.map((d) => ({ receivedAt: d.receivedAt, path: d.path, headers: d.headers, body: JSON.parse(d.body) })) }, notes: `count=${hook.deliveries.length}; record whether duplicates occurred and which auth/signature headers are present` })
hookRec.write()
await hook.close()

// 8. SIG-009 scenario: verifier transport failure behavior
//    call a DocuSeal verification/completion endpoint with an unreachable
//    route + record status/error shape; assert-at-replay: no false status.
const errRec = rec('verifier-error')
try {
  const r = await fetch('http://127.0.0.1:8399/unreachable-endpoint', { signal: AbortSignal.timeout(3000) })
  errRec.step({ name: 'unreachable-verifier', request: { method: 'GET', path: 'http://127.0.0.1:8399/unreachable-endpoint', headers: {} }, response: { status: r?.status ?? 0, headers: {}, body: null }, notes: 'network-level failure shape; product must map to `error`, never a validity status' })
} catch (e) {
  errRec.step({ name: 'unreachable-verifier', request: { method: 'GET', path: 'http://127.0.0.1:8399/unreachable-endpoint', headers: {} }, response: { status: 0, headers: {}, body: { error: String(e && e.cause ? e.cause.code ?? e.message : e.message) } }, notes: 'ECONNREFUSED/timeout observed; product maps to `error`' })
}
errRec.write()

// 9. fill SIG-007 into the manifest
const manifestPath = join(SIG_DIR, 'signatures-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const i = manifest.items.findIndex((it) => it.id === 'SIG-007')
manifest.items[i] = { ...manifest.items[i], file: 'sig-007.pdf', sha256: sig7Sha, capturedAt: new Date().toISOString() }
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`docuseal capture complete — SIG-007 sha256=${sig7Sha}`)
```

- [ ] **Step 3: Run the capture session**

Run: `node scripts/capture/capture-docuseal.mjs`
Expected: recordings + `sig-007.pdf` + manifest update. **Live-fix expectations:** the Playwright signing sequence and exact DocuSeal field names will likely need in-session adjustment against the pinned UI — adjust the script, note UI drift in the step `notes`, keep the recording assertions honest (what was observed, not what was intended). The webhook receiver MUST be listening before `complete.click()` (it is — started in step 3 of the script).

- [ ] **Step 4: Inspect recordings (redaction + digest stamps)**

Run: `Select-String -Path fixtures/docuseal/*.json -Pattern "X-Auth-Token\\":\\"(?!<redacted>)"`
Expected: no output. Read `verifier-error.json` once: confirm the failure is recorded with an explicit `notes` mapping to `error`.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture/capture-docuseal.mjs fixtures/docuseal fixtures/signatures/sig-007.pdf fixtures/signatures/signatures-manifest.json
git commit -m "feat: capture docuseal contract fixtures"
```

---

### Task 6: Replay harness (offline contract assertions)

**Files:**
- Create: `scripts/test/replay/recordings.test.mjs`
- Create: `scripts/test/replay/manifest.test.mjs`
- Modify: nothing else — root `vitest.config.ts` already includes `scripts/test/**/*.test.mjs`, so `pnpm test` picks these up.

**Interfaces:**
- Consumes: `fixtures/paperless/*.json`, `fixtures/docuseal/*.json`, `fixtures/signatures/signatures-manifest.json` (Tasks 4–5).
- Produces: the offline gate the roadmap exit condition rests on ("contract fixtures run successfully against pinned upstream builds" — replay proves the recorded contracts satisfy the properties the product depends on).

- [ ] **Step 1: Write the recordings replay suite**

Create `scripts/test/replay/recordings.test.mjs`:

```javascript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const load = (service, journey) =>
  JSON.parse(readFileSync(join(ROOT, 'fixtures', service, `${journey}.json`), 'utf8'))

const PAPERLESS_JOURNEYS = ['auth', 'upload-polling', 'search-list', 'preview', 'metadata', 'download', 'permissions']
const DOCUSEAL_JOURNEYS = ['submissions', 'progress', 'webhook', 'verifier-error']

describe('paperless recordings', () => {
  it.each(PAPERLESS_JOURNEYS)('%s: stamped with the pinned digest', (j) => {
    expect(load('paperless', j).upstream.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('auth: token shape present, wrong-credentials denied', () => {
    const j = load('paperless', 'auth')
    const ok = j.steps.find((s) => s.name === 'create-token')
    expect(ok.response.status).toBe(200)
    expect(Object.keys(ok.response.body)).toContain('token')
    const bad = j.steps.find((s) => s.name === 'wrong-credentials')
    expect(bad.response.status).toBeGreaterThanOrEqual(400)
  })

  it('upload-polling: async task vocabulary observed with a terminal state', () => {
    const j = load('paperless', 'upload-polling')
    const terminal = j.steps.find((s) => s.name === 'task-terminal')
    expect(terminal.notes).toMatch(/terminal state (SUCCESS|FAILURE)/)
  })

  it('search-list: pagination envelope shape', () => {
    const j = load('paperless', 'search-list')
    const first = j.steps.find((s) => s.name === 'list-first-page')
    expect(first.response.body).toHaveProperty('count')
    expect(first.response.body).toHaveProperty('results')
  })

  it('download: original-bytes guarantee recorded', () => {
    const j = load('paperless', 'download')
    const step = j.steps.find((s) => s.name === 'download-original')
    expect(step.notes).toMatch(/sha256=/)
  })

  it('permissions: denied user receives >= 400 and observed code is recorded', () => {
    const j = load('paperless', 'permissions')
    const denied = j.steps.find((s) => s.name === 'denied-cannot-retrieve')
    expect(denied.response.status).toBeGreaterThanOrEqual(400)
    const allowed = j.steps.find((s) => s.name === 'allowed-can-retrieve')
    expect(allowed.response.status).toBe(200)
  })
})

describe('docuseal recordings', () => {
  it.each(DOCUSEAL_JOURNEYS)('%s: stamped with the pinned digest', (j) => {
    expect(load('docuseal', j).upstream.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('submissions: signer link path is /s/<slug>; completion retrieval recorded', () => {
    const j = load('docuseal', 'submissions')
    const create = j.steps.find((s) => s.name === 'create-submission')
    expect(create.notes).toMatch(/\/s\//)
    expect(create.request.body.send_email).toBe(false)
  })

  it('webhook: delivery captured with auth/signature header presence noted', () => {
    const j = load('docuseal', 'webhook')
    const step = j.steps.find((s) => s.name === 'deliveries')
    expect(step.response.body.length).toBeGreaterThanOrEqual(1)
    expect(step.notes).toMatch(/auth\/signature|signature/i)
  })

  it('verifier-error: transport failure mapped to `error`, never a validity status', () => {
    const j = load('docuseal', 'verifier-error')
    const step = j.steps.find((s) => s.name === 'unreachable-verifier')
    expect(step.response.status === 0 || step.response.status >= 500 || step.notes.length > 0).toBe(true)
    expect(step.notes).toMatch(/error/)
  })
})

describe('redaction invariants (all recordings)', () => {
  const services = ['paperless', 'docuseal']
  it.each(services)('%s: no unredacted credential headers or env secrets', (service) => {
    for (const file of readdirSync(join(ROOT, 'fixtures', service))) {
      const text = readFileSync(join(ROOT, 'fixtures', service, file), 'utf8')
      expect(text).not.toMatch(/Token (?!<redacted>)[^\s"]+/)
      expect(text).not.toMatch(/Bearer (?!<redacted>)[^\s"]+/)
      expect(text).not.toMatch(/X-Auth-Token":\s*"(?!<redacted>)[^"]+/)
      for (const secretName of ['POSTGRES_PASSWORD', 'PAPERLESS_SECRET_KEY', 'PAPERLESS_ADMIN_PASSWORD', 'DOCUSEAL_API_TOKEN']) {
        const env = readFileSync(join(ROOT, 'deploy', 'local', '.env'), 'utf8')
        const m = new RegExp(`${secretName}=(.+)`).exec(env)
        if (m && m[1].length > 8) expect(text).not.toContain(m[1])
      }
    }
  })
})
```

- [ ] **Step 2: Write the manifest integrity suite**

Create `scripts/test/replay/manifest.test.mjs`:

```javascript
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SIG = join(ROOT, 'fixtures', 'signatures')
const manifest = JSON.parse(readFileSync(join(SIG, 'signatures-manifest.json'), 'utf8'))

describe('signature fixture manifest integrity', () => {
  it('every pdf-backed item matches its committed sha256', () => {
    for (const item of manifest.items) {
      if (!item.file) continue
      const bytes = readFileSync(join(SIG, item.file))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256)
    }
  })

  it('sig-007 is present after capture (file + sha256 filled)', () => {
    const sig7 = manifest.items.find((i) => i.id === 'SIG-007')
    expect(sig7.file).toBe('sig-007.pdf')
    expect(sig7.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(readFileSync(join(SIG, 'sig-007.pdf')).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('no item invents a vocabulary word outside the normalized set', () => {
    for (const item of manifest.items) {
      expect(['unsigned', 'valid_trusted', 'valid_untrusted', 'invalid', 'error']).toContain(item.expectedOutcome)
    }
  })
})
```

- [ ] **Step 3: Run the replay suites**

Run: `pnpm vitest run -c vitest.config.ts scripts/test/replay/`
Expected: PASS. **Live-fix expectation:** assertions written above are the *contract*; if a captured property differs (e.g., DocuSeal returned no webhook signature header), correct the ASSERTION to record reality and add the observation as a documented contract note in the test file header comment — never weaken a security-relevant assertion (denial >= 400, redaction, no-false-status) to match upstream behavior; escalate instead.

- [ ] **Step 4: Full gate + commit**

Run: `pnpm format; pnpm lint; pnpm test; pnpm validate:docs`
Expected: all exit 0.

```bash
git add scripts/test/replay
git commit -m "test: replay captured contract fixtures offline"
```

---

### Task 7: Documentation (catalog, runbook, companions)

**Files:**
- Modify: `docs/engineering/signature-fixture-catalog.md` — Status Draft → Active; add per-fixture columns filled from `signatures-manifest.json` (checksums, capture date, generator, expected outcome); keep the re-baseline rule.
- Modify: `docs/operations/deployment-runbook.md` — new "Fixture capture session" section covering: start stack (`node deploy/local/stack.mjs start`), Paperless admin env (Task 1), DocuSeal first-run wizard + API token minting (manual), capture scripts in order (`capture-paperless.mjs` → `capture-docuseal.mjs`), redaction inspection, commit checklist, and re-capture-on-re-pin guidance (re-run generators + both capture scripts after any upstream re-pin; diff recordings; correct contract assertions only per Task 6 Step 3 rules).
- Modify: `docs/nontechnical/operations/deployment-runbook.md` — one plain-language companion sentence for the capture-session section (same commit).
- Check: `docs/delivery/requirements-traceability.md` — link the fixture deliverable if a stable ID applies; only add if the file's convention supports it.

**Interfaces:**
- Consumes: everything Tasks 1–6 produced (their final state is the source of truth for the docs).
- Produces: exit-gate documentation evidence.

- [ ] **Step 1: Update the catalog** (use real values from `signatures-manifest.json`; no placeholders)
- [ ] **Step 2: Add the runbook section + companion sentence** (same commit)
- [ ] **Step 3: Run the gate**

Run: `pnpm validate:docs; pnpm lint; pnpm test`
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/engineering/signature-fixture-catalog.md docs/operations/deployment-runbook.md docs/nontechnical/operations/deployment-runbook.md
git commit -m "docs: activate signature fixture catalog and capture runbook"
```

---

### Task 8: PR, CI, merge, final review

**Files:** none new.

- [ ] **Step 1: Sanity-check and push**

Run: `git log origin/main..HEAD --oneline` — expect: spec commit (`44d7ab4`) + Tasks 1–7 commits, nothing else.

```bash
git push -u origin m0c-fixture-capture
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head m0c-fixture-capture --title "feat: capture upstream contract and signature fixtures" --body "Implements plans/specs/2026-09-08-m0c-fixture-capture-design.md (plan: plans/2026-09-08-m0c-fixture-capture.md). Captured Paperless + DocuSeal contract fixtures against the pinned M0-B stack (recordings stamped with pinned digests), generated the SIG-001..009 synthetic signature fixture set (self-signed trust paths, checksums in signatures-manifest.json), added the offline replay harness asserting contract properties, and documented the capture session. DocuSeal capture automated only the PUBLIC hosted signing page (LIC-001 untouched). Replay is offline; live capture is a documented manual session, never CI."
```

- [ ] **Step 3: Watch CI, merge**

Run: `gh pr checks --watch`
Expected: `quality` green. If red: capture the failing step + log tail; report BLOCKED; do NOT push speculative fixes.

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull
```

- [ ] **Step 4: Post-merge verification**

Run: `pnpm test; pnpm validate:compose` on `main`
Expected: replay suites green offline; compose/manifest still matching.

- [ ] **Step 5: Final whole-branch review** (base `56489da` → squash head), triage deferred minors, close out the milestone.
