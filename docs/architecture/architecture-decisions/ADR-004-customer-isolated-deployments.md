# ADR-004: One Deployment per Customer

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Use one logically isolated deployment stack per customer for V1.

## Rationale

Document data and signing data are sensitive. Isolation simplifies data boundaries, configuration, backups, recovery, and operational troubleshooting while the product is new.

## Consequences

Each customer receives separate data stores, storage, secrets, and backups. Centralized multi-tenant operation is explicitly outside V1 and would require a new architecture decision.

