# ADR-007: Use Adapters for Upstream APIs and Webhooks

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Encapsulate Paperless and DocuSeal API/webhook behavior behind product-owned adapters, fixtures, and contract tests.

## Rationale

Upstream API versions and undocumented behaviors can change. An adapter reduces the impact on product routes and business logic.

## Consequences

Upstream identifiers remain opaque. Any undocumented verifier behavior is feature-flagged and must pass release-specific fixtures. Product API schemas are not direct proxies for upstream responses.

