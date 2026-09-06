# Test and Acceptance Plan

**Status:** Draft for approval  
**Owner:** QA and Engineering Lead

## Test layers

- **Unit:** normalization, hashes, state transitions, authorization adapters, and retry policy.
- **Contract:** product clients against pinned Paperless and DocuSeal request/response fixtures.
- **Integration:** upload through Paperless processing, verifier jobs, DocuSeal submissions, webhooks, completed-PDF import, and mappings.
- **Browser:** accessible user workflows across documents, verification, signing, and errors.
- **Security:** authorization separation, CSRF/session behavior, webhook validation, secret exposure, upload limits, and audit redaction.
- **Operations:** backup/restore, upgrade rehearsal, rollback, monitoring alerts, and customer isolation.

## Acceptance scenarios

1. A permitted user uploads and searches a document; a forbidden user cannot retrieve it through UI or API.
2. Automatic verification uses the untouched original and stores an evidence report.
3. Each normalized verification outcome displays correctly without overclaiming legal assurance.
4. Manual re-verification is authorized, queued, observable, and preserves evidence history.
5. A signature request completes and imports exactly one linked signed PDF despite repeated webhook delivery.
6. A malformed, tampered, or verifier-unavailable document fails safely and remains usable as permitted.
7. Restore procedures recover documents, request mappings, reports, and audit history in a consistent customer stack.

## Release gate

All critical flows pass on pinned upstream versions, known defects are risk-accepted by named owners, and no high-severity security or data-integrity issue is unresolved.

