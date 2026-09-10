#!/usr/bin/env node
// LIVE ONLY - captures DocuSeal contract fixtures + SIG-007 against the pinned
// local stack (deploy/upstream-versions.json pins 3.2.4). Requires: stack up,
// DOCUSEAL_API_TOKEN + DOCUSEAL_ADMIN_PASSWORD in deploy/local/.env, first-run
// admin minted (manual, see runbook). Template and webhook creation are UI-only
// on this pinned build (no POST /api/templates, no /api/webhooks - verified
// against the pinned routes.rb and observed 404s), so those two operations are
// driven through an authenticated browser session and recorded as UI journeys;
// everything downstream (submissions, progress, completed PDF) uses the API.
// Signed capability URLs (/file, /disk, /s/<slug>) are scrubbed from
// recordings before write - capability URLs never enter committed fixtures.
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { buildDocument } from '../generate-fixtures/lib/pdf.mjs'
import { startHookReceiver } from './lib/hook-receiver.mjs'
import { JourneyRecorder } from './lib/recorder.mjs'

const BASE = 'http://127.0.0.1:8200'
const HOOK_PUBLIC_URL = 'http://host.docker.internal:8300/hook'
const DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'docuseal')
const SIG_DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'signatures')

// deploy/local/.env is not auto-exported to the process environment; parse it
// directly (same pattern as capture-paperless.mjs). Values are never printed.
const envText = await readFile(
  join(import.meta.dirname, '..', '..', 'deploy', 'local', '.env'),
  'utf8',
)
const envVars = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=', 2))
    .filter((kv) => kv.length === 2),
)
const TOKEN = process.env.DOCUSEAL_API_TOKEN ?? envVars.DOCUSEAL_API_TOKEN
const ADMIN_PASSWORD = process.env.DOCUSEAL_ADMIN_PASSWORD ?? envVars.DOCUSEAL_ADMIN_PASSWORD
if (!TOKEN || !ADMIN_PASSWORD)
  throw new Error(
    'DOCUSEAL_API_TOKEN / DOCUSEAL_ADMIN_PASSWORD missing - set them in deploy/local/.env',
  )

const rec = (journey) => new JourneyRecorder({ journeysDir: DIR, journey, service: 'docuseal' })
let adminEmail = null

// Capability URLs are derivable only with server-side signing state and are a
// security-boundary item (AGENTS.md: no signing links in committed artifacts),
// so they are replaced with a stable placeholder at recording time. The admin
// login email is scrubbed too - the write-guard refuses any .env value
// substring, and it contains the PAPERLESS_ADMIN_USER value.
const SIGNED_URL_RE = /https?:\/\/[^\s"'<>]*\/(file|disk|s|e|p)\/[^\s"'<>]*/g
const scrubUrls = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'string' ? v.replace(SIGNED_URL_RE, '<redacted:capability-url>') : v,
    ),
  )
const scrubSensitive = (value) =>
  JSON.parse(
    JSON.stringify(scrubUrls(value), (_k, v) =>
      typeof v === 'string' && adminEmail ? v.split(adminEmail).join('<redacted:admin-email>') : v,
    ),
  )

async function call(method, path, { body, token = TOKEN } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: token
      ? { 'X-Auth-Token': token, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const ct = res.headers.get('content-type') ?? ''
  const parsed = ct.includes('application/json')
    ? await res.json()
    : Buffer.from(await res.arrayBuffer())
  return { status: res.status, headers: Object.fromEntries(res.headers), body: parsed }
}

// synthetic signer identity - never a real person (Global Constraint)
const SIGNER = { name: 'Capture Fixture Signer', email: 'signer@example.com' }

// 0. sanity: token works before any state is created
{
  const sanity = await call('GET', '/api/templates')
  if (sanity.status !== 200)
    throw new Error(`token sanity check failed: GET /api/templates -> ${sanity.status}`)
  console.log('token sanity: GET /api/templates -> 200')
  const who = await call('GET', '/api/user')
  if (who.status !== 200) throw new Error('GET /api/user failed - cannot resolve admin login email')
  adminEmail = who.body.email
  console.log('admin login email resolved from GET /api/user')
}

// fresh synthetic base document (NOT sig-001 bytes)
const tmp = await mkdtemp(join(tmpdir(), 'm0c-'))
const basePdfPath = join(tmp, 'sig-007-base.pdf')
await writeFile(basePdfPath, await buildDocument('Fixture SIG-007 (docuseal)'))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

// ---- journey: submissions (UI template create + API submission lifecycle) ---
const subs = rec('submissions')

// 1. authenticated UI session (devise login; template/webhook UIs need it)
await page.goto(`${BASE}/sign_in`, { waitUntil: 'domcontentloaded' })
await page.locator('input[name="user[email]"]').fill(adminEmail)
await page.locator('input[name="user[password]"]').fill(ADMIN_PASSWORD)
const signInRespPromise = page.waitForResponse(
  (r) => r.url().endsWith('/sign_in') && r.request().method() === 'POST',
)
await page
  .getByRole('button', { name: /sign in/i })
  .first()
  .click()
const signInResp = await signInRespPromise
await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 })
subs.step({
  name: 'create-ui-session',
  request: {
    method: 'POST',
    path: '/sign_in',
    headers: {},
    body: { user: { email: '<redacted:admin-email>', password: '<redacted>' } },
  },
  response: {
    status: signInResp.status(),
    headers: {},
    body: { note: 'session cookie established; cookie value omitted' },
  },
  notes:
    'UI session required on pinned 3.2.4: template and webhook configuration are UI-only (no API routes); login email resolved via GET /api/user and redacted here (the write-guard refuses any .env value substring, and the admin name is a .env value)',
})

// 2. create template from the synthetic base document via the upload UI.
// The dashboard empty state exposes #file_dropzone_input; the list view
// (templates present) exposes #upload_template - both POST /templates_upload.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const uploadInput = (await page.locator('#file_dropzone_input').count())
  ? page.locator('#file_dropzone_input')
  : page.locator('#upload_template')
await uploadInput.waitFor({ state: 'attached', timeout: 60000 })
await uploadInput.setInputFiles(basePdfPath)
await page.waitForURL(/\/templates\/\d+\/edit/, { timeout: 60000 })
const tplId = Number(page.url().match(/\/templates\/(\d+)/)[1])
const uploadResp = { status: 302, redirectedTo: `/templates/${tplId}/edit` }

// place one text + one signature field for the First Party signer; the
// builder auto-persists placements (PUT /templates/:id observed in-session)
const pageImg = page.locator('img.w-full.h-full').first()
await pageImg.waitFor({ timeout: 60000 })
const pageBox = await pageImg.boundingBox()
await page.locator('#text_type_field_button').click()
await page.waitForTimeout(400)
await page.mouse.click(pageBox.x + pageBox.width * 0.25, pageBox.y + pageBox.height * 0.15)
await page.waitForTimeout(1200)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.locator('#signature_type_field_button').click()
await page.waitForTimeout(400)
await page.mouse.click(pageBox.x + pageBox.width * 0.25, pageBox.y + pageBox.height * 0.3)
await page.waitForTimeout(1200)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
subs.step({
  name: 'create-template-via-ui',
  request: {
    via: 'browser-ui',
    action:
      'POST /templates_upload (file dropzone #file_dropzone_input) then field placement in /templates/:id/edit builder',
    headers: {},
    body: {
      filename: 'sig-007-base.pdf',
      fieldsPlaced: [
        { type: 'text', area: 'x=25%, y=15% of page 1' },
        { type: 'signature', area: 'x=25%, y=30% of page 1' },
      ],
      role: 'First Party',
    },
  },
  response: { status: uploadResp.status, headers: {}, body: uploadResp },
  notes:
    'template creation is UI-only on pinned 3.2.4: POST /api/templates -> 404 and POST /api/submissions/init -> 422 {"error":"Template not found"} observed in-session (also verified against pinned routes.rb: api/templates has no create action); builder auto-persists placements via PUT /templates/:id (200 observed); template id redacted from URL in notes is resolved at runtime',
})

// 3. give the template its product-facing name via the one API route that exists
const renameRes = await call('PUT', `/api/templates/${tplId}`, {
  body: { name: 'M0C Capture Template' },
})
subs.step({
  name: 'rename-template',
  request: {
    method: 'PUT',
    path: `/api/templates/${tplId}`,
    headers: {},
    body: { name: 'M0C Capture Template' },
  },
  response: { status: renameRes.status, headers: renameRes.headers, body: renameRes.body },
  notes: 'api/templates exposes update/show/index/destroy only on this pinned build',
})

// 4. verify the template contract via the API (fields + submitter roles)
const tplRes = await call('GET', `/api/templates/${tplId}`)
subs.step({
  name: 'verify-template-fields',
  request: { method: 'GET', path: `/api/templates/${tplId}`, headers: {} },
  response: { status: tplRes.status, headers: tplRes.headers, body: scrubSensitive(tplRes.body) },
  notes:
    'fields must exist before POST /api/submissions (pinned build rejects fieldless templates with 422 "Template does not contain fields"); capability URLs scrubbed',
})

// ---- journey: webhook (API probe + UI create + deliveries) ------------------
const hookRec = rec('webhook')

// 5. honest probe: the pinned build has no webhook API
const whApiRes = await call('POST', '/api/webhooks', {
  body: { url: HOOK_PUBLIC_URL, events: ['form.completed'] },
})
hookRec.step({
  name: 'webhook-api-unavailable',
  request: {
    method: 'POST',
    path: '/api/webhooks',
    headers: {},
    body: { url: HOOK_PUBLIC_URL, events: ['form.completed'] },
  },
  response: { status: whApiRes.status, headers: whApiRes.headers, body: whApiRes.body },
  notes:
    'pinned 3.2.4 has no webhook API routes (GET/POST /api/webhooks -> 404 {"status":404}); verified against pinned routes.rb - webhook configuration is UI-only (/settings/webhooks)',
})

// 6. webhook receiver listening BEFORE any completion
const hook = await startHookReceiver({ port: Number(process.env.HOOK_PORT ?? 8300) })

// 7. create the webhook through the authenticated UI. Rerun-safety: with more
// than one webhook the settings page becomes a list view without the form, so
// delete any leftover webhooks first (DEV ONLY stack).
await page.goto(`${BASE}/settings/webhooks`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
for (let i = 0; i < 10; i += 1) {
  if (await page.locator('#new_webhook_url').count()) break
  const del = page.getByRole('button', { name: /delete/i }).first()
  if (!(await del.count())) break
  page.once('dialog', (dlg) => dlg.accept())
  await del.click()
  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/settings/webhooks`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
}
await page.locator('#webhook_url_url').fill(HOOK_PUBLIC_URL)
await page.locator('#webhook_url_events_form_completed').check()
await page.locator('#webhook_url_events_submission_completed').check()
const whPostPromise = page.waitForResponse(
  (r) => r.url().endsWith('/settings/webhooks') && r.request().method() === 'POST',
)
await page.locator('#new_webhook_url button[type="submit"]').click()
const whPost = await whPostPromise
await page.waitForTimeout(1500)
hookRec.step({
  name: 'create-webhook-via-ui',
  request: {
    via: 'browser-ui',
    action: 'POST /settings/webhooks (form #new_webhook_url)',
    headers: {},
    body: {
      webhook_url: { url: HOOK_PUBLIC_URL, events: ['form.completed', 'submission.completed'] },
    },
  },
  response: { status: whPost.status(), headers: {}, body: { redirectedTo: '/settings/webhooks' } },
  notes:
    'container reaches host receiver via host.docker.internal (Docker Desktop); both form.completed and submission.completed subscribed so the recording captures the submitter-level and submission-level completion payloads; Test mode toggle left OFF',
})

// 8. create submission via API (no email). Drift vs the brief: the pinned API
// returns a bare submitter array (slug per submitter, submission_id on each),
// and the submitter role key is `role` (the brief's `roles` array is not part
// of the create validator).
const subRes = await call('POST', '/api/submissions', {
  body: {
    template_id: tplId,
    send_email: false,
    submitters: [{ role: 'First Party', name: SIGNER.name, email: SIGNER.email }],
  },
})
const submitter = Array.isArray(subRes.body) ? subRes.body[0] : subRes.body?.submitters?.[0]
const submissionId = submitter?.submission_id
const slug = submitter?.slug
if (!submissionId || !slug)
  throw new Error(
    `no submitter slug/submission id in create response: ${JSON.stringify(subRes.body).slice(0, 300)}`,
  )
subs.step({
  name: 'create-submission',
  request: {
    method: 'POST',
    path: '/api/submissions',
    headers: {},
    body: {
      template_id: tplId,
      send_email: false,
      submitters: [{ role: 'First Party', ...SIGNER }],
    },
  },
  response: { status: subRes.status, headers: subRes.headers, body: scrubSensitive(subRes.body) },
  notes: `signer link path recorded as /s/${slug} (full URL scrubbed); response is a bare submitter array on pinned 3.2.4 - slug at [0].slug, submission id at [0].submission_id; submitter key is role (singular)`,
})

// ---- journey: progress (pre/post-completion status vocabulary) --------------
const prog = rec('progress')
const pre = await call('GET', `/api/submissions/${submissionId}`)
prog.step({
  name: 'progress-pending',
  request: { method: 'GET', path: `/api/submissions/${submissionId}`, headers: {} },
  response: { status: pre.status, headers: pre.headers, body: scrubSensitive(pre.body) },
  notes:
    'pre-completion status vocabulary (submission.status + submitters[].status); capability URLs scrubbed',
})

// 9. complete the PUBLIC hosted signing page (embedded untouched)
await page.goto(`${BASE}/s/${slug}`, { waitUntil: 'networkidle' })
const textInput = page.locator('input[type="text"]:visible').first()
if ((await textInput.count()) && (await textInput.isVisible())) {
  await textInput.fill(SIGNER.name)
  await page.locator('#submit_form_button').click()
  await page.waitForTimeout(2000)
}
const signNow = page.getByText('SIGN NOW', { exact: false }).first()
if ((await signNow.count()) && (await signNow.isVisible())) {
  await signNow.click()
  await page.waitForTimeout(1200)
}
await page.getByRole('button', { name: /type/i }).first().click()
await page.waitForTimeout(800)
const typeInput = page.locator('input:visible').last()
await typeInput.fill(SIGNER.name)
await page.waitForTimeout(600)
const signComplete = page.getByText('SIGN AND COMPLETE', { exact: false }).first()
const signCompleteVisible = await signComplete.isVisible()
if (signCompleteVisible) await signComplete.click()
await page.waitForSelector('text=Document has been signed!', { timeout: 30000 })
subs.step({
  name: 'complete-signing-via-public-page',
  request: {
    via: 'browser-ui',
    action: `GET /s/${slug} then typed-signature flow (text field -> NEXT -> SIGN NOW -> Type tab -> SIGN AND COMPLETE)`,
    headers: {},
    body: { signer: SIGNER.name, signatureMode: 'type' },
  },
  response: { status: 200, headers: {}, body: { pageState: 'Document has been signed!' } },
  notes:
    'public hosted signing page driven with Playwright; pinned 3.x uses a field-by-field wizard: text field fill then #submit_form_button (NEXT), signature dialog (button "SIGN NOW" reopens it if minimized), TYPE tab, then "SIGN AND COMPLETE"; no generic Complete button exists on this build',
})

// 10. completion poll
let done = null
for (let i = 0; i < 30; i++) {
  done = await call('GET', `/api/submissions/${submissionId}`)
  if (done.body?.status === 'completed' || done.status >= 400) break
  await new Promise((r) => setTimeout(r, 2000))
}
prog.step({
  name: 'progress-completed',
  request: { method: 'GET', path: `/api/submissions/${submissionId}`, headers: {} },
  response: { status: done.status, headers: done.headers, body: scrubSensitive(done.body) },
  notes: 'post-completion status vocabulary; capability URLs scrubbed',
})
prog.write()

// 11. retrieve the completed PDF -> SIG-007 bytes
const docsRes = await call('GET', `/api/submissions/${submissionId}/documents`)
const docUrl = docsRes.body?.documents?.[0]?.url
if (typeof docUrl !== 'string')
  throw new Error(
    `no document url in /documents response: ${JSON.stringify(docsRes.body).slice(0, 300)}`,
  )
const pdfFetch = await fetch(docUrl)
const sig7Bytes = Buffer.from(await pdfFetch.arrayBuffer())
const sig7Sha = createHash('sha256').update(sig7Bytes).digest('hex')
if (sig7Bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
  throw new Error(
    `retrieved bytes are not a PDF (header ${sig7Bytes.subarray(0, 5).toString('latin1')})`,
  )
await writeFile(join(SIG_DIR, 'sig-007.pdf'), sig7Bytes)
subs.step({
  name: 'retrieve-completed-pdf',
  request: { method: 'GET', path: `/api/submissions/${submissionId}/documents`, headers: {} },
  response: {
    status: docsRes.status,
    headers: docsRes.headers,
    body: scrubSensitive(docsRes.body),
  },
  notes: `drift vs brief: /documents returns JSON {id, documents:[{name, url}]} - the bytes come from the signed per-document URL (fetched in-session, auth-free signed link, URL scrubbed); sha256(bytes)=${sig7Sha}; bytes committed as fixtures/signatures/sig-007.pdf`,
})
subs.write()

// 12. webhook deliveries: wait for the completion events, record what arrived
const settleMs = 15000
const deadline = Date.now() + 30000
while (hook.deliveries.length < 2 && Date.now() < deadline)
  await new Promise((r) => setTimeout(r, 1000))
await new Promise((r) => setTimeout(r, settleMs))
const deliveries = hook.deliveries.map((d) => {
  let parsed = null
  try {
    parsed = scrubSensitive(JSON.parse(d.body))
  } catch {
    parsed = {
      unparseable: true,
      scrubbed: String(d.body).replace(SIGNED_URL_RE, '<redacted:capability-url>'),
    }
  }
  const sigHeader = d.headers['x-docuseal-signature']
  return {
    receivedAt: d.receivedAt,
    method: d.method,
    path: d.path,
    headerNames: Object.keys(d.headers),
    signatureHeader: sigHeader
      ? { present: true, shape: `${sigHeader.split('.')[0]}.<hmac-sha256-hex>` }
      : { present: false },
    body: parsed,
  }
})
hookRec.step({
  name: 'deliveries',
  request: {
    method: 'POST',
    path: HOOK_PUBLIC_URL,
    headers: {},
    body: { observed: 'see response' },
  },
  response: { status: 200, headers: {}, body: deliveries },
  notes: `count=${deliveries.length}; event types observed: ${[...new Set(deliveries.map((d) => d.body?.event_type))].join(',') || 'none'}; signature header X-Docuseal-Signature shape <unix-ts>.<hmac-sha256-hex> (presence recorded per delivery); duplicates: ${deliveries.length === new Set(deliveries.map((d) => JSON.stringify(d.body))).size ? 'none' : 'yes'}; notification-only - product must reconcile against an authoritative API read (AGENTS.md invariant)`,
})
hookRec.write()
await hook.close()

// ---- journey: verifier-error (SIG-009 scenario) -----------------------------
// SIG-009 records two observed failure shapes the product's verifier wrapper
// can hit: a transport-level failure (endpoint unreachable) and an upstream
// error response (pinned DocuSeal verifier rejects malformed input with 422).
// Assert-at-replay: both map to `error`, never a validity status.
const errRec = rec('verifier-error')
try {
  const r = await fetch('http://127.0.0.1:8399/unreachable-endpoint', {
    signal: AbortSignal.timeout(3000),
  })
  errRec.step({
    name: 'unreachable-verifier',
    request: { method: 'GET', path: 'http://127.0.0.1:8399/unreachable-endpoint', headers: {} },
    response: { status: r?.status ?? 0, headers: {}, body: null },
    notes: 'network-level failure shape; product must map to `error`, never a validity status',
  })
} catch (e) {
  errRec.step({
    name: 'unreachable-verifier',
    request: { method: 'GET', path: 'http://127.0.0.1:8399/unreachable-endpoint', headers: {} },
    response: {
      status: 0,
      headers: {},
      body: { error: String(e?.cause ? (e.cause.code ?? e.message) : e.message) },
    },
    notes: 'ECONNREFUSED/timeout observed at network level; product maps to `error`',
  })
}
{
  const bad = await call('POST', '/api/tools/verify', {
    body: { file: Buffer.from('not a pdf').toString('base64') },
  })
  errRec.step({
    name: 'verifier-malformed-input',
    request: {
      method: 'POST',
      path: '/api/tools/verify',
      headers: {},
      body: { file: '<base64 of non-PDF bytes>' },
    },
    response: { status: bad.status, headers: bad.headers, body: bad.body },
    notes:
      'pinned DocuSeal verifier endpoint (api/tools/verify) rejects malformed PDF bytes with 422 {"error":"Malformed PDF"}; product maps to `error`, never a validity status',
  })
}
errRec.write()

await browser.close()

// 13. fill SIG-007 into the manifest
const manifestPath = join(SIG_DIR, 'signatures-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const i = manifest.items.findIndex((it) => it.id === 'SIG-007')
if (i === -1) throw new Error('SIG-007 entry missing from signatures manifest')
manifest.items[i] = {
  ...manifest.items[i],
  file: 'sig-007.pdf',
  sha256: sig7Sha,
  capturedAt: new Date().toISOString(),
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  `docuseal capture complete - SIG-007 sha256=${sig7Sha}, template id=${tplId}, submission id=${submissionId}, deliveries=${deliveries.length}`,
)
