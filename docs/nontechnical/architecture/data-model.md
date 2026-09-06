# What Information the Product Keeps

**Status:** Draft for stakeholder review

The product does not create a second full copy of the document library. It keeps a small coordination record: which document was sent for signing, which completed document came back, when a signature check happened, and the result of that check.

For a signature check, it also records a unique digital fingerprint of the exact file examined, the time of the check, and the software/policy version used. This helps explain a result later without changing past records.

The document-management system remains responsible for the documents and their permissions. The signing system remains responsible for live signing sessions.

