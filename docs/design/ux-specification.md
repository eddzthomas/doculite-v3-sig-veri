# UX Specification

**Status:** Draft for approval  
**Owner:** Design Lead

## Core states

| Area | Required states |
|---|---|
| Ingestion | uploading, queued, Paperless processing, ready, processing failed |
| Verification | not checked, queued, `unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, `error` |
| Signing | draft, creating, sent, in progress, completed, declined, expired, cancelled, failed |
| Access | allowed, read-only, forbidden, session expired |

## Interaction requirements

- The upload flow confirms destination permissions and shows asynchronous processing rather than implying immediate availability.
- Search results include a compact verification badge only when a report exists; badge labels never use color alone.
- Document detail explains verification in plain language and offers evidence in a progressive-disclosure panel.
- The signing action explains that the completed PDF will be added as a related document, not replace the selected file.
- Error states state what failed, preserve safe context, and offer retry or support guidance where permitted.
- Destructive actions such as cancellation require explicit confirmation and state their external effect.

## Content rules

Use “signature status” for the normalized outcome, “certificate trust” for policy trust, and “DocuSeal record” for provenance. Do not label a document legally valid, compliant, certified, or qualified unless a separately approved capability supports that claim.

