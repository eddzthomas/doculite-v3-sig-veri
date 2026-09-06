import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    await writeDoc('e.md', '**Status:** Approved\n\nTODO: decide\n')
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

  it('ignores links inside a fenced code block', async () => {
    await writeDoc('h.md', 'Intro\n\n```\nconst link = "[x](./nope.md)"\n```\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })

  it('still flags links in prose of a file that also has a fenced block', async () => {
    await writeDoc('i.md', '```\nconst code = "example"\n```\n\nSee [missing](./nope.md) here.\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ file: 'i.md', type: 'broken-link' })
  })

  it('ignores links inside a tilde-fenced block', async () => {
    await writeDoc('j.md', '~~~\n[x](./nope.md)\n~~~\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })

  it('ignores links after an unclosed fence opener', async () => {
    await writeDoc('k.md', '```\nconst x = 1\n\nSee [missing](./nope.md) here.\n')
    const issues = await collectDocIssues(dir)
    expect(issues).toHaveLength(0)
  })
})
