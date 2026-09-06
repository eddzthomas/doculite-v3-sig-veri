# ADR-002: Integrate DocuSeal as a Separate Service

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Deploy and integrate DocuSeal as an independent service rather than merging its code or database with Paperless-ngx.

## Rationale

The projects have distinct responsibilities, release cycles, and licenses. API-level integration limits coupling and creates a clearer operational and licensing boundary.

## Consequences

The product uses DocuSeal APIs/webhooks and does not touch its database or storage. Failures are asynchronous integration failures with retries and reconciliation, not cross-application transactions.

