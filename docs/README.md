# Doculite Documentation

This directory is the source of truth for planning, building, operating, and reviewing the Doculite document-management platform.

AI agents and implementation contributors must begin with the repository-root `AGENTS.md`, which summarizes the architecture, maintenance rules, and required working process.

## How to use this documentation

- Technical documents describe requirements, architecture, controls, interfaces, and runbooks for delivery teams.
- Matching plain-language documents live under `nontechnical/`. They explain the same decisions for sponsors, customers, and non-technical reviewers.
- Architecture decisions are recorded in `architecture/architecture-decisions/` and take precedence over conflicting narrative text.
- Requirements, risks, controls, and operational obligations use stable IDs so they can be traced through design and testing.

## Reading order

1. `product/project-charter.md`
2. `product/product-requirements.md`
3. `architecture/system-architecture.md`
4. `architecture/document-lifecycle.md`
5. `signatures/verification-policy.md`
6. `integrations/openapi.yaml`
7. `security/threat-model.md`
8. `compliance/legal-decision-register.md`
9. `operations/deployment-runbook.md`

The interactive architecture view is `architecture/project-flow.html`.

## Document status and review

Every document uses these states:

- **Draft** — being prepared; not a delivery commitment.
- **Review** — ready for the named reviewers.
- **Approved** — accepted for the current release baseline.
- **Superseded** — retained for history only.

Each document should identify an owner, reviewers, last review date, and related IDs. Legal, privacy, and commercial-license documents record engineering facts and approvals; they do not replace advice from qualified counsel or procurement.

## Architecture baseline

Doculite uses Paperless-ngx as the document system of record, DocuSeal as a separately deployed signing and basic PDF-signature-verification service, and an independently authored Next.js/TypeScript application layer. Each customer receives an isolated deployment. The original document remains preserved; a completed signed PDF is imported as a linked document rather than replacing the source.

## Source references

- Paperless-ngx repository and documentation: <https://github.com/paperless-ngx/paperless-ngx>
- Paperless REST API: <https://docs.paperless-ngx.com/api/>
- DocuSeal repository: <https://github.com/docusealco/docuseal>
- DocuSeal API documentation: <https://www.docuseal.com/docs/api>
- HexaPDF digital-signature documentation: <https://hexapdf.gettalong.org/documentation/digital-signatures/index.html>
