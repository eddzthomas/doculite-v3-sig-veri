# Authentication, Identity, and Authorization

**Status:** Draft for security review  
**Owner:** Architecture team  
**Applies to:** V1

## User identity

The product must establish an authenticated user identity before displaying or operating on a Paperless document. The selected identity pattern—shared upstream session, product identity provider with mapped Paperless identities, or another approved method—must be decided before implementation and recorded in an ADR. This document intentionally does not assume single sign-on, MFA, or a particular token format.

## Authorization rules

- The product performs document operations only after confirming the acting user's Paperless permissions through an approved supported interface.
- Verification reports, related signed documents, and signing-request metadata inherit the authorization of their associated Paperless source document unless a stricter approved rule applies.
- Only authorized roles may create, cancel, or view signing requests. The detailed role matrix belongs in product requirements and UX specifications.
- External signers use DocuSeal's signing experience or a permitted embedded experience; they do not receive product or Paperless service credentials.

## Service identities

Product-to-Paperless and product-to-DocuSeal calls use server-side service credentials with only the scope required for their workflow. Credential storage, rotation, transport, audit logging, and breach response are defined by Security and Operations. Browser code must not receive upstream API credentials.

## Session and webhook boundary

The product's browser session protects product endpoints. The webhook endpoint uses provider-authentication and replay/idempotency controls specified in `docs/integrations/webhook-contracts.md`; it must not depend on an end-user browser session.

