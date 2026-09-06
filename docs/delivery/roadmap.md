# Implementation Roadmap

**Status:** Draft for baseline approval  
**Owner:** Delivery Lead  
**Reviewers:** Product Owner, Engineering Lead, Security Lead, Operations Lead, QA Lead  
**Last reviewed:** 2026-07-18  
**Applies to:** V1  
**Related IDs:** FR-001 through FR-009, NFR-001 through NFR-006, RISK-001 through RISK-005

## Purpose

This roadmap converts the approved V1 product and architecture direction into an executable delivery sequence. It defines the order of work, accountable roles, dependencies, milestone gates, and evidence required to advance toward production.

## Planning baseline

- **Duration:** 26 weeks to the first controlled production rollout.
- **Cadence:** Two-week implementation iterations with a demonstrated increment at the end of each iteration.
- **Core team assumption:** Product/UX lead, technical lead, two full-stack engineers, platform/security engineer, and a QA role. One person may hold more than one role, but responsibilities and approvals remain explicit.
- **Architecture:** Next.js/TypeScript product application and worker, Paperless-ngx as the document system of record, DocuSeal as a separate signing and basic PDF-verification service, and a product-owned integration database.
- **Deployment:** One isolated application and persistence boundary per customer.
- **Release approach:** Pin upstream versions and image digests; never plan production work against `latest` tags.
- **Assurance boundary:** V1 reports basic PDF signature integrity, configured certificate trust, and DocuSeal provenance. It does not claim regulated or compliance-grade signature validation.

The dates are a delivery baseline, not a promise independent of staffing. If fewer than four implementation roles are available, preserve the phase order and exit gates while extending the calendar.

## Milestones

| Milestone | Target | Outcome | Requirements |
| --- | --- | --- | --- |
| M0 — Feasibility baseline | End of week 2 | Upstream contracts, licensing path, architecture, fixtures, and delivery environment are approved. | Enables all V1 work |
| M1 — Deployable skeleton | End of week 5 | An isolated customer stack can be created, authenticated, monitored, and safely changed. | NFR-001, NFR-002, NFR-003, NFR-006 |
| M2 — DMS alpha | End of week 9 | Permitted users can upload, process, find, preview, organize, and download documents. | FR-001, FR-002, FR-003, FR-009 |
| M3 — Verification beta | End of week 13 | Original PDFs are automatically and manually verified with evidence-backed, plain-language results. | FR-004, FR-005, FR-008, NFR-004 |
| M4 — Signing beta | End of week 18 | A document can be sent, signed, imported once, linked to its source, and verified. | FR-006, FR-007, FR-008 |
| M5 — Release candidate | End of week 21 | Security, accessibility, observability, backup, restore, upgrade, and rollback controls pass. | NFR-001 through NFR-006 |
| M6 — Pilot accepted | End of week 25 | A representative customer completes the V1 journeys and operations demonstrate support readiness. | All V1 requirements |
| M7 — Controlled production | Week 26 onward | Customers are provisioned one at a time under measured release and rollback controls. | All production gates |

## Phase 0 — Evidence, decisions, and project bootstrap

**Schedule:** Weeks 1–2  
**Accountable:** Technical Lead  
**Supporting:** Product, Security, Operations, Legal/Procurement, QA

### Deliverables

- Initialize the product repository, ownership rules, branch protections, formatting, static checks, tests, dependency updates, and documentation validation.
- Pin the initial Paperless-ngx and DocuSeal releases by tag, commit, and container digest.
- Capture Paperless request/response fixtures for authentication, users, permissions, upload, task polling, search, preview, metadata, and download.
- Capture DocuSeal fixtures for submission creation, progress, completion, completed-document retrieval, verification, and webhook behavior.
- Prove the verification adapter against unsigned, valid, external, tampered, malformed, and multi-signature PDFs.
- Approve the service boundaries, data ownership, document lifecycle, normalized status model, product API, and ADRs.
- Decide the DocuSeal commercial-license path for embedded signing, form building, white-label behavior, API use, and customer deployment.
- Establish the target hosting pattern, identity approach, secrets mechanism, storage encryption approach, malware-scanning approach, monitoring stack, and preliminary RPO/RTO.
- Create a prioritized backlog with requirement IDs and testable acceptance criteria.

### Exit gate

- No unresolved architecture decision blocks M1.
- The DocuSeal commercial path is approved or an explicit community-feature fallback is selected.
- Contract fixtures run successfully against pinned upstream builds.
- Counsel-owned licensing questions are recorded and assigned; no unreviewed proprietary-boundary assumption is treated as fact.
- The team can start, test, and stop a disposable local stack without using real customer documents.

## Phase 1 — Platform and deployable skeleton

**Schedule:** Weeks 3–5  
**Accountable:** Platform/Security Engineer  
**Supporting:** Technical Lead, Full-stack Engineers, QA

### Deliverables

- Implement the Next.js application/API boundary, worker process, product database migrations, Redis-backed job transport, and typed configuration.
- Create repeatable local, CI, test, staging, and per-customer deployment definitions using pinned artifacts.
- Route public traffic through TLS termination; keep upstream admin, database, queue, and storage endpoints private.
- Implement the chosen authentication/session flow, CSRF controls, Paperless identity mapping, and authorization checks.
- Add correlation IDs, structured redacted logs, health/readiness checks, feature flags, and audit-event foundations.
- Define durable idempotency, retry, timeout, and dead-letter behavior for background work.
- Implement secrets injection without exposing upstream credentials to browser bundles or logs.
- Provision one disposable isolated stack and prove that its data cannot be reached from another test stack.

### Exit gate

- Authentication, session expiration, CSRF, and basic permission tests pass.
- Product credentials are absent from generated browser assets and routine logs.
- A failed worker job retries without duplicating durable product records.
- The stack is deployable and removable using documented procedures.

## Phase 2 — Core DMS vertical slice

**Schedule:** Weeks 6–9  
**Accountable:** Full-stack Lead  
**Supporting:** Product/UX, Paperless Integration Engineer, QA

### Deliverables

- Implement document upload through Paperless, asynchronous processing status, and recoverable upload errors.
- Implement browse, full-text search, filtering, sorting, pagination, preview, download, metadata, tags, and permitted metadata changes.
- Preserve Paperless as the authorization authority for document operations; test owner, group, and object-level permission cases.
- Show original, OCR/archive derivative, processing history, and linked-document concepts without modifying signed originals.
- Provide responsive, keyboard-operable UI states for empty, pending, success, partial-failure, forbidden, and unavailable cases.
- Preserve access to Paperless administration as an operations-only fallback.
- Add contract, integration, and browser coverage for the core document journeys.

### Exit gate

- FR-001, FR-002, FR-003, and FR-009 acceptance scenarios pass against the pinned Paperless build.
- A user cannot retrieve or mutate a document that Paperless does not authorize for that user.
- Upload and processing failures are observable and safely retryable.
- The DMS alpha is demonstrated using non-sensitive fixtures in an isolated staging stack.

## Phase 3 — Signature-verification vertical slice

**Schedule:** Weeks 10–13  
**Accountable:** Integration Lead  
**Supporting:** Signature/PKI Reviewer, Product/UX, QA, Security

### Deliverables

- Queue verification after Paperless ingestion completes and provide an authorized manual re-verification action.
- Download and hash the untouched original with SHA-256; do not verify OCR/archive derivatives as though they were the signed source.
- Implement a versioned DocuSeal compatibility adapter and normalize responses into independent integrity, trust, and provenance dimensions.
- Store immutable verification reports containing source document/version IDs, hash, policy version, adapter/upstream versions, timestamps, per-signature evidence, and structured failures.
- Implement the canonical outcomes: `unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, and `error`.
- Present a concise result with expandable technical evidence, clear limitations, and accessible status cues that do not depend on color alone.
- Add timeout, unavailable-verifier, malformed-response, replay, and retry handling.
- Complete the approved signature-fixture catalog and deterministic contract tests.

### Exit gate

- Every approved fixture produces the expected integrity, trust, provenance, and overall outcome.
- Provenance never changes the cryptographic validity outcome.
- Verification history is preserved across manual rechecks and adapter upgrades.
- Customer-facing language passes product and legal review for the V1 assurance boundary.
- FR-004, FR-005, FR-008, and NFR-004 pass.

## Phase 4 — Signing workflow vertical slice

**Schedule:** Weeks 14–18  
**Accountable:** Integration Lead  
**Supporting:** Product/UX, Full-stack Engineers, QA, Operations

### Entry dependency

Do not implement commercial or white-label DocuSeal capabilities until the Phase 0 commercial-license gate is approved.

### Deliverables

- Let an authorized document manager select an eligible Paperless original and configure recipients, roles, ordering, expiration, and delivery preferences supported by the licensed DocuSeal tier.
- Create idempotent product signature requests and DocuSeal submissions without exposing DocuSeal credentials to the browser.
- Track request and recipient progress through the canonical state machines.
- Process completion events through a private or authenticated webhook route, persist the receipt, enqueue follow-up work, and re-fetch authoritative DocuSeal state.
- Retrieve the completed PDF and import it into Paperless exactly once as a new document linked to the preserved source.
- Queue verification of the completed PDF and show its request, source, output, signer, and verification relationships.
- Implement cancellation, decline, expiration, partial failure, delayed webhook, duplicate webhook, and DocuSeal-unavailable behavior.
- Record audit events without logging document contents, credentials, signed URLs, or unnecessary recipient information.

### Exit gate

- A complete end-to-end signing journey passes with an external test signer.
- Duplicate or reordered events never create more than one imported completed document.
- Unauthorized users cannot create, view, cancel, or retrieve requests for inaccessible documents.
- The unsigned source remains unchanged and recoverable.
- FR-006, FR-007, and the signing portions of FR-008 pass.

## Phase 5 — Security, resilience, accessibility, and release candidate

**Schedule:** Weeks 19–21  
**Accountable:** Security and Operations Leads  
**Supporting:** Engineering, Product/UX, QA

### Deliverables

- Close or risk-accept all threat-model findings required for the pilot.
- Enforce upload type/size controls, malware handling, rate limits, least privilege, storage encryption, backup encryption, and secrets/certificate rotation.
- Complete accessibility review of the core DMS, verification, and signing journeys against the documented WCAG 2.2 AA target.
- Add monitoring and alerting for availability, latency, queue age, OCR failure, verification failure, signing failure, webhook backlog, certificate expiry, storage, database health, backup freshness, and restore-test age.
- Execute coordinated backup/restore, upgrade, migration, rollback, customer-isolation, and failure-recovery rehearsals.
- Produce the SBOM, attribution notices, corresponding-source procedure, change record, deployment evidence, and support runbooks.
- Run performance and capacity tests using an approved representative data set.

### Exit gate

- No unresolved critical/high security or data-integrity defect remains.
- All critical browser journeys pass accessibility review.
- An independent operator restores a complete customer stack within approved recovery objectives and reconciles cross-system mappings.
- Upgrade and rollback rehearsals pass for every pinned component.
- Release-candidate approval is signed by Engineering, Security, Operations, QA, Product, and the required legal/commercial reviewers.

## Phase 6 — Controlled pilot

**Schedule:** Weeks 22–25  
**Accountable:** Product Owner  
**Supporting:** Engineering, Operations, Security, QA, Customer Success

### Deliverables

- Provision one internal validation stack and one approved pilot-customer or representative staging stack.
- Import only approved pilot data after privacy, retention, support, and backup expectations are accepted.
- Train administrators and operators using the plain-language documentation and runbooks.
- Observe product and operational metrics, support cases, failed jobs, verification interpretation, signer completion, and restore readiness.
- Triage pilot findings into release blockers, scheduled improvements, or explicitly accepted risks.
- Re-run security, accessibility, data-integrity, backup, and rollback gates after pilot fixes.

### Exit gate

- The pilot completes every V1 journey using representative documents and roles.
- No unresolved release-blocking issue or unapproved legal/commercial assumption remains.
- Product, pilot sponsor, Engineering, Security, Operations, and QA approve production readiness.
- Support ownership, escalation, maintenance windows, and customer communications are ready.

## Phase 7 — Production rollout and steady-state delivery

**Schedule:** Week 26 onward  
**Accountable:** Release Owner  
**Supporting:** Operations, Engineering, Security, Product, Customer Success

### Deliverables

- Provision customers one at a time using immutable, pinned releases and the approved customer-provisioning runbook.
- Run customer-specific preflight, smoke, backup, monitoring, security, attribution, and rollback checks.
- Observe each deployment through its stabilization window before beginning the next rollout.
- Review upstream Paperless, DocuSeal, runtime, and dependency updates on a scheduled cadence; test them in disposable and staging environments before release.
- Track outcome metrics, operational load, residual risk, accessibility regressions, verification errors, signing completion, and recovery-drill results.
- Use the traceability matrix and ADR process to control scope and architecture changes.

### Per-customer production gate

- Customer data, domain, secrets, certificates, storage, databases, monitoring, and backups are isolated and verified.
- Authentication, upload, search, verification, signing, signed-document import, and audit smoke tests pass.
- Backup freshness and rollback evidence are current.
- Required licenses, notices, attribution, and source-access obligations are satisfied for the exact release.

## Parallel workstreams

| Workstream | Runs throughout | Primary owner |
| --- | --- | --- |
| Product and UX | Requirements, research, prototypes, content, accessibility, pilot feedback | Product/UX Lead |
| Platform | Environments, CI/CD, isolation, configuration, releases | Platform Engineer |
| Paperless integration | API contracts, permissions, document lifecycle, upgrades | Full-stack/Integration Engineer |
| DocuSeal and signatures | Adapter, fixtures, signing workflows, upstream compatibility | Integration Lead |
| Security and compliance | Threats, privacy, secrets, licenses, claims, evidence | Security Lead with counsel/procurement approvals |
| Quality engineering | Unit, contract, integration, browser, security, operations, and regression tests | QA Lead |
| Operations and support | Monitoring, backup, recovery, incidents, customer provisioning | Operations Lead |
| Documentation | Technical source of truth and one-to-one plain-language companions | Documentation Lead |

## Critical dependencies

1. Upstream version pinning and contract fixtures precede production adapter work.
2. Architecture, data ownership, and authorization decisions precede DMS feature development.
3. Customer isolation, secrets, identity, and durable job behavior precede document and signing workflows.
4. Verification fixtures and normalization precede verification UI approval.
5. DocuSeal commercial approval precedes embedded or white-label signing implementation.
6. Idempotent webhook reconciliation precedes completed-document import.
7. Security, accessibility, restore, upgrade, rollback, licensing, and support gates precede the pilot.
8. Pilot acceptance precedes any production customer deployment.

## Definition of implementation-ready

A backlog item may enter an iteration only when it has:

- A requirement or risk/control ID.
- A named owner and reviewers.
- An approved user-visible outcome or operational outcome.
- Defined authorization and data-handling behavior.
- Approved interface/state contracts where applicable.
- Testable acceptance criteria and required fixtures.
- Known upstream, licensing, security, and operational dependencies.

## Definition of done

A delivery item is done only when:

- Code, configuration, migrations, and documentation are reviewed.
- Unit and affected contract/integration/browser tests pass.
- Authorization, retry, idempotency, audit, accessibility, and failure behavior are verified as applicable.
- Logs contain correlation data without prohibited sensitive content.
- Monitoring, support, rollout, and rollback behavior are documented.
- The technical document and plain-language companion remain synchronized.
- Traceability links the requirement to the delivered evidence.

## Schedule control

- Review roadmap health at the end of every iteration.
- Treat failed milestone gates as schedule changes, not paperwork exceptions.
- Record scope additions through the PRD and traceability matrix before committing them to a milestone.
- Escalate any threat to the critical path in the central risk register with an owner, trigger, mitigation, and contingency.
- Preserve the architecture and release gates if staffing or dates change.
