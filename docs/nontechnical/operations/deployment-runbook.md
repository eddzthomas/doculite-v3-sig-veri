# Safely Releasing Changes

**Audience:** Product sponsors, customers, and non-technical reviewers

Before a change is released, the team confirms that it was tested, that a recent backup exists, and that it can be reversed safely. Releases use approved versions of the application and the underlying document and signing services.

For development, the team also has a disposable local test stack that runs the same pinned versions and is never used for customer deployments.

After release, the team checks sign-in, document access, uploads, signature checks, signing requests, and service health. If a change could affect confidentiality, document integrity, or availability, the team stops it and follows the approved rollback or incident process.
