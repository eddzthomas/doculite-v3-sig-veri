# M0-A: Upstream Version Pinning — Design

**Status:** Draft for approval  
**Date:** 2026-09-06  
**Parent roadmap:** `docs/delivery/roadmap.md` Phase 0, deliverable "Pin the initial Paperless-ngx and DocuSeal releases by tag, commit, and container digest"  
**Policy source:** `docs/engineering/upstream-upgrade-policy.md`

## Purpose

Record the exact initially-supported Paperless-ngx and DocuSeal versions — tag, commit SHA, release date, container image reference, and multi-arch image digest — in a machine-readable, committed manifest, so that every later milestone (compose stack, fixtures, adapter proof, per-customer deployment) builds against identical, auditable upstream artifacts and never against `latest` or a mutable tag.

## Pinning policy (decided)

Latest stable release of each component at execution time:

- **Paperless-ngx:** newest stable tag from `github.com/paperless-ngx/paperless-ngx` (expected `v3.1.x` line; research on 2026-09-06 found v3.1.3 released 2026-09-04 — the implementation must verify live via the GitHub API, not trust research).
- **DocuSeal:** newest stable tag from `github.com/docusealco/docuseal` (expected `3.2.x` line; verify live).

Pre-release, beta/rc, and `latest` tags are never eligible.

## Deliverables

1. **`deploy/upstream-versions.json`** — the manifest. Schema:

```json
{
  "capturedAt": "YYYY-MM-DD",
  "components": [
    {
      "name": "paperless-ngx",
      "repository": "https://github.com/paperless-ngx/paperless-ngx",
      "tag": "v3.1.3",
      "releaseUrl": "https://github.com/paperless-ngx/paperless-ngx/releases/tag/v3.1.3",
      "releaseDate": "YYYY-MM-DD",
      "commitSha": "40-hex commit SHA that the tag points to",
      "image": {
        "registry": "ghcr.io",
        "repository": "paperless-ngx/paperless-ngx",
        "tagRef": "v3.1.3",
        "digest": "sha256:... multi-arch index digest of the image for that tag"
      },
      "evidence": {
        "githubApi": "the API URL the commit SHA was fetched from",
        "registryApi": "the registry endpoint the digest was fetched from"
      }
    },
    { "name": "docuseal", "...same shape..." : "..." }
  ]
}
```

2. **`scripts/pin-upstream.mjs`** — Node script, two modes:
   - `fetch` — resolves the newest eligible stable tag per component via the GitHub releases API, resolves the tag's commit SHA, resolves the container image digest for that tag from the registry, and writes the manifest.
   - `validate` — re-derives tag/digest facts and reports any drift between the manifest and live registries (used by the upgrade procedure's rehearsal step; not wired into CI in this milestone).
   - Registry access is anonymous (GitHub public API, GHCR anonymous token flow, Docker Hub registry API). No credentials, ever. If a registry requires auth or the digest cannot be resolved anonymously, the script fails loudly rather than writing a partial pin.

3. **Doc updates** (single `docs:` commit):
   - `docs/engineering/upstream-upgrade-policy.md`: add a short "Current pins" line pointing at `deploy/upstream-versions.json` as the authoritative record.
   - `AGENTS.md` "Current state": replace the "no pinned upstream versions yet" bullet with one stating pins are recorded in `deploy/upstream-versions.json` and must be re-pinned explicitly via the upgrade policy.
   - `docs/nontechnical/agents-guide.md`: verified 2026-09-06 to make no pinning claims — no change required. If implementation finds otherwise, update the matching sentence in the same commit.
   - `docs/integrations/paperless-integration.md` and `docuseal-integration.md` remain Draft — their statuses demand pinned-release *behavioral* verification, which is M0-C/M0-D work.

## Registry selection

Prefer GHCR for both components (`ghcr.io/paperless-ngx/paperless-ngx`, `ghcr.io/docusealco/docuseal`). If DocuSeal's GHCR path is not resolvable anonymously, fall back to Docker Hub (`docusealco/docuseal`) and record the actual registry used in the manifest. The digest recorded is always the multi-arch index digest (`sha256:` of the manifest list), not a single-platform manifest digest.

## Testing

- TDD on offline logic in `scripts/test/`: manifest schema validation (required fields, sha256 digest format, 40-hex commit, ISO dates, no `latest`/prerelease tags), drift report generation, and manifest writing (round-trip). Registry/GitHub responses are injected as fixtures — no network in tests.
- The `fetch` mode is validated for real by running it once during execution and committing its output; `validate` mode must exit 0 immediately after (proving manifest and live registries agree).
- Quality gate unchanged: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm validate:docs`, `pnpm build`; new code Biome-clean; all work lands via PR through the now-protected `main` (CI required).

## Out of scope

- Compose stack and runtime bring-up (M0-B).
- Behavioral/API contract verification of the pinned releases (M0-C/D).
- The DocuSeal commercial-license decision (LIC-001) — this milestone produces the version evidence that decision consumes.
- Pinning Paperless' infrastructure dependencies (PostgreSQL, Redis) — decided with the M0-B compose design.

## Risks / notes

- Upstream may publish a newer stable between research and execution; the policy is "latest stable at execution time", so the manifest records whatever the live API returns — the dates and tags in this spec are expectations, not requirements.
- The `validate` mode is the seed of the upgrade rehearsal tooling; do not gold-plate it (no scheduling, no auto-PRs).
