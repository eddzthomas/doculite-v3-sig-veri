# Signature Fixture Catalog

**Status:** Draft for approval  
**Owner:** QA Lead

Fixtures must be legally shareable, non-sensitive PDFs stored outside production data. Each fixture records source, checksum, expected normalized status, integrity result, trust result, provenance expectation, and compatible verifier version.

| Fixture ID | Condition | Expected product outcome |
|---|---|---|
| SIG-001 | Unsigned PDF | `unsigned` |
| SIG-002 | Valid signature trusted by configured policy | `valid_trusted` |
| SIG-003 | Valid signature not trusted by configured policy | `valid_untrusted` |
| SIG-004 | Content altered after signing | `invalid` |
| SIG-005 | Malformed/unsupported signature container | `error` or documented invalid outcome |
| SIG-006 | Multiple signatures with mixed trust | Documented aggregate and per-signature evidence |
| SIG-007 | Completed DocuSeal document | Validity independent from expected provenance result |
| SIG-008 | Valid external signature | Validity independent from DocuSeal provenance |
| SIG-009 | Verifier transport/service failure | `error`, retry behavior, no false status |

Fixture updates require a recorded re-baseline after verifier or trust-policy changes.

