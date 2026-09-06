# How the roadmap keeps promises accountable

**Companion to:** `docs/delivery/requirements-traceability.md`

Every V1 promise is connected to six things:

1. The user or operator journey it supports.
2. The architecture decision that makes it possible.
3. The API, interface, or security control that delivers it.
4. The test or review evidence that proves it works.
5. The roadmap milestone where it must be ready.
6. The exact release candidate where the evidence was collected.

The implementation milestones are:

- **M0:** the upstream technology and licensing approach are proven.
- **M1:** an isolated and secure product foundation is deployable.
- **M2:** the core document-management experience works.
- **M3:** signature verification works and is explained accurately.
- **M4:** signing works from request through linked document return.
- **M5:** security, accessibility, backup, restore, upgrade, and rollback pass.
- **M6:** a representative pilot accepts the complete workflow.
- **M7:** production customers are launched under controlled gates.

If a promised feature has no implementation evidence, it cannot be counted as production-ready.
