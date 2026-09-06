# Open-Source Licensing and Attribution

**Status:** Draft for counsel review  
**Owner:** Engineering licensing owner with counsel  
**Important:** This records engineering facts and proposed controls. Only qualified counsel can provide legal advice or approve obligations.

## Component boundary

V1 deploys Paperless-ngx and DocuSeal as separately operated services integrated through supported network APIs. The independently authored product UI/BFF and worker must not copy upstream source, UI assets, internal packages, or database schemas. Services must not directly read or write each other’s databases or storage.

## Known licensing facts to verify against pinned releases

| Component | Expected license/topic | Engineering rule |
| --- | --- | --- |
| Paperless-ngx | GPLv3 | Preserve notices and source/license obligations applicable to modifications and distribution. Keep local modifications isolated and documented. |
| DocuSeal | AGPLv3 plus project terms/attribution | Preserve notices and required interactive attribution. Treat remote-network interaction and modifications as a counsel-review trigger. |
| HexaPDF or other DocuSeal dependencies | May have separate commercial or open-source terms | Inventory exact version and license; do not assume DocuSeal terms cover all dependencies. |
| Product-authored code | Intended proprietary code | Keep independently authored with clear repository provenance; counsel approves final boundary and notices. |

## Required records and process

- Pin every upstream repository release, commit, container digest, and dependency version.
- Maintain an SBOM and an open-source component inventory with license, source URL, version, modification status, notice location, and approval status.
- Preserve license texts, copyright notices, and required attributions in distribution/deployment materials.
- Record every upstream patch and whether it is maintained in a fork, submitted upstream, or replaced by configuration/API use.
- Do not market a signature outcome as legally compliant, qualified, or equivalent to a regulated scheme unless counsel approves the exact claim.

## Approval gates

1. Engineering submits the component inventory, architecture boundary, planned modifications, and user-interface attribution plan.
2. Counsel approves GPL/AGPL interpretation, source-availability obligations, attribution, trademarks, and distribution/service model before pilot.
3. Procurement and counsel approve commercial DocuSeal and dependency terms before any gated capability is enabled.
4. Release owner confirms notices, versions, and approvals before production release and every material upgrade.

## Prohibited assumptions

Do not infer that service separation eliminates all license obligations, that an upstream open-source license grants trademark rights, or that a vendor feature is available without a commercial entitlement. These are legal/commercial decisions requiring written approval.
