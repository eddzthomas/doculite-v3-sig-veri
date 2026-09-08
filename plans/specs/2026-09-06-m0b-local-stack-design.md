# M0-B: Disposable Local Stack — Design

**Status:** Draft for approval  
**Date:** 2026-09-06  
**Parent roadmap:** `docs/delivery/roadmap.md` Phase 0 exit gate — "The team can start, test, and stop a disposable local stack without using real customer documents"  
**Builds on:** M0-A pin record (`deploy/upstream-versions.json`) and pin tool

## Purpose

A repeatable Docker Compose stack that brings up the pinned upstream services (Paperless-ngx, DocuSeal) with their backing services (PostgreSQL, Redis) on a developer machine, with health verification and a guaranteed-clean teardown. It proves the pinned artifacts actually start and serve, and it is the substrate M0-C fixture capture runs against.

## Deliverables

1. **`deploy/local/compose.yaml`** — five services on one internal network:
   - `paperless` — image by digest from the pin manifest (`ghcr.io/paperless-ngx/paperless-ngx@sha256:…`)
   - `docuseal` — image by digest (`docker.io/docuseal/docuseal@sha256:…`)
   - `postgres` — image by digest, one instance hosting two logical databases (`paperless`, `docuseal`)
   - `redis` — image by digest
   - All published ports bind `127.0.0.1` only. Named volumes for Paperless data/media/export/consume and DocuSeal data. No product app or worker (M1 scope).
2. **`deploy/local/.env.example`** — dev-only defaults (ports, `POSTGRES_PASSWORD`, Paperless secret key), each commented `DEV ONLY — never for production`.
3. **`deploy/local/` scripts** (`start`, `health`, `stop`, `nuke`):
   - `start` — `docker compose up -d`, then wait for every service's readiness check (timeouts; names the failing service).
   - `health` — probe all services and print a status table.
   - `stop` — `docker compose stop`.
   - `nuke` — `docker compose down -v` (destroys volumes; the disposable guarantee).
4. **Manifest extension** — `postgres` and `redis` become components 3 and 4 in `deploy/upstream-versions.json` via the existing pin tool (TDD extension of schema/CLI).
5. **Digest-consistency validator** — an offline script asserting that every image reference in `compose.yaml` matches the digest recorded in the manifest (run in CI; no daemon needed).
6. **Doc update** — `docs/operations/deployment-runbook.md` gains a "Local M0 stack" section; nontechnical companion updated if it mirrors runbook content.

## Stack details

| Service | Readiness check | Notes |
|---|---|---|
| paperless | HTTP GET on the Paperless API (endpoint verified live during implementation; Paperless readiness has varied by version) | env: `PAPERLESS_DBHOST=postgres`, `PAPERLESS_REDIS=redis:6379`, `PAPERLESS_SECRET_KEY` from `.env` |
| docuseal | HTTP GET `/up` (Rails health endpoint — verify live; fall back to `/` if absent) | env: `DATABASE_URL` pointing at the `docuseal` database |
| postgres | `pg_isready` in-container for both databases | `POSTGRES_DB=paperless`, second DB created by an init script or DocuSeal auto-migration — verify live; prefer explicit init script |
| redis | `redis-cli ping` → PONG | no persistence requirements locally |

Ports (dev defaults, all overridable via `.env`): Paperless `127.0.0.1:8100`, DocuSeal `127.0.0.1:8200`, Postgres `127.0.0.1:8101`, Redis `127.0.0.1:8102` (implementation adjusts if Paperless/DocuSeal require specific conventions).

## Pinning extension rules

- `postgres`: component name `postgres`, GitHub repo `postgres/postgres`, release tags look like `REL_17_5` — the Docker image tag is the numeric part (`17.5`) on Docker Hub `library/postgres`. The existing `imageTagStripV` mechanism does not cover `REL_` stripping; extend the component declaration with a general tag-mapping (small refactor of the strip rule into a per-component mapping, TDD).
- `redis`: component name `redis`, GitHub repo `redis/redis`, tags `7.4.x`-style — image `library/redis` on Docker Hub, same tag.
- Backing services do NOT get `fallbackRegistry` (dead fallbacks were removed in M0-A); primary registry only, fail loud.
- Re-running `fetch` after adding components regenerates the manifest — all four components re-resolved in one run, `validate` must show no drift, one `chore:` commit.

## Credentials and safety

- Everything in `.env.example` is dev-only; `.env` is gitignored (already enforced). No real customer data ever enters this stack; fixture documents are created only in M0-C.
- The stack must never be referenced by deployment tooling for real customers; it lives under `deploy/local/` and the runbook states that explicitly.

## Testing

- **Offline (CI):** digest-consistency validator (compose ↔ manifest) with TDD; manifest schema/CLI extension tests; compose.yaml lint via YAML parse (offline).
- **Live (implementation-time, daemon required):** start → all four services healthy → restart-safe (stop/start preserves data) → `nuke` removes everything (`docker ps`, `docker volume ls` prove empty). Evidence recorded in the task report.

## Out of scope

- Product web/API/worker, reverse proxy, TLS, malware scanning, monitoring, backups (M1+).
- Fixture documents (M0-C).
- Multi-customer or production-postgres topology (per-customer isolation is an M1 deployment concern).

## Risks / notes

- Docker daemon availability on Windows depends on Docker Desktop running — implementation stops at NEEDS_CONTEXT if the daemon is unreachable, rather than hacking around it.
- Paperless readiness endpoint and DocuSeal `/up` are assumptions to verify live; the design names the fallback path rather than guessing wrong.
- Digest-pinned images make `docker compose up` fully reproducible; upstream `latest` drift is impossible by construction.
