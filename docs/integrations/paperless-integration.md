# Paperless-ngx Integration Contract

**Status:** Draft; requires pinned-release verification  
**Owner:** Architecture team  
**Applies to:** V1

## Boundary

Paperless-ngx is the document system of record. The product integrates solely through the API/documented extension points approved for the pinned release. It never reads or writes Paperless database tables, task internals, storage layouts, or internal source packages.

## Required capabilities to verify against the pinned release

| Product need | Expected integration capability | Verification gate |
|---|---|---|
| Ingest source document | Authenticated upload/consumption API | Contract test with a disposable fixture |
| Find processing result | Document/task status or queryable completed record | Test asynchronous and failed processing |
| Browse/search/detail | Document list, filters, detail, metadata, thumbnails/previews where documented | Contract tests for pagination and permissions |
| Retrieve exact file | Approved original-document retrieval route | Hash known fixture bytes |
| Update searchable summaries | Supported custom-field/metadata mechanism | Validate permissions and field types |
| Check permissions | Published authorization/permission behavior | Test owner, allowed user, denied user |

The release identifier, API version, base URL configuration, authentication mechanism, and request/response fixtures must be recorded in the deployment configuration and upgrade test suite. The initial reference is [Paperless-ngx API documentation](https://docs.paperless-ngx.com/api/); implementations must use the documentation matching the pinned release, not an unversioned assumption.

## Product rules

- The product preserves Paperless identifiers as opaque IDs.
- It treats Paperless processing as asynchronous and displays a pending/failure state.
- It obtains bytes for verification and signing using a supported retrieval endpoint. It must not rely on OCR/PDF/A derivatives when the workflow requires the original bytes.
- Any metadata synchronization is best-effort and retryable; product evidence remains in the product database.

