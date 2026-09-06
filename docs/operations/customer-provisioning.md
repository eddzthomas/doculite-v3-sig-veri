# Customer Provisioning Runbook

**Status:** Draft for operations review  
**Owner:** Operations lead

## Objective

Provision one isolated customer stack without sharing databases, object storage, secrets, certificates, queues, backups, or administrator credentials with another customer.

## Procedure

1. Create the approved customer identifier, domain, environment record, billing/support owner, region, and data-retention configuration.
2. Provision isolated network, TLS certificates, secret store entries, Paperless, DocuSeal, product app, worker, PostgreSQL databases, Redis/queue, and encrypted storage.
3. Create separate least-privilege service accounts and server-side credentials for Paperless and DocuSeal. Do not reuse tokens across customers.
4. Configure Paperless and DocuSeal through supported settings and APIs; record pinned image digests and configuration version.
5. Configure backup schedule, encryption, retention, restore target, monitoring, alert routing, malware scanning, and customer-specific verification trust configuration.
6. Create the first customer administrator through the approved identity process; require MFA where supported/required.
7. Run provisioning smoke tests: login, upload, OCR completion, search, document authorization, verification, DocuSeal webhook validation, backup job, and monitoring alert.
8. Record evidence, handoff contacts, recovery objectives, and the customer acceptance decision.

## Exit criteria

Operations and security leads approve isolation and controls; product/customer owner approves configured policy; customer admin confirms access; backup and monitoring tests pass. No production documents are accepted before the exit criteria are recorded.
