# M0-D Verification Adapter Proof — Design

**Status:** Approved (design conversation 2026-09-10)
**Scope:** M0 sub-project D of Phase 0 (Evidence, decisions, project bootstrap)
**Spec owner:** Technical Lead
**Depends on:** M0-C fixtures (`fixtures/signatures/` SIG-001..009 complete, main @ `e813505`)

## Purpose

Prove the verification adapter the roadmap exit gate requires: "Prove the verification adapter against unsigned, valid, external, tampered, malformed, and multi-signature PDFs." This sub-project builds the product-owned verification engine (`@doculite/verification`), normalizes its results into the canonical five-word vocabulary with three distinct dimensions (integrity, trust, provenance), and proves it offline against the SIG fixture set. It does NOT wire Paperless/DocuSeal APIs (M1+), persist evidence (M1+), or claim revocation/timestamping/PAdES-LT capabilities (explicitly out per `docs/signatures/verification-policy.md`).

## Decisions (recorded from design conversation)

1. **Verification engine: product-owned, inside the adapter.** M0-C proved pinned DocuSeal 3.2.4 has no verification API (`routes.rb`: no verify route). The policy doc anticipates this ("undocumented interface → experimental → use an adapter, fixture tests, feature flag"). The adapter therefore contains a real cryptographic verifier rather than calling DocuSeal. No spike for a hidden endpoint (already ruled out by the routes.rb read).
2. **Crypto core: `node:crypto` + `node-forge`.** Native `node:crypto` for digests and signature verification; `node-forge` (already a repo devDependency) for ASN.1/PKCS#7 structure parsing. No new third-party verifier library; no subprocesses. We own the PDF-signature parsing edge cases — the SIG fixtures are the test set for exactly those.
3. **Package home: `packages/verification`** (`@doculite/verification`) — TypeScript, source-imported (same pattern as `@doculite/shared`: `main`/`exports` point at `src/index.ts`, no build step), vitest, biome, `typecheck = tsc --noEmit`.

## Result model

```ts
interface VerificationResult {
  status: 'unsigned' | 'valid_trusted' | 'valid_untrusted' | 'invalid' | 'error'
  integrity: 'valid' | 'invalid' | 'error'          // cryptographic fact only
  trust: 'trusted' | 'untrusted' | 'error'          // configured-policy fact only
  provenance: 'docuseal' | 'external' | 'none'      // origin fact only — never changes the other two
  perSignature: Array<PerSignatureSummary>
  evidence: EvidenceRecord
}
```

- `status` is derived by a **total function** with typed invariants, each tested:
  - `integrity: 'invalid' | 'error'` → status is `invalid` or `error`, never `valid_*`
  - `error` anywhere → status `error` (an `error` result is never displayed as unsigned or valid — policy rule)
  - `integrity: 'valid'` + `trust: 'trusted'` → `valid_trusted`; + `untrusted` → `valid_untrusted`
  - no `/ByteRange` found → `unsigned`, integrity `valid` (nothing to falsify), provenance `none`
- The three dimensions are stored and displayed separately; provenance never influences integrity or trust (AGENTS.md invariant).

## Verification pipeline

1. **Byte scan** — find `/ByteRange` occurrences (regex over the raw bytes; ASCII-safe). None → `unsigned`. One or more → per-signature work.
2. **Range digest** — SHA-256 over each covered byte region per ByteRange (via `node:crypto`), including the gap-free coverage check (regions must cover the whole file or the signature is structurally invalid → `error`).
3. **CMS parse** — extract the `/Contents` hex blob → DER → PKCS#7 SignedData (`node-forge.pkcs7`). Malformed container → `error` (distinguishable from content tampering by which step failed — SIG-005 vs SIG-004).
4. **Signature verify** — crypto-verify the CMS digest with the signer certificate's public key; verify the signed **message-digest attribute** equals the computed ByteRange digest (this is what catches SIG-004's one-byte tamper). Key-algorithm support at M0-D: RSA (what the fixtures use); unknown algorithms → `error` with evidence, never a guess.
5. **Trust evaluation** — build the signer chain from embedded certificates; trust iff it terminates at a root whose SHA-256 fingerprint is an anchor in the loaded policy. Expired/not-yet-valid signer certs are recorded in evidence but do NOT change the M0-D trust verdict (no revocation/time claims — policy Limits section); the cert validity window is recorded as evidence.
6. **Aggregate** — per-signature statuses roll up to the document status. Mixed trust (SIG-006: root-A sig + root-B sig) → `valid_untrusted` with per-signature detail preserved (catalog expectation). Any signature with integrity `invalid`/`error` → document `invalid`/`error` respectively (fail-safe aggregation).

## Trust policy

- Versioned JSON files: `packages/verification/policies/v1.json` = `{ version: '1', anchors: [{ name, sha256 }] }` (fingerprint = SHA-256 of the root cert DER bytes, computed from the committed `fixtures/signatures/root-a.pem` / `root-b.pem`).
- v1 anchors: root-A only (SIG-002 → `valid_trusted`). Root-B deliberately absent (SIG-003/008 → `valid_untrusted`).
- Loading takes a path; the loaded `version` travels into every evidence record. An unparseable/missing policy file → every run returns `error` (never a validity status).

## Provenance (M0-D heuristic, explicitly recorded as such)

- Determined from the signer certificate subject: DocuSeal-generated certs carry a DocuSeal-identifiable CN (proven by SIG-007: "Signed with DocuSeal.com" cert embedded in the real PKCS#7 signature). Match → `docuseal`; any other signer → `external`; unsigned → `none`.
- Every result carries an evidence note that this is the M0-D certificate-subject heuristic; submission-based correlation via the DocuSeal API is the M1+ production path.

## Evidence record

Per `docs/signatures/verification-policy.md` Evidence section, the adapter returns (does not persist):

```ts
interface EvidenceRecord {
  evaluatedSha256: string          // input bytes
  adapterVersion: string           // constant, e.g. '1.0.0'
  policyVersion: string | null     // null when policy failed to load
  paperlessDocumentId: null        // M0-D: no Paperless wiring yet
  retrievedAt: null                // M0-D: bytes are provided directly
  rawResultReference: null         // M0-D: full raw summary lives in perSignature/raw field below
  raw: unknown                     // controlled raw verifier output (offline proof only; M1+ replaces with a reference)
  errorDetail?: string             // when applicable — never contains document bytes or signer PII
}
```

Per-signature summary: `{ coveredRanges, digestAlgorithm, signatureAlgorithm, signerSubject, signerCertFingerprint, chainAnchoredAt (root name or null), certValidityWindow, integrity, trust, provenance, notes }`.

## Proof surface

- **Offline vitest suite** (`packages/verification/test/`) over all 9 SIG fixtures, asserting the expected `status` **and the three dimensions** per fixture:
  - SIG-001 → `unsigned` (integrity valid, provenance none)
  - SIG-002 → `valid_trusted` (integrity valid, trust trusted, provenance external)
  - SIG-003 → `valid_untrusted` (trust untrusted, provenance external)
  - SIG-004 → `invalid` (integrity invalid — the one-byte tamper caught by the digest-attribute check)
  - SIG-005 → `error` (container corruption at CMS parse; policy permits documented `invalid` — the test pins which of the two the adapter produces and documents why)
  - SIG-006 → `valid_untrusted` aggregate with 2 per-signature entries (one trusted, one untrusted)
  - SIG-007 → `valid_untrusted` (real PKCS#7, DocuSeal self-signed chain not in policy), provenance `docuseal`
  - SIG-008 → `valid_untrusted`, provenance `external`
  - SIG-009 is the scenario fixture — its failure shapes (transport failure, malformed input) are represented by unit tests over the error paths (verifier given unreachable/garbage input → `error`, never a validity status), not by a PDF
- **Property tests** (the typed invariants above): no `valid_*` without integrity `valid`; `error` propagates; status is a pure function of the dimensions.
- **Trust-policy negative tests**: policy load failure → `error`; anchor fingerprint mismatch → `untrusted`.
- **CLI** (`node packages/verification/bin/verify.mjs <pdf> [--policy <path>]`): prints the JSON result; for manual runs during M1 work. Not part of CI gates beyond lint.

## Documentation changes (same commit sets as behavior)

- `docs/signatures/verification-policy.md`: add the adapter-implementation record (engine choice, adapter version, provenance-heuristic note, scope limits restated) — Status stays Draft for legal/product review, but gains "M0-D implementation record" section.
- Companion `docs/nontechnical/signatures/verification-policy.md` updated in the same commit (plain-language: what the adapter can and cannot claim).
- `docs/engineering/signature-fixture-catalog.md`: add "verified against adapter v1" line to each fixture row (or a single line above the table), with the re-baseline rule intact.
- `docs/delivery/requirements-traceability.md`: link if a stable ID applies (only if the file's convention supports it — M0-C precedent).

## Global constraints (binding for the plan)

- **Offline only:** every test runs without network/daemon; the SIG fixtures are the only PDF inputs; no Paperless/DocuSeal calls anywhere in the package.
- **Vocabulary discipline:** only `unsigned | valid_trusted | valid_untrusted | invalid | error` for status; integrity/trust/provenance vocabularies as defined above; no eIDAS/QES/PAdES/compliance language anywhere in code or docs.
- **Three-dimension separation:** provenance never changes integrity or trust (tested invariant).
- **Fail-safe defaults:** unknown algorithms, unparseable structures, missing policy → `error`, never a validity status.
- **No document bytes or signer PII in error messages or logs.**
- **Conventional commits; no LICENSE changes; PR flow** on branch `m0d-verification-adapter`, `quality` check green, squash-merge to protected `main`.
- **node-signpdf deprecation note carries forward:** the M0-D dependency baseline records `node-forge` as the parsing dependency; no new runtime dependencies beyond what TS/vitest already require (crypto core stays `node:crypto`).

## Exit evidence

1. Offline suite green: all 9 fixtures with expected status + dimensions; property invariants green; policy-failure tests green.
2. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm validate:docs` all green; new package wired into workspace scripts (root `pnpm -r` picks it up).
3. Policy v1 committed with root-A anchor; CLI runs manually against a fixture and prints a normalized result.
4. Docs updated (policy implementation record + companions + catalog line).
5. PR merged with `quality` green; final whole-branch review completed.

## Non-goals

- Paperless document retrieval, DocuSeal API calls, webhook handling (M1+)
- Evidence persistence (M1+ DB)
- Revocation checking, timestamping, PAdES-LT/LTA, eIDAS, QES claims (policy Limits; separate capability + legal approval)
- Trust-policy management UI or APIs (M1+)
- Embedded signing / LIC-001 (separate human decision)
