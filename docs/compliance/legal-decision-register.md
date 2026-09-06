# Legal and Licensing Decision Register

**Status:** Draft for counsel review  
**Owner:** Product sponsor with counsel and the engineering licensing owner  
**Reviewers:** Product Owner, Engineering Lead, Security Lead, Privacy owner  
**Last reviewed:** 2026-09-05  
**Applies to:** V1  
**Related IDs:** RISK-001, RISK-003, LIC-001 through LIC-007

## Purpose

This register is the single record of legal, licensing, privacy, and signature-assurance decisions that require an accountable human owner and written evidence before dependent work proceeds. It tracks each decision's owner, the evidence required, and its current status. It records engineering facts and approval states only; it does not contain legal advice, and conclusions about legal obligations are made by counsel, not by this document or by engineering.

## Scope

Covered:

- Commercial entitlements for gated upstream capabilities (DocuSeal embedded signing, template building, white-label, API use).
- Open-source license obligations for deployed upstream services and their dependencies (GPLv3, AGPLv3, and third-party dependencies).
- Approved wording for customer-facing signature claims and limitation notices.
- Privacy, data-processing, and retention decisions for signer contact data and stored documents.
- Trademark, branding, and attribution use of upstream project names and interfaces.

Excluded:

- Counsel's own advice records and executed contract documents, which live outside this repository; the register records only their existence, location, and approval state.
- Engineering decisions that do not require legal review; those belong in ADRs or the owning technical document.

## Register

Statuses: `Open` (owner assigned, no evidence yet), `Evidence gathered` (written evidence received, pending approval), `Approved` (evidence recorded, dependent work may proceed), `Superseded` (replaced by another row).

| ID | Decision | Owner | Evidence required | Status | Detailed record |
| --- | --- | --- | --- | --- | --- |
| LIC-001 | Commercial entitlement for gated DocuSeal capabilities (embedded signing, template building, white-label, API use, customer deployment model) | Product sponsor / Procurement | Written vendor confirmation or executed agreement covering features, pricing, usage limits, branding, support, and data-processing terms | Open | `commercial-license-decision.md` |
| LIC-002 | GPL/AGPL obligation interpretation, notices, attribution, and source-availability approach for Paperless-ngx and DocuSeal deployments | Counsel with engineering licensing owner | Counsel approval of the component boundary, notice set, attribution plan, and modification records | Open | `open-source-licensing.md` |
| LIC-003 | License inventory and terms for upstream dependencies with separate terms (for example HexaPDF) | Engineering licensing owner | SBOM entry with license, version, source, modification status, and approval per pinned release | Open | `open-source-licensing.md` |
| LIC-004 | Approved customer-facing wording for signature outcomes and limitation notices | Legal / Product | Counsel-approved claim language consistent with the V1 verification policy | Open | `../signatures/verification-policy.md` |
| LIC-005 | Signature-assurance boundary: confirmation that V1 results are basic verification only, with no eIDAS/QES, PAdES-LT/LTA, or compliance-grade claims | Legal / Product | Counsel confirmation of the assurance boundary and of any jurisdiction-specific notices | Open | `../signatures/verification-policy.md` |
| LIC-006 | Data-processing, hosting, subprocessor, retention, and transfer terms for upstream vendors handling document or signer data | Privacy owner / Counsel | Executed data-processing terms or documented vendor review | Open | `../security/privacy-and-retention.md` |
| LIC-007 | Trademark and branding use of upstream project names in product UI, documentation, and customer materials | Counsel / Product | Review of upstream trademark/branding policies and approved usage plan | Open | `open-source-licensing.md` |

## Decisions and requirements

- Every row must name one accountable owner; unowned rows are not valid register entries.
- No gated or legally dependent work may proceed, ship, or be enabled behind a feature flag unless its register row is `Approved`.
- A row moves to `Approved` only when the named evidence exists and the owner has recorded approval with a date and location.
- Engineering records facts (what was built, what was observed, which notices exist) in linked documents; owners record legal conclusions in the register.
- When a new legal, licensing, privacy, or signature-assurance decision surfaces, add a row here and, if material, a risk in `../delivery/risk-register.md` using the next `LIC-*` and `RISK-*` IDs.
- Superseded rows are retained with a pointer to the replacing row; rows are never deleted.

## Validation

- Before enabling any gated capability, a reviewer confirms the corresponding register row is `Approved` and cross-checks the feature flag's link to the row.
- Release checks confirm every distributed release matches the approved notice, attribution, and modification records referenced by LIC-002 and LIC-003.
- Periodic review (at each milestone gate in `../delivery/roadmap.md`) confirms no `Open` row blocks the current phase and no row has been silently dropped.

## References

- `commercial-license-decision.md` — DocuSeal commercial license decision record (LIC-001)
- `open-source-licensing.md` — licensing facts, records, and approval gates (LIC-002, LIC-003, LIC-007)
- `../signatures/verification-policy.md` — V1 verification outcome vocabulary and claim limits (LIC-004, LIC-005)
- `../security/privacy-and-retention.md` — privacy and retention controls (LIC-006)
- `../delivery/risk-register.md` — RISK-001 (commercial terms), RISK-003 (claim overreach)
- `../delivery/roadmap.md` — Phase 0 exit gate requiring the licensing path decision
- ADR-002 (separate DocuSeal service) and ADR-003 (independently authored product UI/API) in `../architecture/architecture-decisions/`
