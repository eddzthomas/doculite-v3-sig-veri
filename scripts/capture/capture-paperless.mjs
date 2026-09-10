#!/usr/bin/env node
// LIVE ONLY — captures Paperless contract fixtures against the pinned local
// stack (deploy/upstream-versions.json pins v3.1.3). Requires the stack
// started via deploy/local/stack.mjs with PAPERLESS_ADMIN_* set in
// deploy/local/.env. Raw byte endpoints are hashed in-session so the session
// log can prove original-bytes fidelity; the bytes themselves are never
// committed to the recording.
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JourneyRecorder } from './lib/recorder.mjs'

const BASE = 'http://127.0.0.1:8100'
const DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'paperless')
// Admin creds come from deploy/local/.env (the capture session input); the
// shell env is only a fallback override. .env is NOT auto-exported to the
// process environment, so the script parses it directly.
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
    .filter((kv) => kv.length === 2)
    .map(([k, v]) => [k, v]),
)
const ADMIN = {
  username: process.env.PAPERLESS_ADMIN_USER ?? envVars.PAPERLESS_ADMIN_USER,
  password: process.env.PAPERLESS_ADMIN_PASSWORD ?? envVars.PAPERLESS_ADMIN_PASSWORD,
}
if (!ADMIN.username || !ADMIN.password)
  throw new Error('admin credentials missing — set PAPERLESS_ADMIN_* in deploy/local/.env')
const FIXTURE_PDF = join(import.meta.dirname, '..', '..', 'fixtures', 'signatures', 'sig-001.pdf')
// Set from the sig-001 manifest sha256 by the session (original-bytes anchor).
const FIXTURE_SHA = process.env.FIXTURE_SHA
// Fail fast: the download journey's original-bytes verification is only
// meaningful when the uploaded bytes are provably the fixture bytes. A missing
// or mismatched FIXTURE_SHA would silently weaken that verification.
const SIG_MANIFEST_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  'signatures',
  'signatures-manifest.json',
)
if (!FIXTURE_SHA)
  throw new Error(
    'FIXTURE_SHA is not set — export the sig-001 manifest sha256 (fixtures/signatures/signatures-manifest.json) before capturing',
  )
{
  const sigManifest = JSON.parse(await readFile(SIG_MANIFEST_PATH, 'utf8'))
  const sig001 = sigManifest.items.find((it) => it.id === 'SIG-001')
  if (!sig001?.sha256)
    throw new Error('SIG-001 entry missing from fixtures/signatures/signatures-manifest.json')
  if (sig001.sha256 !== FIXTURE_SHA)
    throw new Error(
      `FIXTURE_SHA (${FIXTURE_SHA}) does not match the manifest SIG-001 sha256 (${sig001.sha256}) — refusing to capture against the wrong bytes`,
    )
}

const rec = (journey) =>
  new JourneyRecorder({ journeysDir: DIR, journey, service: 'paperless-ngx' })

// /api/token/ is throttled on the pinned build; bursts of token requests can
// 429 nondeterministically (observed live during M0-C capture — a throttled
// sub-login yields no token and cascades into misleading 401s). Retry with
// backoff so the matrix records real permission outcomes, not throttle noise.
// The intentional wrong-credentials probe is NOT retried — its 400 is the
// recorded behavior.
async function loginWithRetry(username, password, { attempts = 6 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const res = await call('POST', '/api/token/', {
      body: new URLSearchParams({ username, password }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const token = res.body?.token
    if (res.status === 200 && typeof token === 'string' && token.length >= 10) return { token, res }
    const retryAfter = Number(res.headers['retry-after'] ?? 60)
    console.log(
      `login for ${username} got ${res.status} (attempt ${i + 1}/${attempts}) — retrying in ${retryAfter}s`,
    )
    await new Promise((r) => setTimeout(r, retryAfter * 1000 + 5000))
  }
  throw new Error(`login for ${username} did not succeed within ${attempts} attempts`)
}

async function call(method, path, { headers = {}, body, token, raw } = {}) {
  const h = { ...headers }
  if (token) h.Authorization = `Token ${token}`
  const res = await fetch(BASE + path, { method, headers: h, body })
  const contentType = res.headers.get('content-type') ?? ''
  let responseBody
  if (raw) {
    const bytes = Buffer.from(await res.arrayBuffer())
    responseBody = {
      binary: true,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sha256Note: '(bytes not committed; sha256 recorded for original-bytes verification)',
    }
  } else if (!contentType.includes('application/json')) {
    responseBody = {
      binary: true,
      sha256Note: '(sha256 recorded in session log, bytes not committed)',
    }
  } else {
    responseBody = await res.json()
  }
  return {
    status: res.status,
    contentType,
    headers: Object.fromEntries(res.headers),
    body: responseBody,
  }
}

// ---- single-journey mode: failed-consume -----------------------------------
// `node scripts/capture/capture-paperless.mjs --only=failed-consume` records
// ONLY the failed-processing contract shape and exits — used to add a missing
// spec deliverable without re-running the success journeys (which would create
// duplicate upstream state). A deliberately corrupt PDF (valid %PDF- header,
// deterministic garbage body) is uploaded, its consume task is polled scoped
// by task id, and the terminal FAILURE state + error-message shape are
// recorded. If upstream behaves differently than expected (synchronous
// rejection, no failure state), the reality is recorded honestly.
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null
if (ONLY === 'failed-consume') {
  const failed = rec('failed-consume')
  // The auth journey records the token shape; this mode reuses the same
  // throttled login without re-recording it.
  const { token: FAILED_TOKEN } = await loginWithRetry(ADMIN.username, ADMIN.password)
  const tmpDir = await mkdtemp(join(tmpdir(), 'm0c-corrupt-'))
  const corruptPath = join(tmpDir, 'corrupt-fixture.pdf')
  // Enough of a header to be accepted as a PDF upload, not enough to survive
  // consumption (no objects, no xref). Body is deterministic, not random, so
  // the recorded shape is reproducible.
  const header = Buffer.from('%PDF-1.4\n', 'latin1')
  const garbage = Buffer.alloc(4096)
  for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 31 + 7) % 251
  const corruptBytes = Buffer.concat([header, garbage])
  await writeFile(corruptPath, corruptBytes)
  const badFd = new FormData()
  badFd.append(
    'document',
    new Blob([corruptBytes], { type: 'application/pdf' }),
    'corrupt-fixture.pdf',
  )
  const badUp = await call('POST', '/api/documents/post_document/', {
    token: FAILED_TOKEN,
    body: badFd,
  })
  failed.step({
    name: 'post-corrupt-document',
    request: {
      method: 'POST',
      path: '/api/documents/post_document/',
      headers: {},
      body: 'multipart: corrupt-fixture.pdf bytes (%PDF- header + deterministic garbage body)',
    },
    response: { status: badUp.status, headers: badUp.headers, body: badUp.body },
    notes:
      'corrupt upload probed for the failed-processing shape; recorded behavior is what the pinned build actually does',
  })
  if (badUp.status >= 400) {
    failed.step({
      name: 'post-corrupt-document-rejected',
      request: { method: 'GET', path: '/api/tasks/', headers: {} },
      response: { status: badUp.status, headers: badUp.headers, body: badUp.body },
      notes:
        'upstream rejected the corrupt upload synchronously (no consume task created); product maps a rejected upload to the normalized outcome `error` — never a validity status',
    })
    failed.write()
    console.log(
      `failed-consume capture complete — upload rejected synchronously with ${badUp.status}`,
    )
    process.exit(0)
  }
  const BAD_TASK_ID = typeof badUp.body === 'string' ? badUp.body : badUp.body?.task_id
  if (typeof BAD_TASK_ID !== 'string' || !BAD_TASK_ID) {
    throw new Error(
      `post_document returned no consume-task id for the corrupt upload — raw body: ${JSON.stringify(badUp.body).slice(0, 300)}`,
    )
  }
  const badSeen = new Set()
  let badTerminal = null
  for (let i = 0; i < 120; i++) {
    const tasks = await call('GET', '/api/tasks/', { token: FAILED_TOKEN })
    const mine = (Array.isArray(tasks.body) ? tasks.body : (tasks.body.results ?? [])).filter(
      (t) => t.task_id === BAD_TASK_ID,
    )
    for (const t of mine) if (typeof t.status === 'string') badSeen.add(t.status)
    badTerminal = mine.find((t) => t.status === 'success' || t.status === 'failure')
    if (badTerminal) {
      failed.step({
        name: 'task-terminal-failure',
        request: { method: 'GET', path: '/api/tasks/', headers: {} },
        response: { status: tasks.status, headers: tasks.headers, body: mine },
        notes: `terminal state ${badTerminal.status}; states seen: ${[...badSeen].join(',')}; polling scoped to consume task ${BAD_TASK_ID}; failure/error detail recorded in the task body exactly as received; product maps a failed consume task to the normalized outcome \`error\` — never a validity status`,
      })
      break
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  if (!badTerminal)
    throw new Error('corrupt consume task never reached a terminal state within the polling bound')
  failed.write()
  console.log(`failed-consume capture complete — terminal status: ${badTerminal.status}`)
  process.exit(0)
}

// ---- journey 1: auth -------------------------------------------------------
const auth = rec('auth')
const { token: TOKEN, res: loginRes } = await loginWithRetry(ADMIN.username, ADMIN.password)
auth.step({
  name: 'create-token',
  request: {
    method: 'POST',
    path: '/api/token/',
    headers: {},
    body: { username: '<admin username>', password: '<redacted>' },
  },
  response: { status: loginRes.status, headers: loginRes.headers, body: { token: '<redacted>' } },
  notes:
    'token shape recorded; value redacted; token requests retry on 429 throttle (observed nondeterministic on this build)',
})
{
  const bad = await call('POST', '/api/token/', {
    body: new URLSearchParams({ username: ADMIN.username, password: 'wrong' }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
  auth.step({
    name: 'wrong-credentials',
    request: {
      method: 'POST',
      path: '/api/token/',
      headers: {},
      body: { username: '<admin username>', password: '<redacted>' },
    },
    response: { status: bad.status, headers: bad.headers, body: bad.body },
    notes: 'denied credential behavior',
  })
}
auth.write()

// ---- journey 2: upload + consume-task polling ------------------------------
const upload = rec('upload-polling')
const fd = new FormData()
fd.append(
  'document',
  new Blob([await readFile(FIXTURE_PDF)], { type: 'application/pdf' }),
  'sig-001.pdf',
)
const upRes = await call('POST', '/api/documents/post_document/', { token: TOKEN, body: fd })
upload.step({
  name: 'post-document',
  request: {
    method: 'POST',
    path: '/api/documents/post_document/',
    headers: {},
    body: 'multipart: sig-001.pdf bytes',
  },
  response: { status: upRes.status, headers: upRes.headers, body: upRes.body },
  notes:
    'async consumption; pinned v3.1.3 returns a bare JSON string consume-task id (not an object)',
})
// poll ONLY this upload's consume task until it reaches a terminal state;
// record every observed state so replay asserts can pick from real
// transitions. Live drift vs the brief: pinned v3.1.3 uses lowercase statuses
// (success/failure/...), paginated envelope, and related_document_ids (array)
// on the task. The task list retains tasks from earlier sessions, so polling
// is scoped to the task id returned by post_document — an unscoped
// "first terminal consume task" match can latch onto a stale task, and
// "first task with truthy related_document_ids" can match a pending task
// (empty array is truthy). Both were observed live during M0-C capture.
const UPLOAD_TASK_ID = typeof upRes.body === 'string' ? upRes.body : upRes.body?.task_id
if (typeof UPLOAD_TASK_ID !== 'string' || !UPLOAD_TASK_ID) {
  throw new Error(
    `post_document returned no consume-task id — raw body: ${JSON.stringify(upRes.body)}`,
  )
}
const seenStates = new Set()
let terminal = null
let lastTasks = []
for (let i = 0; i < 120; i++) {
  const tasks = await call('GET', '/api/tasks/', { token: TOKEN })
  lastTasks = Array.isArray(tasks.body) ? tasks.body : (tasks.body.results ?? [])
  const mine = lastTasks.filter((t) => t.task_id === UPLOAD_TASK_ID)
  for (const t of mine) if (typeof t.status === 'string') seenStates.add(t.status)
  terminal = mine.find((t) => t.status === 'success' || t.status === 'failure')
  if (terminal) {
    upload.step({
      name: 'task-terminal',
      request: { method: 'GET', path: '/api/tasks/', headers: {} },
      response: { status: tasks.status, headers: tasks.headers, body: mine },
      notes: `terminal state ${terminal.status}; states seen: ${[...seenStates].join(',')}; polling scoped to consume task ${UPLOAD_TASK_ID}`,
    })
    break
  }
  await new Promise((r) => setTimeout(r, 2000))
}
if (!terminal)
  throw new Error('consume task never reached a terminal state within the polling bound')
upload.write()
const DOC_ID = terminal.related_document_ids?.[0] ?? terminal.result_data?.document_id
if (DOC_ID === undefined || DOC_ID === null) {
  throw new Error(
    `no related_document on the terminal consume task — raw task: ${JSON.stringify(terminal)}`,
  )
}

// ---- journey 3: search / list ---------------------------------------------
const search = rec('search-list')
for (const [name, path] of [
  ['list-first-page', '/api/documents/?page=1'],
  ['query-filter', '/api/documents/?query=sig-001'],
  ['page-2-or-empty', '/api/documents/?page=2'],
]) {
  const r = await call('GET', path, { token: TOKEN })
  search.step({
    name,
    request: { method: 'GET', path, headers: {} },
    response: { status: r.status, headers: r.headers, body: r.body },
    notes: 'pagination envelope + filter params',
  })
}
search.write()

// ---- journey 4: preview (thumbnail) ---------------------------------------
const preview = rec('preview')
{
  const r = await call('GET', `/api/documents/${DOC_ID}/thumb/`, { token: TOKEN, raw: true })
  preview.step({
    name: 'thumbnail',
    request: { method: 'GET', path: `/api/documents/${DOC_ID}/thumb/`, headers: {} },
    response: { status: r.status, headers: r.headers, body: r.body },
    notes: 'content-type + status; bytes not committed, sha256 of thumb recorded',
  })
}
preview.write()

// ---- journey 5: metadata / custom fields ----------------------------------
const metadata = rec('metadata')
{
  const cf = await call('GET', '/api/custom_fields/', { token: TOKEN })
  metadata.step({
    name: 'list-custom-fields',
    request: { method: 'GET', path: '/api/custom_fields/', headers: {} },
    response: { status: cf.status, headers: cf.headers, body: cf.body },
  })
  const created = await call('POST', '/api/custom_fields/', {
    token: TOKEN,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'fixture_note', data_type: 'string' }),
  })
  metadata.step({
    name: 'create-custom-field',
    request: {
      method: 'POST',
      path: '/api/custom_fields/',
      headers: {},
      body: { name: 'fixture_note', data_type: 'string' },
    },
    response: { status: created.status, headers: created.headers, body: created.body },
  })
  const patched = await call('PATCH', `/api/documents/${DOC_ID}/`, {
    token: TOKEN,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ custom_fields: [{ field: created.body.id, value: 'captured by m0c' }] }),
  })
  metadata.step({
    name: 'assign-custom-field',
    request: {
      method: 'PATCH',
      path: `/api/documents/${DOC_ID}/`,
      headers: {},
      body: { custom_fields: [{ field: created.body.id, value: 'captured by m0c' }] },
    },
    response: { status: patched.status, headers: patched.headers, body: patched.body },
    notes: 'field types + permission requirement',
  })
}
metadata.write()

// ---- journey 6: download (original-bytes verification) ---------------------
const download = rec('download')
{
  const r = await call('GET', `/api/documents/${DOC_ID}/download/`, { token: TOKEN, raw: true })
  const verdict =
    r.body.sha256 === FIXTURE_SHA
      ? `MATCH — sha256(downloaded bytes) === fixture manifest sha256 (${FIXTURE_SHA}); original bytes preserved`
      : `MISMATCH — downloaded sha256 ${r.body.sha256} !== fixture sha256 ${FIXTURE_SHA}`
  download.step({
    name: 'download-original',
    request: { method: 'GET', path: `/api/documents/${DOC_ID}/download/`, headers: {} },
    response: { status: r.status, headers: r.headers, body: r.body },
    notes: `retrieval route; uploaded sig-001 sha256=${FIXTURE_SHA}; session verification: ${verdict}; bytes not committed`,
  })
}
download.write()

// ---- journey 7: permissions (three-account matrix) -------------------------
const perms = rec('permissions')
{
  // three-account matrix: admin (owner) vs allowed vs denied. Live drift vs
  // the brief: a fresh user gets 403 even when object-shared, because
  // paperless also requires the model-level view permission; user_permissions
  // is a codename-SlugRelatedField (write 'view_document', not a pk).
  const mk = async (username, userPermissions) =>
    call('POST', '/api/users/', {
      token: TOKEN,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username,
        password: `${username}-pw`,
        is_superuser: false,
        user_permissions: userPermissions,
      }),
    })
  const allowed = await mk('fixture-allowed', ['view_document'])
  const denied = await mk('fixture-denied', [])
  perms.step({
    name: 'create-users',
    request: {
      method: 'POST',
      path: '/api/users/',
      headers: {},
      body: {
        username: 'fixture-allowed|fixture-denied',
        password: '<redacted>',
        is_superuser: false,
        user_permissions: "['view_document'] | []",
      },
    },
    response: { status: allowed.status, headers: allowed.headers, body: allowed.body },
    notes: `denied creation status=${denied.status}; allowed user carries model-level view_document (required alongside the object share; observed 403 without it)`,
  })
  const allowedToken = (await loginWithRetry('fixture-allowed', 'fixture-allowed-pw')).token
  const deniedToken = (await loginWithRetry('fixture-denied', 'fixture-denied-pw')).token
  // share with allowed user, NOT with denied user. Live drift vs the brief:
  // the `permissions` merge PATCH silently no-ops on pinned v3.1.3 (view.users
  // stays empty); `set_permissions` is the shape that actually grants.
  const share = await call('PATCH', `/api/documents/${DOC_ID}/`, {
    token: TOKEN,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      set_permissions: {
        view: { users: [allowed.body.id], groups: [] },
        change: { users: [], groups: [] },
      },
    }),
  })
  const sharedUserIds = share.body?.permissions?.view?.users ?? []
  perms.step({
    name: 'share-with-allowed-only',
    request: {
      method: 'PATCH',
      path: `/api/documents/${DOC_ID}/`,
      headers: {},
      body: {
        set_permissions: {
          view: { users: ['<allowed user id>'], groups: [] },
          change: { users: [], groups: [] },
        },
      },
    },
    response: { status: share.status, headers: share.headers, body: share.body },
    notes: `grant verified in-session: response permissions.view.users=${JSON.stringify(sharedUserIds)} (expected [${allowed.body.id}])`,
  })
  for (const [name, token] of [
    ['allowed-can-retrieve', allowedToken],
    ['denied-cannot-retrieve', deniedToken],
  ]) {
    const r = await call('GET', `/api/documents/${DOC_ID}/`, { token })
    perms.step({
      name,
      request: { method: 'GET', path: `/api/documents/${DOC_ID}/`, headers: {} },
      response: {
        status: r.status,
        headers: r.headers,
        body:
          name === 'denied-cannot-retrieve'
            ? r.body
            : '<document detail omitted — authorized path>',
      },
      notes: `observed status=${r.status}; assert at replay: allowed user retrieves (200), denied user receives >=400 with no metadata leakage`,
    })
  }
}
perms.write()

console.log(
  'paperless capture complete — journeys written (auth, upload-polling, search-list, preview, metadata, download, permissions)',
)
