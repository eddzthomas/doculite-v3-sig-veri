# Project Charter

**Status:** Draft for approval  
**Owner:** Product Lead  
**Audience:** Product, engineering, security, operations, and sponsors

## Purpose

Build a customer-isolated document-management system (DMS) that makes documents easy to capture, find, control, verify, and send for signature. Paperless-ngx is the document system of record; DocuSeal is a separate signing and basic PDF-signature-verification service; an independently authored Next.js product layer provides the customer experience.

## Outcomes

- Authorized users can upload, OCR, classify, search, preview, and download documents.
- Users can view clear, evidence-backed basic PDF signature results and request re-verification.
- Authorized users can send documents for signature and receive the completed PDF as a linked new record.
- Each customer has an isolated deployment, data stores, storage, secrets, and backups.

## V1 boundaries

V1 includes document management, Paperless permissions, basic PDF signature integrity and configured-certificate trust results, DocuSeal signing workflows, audit history, and operational fallbacks. It excludes qualified-signature claims, revocation/long-term validation claims, a shared multi-tenant installation, replacing Paperless administration, and direct database integration with either upstream service.

## Success measures

- A permitted user can find an ingested document and see its status without using an upstream UI.
- A completed signing request returns exactly one linked completed document after retries or duplicate webhooks.
- Verification distinguishes unsigned, trusted valid, untrusted valid, invalid, and processing-error outcomes.
- An operator can provision and restore one customer environment from the runbooks.

## Decision principles

- Preserve the unsigned original; never overwrite it with an OCR derivative or signed output.
- Enforce document authorization in Paperless, not in duplicated product-side rules.
- Use supported APIs and asynchronous workers; never directly access upstream databases or storage.
- Keep cryptographic validity, certificate trust, and DocuSeal provenance as separate facts.

