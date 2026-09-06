# Backup and Recovery

**Status:** Draft for operations and security review  
**Owner:** Operations lead

## Backup scope

Back up each customer as a coordinated set: Paperless database and document volumes, DocuSeal database/state and completed files where applicable, product database, product configuration necessary for restoration, verification evidence, and customer-scoped secrets or recoverable secret references. Do not place one customer’s backup data in another customer’s set.

## Required characteristics

- Encrypt backups at rest and in transit; restrict restore permissions.
- Set retention and regional location from the approved customer policy.
- Monitor every backup and alert on failure.
- Test a full restore at least annually and after a major storage/database architecture change.
- Define recovery point objective (RPO) and recovery time objective (RTO) per customer agreement; leave neither implicit.

## Recovery sequence

1. Declare recovery or incident and preserve evidence if compromise is suspected.
2. Provision a clean isolated target with the approved software versions and secrets configuration.
3. Restore platform configuration and databases, then document storage, then DocuSeal state, then product mappings/evidence.
4. Verify database integrity, document object counts/hashes where feasible, application health, permissions, search/index readiness, signing mappings, and verification-report consistency.
5. Run a controlled user smoke test before restoring normal traffic.
6. Record actual RPO/RTO, gaps, and follow-up actions.

## Approval

Operations and security leads approve backup design and drills. Customer/business owners approve RPO, RTO, retention, and any data-loss acceptance. Counsel determines legal preservation obligations.
