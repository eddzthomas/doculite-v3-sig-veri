# Development Guide

**Status:** Draft for approval  
**Owner:** Engineering Lead

## Local architecture

Run the independently authored Next.js application and background worker beside pinned Paperless-ngx and DocuSeal services. Each service keeps its own supported persistence boundary. The product service communicates with Paperless and DocuSeal only through authenticated APIs; it never queries their databases or reads their storage volumes directly.

## Configuration principles

- Store local secrets outside version control and use documented placeholder variables in examples.
- Use a dedicated product database for mappings, verification evidence, webhook idempotency, and request state.
- Point local integrations at disposable development instances and sample files only.
- Pin image and package versions; record tested upstream versions before a release.

## Daily workflow

1. Start dependencies and verify their health endpoints.
2. Sign in using a test Paperless account with known permissions.
3. Exercise upload through the product API/UI, then confirm Paperless completion through its API.
4. Trigger verification and signing only with approved fixture documents.
5. Run formatting, static checks, unit tests, contract tests, and affected integration tests before review.

## Debugging boundaries

Use correlation IDs across browser requests, worker jobs, Paperless calls, DocuSeal calls, and webhook processing. Redact credentials, document bytes, recipient contact data, certificate details, and signed URLs from routine logs.

