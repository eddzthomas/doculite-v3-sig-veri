# Upstream Upgrade Policy

**Status:** Draft for approval  
**Owner:** Engineering and Operations Leads

## Policy

Paperless-ngx and DocuSeal are independently versioned dependencies. Releases pin exact supported versions or immutable image digests. The product never assumes undocumented database schemas, internal routes, or storage layout.

## Current pins

The authoritative record of pinned upstream versions — tag, commit, container digest, and capture
date — is [`deploy/upstream-versions.json`](../../deploy/upstream-versions.json). Re-pin only
through the upgrade procedure above; record new evidence with `node scripts/pin-upstream.mjs fetch`
and confirm agreement with `node scripts/pin-upstream.mjs validate`.

## Upgrade procedure

1. Review upstream release notes, security notices, license changes, API changes, and migration notes.
2. Upgrade first in an isolated rehearsal environment using a production-like backup copy.
3. Run API contract, document lifecycle, verification fixture, signing webhook, authorization, backup/restore, and rollback tests.
4. Record compatibility evidence and approved versions.
5. Deploy through the release runbook; monitor errors and keep a tested rollback option.

## Fork threshold

Fork only when a required upstream defect or API gap cannot be handled by supported configuration, public APIs, or an adapter. A fork requires an ADR, license review, patch ownership, rebase plan, security maintenance owner, and exit criterion.

