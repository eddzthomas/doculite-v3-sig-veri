# ADR-001: Paperless-ngx Is the Document System of Record

**Status:** Proposed  
**Decision date:** 2026-07-18

## Decision

Use Paperless-ngx as the authoritative system for document identity, metadata, document access permissions, and document bytes selected by product workflows.

## Rationale

Paperless already supplies the DMS capabilities on which the product is founded. Keeping the document authority in one upstream service avoids a second, divergent document index.

## Consequences

The product database stores mappings and reports rather than a shadow document catalogue. All document reads and writes use approved Paperless interfaces, and product features must honor Paperless authorization.

