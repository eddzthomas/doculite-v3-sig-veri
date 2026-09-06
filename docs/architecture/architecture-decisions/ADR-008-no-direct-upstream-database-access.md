# ADR-008: Prohibit Direct Access to Upstream Databases and Storage

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

The product and worker must not directly query or mutate Paperless or DocuSeal databases or service-owned storage locations.

## Rationale

Direct access bypasses permissions, couples the product to internal schemas, complicates upgrades, and weakens auditability.

## Consequences

All cross-service activity is through approved interfaces. Missing capabilities are handled by an approved extension, adapter, or changed product requirement—not an undocumented database workaround.

