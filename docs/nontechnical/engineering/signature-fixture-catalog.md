# Signature Fixture Catalog: Plain-Language Version

We maintain safe sample PDFs that represent the situations customers may encounter: no signature, a trusted signature, an untrusted but intact signature, a changed-after-signing PDF, a damaged PDF, multiple signatures, documents signed through DocuSeal, documents signed elsewhere, and a temporarily unavailable checking service.

Each sample has an expected result. This helps ensure future changes do not accidentally change what the system reports.

The samples are now real, checked-in files: eight are test PDFs (each with a recorded fingerprint so the team can verify the file has not changed), and the ninth is a recorded example of what happens when the checking service is temporarily unavailable. One PDF was signed through the real signing service during a controlled test session and, because that service's certificate is not a recognized authority, it is expected to be reported as intact but untrusted — which is exactly what should happen for a document signed by an outside service we do not vouch for.

