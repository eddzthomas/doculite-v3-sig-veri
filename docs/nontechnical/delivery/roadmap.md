# Implementation Roadmap — Plain-Language Guide

**Companion to:** `docs/delivery/roadmap.md`  
**Audience:** Sponsors, customers, operational leaders, and non-technical reviewers

## What this roadmap means

The working baseline is roughly six months for a small cross-functional team. It builds the product in complete, testable slices: first the platform, then document management, then verification, then signing, followed by hardening and a controlled pilot.

If the team is smaller, the dates should move rather than skipping security, recovery, licensing, or testing gates.

## Timeline

| Period | What becomes possible |
| --- | --- |
| Weeks 1–2 | We confirm that the upstream projects, licenses, APIs, hosting approach, and signature behavior support the product we intend to build. |
| Weeks 3–5 | We have a secure deployable foundation for an isolated customer environment. |
| Weeks 6–9 | Authorized users can upload, find, preview, organize, and download documents. |
| Weeks 10–13 | The product can check PDF signatures and explain the result without overstating what was proven. |
| Weeks 14–18 | Users can send documents for signature, track progress, and receive a linked signed copy. |
| Weeks 19–21 | Security, accessibility, monitoring, backup, recovery, upgrades, and rollback are proven. |
| Weeks 22–25 | A representative pilot uses the whole workflow and provides feedback. |
| Week 26 onward | Approved customers are launched one at a time with monitoring and rollback protection. |

## Major decision gates

### Before development starts

- Confirm exact Paperless and DocuSeal versions.
- Prove their APIs with realistic test files.
- Decide whether the required DocuSeal commercial features and terms are acceptable.
- Approve how customer stacks, identity, secrets, storage, monitoring, and backups will work.

### Before signing work starts

- Confirm the right to use embedded, white-label, or commercial DocuSeal capabilities.
- Prove that repeated or delayed events cannot create duplicate signed documents.

### Before the pilot

- Resolve critical security and data-integrity issues.
- Demonstrate that the product is accessible in its important workflows.
- Restore a complete customer environment from backup.
- Rehearse upgrades and rollback.
- Confirm support and incident ownership.

### Before each production customer

- Verify that the customer's data, credentials, databases, files, certificates, monitoring, and backups are isolated.
- Run upload, search, verification, signing, import, and permission checks.
- Confirm current licenses, notices, and recovery evidence.

## What each stage delivers

### Foundation

The first stage creates the secure shell of the product: login, customer isolation, deployment automation, private service connections, safe background jobs, logs, and health checks.

### Document management

The second stage exposes Paperless capabilities through the custom interface while keeping Paperless responsible for document access and storage.

### Signature verification

The third stage checks the untouched original PDF. It separately reports whether the signature bytes are intact, whether the certificate is trusted, and whether DocuSeal recognizes the document. These are related facts, not one yes/no answer.

### Signing

The fourth stage allows a document to be sent to external signers. When signing finishes, the signed result becomes a new document linked to the original. The original is preserved.

### Hardening and pilot

The final pre-production stages prove that the system can be protected, monitored, restored, upgraded, supported, and understood by real users.

## What can change the schedule

The most important schedule risks are:

- DocuSeal commercial terms or required features are not acceptable.
- An upstream API behaves differently from the documented version.
- Signature verification needs stronger legal or regulatory assurance than the V1 policy provides.
- Customer identity, hosting, retention, or recovery requirements expand.
- Security, accessibility, backup, or pilot testing reveals a release-blocking issue.

These risks should change the plan openly. They should not be worked around by weakening the release gates.

## What “done” means

A feature is not complete merely because its main screen works. It must also have permission checks, failure handling, safe retries, audit records, tests, monitoring, support guidance, rollback behavior, and synchronized technical and plain-language documentation.
