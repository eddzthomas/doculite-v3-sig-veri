# Webhook Contract: DocuSeal to Product

**Status:** Draft; requires provider-specific implementation verification  
**Owner:** Architecture team  
**Applies to:** V1

## Endpoint

`POST /api/v1/webhooks/docuseal` accepts provider notifications. It acknowledges transport receipt only after basic validation and durable idempotency recording; it does not assume the notification alone is authoritative business state.

## Processing sequence

1. Enforce transport and provider-authentication controls supported by the chosen DocuSeal configuration.
2. Parse only the configured event schema and record a payload digest, provider event reference where available, received time, and correlation references.
3. Apply an idempotency key. Duplicate events are recorded and return a successful non-duplicating outcome.
4. Queue a reconciliation job.
5. The worker retrieves current submission state and any completion artifact through the approved DocuSeal API.
6. The worker advances the product signing-request state only when the retrieved state supports that transition.

## Failure behavior

Malformed, unauthenticated, or unsupported events are rejected and logged without retaining unnecessary payload content. Temporary provider/API failures result in a retryable reconciliation job. A completion event must not create more than one linked Paperless completed document, even if delivery and job execution are repeated.

## Open questions to close before build

The precise webhook signature/header, event type names, retry behavior, and payload schema must be copied from the documentation for the selected pinned DocuSeal release into a contract fixture. This document deliberately does not assert them without that evidence.

