# Project risks in plain language

**Companion to:** `docs/delivery/risk-register.md`

The project is being designed to avoid seven predictable problems:

- We need written confirmation that the DocuSeal license supports the signing experience we want.
- Upstream projects can change, so we will pin releases and run compatibility checks before upgrades.
- A “valid” signature result must not be marketed as a legal or regulatory certification unless a stronger verification program is approved.
- Paperless, DocuSeal, and the product application must stay in sync, especially after failures or restores.
- Customer documents need strong storage, credential, and deployment isolation controls.
- DocuSeal runs its own internal Redis, so the shared Redis serves only Paperless; any plan that assumes one shared queue for signing events must be re-checked in design.
- The signature chain from the signer to a trusted root is currently matched by name alone, without checking that each certificate actually signed the next. A forged certificate that copies a trusted root's name could be spliced onto the chain, so a “trusted” result could be claimed for a tampered signer. Every link in the chain must be cryptographically checked before the system ever looks at a real customer document.

Each risk has a named owner, an early warning sign, a prevention plan, and a recovery plan in the technical register.
