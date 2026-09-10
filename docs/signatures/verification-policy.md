# PDF Signature Verification Policy

**Status:** Draft for product, security, and legal review  
**Owner:** Architecture team  
**Applies to:** V1

## Scope

V1 presents a technical signature-verification result derived from the configured DocuSeal verification adapter and approved trust policy. It is not a legal opinion and must not make compliance claims beyond verified, documented capabilities.

## Canonical display status

| Status | Meaning |
|---|---|
| `unsigned` | No embedded signature was reported for the evaluated bytes. |
| `valid_trusted` | Signature integrity was reported valid and the signer chain met the configured trust policy. |
| `valid_untrusted` | Signature integrity was reported valid, but the configured trust policy did not establish trust. |
| `invalid` | The verifier reported an invalid, altered, or otherwise failed signature result. |
| `error` | Verification could not complete or could not be interpreted safely. |

Integrity, trust, and DocuSeal provenance are stored and displayed as distinct dimensions. A DocuSeal-originated file is not automatically cryptographically valid; an externally originated file can be valid and trusted.

## Evidence

Each run records the Paperless document ID, SHA-256 of bytes evaluated, retrieval time, verifier/adapter version, trust-policy version, normalized result, per-signature summaries where supplied, and a controlled reference to raw verifier output. Manual re-verification creates a new run; it does not rewrite prior evidence.

## Limits and communication

The UI must show the evaluated time and policy version and offer detail appropriate to the user role. Claims about revocation checking, time-stamping, PAdES long-term validation, eIDAS, qualified signatures, or legal enforceability require separate verified capability and legal approval. An `error` result must never be displayed as unsigned or valid.

## M0-D implementation record

The M0-D verification adapter (`packages/verification`, adapter version `1.0.0`) implements this policy's result model as an offline evaluation over exact input bytes:

- **Engine:** Node's built-in `node:crypto` for digest and signature verification, plus `node-forge` for ASN.1/PKCS#7 structure and X.509 certificate parsing. Fully offline; no upstream service calls at M0-D.
- **Result model:** one canonical five-word status (`unsigned`, `valid_trusted`, `valid_untrusted`, `invalid`, `error`) derived from three independently evaluated dimensions — integrity (a cryptographic fact), trust (a configured-policy fact), and provenance (an origin fact). Provenance never influences integrity, trust, or status, and trust is never asserted on an integrity failure (fail-safe evaluation order). Every result carries evidence: SHA-256 of the evaluated bytes, adapter version, trust-policy version, and per-signature summaries.
- **Provenance heuristic:** M0-D derives provenance from the signer certificate subject common name only (CN containing `DocuSeal` → `docuseal`; any other identified signer → `external`; no signer identified → `none`). This heuristic is deliberately recorded as spoofable: an attacker-controlled certificate can carry a DocuSeal-named CN and claim `docuseal` provenance. This is acceptable because provenance is an origin fact that cannot change integrity, trust, or status (invariant is tested); M1+ replaces the heuristic with submission correlation against the product database.
- **Unsigned-detection limit:** the adapter reports `unsigned` when its byte scan finds no signature dictionary. A structurally plausible PDF whose signature dictionaries have been deliberately destroyed can therefore scan as `unsigned` rather than `invalid` — an inherent limit of PDF format inspection at M0-D, not a claim that the document was never signed.
- **Restated limits:** everything in [Limits and communication](#limits-and-communication) is unchanged by the implementation: no revocation checking, no cryptographic timestamp validation, no PAdES conformance, no eIDAS or qualified-signature claims, and no legal-enforceability statements. An `error` result must never be displayed as unsigned or valid; a broken check is an error, never a verdict.

The document status remains Draft for product, security, and legal review: M0-D provides the verified engine behind the documented vocabulary and changes no claim above.

