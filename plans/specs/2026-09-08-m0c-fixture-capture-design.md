# M0-C Fixture Capture — Design

**Status:** Approved (design conversation 2026-09-08)
**Scope:** M0 sub-project C of Phase 0 (Evidence, decisions, project bootstrap)
**Spec owner:** Technical Lead
**Depends on:** M0-A upstream pinning (`deploy/upstream-versions.json`), M0-B local stack (`deploy/local/`, main @ `56489da`)

## Purpose

Produce the Phase 0 contract fixtures the roadmap exit gate requires: "Contract fixtures run successfully against pinned upstream builds." This sub-project captures Paperless-ngx and DocuSeal API fixtures from the pinned local stack, generates the SIG-001..009 signature fixture set, and delivers an offline replay harness that asserts the contract properties the product depends on. It does NOT build the verification adapter (M0-D), define the trust policy (M0-D consumes the committed cert material), or resolve the DocuSeal commercial-license path (LIC-001 stays open; only the *public hosted* signing page is automated).

## Decisions (recorded from design conversation)

1. **Fixture shape:** recordings + replay runner. A captured fixture is a committed request/response recording plus offline contract assertions — not merely stored JSON.
2. **Fixture provenance:** all signature PDFs synthetic, self-signed by our own generated CAs. No third-party CAs, no real identities, fully shareable. SIG-002 "trusted" means the candidate policy includes root-A; SIG-003 "untrusted" means root-B is not in policy.
3. **Storage:** fixture PDFs, cert material, and recordings are committed under `fixtures/`, with generator scripts committed for provenance. Checksums recorded per fixture.
4. **SIG-007 signing flow:** committed Playwright capture script drives the PUBLIC hosted signing page headlessly. Playwright is capture-only (devDependency), never CI.

## Deliverable layout

```
fixtures/
  signatures/
    sig-001.pdf … sig-009.pdf        (SIG-009 has no PDF — scenario fixture, see below)
    root-a.pem / root-a-leaf.pem     (SIG-002/004/005/006 trust path)
    root-b.pem / root-b-leaf.pem     (SIG-003/006/008 trust path)
    signatures-manifest.json         id, condition, sha256, generator + generator version,
                                     expected outcome, cert/trust note, captured-at, upstream digest
  paperless/                         one JSON recording per journey
  docuseal/                          same format
scripts/
  generate-fixtures/                 committed generators (PDF + cert material)
  capture/                           live capture harness (recorder, sanitizer, webhook receiver)
  replay/                            offline replay harness (Vitest suites, part of pnpm test)
```

## Recording format

One JSON file per journey. Array of steps:

```json
{
  "journey": "documents/upload-poll-download",
  "capturedAt": "<ISO8601>",
  "upstream": { "service": "paperless-ngx", "imageDigest": "sha256:…" },
  "steps": [
    {
      "name": "create-token",
      "request":  { "method": "POST", "path": "/api/token/", "headers": { "<sanitized>" }, "body": { "<sanitized>" } },
      "response": { "status": 200, "headers": { "<sanitized>" }, "body": { } },
      "notes": "<contract observation, e.g. token shape, expiry>"
    }
  ]
}
```

- Secrets (passwords, tokens, cookies, session identifiers) are replaced with `<redacted>` by the sanitizer at capture time. A recording containing a raw secret must fail the replay suite.
- `upstream.imageDigest` is the drift anchor: replay may assert recordings were captured against the currently pinned digest (warn on mismatch, hard-fail only where the assertion depends on behavior that changed).
- Redaction and sanitization rules live in one shared module (`scripts/capture/lib/sanitize.mjs`) with offline tests.

## Journeys to capture

### Paperless-ngx (pinned build)

| Journey | Steps | Contract properties asserted at replay |
|---|---|---|
| auth | obtain token for admin | token shape, header usage, wrong-credential behavior |
| upload-polling | upload fixture PDF; poll task/document status to completion; also capture a failed-processing case | async status vocabulary, success + failure transitions, processing latency semantics |
| search-list | list documents, paginate, filter by query | pagination shape, sort/filter params, result envelope |
| preview | fetch thumbnail/preview of uploaded doc | content type, status for missing preview |
| metadata | read + update custom fields/metadata on the doc | field types, permission requirement |
| download | download original bytes; assert sha256 equals fixture checksum | retrieval route returns untouched original bytes |
| permissions | three accounts (owner / allowed user / denied user): list, retrieve, update attempts across the matrix | denial status codes, non-leakage of forbidden metadata |

### DocuSeal (pinned build)

| Journey | Steps | Contract properties asserted at replay |
|---|---|---|
| submissions | create template/submission from base PDF, add recipients, obtain signing URL | request/response shapes, signer/link fields |
| progress | poll submission/recipient progress pre-completion | status vocabulary |
| completion | Playwright completes the hosted signing page; poll to completion; retrieve completed PDF (→ committed as SIG-007) | completed-document retrieval route; PDF bytes hashable |
| webhook | configure webhook to local receiver; capture delivery payload(s) during completion; record observed duplicate-delivery behavior | payload shape, signature/auth header presence, reconcile-before-trust rule inputs |

Webhook receiver: tiny host-run HTTP server bound to `127.0.0.1`, recording headers + payloads. The receiver is a capture tool, not product code. Any webhook payload is treated as notification-only; recordings feed the M1+ reconcile design, not trust.

## Signature fixtures

Construction summary (full construction recipes in the generator scripts):

| Fixture | Construction | Expected product outcome |
|---|---|---|
| SIG-001 | pdf-lib only, no signature | `unsigned` |
| SIG-002 | leaf rooted in root-A; root-A recorded as candidate policy anchor | `valid_trusted` |
| SIG-003 | leaf rooted in root-B (independent CA), not in policy | `valid_untrusted` |
| SIG-004 | SIG-002 bytes altered after signing | `invalid` |
| SIG-005 | SIG-002 with corrupted PKCS#7 container | `error` or documented `invalid` |
| SIG-006 | dual-signed (root-A signature + root-B signature) | documented aggregate + per-signature evidence |
| SIG-007 | live-captured completed DocuSeal document | validity independent from provenance |
| SIG-008 | valid external signature (root-B path, distinct document) | validity independent from provenance |
| SIG-009 | no PDF — scenario fixture: recorded verifier-unreachable / error exchanges | `error`, retry behavior, no false status |

- SIG-007's base document is a fresh synthetic PDF (not a reuse of SIG-001 bytes) so hashes stay distinct.
- Certificates are generated by `node-forge`; key material is random per generation — reproducibility comes from committed generators + committed artifacts, not from deterministic regeneration. Fixture checksums are of the committed bytes.
- The normalized vocabulary used above is defined in `docs/signatures/verification-policy.md`; fixtures never introduce new outcome words.

## Capture harness and operational rules

- `scripts/capture/*.mjs` require the M0-B stack running (`node deploy/local/stack.mjs start`). They are live-only operations documented in the deployment runbook — never CI, never offline tests.
- Capture is a **session**, not a daemon: run the scripts in sequence, commit the resulting recordings + fixtures in the same change set, record the session (upstream digests, date) in the runbook.
- Playwright: devDependency, pinned version, capture-only. It automates the public hosted signing page at `http://127.0.0.1:<port>/s/<slug>`. No embedded signing, no license-gated features.
- DocuSeal webhook configuration is set via its API during capture and torn down with the stack (nuke); nothing persists outside `fixtures/` and the (gitignored) local stack data.

## Replay harness

- Offline Vitest suites under `scripts/replay/` load committed recordings and assert the contract properties listed per journey above. Part of the root `pnpm test` gate — offline, no daemon, no network.
- Also asserts fixture-manifest integrity: every committed fixture's sha256 matches `signatures-manifest.json`; every recording's redaction invariants hold (no token-shaped strings outside `<redacted>` markers).
- These assertions are the executable form of `docs/integrations/paperless-integration.md` and `docs/integrations/docuseal-integration.md`; where a captured behavior contradicts those documents, the document is corrected in the same change set (docs rule: technical + nontechnical companions together).

## Documentation changes (same change sets as behavior)

- `docs/engineering/signature-fixture-catalog.md`: fill in per-fixture checksum, capture date, generator, expected outcome columns; Status Draft → Active; re-baseline rule stays.
- `docs/operations/deployment-runbook.md`: "Fixture capture session" section (start stack → run capture scripts in order → commit artifacts); nontechnical companion updated in the same commit.
- `docs/integrations/*.md`: only if capture contradicts them (corrective).
- Update `docs/delivery/requirements-traceability.md` links for the fixture deliverables if stable IDs apply.

## Global constraints (binding for the plan)

- **No upstream internals:** capture only through documented APIs; never read upstream databases or storage volumes.
- **Secrets redaction:** sanitizer at capture time; replay suite rejects unredacted recordings. Dev-only stack credentials never committed (`.env` stays gitignored).
- **Offline CI:** all committed tests run without Docker or network. Live capture is a documented manual session.
- **Digest-pinned sources:** recordings record the pinned upstream digest; fixtures record generator + checksum.
- **Conventional commits; no LICENSE changes; PR flow** with `quality` check green, squash-merge to protected `main` (feature branch `m0c-fixture-capture`).
- **Vocabulary discipline:** fixture expected-outcomes use only `unsigned | valid_trusted | valid_untrusted | invalid | error`.

## Exit evidence

1. `pnpm test` green offline, including replay suites + fixture-manifest integrity checks.
2. Committed recordings for every journey above, stamped with the pinned upstream digest.
3. `fixtures/signatures/` complete for SIG-001..009 with matching manifest checksums; catalog doc Active.
4. Capture session documented in runbook (technical + nontechnical), including how to re-capture on upstream re-pin.
5. PR merged with `quality` green; final whole-branch review completed.

## Non-goals

- Verification adapter and normalized-result pipeline (M0-D).
- Trust-policy definition (M0-D consumes root-A/root-B material).
- DocuSeal commercial-license decision (LIC-001, human-owned).
- CI wiring of live capture (forbidden by design — live capture is never CI).
- Real-world CA fixtures or third-party fixture catalogs.
