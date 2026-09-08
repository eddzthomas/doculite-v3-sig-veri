# Risk Register

**Status:** Draft  
**Owner:** Documentation Program Lead  
**Reviewers:** Product, Engineering, Security, Operations, Legal  
**Applies to:** V1

| ID | Risk | Owner | Trigger | Mitigation | Contingency | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RISK-001 | DocuSeal commercial terms do not permit the intended embedded or white-label experience. | Product / Procurement | Terms reject a required feature or deployment model. | Confirm executed terms before implementation. | Use attributed upstream screens or replace the signing engine. | Open |
| RISK-002 | An upstream API or undocumented verifier behavior changes. | Engineering | Contract test fails during upgrade. | Pin versions, capture fixtures, and test upgrades. | Maintain a minimal compatible adapter or fork under approved obligations. | Open |
| RISK-003 | Verification results are interpreted as compliance-grade when V1 provides basic cryptographic and trust diagnostics only. | Product / Legal | Customer-facing claim exceeds approved policy. | Use approved status language and limitation notices. | Disable unsupported claims and escalate for policy review. | Open |
| RISK-004 | Cross-service document, signing, and verification records diverge after a failure or restore. | Operations | Reconciliation detects missing mappings or outputs. | Idempotent webhooks, immutable mappings, tested backups. | Run reconciliation and recover from authoritative source. | Open |
| RISK-005 | Customer document data is exposed through insufficient storage, credential, or tenant isolation controls. | Security | Control verification or incident indicates exposure. | Encrypt storage, isolate stacks, least privilege, monitor access. | Invoke incident response and credential rotation. | Open |
| RISK-006 | DocuSeal bundles an in-container Redis; the shared Redis service serves only Paperless. If V1 assumes a shared queue for webhook or signing events, that assumption is invalid. | Engineering | V1 design references a shared Redis queue for DocuSeal webhook or signing events. | Re-examine the event-transport assumption at M1 design and document the per-service arrangement. | Introduce a product-owned queue or rely on direct DocuSeal API reconciliation. | Open |
