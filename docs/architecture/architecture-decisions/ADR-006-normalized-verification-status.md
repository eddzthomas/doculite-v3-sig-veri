# ADR-006: Use a Normalized Verification Status Model

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Expose five product statuses: `unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, and `error`. Keep integrity, trust, and DocuSeal provenance separately.

## Rationale

Different verifier outputs need a stable, comprehensible product vocabulary. Combining provenance or trust with integrity would create misleading results.

## Consequences

The adapter translates provider-specific output and retains raw evidence. Product status changes require migration and approval; legal claims remain out of scope unless separately approved.

