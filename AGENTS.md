# AGENTS.md

First-stop guide for AI agents and engineers in this repository. Read it before planning, editing, or generating implementation code. Full detail lives in `docs/` (index: `docs/README.md`; plain-language companions under `docs/nontechnical/`; ADRs in `docs/architecture/architecture-decisions/` take precedence over conflicting narrative).

## Project

Doculite is a customer-isolated document-management product. Paperless-ngx is the document system of record (bytes, identity, metadata, permissions). DocuSeal is a separate service for signing workflows and basic embedded-PDF signature verification. A product-owned Next.js/TypeScript app and background worker provide the UI, orchestration, normalized verification results, and cross-system mappings. One isolated deployment and persistence boundary per customer.

## Current state

- Documentation-first through the M0 bootstrap: the repository now has a pnpm workspace (apps/web Next.js scaffold, apps/worker, packages/shared), Biome lint/format, Vitest tests, docs validation, GitHub Actions CI, and Dependabot.
- Upstream versions are pinned in `deploy/upstream-versions.json` (Paperless-ngx, DocuSeal); re-pin only via the upgrade policy. Still no product features, database, or upstream integrations above the scaffold.
- Before coding, confirm the task belongs to the current roadmap phase (`docs/delivery/roadmap.md`, baseline M0–M7, 26 weeks) and its entry dependencies are satisfied.
- Quality gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm validate:docs`, `pnpm build` — all must pass; CI enforces them on every push/PR to main.
- Upstream Paperless-ngx/DocuSeal tags, commits, and container digests must be pinned and recorded during M0 — never build against `latest`.
- The DocuSeal commercial-license path (`docs/compliance/commercial-license-decision.md`) is a blocking decision. Keep gated features (embedded signing, template building, white-label) disabled behind flags until approval is recorded.

## Architectural invariants (require an ADR change to alter)

- Services communicate through authenticated APIs and events. Never query an upstream database, mutate an upstream storage volume, or import upstream internal code (see ADR-007, ADR-008).
- Paperless-ngx is authoritative for documents and document permissions; DocuSeal for active submissions and completed signing artifacts; the product database for mappings, product request states, idempotency records, and normalized verification reports.
- Upstream credentials stay server-side — never in browser bundles, browser storage, URLs, routine logs, or error responses.
- A completed signed PDF is imported into Paperless as a new linked document. Never overwrite the unsigned original, and verify the untouched original bytes, not an OCR/PDF-A derivative.
- Integrity, certificate trust, and DocuSeal provenance are separate facts; provenance never changes cryptographic validity.
- Retried APIs, jobs, webhooks, and imports must be idempotent. Webhook payloads are notifications only: persist receipt and reconcile against an authoritative DocuSeal API read.
- Per-customer isolation covers services, databases, files, secrets, certificates, monitoring, and backups.

## Canonical vocabularies (use exactly)

- Verification outcomes: `unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, `error`. Do not describe V1 results as eIDAS/QES, PAdES-LT/LTA, compliance-certified, non-revoked, or legally conclusive (`docs/signatures/verification-policy.md`).
- Signing states: follow the state machine in `docs/signatures/signing-state-machine.md`. No UI-only states that cannot be derived from a durable upstream or product state.

## Licensing and source boundaries

- Paperless-ngx is GPLv3; DocuSeal is AGPLv3 with additional attribution terms in the community repository.
- Keep product code independently authored and separated by service/API boundaries. Do not copy upstream frontend code, components, assets, internal packages, or branding.
- Do not claim code separation resolves legal obligations; record engineering facts and route conclusions to counsel.
- Preserve upstream notices, source-offer obligations, modification records, and attribution for the exact distributed release (`docs/compliance/open-source-licensing.md`).

## Documentation rules

- A technical document and its `docs/nontechnical/` companion change together when behavior or commitments change.
- Update `docs/integrations/openapi.yaml` before or with product API changes; update the relevant ADR when changing an invariant.
- Link new requirements to `docs/delivery/requirements-traceability.md` and material risks to `docs/delivery/risk-register.md` using stable IDs (`FR-*`, `NFR-*`, `SEC-*`, `PRIV-*`, `LIC-*`, `OPS-*`, `RISK-*`, `TEST-*`).
- Approved documents may not contain unresolved `TODO`/`TBD`; use an owned risk, issue, or decision record instead.
- Code and doc examples must state what they do, where they belong, which values are placeholders, and any security/environment assumptions. Never include real credentials, customer identifiers, document contents, signing links, or private keys.

## Working process

1. Read this file and the relevant source-of-truth docs; inspect the working tree before editing.
2. Identify the requirement, ADR, API contract, control, and milestone for the task; make the smallest coherent change within the approved architecture.
3. Test permitted, forbidden, retry, duplicate, timeout, and terminal-failure paths as applicable.
4. Comment intent and non-obvious constraints (idempotency keys, retries, locks, hashes, state transitions, pinned upstream contracts, version/byte-stream selection, security boundaries). Style details: `docs/engineering/coding-and-review-standards.md`.
5. Validate formatting, types, tests, OpenAPI, links, secrets, accessibility, and operational impacts appropriate to the change.
6. Report what changed, evidence, residual risk, and any human approval still required.

## Safety rules

- Use fixture documents only in development and automated tests (`docs/engineering/signature-fixture-catalog.md`).
- Never expose or log real document bytes, OCR text, signer contact data, credentials, private keys, signed URLs, or excessive certificate detail.
- No destructive database, storage, or migration operations without resolving the exact customer and recovery target. Preserve originals, audit evidence, idempotency records, and cross-system mappings during recovery.
- Escalate legal, privacy, signature-assurance, retention, and commercial-license decisions to their human owners.
