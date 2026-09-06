# Document Lifecycle

**Status:** Draft for product and architecture approval  
**Owner:** Architecture team  
**Applies to:** V1

## Lifecycle

1. A permitted user uploads a document through the product experience.
2. The product submits the document to Paperless using the pinned supported ingestion interface and records an ingestion correlation record.
3. Paperless completes its normal document-consumption/indexing process. The product waits or polls using a documented status mechanism; it does not infer completion from a database table.
4. After a Paperless document exists, the product records its Paperless identifier and queues optional verification.
5. For verification, the worker retrieves the selected original through Paperless's supported retrieval interface, calculates SHA-256 for evidence, and invokes the DocuSeal adapter.
6. The worker stores immutable-at-creation verification evidence and a normalized result in the product database. Searchable summary fields may be synchronized to Paperless after permission and field configuration are approved.
7. A permitted user may create a signing request against the selected source document. The product creates the DocuSeal signing workflow and stores the external identifiers.
8. On a validated completion signal, the product re-fetches the authoritative DocuSeal submission/artifact, imports the completed PDF into Paperless as a new document, links it to the source, and queues verification of that completed file.

## Invariants

- The source document is not overwritten by an OCR derivative, signing artifact, or re-uploaded completed PDF.
- Each verification record identifies the exact bytes evaluated through its SHA-256 hash and retrieval timestamp.
- Verification of a document is independent from DocuSeal provenance: a document can have a cryptographically valid signature without originating in DocuSeal.
- Duplicate webhook delivery or worker retries must produce one logical completed-document link and an auditable duplicate-processing outcome.

## Retention and deletion

Retention, legal hold, deletion, and backup retention are product-policy decisions documented by Privacy and Operations. The product must record when an upstream document needed for a related signing or verification history is no longer retrievable; it must not fabricate a result.

