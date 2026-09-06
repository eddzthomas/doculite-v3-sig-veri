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

// Fenced code contents are illustrative, not navigational links. A line whose
// trimmed content starts with ``` or ~~~ toggles fenced state; lines inside a
// fence (including after an unclosed opener) are excluded from link scanning.
// The TODO/Approved rule is unaffected: it scans all lines of the file.
function stripFencedLines(content) {
  const lines = content.split('\n')
  const unfenced = []
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (!inFence) {
      unfenced.push(line)
    }
  }
  return unfenced.join('\n')
}

export async function collectDocIssues(docsDir) {
  const root = resolve(docsDir)
  const files = await listMarkdownFiles(root)
  const issues = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    const relativeFile = file
      .slice(root.length + 1)
      .split(sep)
      .join('/')

    // Rule 1: relative links resolve (outside fenced code blocks)
    for (const match of stripFencedLines(content).matchAll(LINK_PATTERN)) {
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
    const isApproved = statusMatch?.[1].includes('Approved')
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
