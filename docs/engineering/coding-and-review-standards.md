# Coding and Review Standards

**Status:** Draft for approval  
**Owner:** Engineering Lead

## Standards

- Write product-owned TypeScript with explicit schemas at service boundaries.
- Keep browser code free of Paperless and DocuSeal credentials; server routes/worker own privileged calls.
- Isolate upstream clients behind adapters and map upstream responses into product-owned types.
- Make webhooks, imports, and worker jobs idempotent; record external IDs and retries atomically.
- Preserve original hashes and raw diagnostic evidence; do not infer signature outcome from UI state.
- Avoid copying upstream UI code, assets, or internal packages.

## Comments and maintainability

- Comment non-obvious intent, invariants, security boundaries, upstream assumptions, idempotency behavior, state transitions, retry decisions, and rollback constraints.
- Give public modules, exported functions, API handlers, jobs, adapters, state machines, and migrations concise documentation comments describing responsibility, inputs, outputs, side effects, and failure behavior.
- Prefer clear names and small functions over comments that repeat syntax.
- Mark compatibility workarounds with the pinned upstream version or contract evidence that requires them.
- Explain why the untouched original or a particular document version is selected whenever document bytes cross a service boundary.
- Keep comments current in the same change as the behavior they describe.

### Documentation code blocks

Every non-trivial code, command, configuration, API, and schema block must include native-language comments or immediately adjacent prose explaining its purpose, location, placeholder values, assumptions, expected result, and important failure behavior. Examples must use synthetic data and must not contain credentials, customer information, real document content, signed URLs, or private keys.

## Review checklist

- Requirement IDs and acceptance criteria are referenced by the change.
- Authorization delegates to Paperless and is tested for both permitted and forbidden users.
- New state transitions include retries, duplicate events, and terminal failures.
- Logs and telemetry exclude secrets and document contents.
- New API behavior updates OpenAPI/contracts, tests, and user-facing copy.
- Dependencies, migrations, and feature flags have rollback paths.
- Non-obvious behavior has intent-focused comments, and documentation examples explain how to use them safely.

## Definition of done

Implementation, tests, documentation, accessibility review for UI changes, security review for trust-boundary changes, and operational instructions are complete before release approval.
