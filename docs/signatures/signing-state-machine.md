# Signing Request State Machine

**Status:** Draft for implementation approval  
**Owner:** Architecture team  
**Applies to:** V1

## States

| State | Meaning |
|---|---|
| `draft` | User configuration exists locally and is not yet creating an upstream submission. |
| `creating` | Product is creating/reconciling the DocuSeal workflow. |
| `sent` | Signing invitations/workflow are available. |
| `in_progress` | At least one signer action or upstream in-progress status is observed. |
| `completed` | Authoritative completed artifact has been retrieved, imported into Paperless, and linked. |
| `declined` | Upstream reports a declined signing outcome. |
| `expired` | Upstream reports expiration. |
| `cancelled` | Cancellation has been confirmed upstream. |
| `failed` | A non-retryable setup, reconciliation, or import failure requires attention. |

## Transitions

`draft → creating → sent → in_progress → completed` is the normal path. `creating` can transition to `failed`. `sent` or `in_progress` can transition to `declined`, `expired`, `cancelled`, or `completed`. A cancellation request is valid only in states whose upstream workflow can be cancelled. Terminal states are not reopened; a new request is created for a new signing attempt.

## Completion rule

`completed` is set only after the product has re-fetched the authoritative upstream completion record, downloaded the completed artifact, imported it into Paperless, created the source/completed link, and persisted the resulting Paperless document ID. A webhook alone never sets `completed`.

## Retry and reconciliation

Temporary failures remain retryable while the record is in a non-terminal operational state. Reconciliation is idempotent using upstream identifiers and the product mapping. The UI distinguishes a pending reconciliation from a completed signing request.

