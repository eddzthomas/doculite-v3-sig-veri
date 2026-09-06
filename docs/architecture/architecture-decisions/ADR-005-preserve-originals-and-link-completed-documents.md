# ADR-005: Preserve Originals and Link Completed Documents

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Never overwrite the source Paperless document with a signing artifact. Import a completed signed PDF as a new Paperless document and link it to its source.

## Rationale

Preserving the exact source document supports traceability, hashing, verification evidence, and clear user understanding of what was signed.

## Consequences

The product maintains relationship mappings and presents both documents together. Verification runs identify which bytes they evaluated.

