# Product Integration Data Model

**Status:** Draft for implementation design  
**Owner:** Architecture team  
**Applies to:** V1

The product database stores integration information and does not duplicate Paperless's complete document index or DocuSeal's complete submission model.

| Entity | Required fields | Notes |
|---|---|---|
| `document_link` | product ID, Paperless document ID, relationship type, source document ID, created time | Links originals, completed files, and related artifacts. |
| `verification_run` | ID, Paperless document ID, SHA-256, source retrieval time, policy version, adapter version, status, raw report reference, started/completed times | Append-only result history; `status` is normalized. |
| `signature_finding` | verification run ID, ordinal, integrity result, trust result, signer summary, signing-time summary, provenance result | One row per detected signature where the verifier can provide it. |
| `signing_request` | ID, source Paperless ID, DocuSeal template/submission IDs, state, initiator, created/updated times, completion Paperless ID | Product lifecycle projection. |
| `signing_recipient` | request ID, external recipient reference, routing order, recipient state | Store only necessary recipient data. |
| `webhook_receipt` | provider event ID or derived idempotency key, payload digest, received time, result, correlation IDs | Enables duplicate detection and audit. |

## Constraints

- External IDs are opaque strings; code must not depend on their format.
- Raw verifier output is retained as evidence with access controls and must be versioned by adapter/schema version.
- SHA-256 identifies evaluated bytes, not a claim that content is safe, trusted, or legally binding.
- Product data deletion must preserve referential integrity and follow approved retention policy; no deletion rules are assumed here.

## State ownership

Paperless document permissions are evaluated before product operations that reveal document-related data. The product's request and verification states are not substitutes for Paperless authorization.

