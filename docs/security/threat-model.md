# Threat Model

**Status:** Draft for security review  
**Owner:** Security lead  
**Method:** Assets, actors, trust boundaries, threats, controls

## Assets and actors

Protected assets are customer documents and metadata, accounts and permissions, signature evidence and trust certificates, DocuSeal submissions, service credentials, backups, and audit records. Actors include authorized users, external signers, customer administrators, product operators, upstream services, malicious internet users, compromised accounts, and compromised dependencies.

## Principal threats and required treatment

| ID | Threat | Required treatment | Validation |
| --- | --- | --- | --- |
| SEC-001 | A user accesses a document outside their Paperless permission | Enforce document authorization server-side for every read, download, verification, and signing action. | Authorization integration and browser tests |
| SEC-002 | One customer can reach another customer’s records | Separate deployment, credentials, databases, volumes, keys, and backups per customer. | Provisioning review and isolation test |
| SEC-003 | Tokens or secrets leak through code, browser, logs, or support artifacts | Server-side secrets, secret scanning, redaction, scoped service accounts, rotation. | CI scan and log review |
| SEC-004 | Malicious upload harms workers or storage | Type/size limits, malware scan, isolated processing, resource limits, safe previewing. | Malware and oversized-file tests |
| SEC-005 | Forged or replayed DocuSeal webhook changes status | Authenticate webhook, record idempotency key, re-fetch submission, restrict endpoint, audit result. | Signed/invalid/duplicate webhook tests |
| SEC-006 | A tampered PDF is shown as valid | Verify original bytes; store hash, policy version, evidence, and distinct integrity/trust/provenance outcomes. | Tampered-PDF fixture test |
| SEC-007 | Verification overstates legal assurance | Use defined result language and limitations; do not make compliance claims absent approved policy and counsel review. | UX/content review |
| SEC-008 | Ransomware or operator error destroys documents | Immutable/offsite backup where available, least privilege, restore drills, monitored storage. | Restore exercise |
| SEC-009 | Vulnerable upstream code is deployed | Pinned versions, SBOM, scanning, advisory monitoring, staged upgrades and rollback. | Release gate evidence |
| SEC-010 | Privileged account takeover | MFA, least privilege, dedicated admin accounts, session controls, access reviews, alerting. | Access review and test |

## Trust boundaries

- Browser to product application: untrusted client input and authenticated session boundary.
- Product application to Paperless and DocuSeal: service-to-service authorization boundary.
- DocuSeal to webhook receiver: external event boundary requiring authentication and replay protection.
- Worker to queues/storage: asynchronous workload boundary requiring job authorization and safe file handling.
- Customer deployment to operations tooling: privileged administration boundary requiring audited, time-bound access.

## Residual-risk rules

High or critical risks need a named owner, mitigation date, and written security approval before pilot or production. Exceptions must include scope, compensating control, expiry date, and review owner. Legal significance of electronic signatures, retention, and jurisdiction-specific privacy duties are counsel decisions, not threat-model conclusions.

## Review gate

Security lead reviews the model before implementation, before pilot, after any severe incident, and at least annually. Product, architecture, and operations leads must confirm their assigned controls are represented in requirements and tests.
