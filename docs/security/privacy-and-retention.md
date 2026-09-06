# Privacy and Retention

**Status:** Draft for privacy and security review  
**Owner:** Privacy owner with security lead  
**Important:** This is an engineering data-handling baseline, not legal advice or a privacy notice.

## Data inventory

| Data class | Primary owner | Examples | Engineering treatment |
| --- | --- | --- | --- |
| Document content | Paperless | originals, OCR derivatives, signed PDFs | access-controlled encrypted storage; preserve originals where required |
| Document metadata | Paperless | title, tags, correspondent, permissions | minimize export and protect as customer data |
| Signing data | DocuSeal | recipients, templates, signing session data | send only required fields; protect server credentials |
| Product integration data | Product database | upstream IDs, hashes, request states, verification reports | encrypted database, access control, customer-scoped backup |
| Operational data | Product services | audit events, health metrics, error reports | minimize, redact content/secrets, set retention limits |
| Backup data | Customer backup set | databases, files, configuration evidence | encrypted, access-controlled, lifecycle-managed |

## Lifecycle requirements

- Collect only data required for document management, verification, signing, support, and agreed operations.
- Keep an original and a completed signed document as separate linked records; do not overwrite originals.
- Apply customer-approved retention schedules to documents, metadata, signing data, reports, logs, and backups. The system must support legal holds where product scope requires them.
- Deletion must include product-owned mapping and report data and request deletion from upstream systems where supported and authorized. Backups may expire on their normal lifecycle; document the maximum deletion delay.
- Exports, diagnostics, and support bundles require authorization and must exclude unnecessary content and secrets.

## Privacy approval gates

1. Customer/legal owner defines purposes, retention, regional hosting, notice, and deletion obligations.
2. Privacy owner approves the data inventory, transfer list, subprocessors, and data-retention configuration before pilot.
3. Security and operations leads demonstrate access controls, backup expiry, and deletion behavior before production.

## Open decisions for counsel or customer policy

Counsel must determine applicable privacy laws, legal-hold obligations, data-processing terms, cross-border transfer requirements, and electronic-signature retention rules. Engineering implements the approved policy and records the configured values; it does not infer them.
