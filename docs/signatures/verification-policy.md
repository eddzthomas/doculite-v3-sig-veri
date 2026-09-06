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

