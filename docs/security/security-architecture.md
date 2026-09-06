# Security Architecture

**Status:** Draft for security review  
**Owner:** Security lead  
**Applies to:** V1 per-customer deployment

## Purpose

This document defines engineering security controls for the DMS. It is not legal, privacy, or compliance advice. Each customer receives an isolated deployment containing the product application and worker, Paperless-ngx, DocuSeal, separate data stores, storage volumes, and secrets.

## Security boundaries

- The custom product UI/BFF is the only browser-facing application service. It authorizes the user before requesting document data or a signing action.
- Paperless-ngx is the document system of record. Its supported APIs, not its database or storage volumes, are the integration boundary.
- DocuSeal owns templates, submissions, and active signing sessions. Its APIs and signed webhook events are the only integration boundary.
- The product database owns cross-system IDs, verification reports, signing-request state, hashes, and webhook idempotency records.
- Each customer has its own network, databases, cache/queue, storage, encryption keys, backups, and service credentials. Cross-customer access is prohibited by deployment design, not only application filtering.

## Required controls

| Area | Required control |
| --- | --- |
| Transport | TLS for every browser, API, webhook, and administration connection; reject insecure external transport. |
| Identity | Use the Paperless authorization model for document access. The product must check authorization on every document and signing operation. Require MFA for privileged production administration. |
| Sessions | Secure, HTTP-only, same-site cookies; CSRF protection for state-changing browser requests; short-lived sessions and explicit logout. |
| Secrets | Store tokens, database passwords, webhook secrets, and signing keys in a managed secret store or deployment secret mechanism. Never put them in source, logs, browser bundles, or client storage. Rotate after exposure and on the defined schedule. |
| Service access | Give each service a distinct account with only required scopes. DocuSeal tokens stay server-side. Block public database, Redis, object-storage, and administration endpoints. |
| Files | Enforce size/type limits, malware scanning before processing, random stored filenames, and no execution of uploaded content. Preserve the original byte stream for hashing and signature verification. |
| Encryption | Encrypt traffic in transit and customer document storage, databases, backups, and secrets at rest using provider-supported encryption. Document key ownership and rotation. |
| Logging | Log actor, request, document ID, action, result, correlation ID, and timestamp; do not log document contents, access tokens, signed URLs, or full certificate data unless an approved diagnostic process requires it. |
| Availability | Rate-limit public endpoints, bound queues, use retries with backoff, and monitor storage, database, worker, webhook, and verification failures. |
| Supply chain | Pin container images and dependencies; scan for vulnerabilities; produce an SBOM; review upstream security advisories before upgrades. |

## Signature-specific controls

- Hash and verify the untouched original or completed signed PDF, never a Paperless OCR/PDF-A derivative unless it is demonstrably byte-identical.
- Store integrity result, certificate trust result, and DocuSeal provenance as separate fields. A DocuSeal provenance match must not be represented as cryptographic validity.
- Trust certificates and verification policy are customer-scoped, versioned, access-controlled configuration. Re-run verification when policy or trust material changes.
- Verify DocuSeal webhook authenticity, reject stale/replayed events where supported, record event IDs, and re-fetch authoritative submission state before importing a completed document.

## Security approval gates

1. Security lead approves the threat model and control matrix before implementation.
2. Platform lead proves customer isolation, TLS, secret handling, and backups in a staging deployment before pilot.
3. Security lead approves penetration-test findings, exception records, and residual high risks before production.
4. Operations lead approves alerting, access procedures, restoration drills, and incident runbooks before production.

## Evidence and review

Maintain deployment configuration, scan reports, access reviews, secret-rotation records, restore-drill records, and security exceptions as release evidence. Reassess this document after an architecture change, material upstream upgrade, incident, or annually.
