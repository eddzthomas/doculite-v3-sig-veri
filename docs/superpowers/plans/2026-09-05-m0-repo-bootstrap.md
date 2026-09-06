# M0 Repository Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Doculite product repository per roadmap Phase 0: git + GitHub remote with branch protection, pnpm monorepo scaffold (apps/web, apps/worker, packages/shared), Vitest, Biome, typecheck, docs validation, CI, and Dependabot.

**Architecture:** pnpm workspaces monorepo matching the roadmap's app + worker + shared-package structure. Product code is independently authored — no upstream Paperless-ngx/DocuSeal source, assets, or branding. The shared package anchors the canonical verification-outcome vocabulary in code; the web app is a clean Next.js scaffold; the worker is a minimal typed package proving multi-package workspaces (real worker logic is M1 scope).

**Tech Stack:** Node 24 (local: v24.13.1), pnpm 10 (local: 10.33.2, pinned via `packageManager`), TypeScript 5, Next.js current stable (resolved by `create-next-app`, recorded in lockfile), Vitest, Biome (lint + format), GitHub Actions, Dependabot.

**Spec:** `docs/delivery/roadmap.md` Phase 0 deliverables and exit gate; working rules in root `AGENTS.md`; doc rules in `docs/README.md`.

## Global Constraints

- **No LICENSE file.** Product licensing is an open legal decision (`docs/compliance/legal-decision-register.md`, LIC-002). Creating a product license is explicitly out of scope.
- **No upstream code.** Never copy Paperless-ngx/DocuSeal source, components, assets, or branding (`AGENTS.md` — Licensing and source boundaries).
- **No real credentials, customer data, or signing fixtures** anywhere in this plan's commits.
- **Node 24.x, pnpm 10.x** via `packageManager` field; CI must match (`node-version: 24`).
- **Commit style:** conventional commits (`feat:`, `test:`, `chore:`, `ci:`, `docs:`).
- **Working tree discipline:** each task ends with a green commit; do not leave unrelated files staged.
- **Task 10 requires human input** (GitHub repo name/owner confirmation and auth); Tasks 1–9 are fully autonomous.

---

### Task 1: Git initialization and repo foundation

**Files:**
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a git repository on branch `main` with a clean initial commit; later tasks commit on top

- [ ] **Step 1: Verify git identity is configured**

Run: `git config user.name; git config user.email`
Expected: both print values. If either is empty, ask the user for values and set them with `git config --global user.name "..."` / `git config --global user.email "..."` — never invent them.

- [ ] **Step 2: Initialize repository**

Run: `git init -b main`
Expected: `Initialized empty Git repository` and current branch is `main`.

- [ ] **Step 3: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/

# Build outputs
dist/
build/
.next/
out/
coverage/

# Environment and secrets
.env
.env.*
!.env.example

# Editor and OS
.vscode/
.idea/
Thumbs.db
.DS_Store

# pnpm
.pnpm-store/
```

- [ ] **Step 4: Create `README.md`**

```markdown
# Doculite

Customer-isolated document management: Paperless-ngx as the document system of
record, DocuSeal for signing workflows, and a product-owned Next.js/TypeScript
application layer.

## For contributors and AI agents

Start with [`AGENTS.md`](./AGENTS.md) — the first-stop guide covering
architecture invariants, canonical vocabularies, licensing boundaries, and the
required working process.

- Documentation index: [`docs/README.md`](./docs/README.md)
- Delivery roadmap: [`docs/delivery/roadmap.md`](./docs/delivery/roadmap.md)

## Status

Documentation-first. Application code begins with the M0 bootstrap
(see `docs/superpowers/plans/`).
```

- [ ] **Step 5: Commit**

Run:
```bash
git add .gitignore README.md
git commit -m "chore: initialize repository with gitignore and readme"
```
Expected: clean `git status` afterward.

---

### Task 2: Root workspace manifest and pnpm pins

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Modify: none

**Interfaces:**
- Consumes: git repo from Task 1
- Produces: workspace glob `apps/*` and `packages/*`; pinned `packageManager` field; root scripts `lint`, `format`, `typecheck`, `test`, `build`, `validate:docs` (defined here; the tools backing `lint`/`typecheck`/`test`/`build` arrive in Tasks 3–9 — CI in Task 9 runs all of them, so every script must exist by then)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "doculite",
  "version": "0.0.0",
  "private": true,
  "engines": {
    "node": ">=24"
  },
  "packageManager": "pnpm@10.33.2",
  "scripts": {
    "lint": "pnpm -r lint && biome check .",
    "format": "biome format --write .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "validate:docs": "node scripts/validate-docs.mjs docs"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Verify pnpm accepts the workspace**

Run: `pnpm -r exec echo ok` 
Expected: exits 0 with no packages found (empty workspace) — no error.

- [ ] **Step 4: Commit**

Run:
```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: add pnpm workspace root manifest with pinned package manager"
```
Note: `pnpm-lock.yaml` may not exist yet; include it in the commit only if present.

---

### Task 3: Biome lint and format setup

**Files:**
- Create: `biome.json`
- Modify: `package.json` (add devDependency via command; no manual script edits — scripts already defined in Task 2)

**Interfaces:**
- Consumes: root `lint`/`format` scripts from Task 2
- Produces: `pnpm lint` and `pnpm format` work repo-wide; later tasks keep their code Biome-clean

- [ ] **Step 1: Install Biome at workspace root**

Run: `pnpm add -D -w @biomejs/biome`
Expected: added to root `devDependencies`, `pnpm-lock.yaml` created.

- [ ] **Step 2: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  }
}
```

Note: if Biome's installed major differs from the schema version above, replace `2.0.0` in `$schema` with the installed major (check `pnpm biome --version`); keep all other settings identical.

- [ ] **Step 3: Verify lint passes on the current tree**

Run: `pnpm lint`
Expected: exits 0 (repo currently has only JSON/MD files, which Biome does not lint by default).

- [ ] **Step 4: Verify formatting is applied**

Run: `pnpm format`
Expected: no errors; JSON files reformatted if needed.

- [ ] **Step 5: Commit**

Run:
```bash
git add biome.json package.json pnpm-lock.yaml
git commit -m "chore: add biome for linting and formatting"
```

---

### Task 4: `packages/shared` — canonical verification outcomes (TDD)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/verification-outcomes.ts`
- Create: `packages/shared/test/verification-outcomes.test.ts`

**Interfaces:**
- Consumes: workspace glob from Task 2 (`packages/*` is a workspace package)
- Produces (used by future M1+ tasks, not by this plan's other tasks):
  - `VERIFICATION_OUTCOMES: readonly ["unsigned", "valid_trusted", "valid_untrusted", "invalid", "error"]`
  - `type VerificationOutcome = "unsigned" | "valid_trusted" | "valid_untrusted" | "invalid" | "error"`
  - `isVerificationOutcome(value: unknown): value is VerificationOutcome`

- [ ] **Step 1: Create package manifest**

`packages/shared/package.json`:
```json
{
  "name": "@doculite/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/shared/src/index.ts` (re-export barrel — created now so `main` resolves):
```typescript
export * from './verification-outcomes'
```

- [ ] **Step 2: Create root `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Write the failing test**

`packages/shared/test/verification-outcomes.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import {
  VERIFICATION_OUTCOMES,
  isVerificationOutcome,
  type VerificationOutcome,
} from '../src/verification-outcomes'

describe('VERIFICATION_OUTCOMES', () => {
  it('contains exactly the five canonical outcomes in policy order', () => {
    expect([...VERIFICATION_OUTCOMES]).toEqual([
      'unsigned',
      'valid_trusted',
      'valid_untrusted',
      'invalid',
      'error',
    ])
  })

  it('is frozen', () => {
    expect(Object.isFrozen(VERIFICATION_OUTCOMES)).toBe(true)
  })
})

describe('isVerificationOutcome', () => {
  it.each(['unsigned', 'valid_trusted', 'valid_untrusted', 'invalid', 'error'])(
    'accepts %s',
    (value) => {
      expect(isVerificationOutcome(value)).toBe(true)
    },
  )

  it.each(['valid', 'VALID_TRUSTED', 'qes', 'pades-lt', '', null, undefined, 42])(
    'rejects %s',
    (value) => {
      expect(isVerificationOutcome(value)).toBe(false)
    },
  )

  it('narrows the type on accept', () => {
    const value: unknown = 'valid_trusted'
    if (isVerificationOutcome(value)) {
      const narrowed: VerificationOutcome = value
      expect(narrowed).toBe('valid_trusted')
    } else {
      throw new Error('should have narrowed')
    }
  })
})
```

These values are copied verbatim from the canonical vocabulary in root `AGENTS.md` and `docs/signatures/verification-policy.md` — do not add, remove, or reorder.

- [ ] **Step 4: Install test tooling and run test to verify it fails**

Run:
```bash
pnpm add -D vitest typescript --filter @doculite/shared
pnpm --filter @doculite/shared test
```
Expected: FAIL — Vitest cannot resolve `../src/verification-outcomes` (module not yet implemented).

- [ ] **Step 5: Implement the module**

`packages/shared/src/verification-outcomes.ts`:
```typescript
/**
 * Canonical verification outcomes for V1.
 * Source of truth: docs/signatures/verification-policy.md and root AGENTS.md.
 * These are the ONLY values V1 may report — do not add statuses such as
 * eIDAS/QES or PAdES-LT/LTA claims (prohibited by the verification policy).
 */
export const VERIFICATION_OUTCOMES = Object.freeze([
  'unsigned',
  'valid_trusted',
  'valid_untrusted',
  'invalid',
  'error',
] as const)

export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number]

const OUTCOME_SET: ReadonlySet<string> = new Set(VERIFICATION_OUTCOMES)

export function isVerificationOutcome(value: unknown): value is VerificationOutcome {
  return typeof value === 'string' && OUTCOME_SET.has(value)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @doculite/shared test`
Expected: PASS (all cases).

- [ ] **Step 7: Typecheck and lint the package**

Run: `pnpm --filter @doculite/shared typecheck; pnpm --filter @doculite/shared lint`
Expected: both exit 0. Biome may flag `as const`/formatting — run `pnpm format` if so, then re-run both.

- [ ] **Step 8: Commit**

Run:
```bash
git add packages/shared tsconfig.base.json package.json pnpm-lock.yaml
git commit -m "feat: add shared package with canonical verification outcomes"
```

---

### Task 5: `apps/worker` — minimal typed workspace package (TDD)

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/test/index.test.ts`

**Interfaces:**
- Consumes: root `tsconfig.base.json` from Task 4
- Produces: `workerInfo: { name: 'doculite-worker', version: string }` — real worker logic (queues, retries, jobs) is M1 scope; this package exists to prove the workspace toolchain covers the second app before then

- [ ] **Step 1: Create package manifest**

`apps/worker/package.json`:
```json
{
  "name": "@doculite/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  }
}
```

`apps/worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the failing test**

`apps/worker/test/index.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import { workerInfo } from '../src/index'

describe('workerInfo', () => {
  it('identifies the worker package', () => {
    expect(workerInfo.name).toBe('doculite-worker')
  })

  it('reports a version matching package.json', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } })
    expect(workerInfo.version).toBe(pkg.default.version)
  })
})
```

- [ ] **Step 3: Install tooling and run test to verify it fails**

Run:
```bash
pnpm add -D vitest typescript @types/node --filter @doculite/worker
pnpm --filter @doculite/worker test
```
Expected: FAIL — `../src/index` cannot be resolved.

- [ ] **Step 4: Implement the module**

`apps/worker/src/index.ts`:
```typescript
/**
 * Doculite worker entry point. M0 scaffold only — the real worker process
 * (Redis-backed job transport, retries, idempotency) is implemented in M1
 * per docs/delivery/roadmap.md Phase 1.
 */
export interface WorkerInfo {
  name: 'doculite-worker'
  version: string
}

export const workerInfo: WorkerInfo = {
  name: 'doculite-worker',
  version: '0.0.0',
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @doculite/worker test`
Expected: PASS. If the JSON import assertion fails on the `with: { type: 'json' }` attribute syntax, replace that test body with reading the version constant `'0.0.0'` asserted against `workerInfo.version` and keep a comment that the assertion guards version drift.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @doculite/worker typecheck; pnpm --filter @doculite/worker lint`
Expected: both exit 0 (run `pnpm format` first if Biome flags formatting).

- [ ] **Step 7: Commit**

Run:
```bash
git add apps/worker package.json pnpm-lock.yaml
git commit -m "feat: add minimal worker package to prove multi-app workspace"
```

---

### Task 6: `apps/web` — Next.js scaffold

**Files:**
- Create: `apps/web/**` (generated by create-next-app)
- Modify: `apps/web/package.json` (add `typecheck` script; add Vitest only if Step 4's smoke test is kept)

**Interfaces:**
- Consumes: workspace glob `apps/*` from Task 2
- Produces: a buildable Next.js app at `apps/web` with `pnpm --filter @doculite/web build` and `typecheck` scripts; real product UI is M1/M2 scope

- [ ] **Step 1: Scaffold the app non-interactively**

Run (from repo root):
```bash
pnpm create next-app@latest apps/web --ts --app --no-eslint --no-tailwind --src-dir --import-alias "@/*" --use-pnpm --yes
```
Expected: `apps/web` created; `pnpm-workspace.yaml` already covers it. Record the resolved Next.js version in the task report (read it from `apps/web/package.json`) — it must be a specific semver, never a range or `latest`.

Flag rationale: `--no-eslint` because Biome owns linting; `--no-tailwind` because the design system stack is an M1 decision (`docs/design/design-system-accessibility.md`); `--src-dir` matches the `@/*` alias layout Next scaffolds.

- [ ] **Step 2: Add typecheck script to `apps/web/package.json`**

In the `scripts` object add:
```json
"typecheck": "tsc --noEmit"
```
Keep the scaffold's existing `build` script — Next's own `next build` is the web build (root `build` runs it via `pnpm -r build`).

- [ ] **Step 3: Verify typecheck and build**

Run:
```bash
pnpm --filter @doculite/web typecheck
pnpm --filter @doculite/web build
```
Expected: both exit 0.

- [ ] **Step 4: Add a minimal Vitest smoke test**

Run:
```bash
pnpm add -D vitest --filter @doculite/web
```

Create `apps/web/test/smoke.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import Home from '../src/app/page'

describe('web app scaffold', () => {
  it('default page module exports a component', () => {
    expect(Home).toBeTypeOf('function')
  })
})
```

Run: `pnpm --filter @doculite/web test`
Expected: PASS.

If the JSX import fails to resolve in Vitest without extra config, fix it by creating `apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
```
and run `pnpm add -D @vitejs/plugin-react --filter @doculite/web`. Do not disable the test — a web package with zero tests is a task failure; if all JSX-based approaches fail after two attempts, replace the assertion with `expect(true).toBe(true)` is NOT acceptable — instead test the app's `package.json` name is `@doculite/web` (rename the scaffolded package name to `@doculite/web` in that case, which is required anyway for consistent filtering).

- [ ] **Step 5: Rename the scaffolded package**

In `apps/web/package.json` set `"name": "@doculite/web"` (scaffold generates `web`). Re-run `pnpm install` so the lockfile updates.

- [ ] **Step 6: Lint the whole workspace**

Run: `pnpm lint`
Expected: exit 0. Biome may flag generated Next.js files (`next.config.ts`, scaffolded app code). If so, add to `biome.json` (root) a `files.ignore` array entry `"apps/web/next-env.d.ts"` and any other offending generated paths only — do not weaken lint rules.

- [ ] **Step 7: Commit**

Run:
```bash
git add apps/web package.json pnpm-lock.yaml biome.json
git commit -m "feat: scaffold next.js app in apps/web"
```

---

### Task 7: Docs validation script (TDD)

**Files:**
- Create: `scripts/validate-docs.mjs`
- Create: `scripts/test/validate-docs.test.mjs`
- Create: `vitest.config.ts` (root)
- Modify: none (root `validate:docs` script already exists from Task 2)

**Interfaces:**
- Consumes: root script `validate:docs` from Task 2
- Produces: `collectDocIssues(docsDir: string): Promise<DocIssue[]>` where each `DocIssue` is `{ file: string, line: number | null, type: 'broken-link' | 'todo-in-approved-doc', detail: string }`; CI (Task 9) runs `pnpm validate:docs` and fails on any issue

Validation rules (from root `AGENTS.md` documentation rules):
1. Relative markdown links in `docs/**/*.md` must resolve to existing files (links starting with `http://`, `https://`, or `#` are skipped).
2. Files whose status header line matches `**Status:**` containing `Approved` must not contain `TODO` or `TBD`.

- [ ] **Step 1: Create root `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/test/**/*.test.mjs'],
  },
})
```

Root `test` script currently runs `pnpm -r test` (packages). Change root `package.json` `test` script to:
```json
"test": "vitest run && pnpm -r test"
```

- [ ] **Step 2: Write the failing tests**

`scripts/test/validate-docs.test.mjs`:
```javascript
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectDocIssues } from '../validate-docs.mjs'

let dir

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculite-docs-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeDoc(relPath, content) {
  const target = join(dir, relPath)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content, 'utf8')
}

describe('collectDocIssues', () => {
  it('flags a broken relative markdown link', async () => {
    await writeDoc('a.md', 'See [missing](./nope.md) here.\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ file: 'a.md', type: 'broken-link' })
  })

  it('accepts an existing relative link', async () => {
    await writeDoc('b.md', 'See [ok](./c.md).\n')
    await writeDoc('c.md', 'target\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })

  it('skips http, https, and anchor links', async () => {
    await writeDoc('d.md', '[x](https://example.com) [y](http://a.b) [z](#section)\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })

  it('flags TODO in an Approved document with its line number', async () => {
    await writeDoc('e.md', '**Status:** Approved\n\nfine\nTODO: decide\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      file: 'e.md',
      line: 3,
      type: 'todo-in-approved-doc',
    })
  })

  it('allows TODO in a non-approved document', async () => {
    await writeDoc('f.md', '**Status:** Draft\n\nTODO: later\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })

  it('treats a document with no status line as non-approved', async () => {
    await writeDoc('g.md', '# Title\n\nTODO: fine here\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run -c vitest.config.ts`
Expected: FAIL — `validate-docs.mjs` does not exist.

- [ ] **Step 4: Implement the script**

`scripts/validate-docs.mjs`:
```javascript
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g
const STATUS_PATTERN = /^\*\*Status:\*\*(.*)$/m
const TODO_PATTERN = /\b(TODO|TBD)\b/

async function listMarkdownFiles(dir, base = dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await listMarkdownFiles(full, base, out)
    } else if (entry.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

function isSkippedLink(target) {
  return (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('#') ||
    isAbsolute(target)
  )
}

export async function collectDocIssues(docsDir) {
  const root = resolve(docsDir)
  const files = await listMarkdownFiles(root)
  const issues = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    const relativeFile = file.slice(root.length + 1).split(sep).join('/')

    // Rule 1: relative links resolve
    for (const match of content.matchAll(LINK_PATTERN)) {
      const target = match[1]
      if (isSkippedLink(target)) continue
      const withoutAnchor = target.split('#')[0]
      if (withoutAnchor === '') continue
      const resolved = resolve(dirname(file), withoutAnchor)
      try {
        await stat(resolved)
      } catch {
        issues.push({
          file: relativeFile,
          line: null,
          type: 'broken-link',
          detail: target,
        })
      }
    }

    // Rule 2: no TODO/TBD in Approved docs
    const statusMatch = content.match(STATUS_PATTERN)
    const isApproved = statusMatch !== null && statusMatch[1].includes('Approved')
    if (isApproved) {
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (TODO_PATTERN.test(lines[i])) {
          issues.push({
            file: relativeFile,
            line: i + 1,
            type: 'todo-in-approved-doc',
            detail: lines[i].trim(),
          })
        }
      }
    }
  }

  return issues
}

// CLI entry: `node scripts/validate-docs.mjs <docsDir>`
// Exits 1 and prints each issue when any are found.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const docsDir = process.argv[2]
  if (!docsDir) {
    console.error('usage: node scripts/validate-docs.mjs <docsDir>')
    process.exit(2)
  }
  const issues = await collectDocIssues(docsDir)
  for (const issue of issues) {
    const line = issue.line === null ? '' : `:${issue.line}`
    console.error(`${issue.type}: ${issue.file}${line} — ${issue.detail}`)
  }
  if (issues.length > 0) {
    console.error(`docs validation failed: ${issues.length} issue(s)`)
    process.exit(1)
  }
  console.log('docs validation passed')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run -c vitest.config.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Validate the real docs tree**

Run: `pnpm validate:docs`
Expected: exits 0. The `docs/` tree currently has no Approved-status documents with TODOs and the broken `legal-decision-register.md` link was fixed on 2026-09-05, so the real tree should be clean. If it reports issues, fix the flagged docs (they are real defects per AGENTS.md rules) in a separate commit `docs: fix issues found by docs validation` before committing the script.

- [ ] **Step 7: Lint, typecheck not applicable (plain .mjs, no tsconfig), format, and commit**

Run:
```bash
pnpm format
pnpm lint
```
Expected: exit 0.

Commit:
```bash
git add scripts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "test: add docs validation with link and approved-todo rules"
```

---

### Task 8: CI workflow and Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: root scripts `lint`, `typecheck`, `test`, `build`, `validate:docs` (all defined by Tasks 2–7)
- Produces: CI gates every future PR on all five checks

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        # Reads the pinned version from package.json packageManager field

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Validate docs
        run: pnpm validate:docs

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 3: Verify all root scripts pass locally before wiring CI**

Run:
```bash
pnpm lint; pnpm typecheck; pnpm test; pnpm validate:docs; pnpm build
```
Expected: all exit 0. `pnpm build` runs `next build` inside apps/web (may take a minute).

- [ ] **Step 4: Commit**

Run:
```bash
git add .github
git commit -m "ci: add quality workflow and dependabot"
```

---

### Task 9: GitHub remote, push, and branch protection

**Files:**
- Create: none (remote-side configuration)

**Interfaces:**
- Consumes: the committed repo from Tasks 1–8
- Produces: a private GitHub repo with `main` protected by the CI check

**⚠ Requires human input:** confirm the GitHub repo name and that the user is authenticated. Do not create a public repo.

- [ ] **Step 1: Confirm authentication**

Run: `gh auth status`
Expected: logged in. If not, stop and ask the user to run `gh auth login` interactively.

- [ ] **Step 2: Ask the user to confirm the repo name (default: `doculite`)**

- [ ] **Step 3: Create the private repo and push**

Run: `gh repo create doculite --private --source . --remote origin --push`
Expected: remote `origin` set, `main` pushed.

- [ ] **Step 4: Enable branch protection on `main`**

Run (requires GitHub Pro/Team for private repos — if the API returns 403/422, report to the user and record the residual gap in the task report instead of retrying):
```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["CI / quality"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```
(`{owner}/{repo}` substituted with the actual values from Step 3 output.)

- [ ] **Step 5: Verify CI runs on the pushed commit**

Run: `gh run list --limit 1`
Expected: a `CI` run for the latest commit. Watch it with `gh run watch` — expected result: all checks pass.

- [ ] **Step 6: Report**

Record in the task report: repo URL, resolved Next.js/TypeScript/Vitest/Biome versions, CI run URL, and any branch-protection caveat from Step 4.

---

## Out of scope (deferred to later plans)

- Pinning Paperless-ngx/DocuSeal tags/commits/digests (M0 item 2 — next plan)
- Contract fixtures and the verification adapter proof (M0 items 4–5)
- CODEOWNERS file — blocked on team GitHub handles (human input; roadmap "ownership rules" completes then)
- Redis/job transport, database migrations, authentication — M1 scope
- Product LICENSE — blocked on LIC-002 (`docs/compliance/legal-decision-register.md`)

## Self-review notes

- Spec coverage: roadmap Phase 0 "Initialize the product repository, ownership rules, branch protections, formatting, static checks, tests, dependency updates, and documentation validation" → repo+formatting (T1–T3), static checks+tests (T3–T5), dependency updates (T8 Dependabot), docs validation (T7), branch protection (T9). Ownership rules partially deferred (CODEOWNERS needs team handles) — noted above, not silently dropped.
- No placeholders: every code step has complete file content; the only human-input points are git identity (T1S1), repo name/auth (T9), and the documented fallback paths.
- Type consistency: `@doculite/shared` exports used nowhere else in this plan (consumers are M1+); root scripts referenced by CI match exactly those defined in Task 2/7.
