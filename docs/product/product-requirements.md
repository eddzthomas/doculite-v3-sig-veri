# Product Requirements

**Status:** Draft for approval  
**Owner:** Product Lead  
**Source of truth for:** V1 product requirements

## Personas

- **Administrator:** configures users, permissions, retention settings, trust material, and integrations.
- **Document manager:** uploads, organizes, searches, reviews, and sends documents for signature.
- **Viewer:** finds and reads documents explicitly shared with them.
- **External signer:** completes a DocuSeal signing session without access to the DMS.
- **Operator:** provisions, monitors, restores, and upgrades a customer stack.

## Functional requirements

| ID | Requirement | Acceptance outcome |
|---|---|---|
| FR-001 | Upload documents through the product UI. | File is consumed by Paperless and its processing state is visible. |
| FR-002 | Browse, search, filter, preview, tag, and download permitted Paperless documents. | Results and access match Paperless permissions. |
| FR-003 | Show document metadata and processing history. | UI identifies original, archive/OCR derivatives where available, and linked signed copies. |
| FR-004 | Automatically verify the untouched original after ingestion and on demand. | Report stores hash, time, verifier version, policy version, and normalized status. |
| FR-005 | Show a plain-language verification summary with detailed evidence for permitted users. | `unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, and `error` are visually distinct. |
| FR-006 | Send an eligible document through DocuSeal for signature. | Request captures recipients, order, and request state. |
| FR-007 | Track signing progress and import the authoritative completed PDF. | Completed PDF is a new Paperless document linked to its source. |
| FR-008 | Record operationally useful audit events. | Actions and integration events are traceable without logging document contents. |
| FR-009 | Provide Paperless administration as an operational fallback. | Operators can recover from product UI issues without bypassing upstream authorization. |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-001 | One deployment and persistence boundary per customer. |
| NFR-002 | API tokens and service credentials never reach browser code or storage. |
| NFR-003 | Product APIs and background jobs are idempotent where retries are possible. |
| NFR-004 | All user-visible verification claims describe basic PDF validation only. |
| NFR-005 | Core workflows meet WCAG 2.2 AA design requirements. |
| NFR-006 | Releases use pinned upstream versions and tested upgrade/rollback procedures. |

## Out of scope

No regulatory compliance guarantee, eIDAS/QES determination, revocation checking, long-term archival-signature validation, shared tenancy, mobile-native app, or custom fork of upstream code in V1.

