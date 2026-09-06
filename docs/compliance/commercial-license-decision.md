# Commercial License Decision Record

**Status:** Blocking decision record  
**Owner:** Product sponsor and procurement, advised by counsel and engineering

## Decision required

Before implementing or enabling embedded signing, embedded template building, white-label experiences, PDF verification endpoints, or any other potentially gated DocuSeal capability, obtain written confirmation of availability, pricing, usage limits, branding/attribution rules, support terms, and data-processing terms.

## Evaluation record

| Item | Required decision evidence |
| --- | --- |
| Capability | Exact product feature and API/UI surface required by V1 |
| Version | Pinned DocuSeal release and deployment model |
| Entitlement | Written vendor confirmation or executed agreement |
| Branding | Required attribution, white-label limits, and customer-facing wording |
| Data handling | Hosting, subprocessors, retention, and transfer terms |
| Support | SLA, security contact, upgrade expectations, incident process |
| Cost/term | Approved budget, renewal owner, expiration date, usage limits |
| Fallback | Native attributed upstream interface, reduced V1 scope, or alternative signing service |

## Engineering constraints

- Feature flags must keep commercially gated features disabled until approval evidence is recorded.
- The product may use only documented, entitled interfaces. Undocumented endpoints require an upgrade-risk assessment and written product/engineering approval; they are not a substitute for a license.
- Do not copy a paid or white-label experience from upstream source to avoid commercial terms.
- Store license keys and vendor tokens as server-side secrets only.

## Approval gate

Product sponsor approves business need; procurement approves purchase; counsel approves contractual and licensing terms; security/privacy owners approve data handling; engineering lead confirms technical compatibility. All approvals are required before production enablement.
