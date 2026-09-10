# Signature Fixture Catalog

**Status:** Active — M0-C fixtures generated, captured, and committed
**Owner:** QA Lead

Fixtures must be legally shareable, non-sensitive PDFs stored outside production data. Each fixture records source, checksum, expected normalized status, integrity result, trust result, provenance expectation, and compatible verifier version. The authoritative machine-readable values live in `fixtures/signatures/signatures-manifest.json`; this catalog summarizes it and must not diverge from it. Outcomes use only the normalized vocabulary (`unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, `error`) per `docs/signatures/verification-policy.md`.

## Inventory

| Fixture ID | Condition | Expected product outcome | Source / construction |
|---|---|---|---|
| SIG-001 | Unsigned PDF | `unsigned` | Generator: pdf-lib document only, no signature |
| SIG-002 | Valid signature, root-A in candidate trust policy | `valid_trusted` | Generator: leaf(A) over pdf-lib document |
| SIG-003 | Valid signature, root-B not in candidate trust policy | `valid_untrusted` | Generator: leaf(B) over pdf-lib document |
| SIG-004 | Content altered after signing | `invalid` | Generator: single-byte mutation of sig-002 inside the signed range |
| SIG-005 | Malformed signature container | `error` | Generator: PKCS#7 hex corruption of sig-002 |
| SIG-006 | Multiple signatures with mixed trust | `valid_untrusted` | Generator: leaf(A) then leaf(B) incremental signatures; aggregate and per-signature evidence is asserted in the offline replay tests |
| SIG-007 | Completed DocuSeal document | `valid_untrusted` | Live capture from pinned DocuSeal 3.2.4 during the M0-C capture session: real PKCS#7 detached signature under the self-signed certificate DocuSeal embeds at signing |
| SIG-008 | Valid external signature | `valid_untrusted` | Generator: leaf(B) over a distinct document (proves validity is independent of DocuSeal provenance) |
| SIG-009 | Verifier transport/service failure | `error` | Scenario fixture: recorded verifier-unreachable and verifier-rejects-malformed-input exchanges at `fixtures/docuseal/verifier-error.json` (no PDF bytes) |

Trust expectations follow the fixture trust paths: root-A is in the candidate policy and root-B is not, so SIG-002 is the only `valid_trusted` outcome; every live-certificate fixture — including SIG-007, whose signature comes from DocuSeal's self-signed capture-time certificate — is `valid_untrusted`. Provenance never changes cryptographic validity (ADR-006).

## Checksums (sha256, from the manifest)

- SIG-001 `sig-001.pdf`: `04efb22bb7709c1cafb5921b56084cade0343f03e411241f98ec5275165775f2`
- SIG-002 `sig-002.pdf`: `72fe4e53e5eeae01eed24b2e1895c1255dbd240a3c0fc08e89467d58d3ad9336`
- SIG-003 `sig-003.pdf`: `93d24f5df81c39b4eea7f811f4f88276e67ee92d431e0c8231bb2f0b918e551a`
- SIG-004 `sig-004.pdf`: `44588802af0776c2393d5b1af2ddafe91aa3dec8484124995decd8b163f023a8`
- SIG-005 `sig-005.pdf`: `d1e8035f27a71523080b324e66f381c5852e9dac31aac2258af385a74f681070`
- SIG-006 `sig-006.pdf`: `40e4b2d062f2b4774a6a16bab6acffa9d14ba2ee8d13ed30fb93183f33b608d4`
- SIG-007 `sig-007.pdf`: `931948a6acec8086e1ad486b9b765116e4efe256ee4c41297fa071473ee84d5a`
- SIG-008 `sig-008.pdf`: `c4be9caccfcc3542cdabce537bc5f0b3b844bd3fe0de92c581f0910602274e90`
- SIG-009: none (scenario recording, not a PDF)

SIG-009 has no checksum by design: it is a recorded interaction scenario (`fixtures/docuseal/verifier-error.json`), replayed by the verifier wrapper, not a byte fixture. The replay tests verify every PDF-backed fixture's checksum against the manifest at test time.

## Capture provenance

- Generator-produced fixtures (SIG-001–SIG-006, SIG-008): generated 2026-09-08 (manifest `generatedAt` 2026-09-08T20:33:33.077Z, generator version 1.0.0) by `node scripts/generate-fixtures/generate-all.mjs`. Signing keys are not committed; only the public test roots and leaf certificates are (`fixtures/signatures/root-a.pem`, `root-a-leaf.pem`, `root-b.pem`, `root-b-leaf.pem`). These are synthetic, test-only certificate chains and must never be added to a production trust policy.
- SIG-007: captured live from the pinned DocuSeal 3.2.4 stack on 2026-09-09 (manifest `capturedAt` 2026-09-09T03:53:29.065Z) during the capture session in `docs/operations/deployment-runbook.md`; the completed PDF bytes are committed as `fixtures/signatures/sig-007.pdf` and its sha256 is recorded by the capture script at capture time.
- Paperless contract recordings (`fixtures/paperless/*.json`: `auth`, `upload-polling`, `search-list`, `preview`, `metadata`, `download`, `permissions`) were captured 2026-09-09 against pinned Paperless-ngx v3.1.3.
- DocuSeal contract recordings (`fixtures/docuseal/*.json`: `submissions`, `progress`, `webhook`, `verifier-error`) were captured 2026-09-09 against pinned DocuSeal 3.2.4.

Recordings are contract fixtures, not customer data: no real documents, signer identities (signers are synthetic, e.g. `signer@example.com`), credentials, tokens, capability URLs, or admin emails are committed. Capture scripts sanitize recordings and a write-guard refuses to write unredacted content.

## Compatible verifier versions

Recordings and captured bytes are valid only against the pinned upstream versions in `deploy/upstream-versions.json` (Paperless-ngx v3.1.3, DocuSeal 3.2.4). After any upstream re-pin, re-capture per the "Fixture capture session" section of `docs/operations/deployment-runbook.md` and re-baseline this catalog.

## Re-baseline rule

Fixture updates require a recorded re-baseline after verifier or trust-policy changes: regenerate and/or re-capture, record the new checksums and capture dates in `signatures-manifest.json`, update this catalog in the same change, and re-run the offline replay suites. Do not edit committed fixture bytes by hand.
