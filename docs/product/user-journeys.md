# User Journeys

**Status:** Draft for approval  
**Owner:** Product Lead

## Document manager: ingest and find

1. The user uploads a permitted file in the product UI.
2. The product sends it to Paperless and shows processing status.
3. Paperless consumes, OCRs, and indexes the document; the product refreshes the record.
4. A worker hashes the untouched original and stores a verification report.
5. The user searches, filters, previews, and downloads only documents authorized by Paperless.

Success: processing, verification, and permission states are understandable; failures expose a retry path without claiming a false result.

## Document manager: verify

1. The user opens a document detail page and reads the status summary.
2. The user opens the evidence panel for signer, integrity, trust, and provenance details.
3. The user requests re-verification if authorized.
4. The UI shows queued, complete, or failed processing and retains prior evidence history.

Success: unsigned is not presented as invalid; trusted and untrusted valid signatures are distinguishable.

## Document manager: request signatures

1. The user selects a source document and starts a signing request.
2. The product validates access and creates a DocuSeal submission through the server.
3. The user configures permitted recipients and order using the licensed/approved signing experience.
4. Recipients sign through DocuSeal; the product displays progress.
5. Completion webhook processing retrieves the authoritative PDF, imports it into Paperless, verifies it, and links it to the source.

Success: the source remains unchanged and duplicate completion events produce one linked completed document.

## Administrator and operator

Administrators manage Paperless permissions and customer configuration. Operators provision isolated stacks, review health and integration failures, restore coordinated backups, and use the native Paperless administration interface only as an operational fallback.

