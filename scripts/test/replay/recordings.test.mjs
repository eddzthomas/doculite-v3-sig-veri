// Offline replay of the M0-C captured contract recordings (fixtures/paperless,
// fixtures/docuseal). Asserts the properties the product depends on against
// captured reality, not the capture brief's assumptions. Assertions were
// adjusted where the recording disproved the brief's expectation; each such
// divergence is documented with a `contract note:` comment.
//
// Contract observations that differ from the brief:
// - Paperless task statuses are lowercase (`started`/`success`), not uppercase
//   SUCCESS/FAILURE; the pinned v3.1.3 also returns `related_document_ids` on
//   the consume task.
// - Paperless out-of-range page is 404 with a bare `detail` body and NO
//   pagination envelope (brief expected a page-2 envelope or empty page).
// - Recorded failure statuses: wrong credentials on the token endpoint are
//   denied with 400; insufficient permission with a valid token is 403. The
//   401-vs-403 distinction is not exercised by any captured journey, so the
//   replay asserts the recorded denials only (>= 400 security floor kept).
// - DocuSeal webhook deliveries: exactly the four events
//   form.viewed/form.started/form.completed/submission.completed, each with a
//   present X-Docuseal-Signature header of shape <unix-ts>.<hmac-sha256-hex>;
//   no duplicate deliveries were observed.
// - DocuSeal verifier-error journey has TWO failure shapes: transport failure
//   (status 0, ECONNREFUSED) and upstream 422 malformed input. Both must map
//   to `error` and never to a validity status.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnvSecrets } from '../../capture/lib/sanitize.mjs'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const load = (service, journey) =>
  JSON.parse(readFileSync(join(ROOT, 'fixtures', service, `${journey}.json`), 'utf8'))

const PAPERLESS_JOURNEYS = [
  'auth',
  'upload-polling',
  'search-list',
  'preview',
  'metadata',
  'download',
  'permissions',
]
const DOCUSEAL_JOURNEYS = ['submissions', 'progress', 'webhook', 'verifier-error']

describe('paperless recordings', () => {
  it.each(PAPERLESS_JOURNEYS)('%s: stamped with the pinned digest', (j) => {
    const recording = load('paperless', j)
    expect(recording.upstream.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(recording.upstream.service).toBe('paperless-ngx')
  })

  it('auth: token shape present (value redacted), wrong-credentials denied', () => {
    const j = load('paperless', 'auth')
    const ok = j.steps.find((s) => s.name === 'create-token')
    expect(ok.response.status).toBe(200)
    expect(Object.keys(ok.response.body)).toContain('token')
    // Redaction invariant: the token value itself never enters the recording.
    expect(ok.response.body.token).toBe('<redacted>')
    const bad = j.steps.find((s) => s.name === 'wrong-credentials')
    expect(bad.response.status).toBeGreaterThanOrEqual(400)
    // contract note: the token endpoint denies bad credentials with 400 (not
    // 401); denial status >= 400 is the security-relevant floor.
  })

  it('upload-polling: async task vocabulary observed with a terminal state', () => {
    const j = load('paperless', 'upload-polling')
    const terminal = j.steps.find((s) => s.name === 'task-terminal')
    expect(terminal.response.status).toBe(200)
    // contract note: task statuses are lowercase on pinned v3.1.3
    // (started/success), not the brief's uppercase SUCCESS/FAILURE vocabulary.
    expect(terminal.notes).toMatch(/terminal state success/)
    expect(terminal.notes).toMatch(/states seen: started,success/)
    const task = terminal.response.body[0]
    expect(['started', 'success', 'failure', 'pending']).toContain(task.status)
    expect(task.status).toBe('success')
    // contract note: the pinned build exposes related_document_ids on the
    // consume task — the linkage upload -> document id depends on.
    expect(task.related_document_ids).toEqual([4])
  })

  it('upload-polling: post_document returns a bare consume-task id string', () => {
    const j = load('paperless', 'upload-polling')
    const post = j.steps.find((s) => s.name === 'post-document')
    expect(post.response.status).toBe(200)
    // contract note: pinned v3.1.3 returns a bare JSON string task id, not an
    // object envelope; polling must treat the string as the consume-task id.
    expect(typeof post.response.body).toBe('string')
    expect(post.response.body).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('search-list: pagination envelope shape', () => {
    const j = load('paperless', 'search-list')
    const first = j.steps.find((s) => s.name === 'list-first-page')
    expect(first.response.status).toBe(200)
    expect(first.response.body).toHaveProperty('count')
    expect(first.response.body).toHaveProperty('results')
    expect(first.response.body).toHaveProperty('next')
    expect(first.response.body).toHaveProperty('previous')
    expect(Array.isArray(first.response.body.results)).toBe(true)
  })

  it('search-list: out-of-range page is 404 without an envelope', () => {
    const j = load('paperless', 'search-list')
    const step = j.steps.find((s) => s.name === 'page-2-or-empty')
    // contract note: brief expected a page-2 envelope or empty page; pinned
    // v3.1.3 returns 404 {"detail":"Invalid page."} with no pagination
    // envelope. Product pagination must treat 404 as "no more pages".
    expect(step.response.status).toBe(404)
    expect(step.response.body).not.toHaveProperty('results')
    expect(step.response.body).toHaveProperty('detail')
  })

  it('preview: thumbnail served with content-type and recorded digest', () => {
    const j = load('paperless', 'preview')
    const step = j.steps.find((s) => s.name === 'thumbnail')
    expect(step.response.status).toBe(200)
    expect(step.response.headers['content-type']).toBe('image/webp')
    expect(step.response.body.binary).toBe(true)
    expect(step.response.body.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('metadata: custom-field create/assign lifecycle recorded', () => {
    const j = load('paperless', 'metadata')
    const created = j.steps.find((s) => s.name === 'create-custom-field')
    expect(created.response.status).toBe(201)
    expect(created.response.body.data_type).toBe('string')
    const assigned = j.steps.find((s) => s.name === 'assign-custom-field')
    expect(assigned.response.status).toBe(200)
    expect(assigned.response.body.custom_fields[0].field).toBe(created.response.body.id)
  })

  it('download: original-bytes guarantee recorded', () => {
    const j = load('paperless', 'download')
    const step = j.steps.find((s) => s.name === 'download-original')
    expect(step.response.status).toBe(200)
    expect(step.notes).toMatch(/sha256=/)
    // In-session verification evidence: downloaded bytes hash-match the
    // fixture manifest sha256 (original bytes preserved).
    expect(step.notes).toMatch(/MATCH/)
    expect(step.response.body.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('permissions: denied user receives >= 400 with no metadata leakage', () => {
    const j = load('paperless', 'permissions')
    const denied = j.steps.find((s) => s.name === 'denied-cannot-retrieve')
    expect(denied.response.status).toBeGreaterThanOrEqual(400)
    // Redaction invariant: the denial body carries only the error detail — no
    // document id/title/content may leak with the denial.
    expect(Object.keys(denied.response.body)).toEqual(['detail'])
    const allowed = j.steps.find((s) => s.name === 'allowed-can-retrieve')
    expect(allowed.response.status).toBe(200)
    // contract note: recorded denial is 403 (permission) with a valid token;
    // no 401 auth-failure path exists in the captures, so the 400-floor is
    // asserted instead of a specific 401 code.
    expect(denied.response.status).toBe(403)
  })
})

describe('docuseal recordings', () => {
  it.each(DOCUSEAL_JOURNEYS)('%s: stamped with the pinned digest', (j) => {
    const recording = load('docuseal', j)
    expect(recording.upstream.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(recording.upstream.service).toBe('docuseal')
  })

  it('submissions: signer link path is /s/<slug>; completion retrieval recorded', () => {
    const j = load('docuseal', 'submissions')
    const create = j.steps.find((s) => s.name === 'create-submission')
    expect(create.notes).toMatch(/\/s\//)
    expect(create.request.body.send_email).toBe(false)
    // contract note: pinned 3.2.4 returns a bare submitter array — slug at
    // [0].slug, submission id at [0].submission_id, role key singular.
    const created = create.response.body
    expect(Array.isArray(created)).toBe(true)
    expect(created[0].slug).toMatch(/^[A-Za-z0-9]+$/)
    expect(created[0].submission_id).toBe(6)
    expect(created[0]).toHaveProperty('role')
    expect(created[0]).not.toHaveProperty('roles')
    // Hosted signer page path recorded as /s/<slug>.
    expect(create.notes).toContain('/s/gKUa4oWziVbYkf')
  })

  it('submissions: capability URLs scrubbed, completion documents via signed URL', () => {
    const j = load('docuseal', 'submissions')
    const retrieve = j.steps.find((s) => s.name === 'retrieve-completed-pdf')
    expect(retrieve.response.status).toBe(200)
    // contract note: /documents returns JSON {id, documents:[{name, url}]} —
    // the PDF bytes come from the signed per-document URL, recorded here as a
    // scrubbed capability URL plus an in-session sha256 in notes.
    expect(retrieve.response.body.documents[0].url).toBe('<redacted:capability-url>')
    expect(retrieve.notes).toMatch(/sha256\(\w+\)=[0-9a-f]{64}/)
  })

  it('progress: pre/post-completion status vocabulary from an authoritative read', () => {
    const j = load('docuseal', 'progress')
    const pending = j.steps.find((s) => s.name === 'progress-pending')
    expect(pending.response.body.status).toBe('pending')
    expect(pending.response.body.submitters[0].status).toBe('awaiting')
    const completed = j.steps.find((s) => s.name === 'progress-completed')
    expect(completed.response.body.status).toBe('completed')
    expect(completed.response.body.completed_at).toBeTruthy()
    expect(completed.response.body.submitters[0].status).toBe('completed')
  })

  it('webhook: delivery captured with signature header present on every delivery', () => {
    const j = load('docuseal', 'webhook')
    const step = j.steps.find((s) => s.name === 'deliveries')
    expect(step.response.body.length).toBeGreaterThanOrEqual(1)
    // contract note: the brief asked for a signature mention in notes; the
    // capture recorded per-delivery signature evidence, which is stronger —
    // assert presence and shape on every delivery.
    for (const delivery of step.response.body) {
      expect(delivery.signatureHeader.present).toBe(true)
      expect(delivery.signatureHeader.shape).toMatch(/^\d+\.<hmac-sha256-hex>$/)
      expect(delivery.headerNames).toContain('x-docuseal-signature')
      // Redaction invariant: the signature VALUE is never recorded.
      expect(delivery.signatureHeader).not.toHaveProperty('value')
    }
    expect(step.notes).toMatch(/signature/i)
  })

  it('webhook: observed event vocabulary is complete and duplicate-free', () => {
    const j = load('docuseal', 'webhook')
    const step = j.steps.find((s) => s.name === 'deliveries')
    const events = step.response.body.map((d) => d.body.event_type)
    // contract note: pinned 3.2.4 delivered form.viewed, form.started,
    // form.completed, submission.completed for a single-submitter API-driven
    // signing journey; deliveries are unique (no retries observed).
    expect(events).toEqual([
      'form.viewed',
      'form.started',
      'form.completed',
      'submission.completed',
    ])
    // Notification-only invariant: payload data is exactly one notification
    // body per delivery; the product reconciles against an API read.
    expect(new Set(events).size).toBe(events.length)
  })

  it('verifier-error: transport failure mapped to `error`, never a validity status', () => {
    const j = load('docuseal', 'verifier-error')
    const step = j.steps.find((s) => s.name === 'unreachable-verifier')
    expect(step.response.status).toBe(0)
    expect(step.response.body.error).toBe('ECONNREFUSED')
    expect(step.notes).toMatch(/error/)
    // The product must map this shape to the normalized outcome `error` —
    // never to unsigned/valid_trusted/valid_untrusted/invalid.
  })

  it('verifier-error: upstream malformed-input rejection also maps to `error`', () => {
    const j = load('docuseal', 'verifier-error')
    // contract note: the journey has TWO failure shapes; the brief recorded
    // only the transport one. The pinned verifier endpoint rejects malformed
    // PDF bytes with 422 {"error":"Malformed PDF"} — also `error`, never a
    // validity status.
    const step = j.steps.find((s) => s.name === 'verifier-malformed-input')
    expect(step.response.status).toBe(422)
    expect(step.response.body.error).toBe('Malformed PDF')
    expect(step.notes).toMatch(/never a validity status/)
  })
})

describe('redaction invariants (all recordings)', () => {
  const services = ['paperless', 'docuseal']
  const envSecrets = parseEnvSecrets()

  it.each(services)('%s: no unredacted credential headers or env secrets', (service) => {
    for (const file of readdirSync(join(ROOT, 'fixtures', service))) {
      const text = readFileSync(join(ROOT, 'fixtures', service, file), 'utf8')
      expect(text).not.toMatch(/Token (?!<redacted>)[^\s"]+/)
      expect(text).not.toMatch(/Bearer (?!<redacted>)[^\s"]+/)
      expect(text).not.toMatch(/X-Auth-Token":\s*"(?!<redacted>)[^"]+/)
    }
  })

  it('no DEV ONLY .env secret value leaks into any recording', () => {
    // CI-safe: deploy/local/.env may be absent; only leak-check when present.
    expect(envSecrets.length).toBeGreaterThanOrEqual(0)
    if (envSecrets.length === 0) return
    for (const service of services) {
      for (const file of readdirSync(join(ROOT, 'fixtures', service))) {
        const text = readFileSync(join(ROOT, 'fixtures', service, file), 'utf8')
        for (const secret of envSecrets) {
          expect(text).not.toContain(secret.value)
        }
      }
    }
  })
})
