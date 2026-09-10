# Requirements Traceability

**Status:** Draft for baseline approval  
**Owner:** Documentation Program Lead  
**Reviewers:** Product Owner, Engineering Lead, QA Lead  
**Last reviewed:** 2026-09-10  
**Applies to:** V1

| Requirement | Primary journey | Architecture / decision | Interface or control | Planned evidence | Milestone |
| --- | --- | --- | --- | --- | --- |
| FR-001 Upload documents | Document manager uploads and observes processing | System architecture; document lifecycle; ADR-001 | Paperless upload/task adapter | TEST-INGEST-UPLOAD-* | M2 — DMS alpha |
| FR-002 Browse, search, preview, tag, download | Permitted user finds and manages a document | ADR-001; authentication and identity | Paperless document/search/metadata adapters | TEST-DMS-*; TEST-PERM-* | M2 — DMS alpha |
| FR-003 Metadata and processing history | User distinguishes source, derivatives, and linked outputs | Document lifecycle; data model; ADR-005 | Product document view | TEST-DOC-DETAIL-* | M2 — DMS alpha |
| FR-004 Automatic and manual verification | User receives evidence for the untouched original | Verification policy; ADR-006; ADR-007 | Verification API and worker | TEST-VERIFY-* | M3 — Verification beta |
| FR-004 Automatic and manual verification | Adapter proves integrity, trust, and provenance for each captured signature fixture (offline) | Verification policy; ADR-006; ADR-007; M0-D adapter design | Product-owned verification adapter (packages/verification) | TEST-VERIFY-MATRIX-001 — fixture outcome matrix suite (packages/verification/test/matrix.test.ts) | M0 — Verification adapter |
| FR-004 Automatic and manual verification | Adapter result model invariants hold for every fixture scenario | Verification policy; ADR-006; ADR-007; M0-D adapter design | Product-owned verification adapter (packages/verification) | TEST-VERIFY-INVARIANTS-001 — result-model invariant suite (packages/verification/test/invariants.test.ts) | M0 — Verification adapter |
| FR-005 Plain-language verification result | User understands integrity, trust, provenance, and limitations | Verification policy; UX specification | Verification report UI | TEST-VERIFY-UI-*; TEST-A11Y-* | M3 — Verification beta |
| FR-006 Send for signature | Document manager creates a recipient workflow | Signing state machine; ADR-002; ADR-007 | Signature-request API | TEST-SIGN-CREATE-* | M4 — Signing beta |
| FR-007 Track and import completed PDF | User sees progress and a linked signed output | Document lifecycle; ADR-005 | DocuSeal webhook/retrieval and Paperless import adapters | TEST-SIGN-COMPLETE-*; TEST-IDEMPOTENCY-* | M4 — Signing beta |
| FR-008 Audit events | Authorized reviewer traces product and integration actions | Data model; security architecture | Audit-event service and redacted logs | TEST-AUDIT-* | M3–M5 |
| FR-009 Paperless administration fallback | Operator recovers from product UI issues | Deployment topology; ADR-001 | Private/admin route and operations procedure | TEST-OPS-FALLBACK-* | M2 — DMS alpha |
| NFR-001 Per-customer isolation | Operator provisions and removes a customer stack | Deployment topology; ADR-004 | SEC-ISOLATION-*; OPS-PROVISION-* | TEST-ISOLATION-* | M1 and M5 |
| NFR-002 Server-only credentials | User never receives upstream service credentials | System architecture; ADR-003 | Secret injection and BFF boundary | TEST-SECRET-*; bundle scan | M1 and M5 |
| NFR-003 Idempotent APIs and jobs | Retries do not duplicate durable outcomes | Data model; ADR-007 | Idempotency store, queue, webhook receipts | TEST-IDEMPOTENCY-* | M1 and M4 |
| NFR-004 Basic-verification claims only | Product avoids unsupported legal claims | Verification policy; licensing documents | Approved content and limitation notices | TEST-CONTENT-*; legal review record | M3 and M5 |
| NFR-005 WCAG 2.2 AA design target | Core journeys work with accessible interaction | Design-system accessibility specification | Accessible components and browser behavior | TEST-A11Y-*; manual review | M2–M5 |
| NFR-006 Pinned and recoverable releases | Operator can upgrade and roll back safely | Upstream upgrade policy; release runbook | Artifact pinning, migration and rollback controls | TEST-UPGRADE-*; TEST-RESTORE-* | M0, M5, M7 |

## Maintenance rule

No V1 requirement may enter a production release unless its planned evidence is linked to an executed test, review record, or operational drill for the exact release candidate.
