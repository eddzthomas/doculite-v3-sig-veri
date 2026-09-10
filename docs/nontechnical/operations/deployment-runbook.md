# Safely Releasing Changes

**Audience:** Product sponsors, customers, and non-technical reviewers

Before a change is released, the team confirms that it was tested, that a recent backup exists, and that it can be reversed safely. Releases use approved versions of the application and the underlying document and signing services.

For development, the team also has a disposable local test stack that runs the same pinned versions and is never used for customer deployments. On that stack, the team runs a one-off "capture session": after filling in two admin screens and copying an API token into a local settings file, two scripts record how the document and signing services respond, and the recorded examples are saved and checked in so automated tests can replay them. The scripts automatically remove passwords, tokens, and signing links before saving anything, and the sample document used is a safe test PDF, never a real customer document. When a pinned version is upgraded, the session is run again.

After release, the team checks sign-in, document access, uploads, signature checks, signing requests, and service health. If a change could affect confidentiality, document integrity, or availability, the team stops it and follows the approved rollback or incident process.
