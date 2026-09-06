# Deployment Topology

**Status:** Draft for operations and security review  
**Owner:** Architecture team  
**Applies to:** V1

## Topology

One customer receives one logically isolated deployment containing a reverse proxy, product web/API service, product worker, Paperless-ngx, DocuSeal, their required backing services, and separate persistent data locations. Customer traffic enters only through the reverse proxy. Internal service endpoints are not exposed directly to the public internet unless a reviewed operational need requires it.

## Persistent data boundaries

| Data | Primary service | Backup unit |
|---|---|---|
| Paperless documents and metadata | Paperless plus its configured storage/database | Coordinated Paperless data set |
| Signing submissions and completed artifacts | DocuSeal plus its configured storage/database | Coordinated DocuSeal data set |
| Mappings, reports, request state | Product database | Product database |
| Queue messages | Redis/queue | Disposable; jobs are reconstructible from durable state |

Backups and restores must be coordinated across all three durable systems. Restore verification must confirm that product mappings refer to recoverable Paperless and DocuSeal records.

## Network flows

- Browser → reverse proxy → product web/API.
- Product worker/API → Paperless API and DocuSeal API.
- DocuSeal → product webhook endpoint.
- Services → their own databases, queues, and storage.

Direct browser access to product service credentials, upstream databases, or internal storage is prohibited by architecture. The exact TLS termination, identity provider, malware-scanning service, encryption-at-rest mechanism, monitoring stack, and secret manager are deployment decisions owned by Security and Operations; this document does not assert that any is provided by an upstream project.

## Scaling and availability

The web/API service and worker may scale independently. Paperless consumption and DocuSeal submission processing are asynchronous external dependencies, so the product reports pending states and uses durable retries. V1 prioritizes recoverable, isolated deployments over shared multi-tenant infrastructure.

