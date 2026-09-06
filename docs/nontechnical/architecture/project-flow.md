# Understanding the project-flow diagram

**Companion to:** `docs/architecture/project-flow.html`

The interactive diagram shows the same platform from five useful angles:

- **System** shows who uses the product and how the custom application connects Paperless and DocuSeal.
- **Ingestion** follows a document from upload through Paperless processing and signature checking.
- **Verification** shows why a signature can be valid but not trusted, and why that is different from knowing whether the document came from DocuSeal.
- **Signing** follows a request from the document manager to an external signer and back to the document archive.
- **Deployment** shows that each customer receives its own isolated stack and data stores.

The key idea is simple: Paperless keeps the document record, DocuSeal handles signing and basic PDF-signature checks, and the custom product connects them without mixing their databases or source code. A completed signed document is saved alongside its original, not on top of it.
