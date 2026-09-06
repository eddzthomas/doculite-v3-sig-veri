# ADR-003: Independently Authored Product UI and API

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Build a product-owned web interface and orchestration API independently from Paperless and DocuSeal user-interface code.

## Rationale

The product needs a consistent user workflow while preserving maintainable boundaries from upstream projects.

## Consequences

The product may link to or embed only capabilities permitted by the selected DocuSeal edition and terms. It does not copy upstream UI code, assets, or internal packages. License and attribution review remains required.

