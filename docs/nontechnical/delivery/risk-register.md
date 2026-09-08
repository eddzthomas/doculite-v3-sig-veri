# Project risks in plain language

**Companion to:** `docs/delivery/risk-register.md`

The project is being designed to avoid six predictable problems:

- We need written confirmation that the DocuSeal license supports the signing experience we want.
- Upstream projects can change, so we will pin releases and run compatibility checks before upgrades.
- A “valid” signature result must not be marketed as a legal or regulatory certification unless a stronger verification program is approved.
- Paperless, DocuSeal, and the product application must stay in sync, especially after failures or restores.
- Customer documents need strong storage, credential, and deployment isolation controls.
- DocuSeal runs its own internal Redis, so the shared Redis serves only Paperless; any plan that assumes one shared queue for signing events must be re-checked in design.

Each risk has a named owner, an early warning sign, a prevention plan, and a recovery plan in the technical register.
