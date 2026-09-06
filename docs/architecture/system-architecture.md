# System Architecture

**Status:** Draft for architecture approval  
**Owner:** Architecture team  
**Applies to:** V1

## Purpose

The product is a customer-isolated document-management application built around independent services. Paperless-ngx is the document system of record. DocuSeal is a separately deployed signing and PDF-signature-verification service. A product-owned application layer provides the custom user experience and integration orchestration.

## Components and ownership

| Component | Responsibility | Owns |
|---|---|---|
| Product web application/API | Custom UI, product API, orchestration, product authorization decisions | Product views and integration requests |
| Product worker | Retries, polling, verification jobs, webhook follow-up | Job execution only |
| Product database | Cross-system mappings, request states, verification reports, idempotency records | Product integration data |
| Paperless-ngx | Document ingestion, OCR/indexing, metadata, document permissions, document retrieval | Documents and Paperless metadata |
| DocuSeal | Templates, submissions, signing sessions, completed signing artifacts, verification execution | Signing workflow data |
| Object storage/volumes | Service-owned persistent files | Service-specific document/artifact bytes |
| Redis/queue | Asynchronous job transport | Transient jobs |

The product layer communicates with Paperless and DocuSeal only through supported, authenticated interfaces. It must not query their databases, mutate their storage volumes, or import either upstream application's internal code into the product application.

## Trust boundaries

- Browser-to-product traffic is authenticated product traffic.
- Product-to-Paperless and product-to-DocuSeal traffic is server-to-server; upstream credentials are never delivered to browsers.
- DocuSeal webhooks cross from DocuSeal into the product API and are treated as untrusted until authenticated and reconciled by an authoritative API read.
- Each customer deployment is its own security, data, storage, and backup boundary.

## Source-of-truth rules

- Paperless is authoritative for document identity, bytes selected for a workflow, metadata, and document permissions.
- DocuSeal is authoritative for an active submission and its completed signing artifact.
- The product database is authoritative for mappings, verification history, normalized display status, and webhook processing records.
- A completed signed PDF is imported to Paperless as a new, linked document. It never replaces the selected original.

## Integration evidence

Paperless integration must be pinned to an approved Paperless-ngx release and its published API documentation before implementation. DocuSeal integration must be pinned to an approved DocuSeal release and validated against a recorded contract fixture. The initial evidence locations are [Paperless API documentation](https://docs.paperless-ngx.com/api/) and [DocuSeal API documentation](https://www.docuseal.com/docs/api). Any endpoint or response not documented in the pinned source is experimental and requires an adapter plus an upgrade contract test.

