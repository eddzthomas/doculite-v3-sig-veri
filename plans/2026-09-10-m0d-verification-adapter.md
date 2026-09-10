# M0-D Verification Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the product-owned verification adapter (`@doculite/verification`) — ByteRange extraction, range digests, PKCS#7/CMS parsing, cryptographic verification, configured-trust evaluation, DocuSeal-provenance heuristic, evidence records — and prove it offline against the SIG-001..009 fixture set.

**Architecture:** A TypeScript workspace package (source-imported, no build step) with a pure result model (`status` derived from three separate dimensions by a total function), a cryptographic core (`node:crypto` + `node-forge`), a versioned trust-policy loader, and a thin CLI. Everything is offline; the SIG fixtures are the only PDF inputs.

**Tech Stack:** TypeScript (matching `@doculite/shared` conventions), `node:crypto`, `node-forge` (existing devDependency pattern — added as this package's dependency), Vitest, Biome.

**Spec:** `plans/specs/2026-09-10-m0d-verification-adapter-design.md` (spec travels with this plan).

## Global Constraints

- **Offline only:** every test runs without network/daemon; SIG fixtures are the only PDF inputs; no Paperless/DocuSeal calls anywhere in the package.
- **Vocabulary discipline:** only `unsigned | valid_trusted | valid_untrusted | invalid | error` for `status`; integrity ∈ `valid|invalid|error`; trust ∈ `trusted|untrusted|error`; provenance ∈ `docuseal|external|none`; no eIDAS/QES/PAdES/compliance language anywhere.
- **Three-dimension separation:** provenance never changes integrity or trust (tested invariant).
- **Fail-safe defaults:** unknown algorithms, unparseable structures, missing/unparseable policy → `error`, never a validity status. No document bytes or signer PII in error messages.
- **RSA only at M0-D:** fixtures are RSA-2048; unsupported key algorithms → `error` with evidence, never a guess.
- **Conventional commits; no LICENSE changes; PR flow** on branch `m0d-verification-adapter`, `quality` check green, squash-merge to protected `main`.
- **Adapter version constant:** `1.0.0` (travels into every evidence record).

---

### Task 1: Package scaffold + result model (TDD)

**Files:**
- Create: `packages/verification/package.json`
- Create: `packages/verification/tsconfig.json`
- Create: `packages/verification/src/index.ts`
- Create: `packages/verification/src/result.ts` — result model types + `deriveStatus`
- Create: `packages/verification/test/result.test.ts`
- Create: `packages/verification/.biometric-ignore` — no; Biome covers via root config (do NOT create)

**Interfaces:**
- Consumes: canonical vocabulary types from `@doculite/shared` (`workspace:*` dependency; `packages/shared/src/verification-outcomes.ts` already exports the canonical `status` union — re-use or mirror it; mirror if shared's export shape doesn't fit, and keep the five words identical).
- Produces (used by Tasks 2–4):
  - `type VerificationResult`, `type PerSignatureSummary`, `type EvidenceRecord` per spec (exact field names from the spec's Result model / Evidence record / per-signature summary)
  - `deriveStatus(d: { integrity: 'valid'|'invalid'|'error'; trust: 'trusted'|'untrusted'|'error'; signed: boolean }): 'unsigned' | 'valid_trusted' | 'valid_untrusted' | 'invalid' | 'error'` — total, pure
  - `ADAPTER_VERSION = '1.0.0'` constant

- [ ] **Step 1: Scaffold the package**

`packages/verification/package.json` (mirror `@doculite/shared`'s shape):

```json
{
  "name": "@doculite/verification",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@doculite/shared": "workspace:*",
    "node-forge": "^1.4.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/node-forge": "^1.3.11",
    "typescript": "^7.0.2",
    "vitest": "^5.0.0"
  }
}
```

Run: `pnpm install` (wires the workspace link).

`packages/verification/tsconfig.json` (mirror `packages/shared/tsconfig.json` values; `compilerOptions.noEmit` true).

- [ ] **Step 2: Write failing tests for `deriveStatus`**

`packages/verification/test/result.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { ADAPTER_VERSION, deriveStatus } from '../src/result.ts'

describe('deriveStatus', () => {
  it('unsigned: not signed and nothing failed', () => {
    expect(deriveStatus({ signed: false, integrity: 'valid', trust: 'untrusted' })).toBe('unsigned')
  })
  it('valid_trusted / valid_untrusted', () => {
    expect(deriveStatus({ signed: true, integrity: 'valid', trust: 'trusted' })).toBe('valid_trusted')
    expect(deriveStatus({ signed: true, integrity: 'valid', trust: 'untrusted' })).toBe('valid_untrusted')
  })
  it('integrity invalid → never valid_*', () => {
    expect(deriveStatus({ signed: true, integrity: 'invalid', trust: 'trusted' })).toBe('invalid')
    expect(deriveStatus({ signed: true, integrity: 'invalid', trust: 'untrusted' })).toBe('invalid')
  })
  it('error anywhere → error (never a validity status)', () => {
    expect(deriveStatus({ signed: true, integrity: 'error', trust: 'trusted' })).toBe('error')
    expect(deriveStatus({ signed: true, integrity: 'valid', trust: 'error' })).toBe('error')
    expect(deriveStatus({ signed: false, integrity: 'valid', trust: 'error' })).toBe('error')
  })
  it('unsigned with integrity error still surfaces error', () => {
    expect(deriveStatus({ signed: false, integrity: 'error', trust: 'untrusted' })).toBe('error')
  })
  it('exports the adapter version', () => {
    expect(ADAPTER_VERSION).toBe('1.0.0')
  })
})
```

- [ ] **Step 3: RED — run**

Run: `pnpm --filter @doculite/verification test`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `src/result.ts`**

```typescript
import type { VerificationStatus } from './types.ts'

export const ADAPTER_VERSION = '1.0.0'

export interface Dimensions {
  signed: boolean
  integrity: 'valid' | 'invalid' | 'error'
  trust: 'trusted' | 'untrusted' | 'error'
}

// Total, pure status derivation. Typed invariants (each tested):
// - error anywhere → 'error' (never displayed as unsigned or valid)
// - integrity invalid → 'invalid', never 'valid_*'
// - unsigned + nothing failed → 'unsigned'
export function deriveStatus(d: Dimensions): VerificationStatus {
  if (d.integrity === 'error' || d.trust === 'error') return 'error'
  if (!d.signed) return 'unsigned'
  if (d.integrity === 'invalid') return 'invalid'
  return d.trust === 'trusted' ? 'valid_trusted' : 'valid_untrusted'
}
```

(`src/types.ts` holds `VerificationStatus`, `Integrity`, `Trust`, `Provenance`, `PerSignatureSummary`, `EvidenceRecord` with the exact spec field names; keep the five-word status union identical to `@doculite/shared`'s canonical type — if shared exports it, import and re-export it instead of duplicating.)

- [ ] **Step 5: GREEN + full gate + commit**

Run: `pnpm --filter @doculite/verification test` → PASS. Then: `pnpm format; pnpm lint; pnpm typecheck; pnpm test; pnpm validate:docs` → all exit 0.

```bash
git add packages/verification pnpm-lock.yaml
git commit -m "feat: scaffold verification adapter package with result model"
```

---

### Task 2: Cryptographic verifier core (integrity dimension)

**Files:**
- Create: `packages/verification/src/verifier.ts`
- Create: `packages/verification/test/verifier.test.ts`
- Create: `packages/verification/src/policy.ts` — stub in this task ONLY as `{ version: null, anchors: [] }` placeholder loader so trust integration lands in Task 3 without interface churn (clearly marked `// Task 3 replaces the stub`)

**Interfaces:**
- Consumes: `Dimensions`, types from Task 1; fixture PDFs from `fixtures/signatures/`.
- Produces (used by Tasks 3–4):
  - `scanSignatures(bytes: Uint8Array): Array<{ byteRange: [number, number, number, number], contentsHex: string } | { malformed: true }>` — ByteRange scan + `/Contents` extraction.
  - `verifySignature(bytes, sig): { integrity: 'valid'|'invalid'|'error'; detail: string; signer?: {...} }` — the cryptographic core.
  - `evaluateIntegrity(bytes): { integrity, perSignature: [...], raw }` — the document-level integrity call used by Task 4.

- [ ] **Step 1: Write failing fixture tests (RED)**

`packages/verification/test/verifier.test.ts` — structure:

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateIntegrity } from '../src/verifier.ts'

const SIG = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'signatures')
const pdf = (name: string) => new Uint8Array(readFileSync(join(SIG, name)))

describe('evaluateIntegrity (integrity dimension only)', () => {
  it('SIG-001 unsigned pdf → no signatures', () => {
    const r = evaluateIntegrity(pdf('sig-001.pdf'))
    expect(r.integrity).toBe('valid')
    expect(r.perSignature).toHaveLength(0)
  })
  it('SIG-002 valid PKCS#7 over covered ranges → integrity valid', () => {
    const r = evaluateIntegrity(pdf('sig-002.pdf'))
    expect(r.integrity).toBe('valid')
    expect(r.perSignature[0].signatureAlgorithm).toMatch(/RSA/i)
    expect(r.perSignature[0].signerCertFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
  it('SIG-004 one-byte tamper → integrity invalid', () => {
    expect(evaluateIntegrity(pdf('sig-004.pdf')).integrity).toBe('invalid')
  })
  it('SIG-005 corrupted container → error', () => {
    expect(evaluateIntegrity(pdf('sig-005.pdf')).integrity).toBe('error')
  })
  it('SIG-006 two signatures, both integrity-valid', () => {
    const r = evaluateIntegrity(pdf('sig-006.pdf'))
    expect(r.integrity).toBe('valid')
    expect(r.perSignature).toHaveLength(2)
  })
  it('SIG-007 real docuseal PKCS#7 → integrity valid', () => {
    expect(evaluateIntegrity(pdf('sig-007.pdf')).integrity).toBe('valid')
  })
  it('garbage input → error (never a validity status)', () => {
    expect(evaluateIntegrity(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0x01])).integrity).toBe('error')
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement `verifier.ts`**

Implementation notes (the engineering content):
- ByteRange scan: `/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g` over the byte string (latin1). Coverage check: `start1 === 0` and `start2 + len2 === bytes.length` for every signature; a violation → `error` (gap covered — structurally broken).
- `/Contents\s*<([0-9A-Fa-f]+)>` → hex → bytes → `forge.asn1.fromDer` → `forge.pkcs7.messageFromAsn1`. Parse failure → `error`, detail names the step (no byte dumps).
- Content digests: SHA-256 of `[start1, len1]` and `[start2, len2]` regions (`node:crypto` createHash).
- Message-digest attribute: locate the signer's authenticated attributes (`messageDigest` OID 1.2.840.113540.1.7.1 is WRONG — use 1.2.840.113549.1.9.4, RFC 5652); compare against computed digest of the content ranges. Mismatch → `invalid` (content tampered after signing — SIG-004).
- Crypto verify: verify the signature over the DER-encoded authenticated attributes with the signer certificate's RSA public key (`forge.pki.rsa.verify` over a `forge.md.sha256` of the attributes DER). Failure → `invalid`. Unknown key algorithm → `error`.
- Digest-algorithm flexibility: read the CMS digestAlgorithm OID; support SHA-256 (and SHA-1 only to *classify* legacy containers as `error` with a clear note — fixtures are all SHA-256).
- Per-signature summary fields exactly per spec (`PerSignatureSummary`).
- **Live-fix expectation:** `node-forge`'s PKCS#7 verify path has known quirks (authenticatedAttributes DER re-encoding must be byte-exact — use the raw DER slice, not a re-encode). If forge's high-level `message.verify` doesn't fit detached PDF signatures, do the attribute-DER + RSA-verify manually as described; the FIXTURE ASSERTIONS are the contract, not the API choice.

- [ ] **Step 3: GREEN + full gate + commit**

Run: `pnpm --filter @doculite/verification test` → PASS. Then `pnpm format; pnpm lint; pnpm typecheck; pnpm test; pnpm validate:docs` → exit 0.

```bash
git add packages/verification
git commit -m "feat: verify pdf signature integrity with node crypto and forge"
```

---

### Task 3: Trust policy (trust dimension)

**Files:**
- Modify: `packages/verification/src/policy.ts` (replace the stub)
- Create: `packages/verification/policies/v1.json`
- Create: `packages/verification/test/policy.test.ts` + trust tests in a new `packages/verification/test/trust.test.ts`
- Modify: `packages/verification/src/verifier.ts` (export chain-building pieces for trust use)

**Interfaces:**
- Consumes: `fixtures/signatures/root-a.pem` / `root-b.pem` (committed cert-only PEMs).
- Produces (used by Task 4):
  - `loadPolicy(path: string): { version: string, anchors: Array<{ name: string, sha256: string }> }` — throws on missing/unparseable (caller maps to `error`).
  - `evaluateTrust(signerChain, policy): { trust: 'trusted'|'untrusted'|'error'; anchoredAt: string | null }` — trust iff the chain terminates at a root whose SHA-256 fingerprint (DER bytes) is an anchor.
- `policies/v1.json`: `{ "version": "1", "anchors": [{ "name": "root-a", "sha256": "<computed>" }] }` — the fingerprint value is COMPUTED from the committed root-a.pem during implementation and written into the file (a test recomputes and asserts it matches, so the file can't drift).

- [ ] **Step 1: Write failing tests (RED)** — anchor-from-pem test (computes root-A fingerprint, asserts it equals the committed policy value), trust evaluation tests (chain rooted in root-A → trusted with `anchoredAt: 'root-a'`; root-B chain → untrusted; chain with no embedded intermediates and unknown root → untrusted; corrupt policy JSON → load throws; missing anchors → every evaluate returns `error`-safe behavior via caller).
- [ ] **Step 2: Implement** — `policy.ts` per interfaces; fingerprint helper computes SHA-256 over the certificate DER (forge ASN.1 encode), test derives it from `root-b.pem` to assert the root-B anchor is ABSENT from v1.
- [ ] **Step 3: GREEN + full gate + commit** — `feat: add versioned trust policy evaluation`

---

### Task 4: Provenance + evidence + full fixture matrix (TDD)

**Files:**
- Create: `packages/verification/src/provenance.ts`
- Create: `packages/verification/src/evidence.ts`
- Create: `packages/verification/src/verify.ts` — orchestrates pipeline → `VerificationResult`
- Create: `packages/verification/test/matrix.test.ts`, `packages/verification/test/provenance.test.ts`, `packages/verification/test/invariants.test.ts`
- Modify: `packages/verification/src/index.ts` (public API: `verifyPdf(bytes, { policyPath })`)

**Interfaces:**
- Consumes: Tasks 1–3 exports.
- Produces: `verifyPdf(bytes, opts): VerificationResult` — the public API; plus `ADAPTER_VERSION` re-export, types re-export.

- [ ] **Step 1: Write the full 9-fixture matrix test (RED)**

`packages/verification/test/matrix.test.ts` — reads `fixtures/signatures/signatures-manifest.json` and asserts for every PDF-backed item: `verifyPdf(...).status === item.expectedOutcome` **and** the per-fixture dimensions:

| Fixture | integrity | trust | provenance |
|---|---|---|---|
| SIG-001 | valid | untrusted | none |
| SIG-002 | valid | trusted | external |
| SIG-003 | valid | untrusted | external |
| SIG-004 | invalid | untrusted | external |
| SIG-005 | error | error | none |
| SIG-006 | valid | untrusted | external (2 perSignature: one trusted, one untrusted) |
| SIG-007 | valid | untrusted | docuseal |
| SIG-008 | valid | untrusted | external |

SIG-009 (scenario) gets unit tests over the error paths instead: garbage bytes → `error`; truncated container → `error`; assert evidence.errorDetail names the step without containing input bytes.

Provenance determination: signer cert subject CN contains `DocuSeal` (SIG-007's embedded cert) → `docuseal`; else `external`; unsigned → `none`. The heuristic is recorded in every result's evidence notes (spec: M0-D heuristic; M1+ moves to submission correlation).

- [ ] **Step 2: Implement provenance.ts + evidence.ts + verify.ts** — orchestration: `evaluateIntegrity` → per-signature `evaluateTrust` → per-signature provenance → aggregate dimensions (fail-safe roll-up per spec: any `invalid` → invalid; any `error` → error; else trust decides) → `deriveStatus` → evidence record (`evaluatedSha256`, `adapterVersion`, `policyVersion`, `raw`, `errorDetail` when applicable).
- [ ] **Step 3: Invariant property tests** — for every fixture result: no `valid_*` unless integrity `valid`; `error` propagates; provenance matches the independent per-signature subject facts.
- [ ] **Step 4: GREEN + full gate + commit** — `feat: normalize and prove adapter results against the sig fixture set`

---

### Task 5: CLI + documentation

**Files:**
- Create: `packages/verification/bin/verify.mjs` — CLI: `node packages/verification/bin/verify.mjs <pdf> [--policy <path>]` → prints normalized JSON result. Thin wrapper importing `src/verify.ts` (ts source import works via Node's TS support in v24 — if not, keep the CLI as `.mjs` importing the built behavior through the package's source path exactly as the workspace does for shared).
- Modify: `docs/signatures/verification-policy.md` — add "M0-D implementation record" section (engine: node:crypto + node-forge; adapter v1.0.0; provenance = cert-subject heuristic, M1+ moves to submission correlation; limits restated). Status stays Draft for legal/product review.
- Modify: `docs/nontechnical/signatures/verification-policy.md` — same-commit companion paragraph (what the adapter can and cannot claim).
- Modify: `docs/engineering/signature-fixture-catalog.md` — add one line above the table: fixtures verified against adapter v1 (status per catalog expectations); re-baseline rule intact.
- Check: `docs/delivery/requirements-traceability.md` — link if the convention supports it; else record the decision.

- [ ] **Step 1: CLI** — runs offline, exits 0 on any *successful* verification (including `invalid`/`error` results — the CLI is a viewer; exit 1 only on usage errors). Prints result JSON.
- [ ] **Step 2: Docs** — real values only; no TODO/TBD; companions together.
- [ ] **Step 3: Gate + commit** — `pnpm validate:docs; pnpm lint; pnpm test; pnpm typecheck; pnpm build` → `docs: record verification adapter implementation`

---

### Task 6: PR, CI, merge, final review

- [ ] **Step 1:** `git log origin/main..HEAD --oneline` sanity (spec commit + 5 task commits) → `git push`
- [ ] **Step 2:** `gh pr create --base main --head m0d-verification-adapter --title "feat: add product-owned signature verification adapter" --body "Implements plans/specs/2026-09-10-m0d-verification-adapter-design.md (plan: plans/2026-09-10-m0d-verification-adapter.md). Product-owned cryptographic verifier (node:crypto + node-forge), three-dimension result model (integrity/trust/provenance, provenance never influences the others), versioned trust policy v1 (root-A anchor), proven offline against SIG-001..009 with the normalized five-word vocabulary. Offline only; no Paperless/DocuSeal wiring; no compliance claims (policy Limits)."` (--body-file on PowerShell)
- [ ] **Step 3:** `gh pr checks --watch` → `quality` green → `gh pr merge --squash --delete-branch` → `git checkout main; git pull`
- [ ] **Step 4:** Post-merge `pnpm test; pnpm typecheck; pnpm build` on main
- [ ] **Step 5:** Final whole-branch review (base `e813505` → squash head), deferred-minor triage, close out M0.
