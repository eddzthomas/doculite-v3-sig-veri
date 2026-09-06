# Guide for AI-assisted project work

**Companion to:** `AGENTS.md`

The repository includes a root guide that tells AI agents and engineers what the product is, which documents govern implementation, and which decisions must not be changed casually.

Its central rules are:

- Paperless stores and controls access to documents.
- DocuSeal handles signing and basic PDF-signature checks as a separate service.
- The custom product connects them through APIs without reaching into their databases.
- Original documents are preserved; completed signed documents are added as linked copies.
- Customer environments, credentials, data, and backups remain isolated.
- Signature integrity, certificate trust, and DocuSeal recognition are presented as separate facts.
- Licensing and legal conclusions require human approval.

Future code must include useful comments for decisions that are difficult to infer. Comments should explain why a security check, retry rule, signature status, document choice, or integration workaround exists. They should not describe obvious lines of code.

Documentation examples must explain their purpose, location, placeholders, expected result, and important risks. They must never contain real customer data or secrets.
