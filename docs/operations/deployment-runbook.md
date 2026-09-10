# Deployment Runbook

**Status:** Draft for operations review  
**Owner:** Operations lead

## Preconditions

- Approved release, change record, image digests, migration plan, rollback plan, and security/license approvals.
- Current successful backup and confirmed restore point for the affected customer.
- Staging validation completed against the same upstream versions and configuration class.

## Local M0 stack

The disposable local stack (DEV ONLY — never for customer deployments) runs the pinned
Paperless-ngx, DocuSeal, Postgres, and Redis images by digest, from
`deploy/local/compose.yaml`. Pin authority: `deploy/upstream-versions.json`;
digest agreement is checked by `pnpm validate:compose`.

- Start: `node deploy/local/stack.mjs start` (waits for health)
- Status: `node deploy/local/stack.mjs health`
- Stop (data preserved): `node deploy/local/stack.mjs stop`
- Destroy (volumes removed): `node deploy/local/stack.mjs nuke`

Requires Docker Desktop with the daemon running. Copy `deploy/local/.env.example`
to `deploy/local/.env` first. Never put real customer documents in this stack;
fixtures are created only by the M0-C fixture work. Re-pin backing services only
via the upstream upgrade policy.

## Fixture capture session (DEV ONLY)

The M0 contract fixtures under `fixtures/` are captured live against the pinned local
stack and committed as offline replay evidence (`docs/engineering/signature-fixture-catalog.md`).
Never run a capture session with real customer documents or real signer identities;
signers are synthetic (e.g. `signer@example.com`).

### Admin provisioning

- Paperless admin: provisioned automatically from `PAPERLESS_ADMIN_USER` /
  `PAPERLESS_ADMIN_PASSWORD` in `deploy/local/.env` on the first stack start — no manual step.
- DocuSeal admin: the first-run wizard is manual and one-time per fresh stack. In the
  browser, complete first name, last name, company, email, and password, then record
  the password as `DOCUSEAL_ADMIN_PASSWORD` in `deploy/local/.env` — the capture
  session needs it for the authenticated UI setup steps.
- DocuSeal API token: Settings → API shows a single built-in token (`X-Auth-Token`);
  use the COPY button and record it as `DOCUSEAL_API_TOKEN` in `deploy/local/.env`.
  Both values live only in `deploy/local/.env`, which is not committed.
- Playwright chromium is normally already cached under `%LOCALAPPDATA%\ms-playwright`;
  run `npx playwright install chromium` only if a version-mismatch error appears.

### Session procedure

1. Start and verify the stack: `node deploy/local/stack.mjs start`, then
   `node deploy/local/stack.mjs health`.
2. Capture the Paperless contract journeys: export the SIG-001 manifest sha256
   from `fixtures/signatures/signatures-manifest.json` as `FIXTURE_SHA`
   (fail-fast: the script refuses to run without it or on a mismatch), then run
   `node scripts/capture/capture-paperless.mjs` (writes
   `fixtures/paperless/*.json`; token requests retry on the pinned build's 429
   throttle). To record only the failed-processing shape without re-running the
   success journeys, append `--only=failed-consume`.
3. Capture the DocuSeal contract journeys and SIG-007:
   `node scripts/capture/capture-docuseal.mjs`. The script starts the webhook receiver
   on host port 8300 and keeps it listening before the signing flow completes (the
   container reaches the host via `http://host.docker.internal:8300/hook`). Because
   pinned DocuSeal 3.2.4 has no template-creation API and no webhook API (UI-only,
   verified against the pinned `routes.rb` and live 404/422 probes), template and
   webhook setup run inside the script's authenticated Playwright session.
4. Redaction inspection: the capture scripts sanitize recordings and a write-guard
   refuses to write unredacted content (tokens, `.env` secret substrings, capability
   URLs, admin email). Before committing, skim the `fixtures/paperless/*.json` and
   `fixtures/docuseal/*.json` diffs and confirm no credential-shaped values remain.
5. Commit checklist: the regenerated/captured fixture bytes
   (`fixtures/signatures/*.pdf` and `signatures-manifest.json`, plus the committed test
   certificates), both recording directories (`fixtures/paperless/*.json`,
   `fixtures/docuseal/*.json`), and any replay-assertion corrections that match the new
   captures.

### Re-capture on re-pin

On any upstream re-pin (`deploy/upstream-versions.json`):

1. Re-run the fixture generators FIRST (`node scripts/generate-fixtures/generate-all.mjs`),
   before capture — regenerating after a capture session begins would swap the
   generator's certificate roots out from under the captured material. Never regenerate
   once a capture session has started.
2. Re-run both capture scripts in the order above; for a fresh DocuSeal stack, repeat
   the manual first-run wizard and re-mint the API token.
3. Diff the new recordings against the committed ones. Expect UI drift on the DocuSeal
   signing wizard — re-tune the capture selectors if steps fail, not the assertions.
4. Update replay/contract assertions only when a captured contract property changed and
   the correction does not weaken a security-relevant assertion (denial `>= 400`,
   redaction, no-false-status); escalate instead of weakening. Record contract notes
   with the assertions, and update `docs/engineering/signature-fixture-catalog.md`
   (checksums, capture dates) in the same change.
5. Write and keep every recording as UTF-8. `JourneyRecorder` writes UTF-8; do not
   post-process, re-save, or re-encode the recordings through a non-UTF-8 editor or
   shell redirection. The committed `fixtures/docuseal/submissions.json` and
   `fixtures/docuseal/webhook.json` currently carry double-encoded em-dash mojibake
   from the M0-C session; a re-capture must not reproduce or compound it, and the
   committed recordings' notes are never edited by hand.

## Deployment procedure

1. Announce the maintenance window when required and confirm monitoring coverage.
2. Verify backups, free storage, database health, queue depth, TLS certificates, and secrets are valid.
3. Deploy immutable, pinned product and worker images; apply only reviewed migrations.
4. Deploy or upgrade Paperless and DocuSeal only through their supported procedures and pinned images.
5. Run smoke tests for authentication, authorization, upload, worker processing, document retrieval, verification, signing request creation, webhook processing, and audit logging.
6. Observe service errors, queue latency, webhook failures, storage, and database performance for the defined stabilization window.
7. Mark the change complete only after the release owner accepts validation evidence.

## Rollback

If a release threatens confidentiality, integrity, availability, or data correctness, stop the rollout, disable affected feature flags or traffic, revert immutable application images, and follow the approved database rollback/restore procedure. Never run an untested destructive rollback. If a migration is irreversible, use the pre-deployment restore point and incident process.

## Approval

Release owner, operations lead, and engineering lead approve normal releases. Security lead approves security-sensitive changes. Emergency changes require an incident/change record and retrospective approval.
