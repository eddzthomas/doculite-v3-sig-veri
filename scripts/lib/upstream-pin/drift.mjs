/**
 * Computes drift between the committed pin manifest and live-derived facts.
 * Used by `pin-upstream.mjs validate` and future upgrade rehearsals.
 */
const COMPARED_FIELDS = ['tag', 'commitSha']

export function computeDrift(expectedComponents, liveComponents) {
  const drift = []
  const expectedByName = new Map(expectedComponents.map((c) => [c.name, c]))
  const liveByName = new Map(liveComponents.map((c) => [c.name, c]))

  for (const [name, expected] of expectedByName) {
    const live = liveByName.get(name)
    if (live === undefined) {
      drift.push({ component: name, field: 'component', expected: 'present', actual: 'missing' })
      continue
    }
    for (const field of COMPARED_FIELDS) {
      if (expected[field] !== live[field]) {
        drift.push({ component: name, field, expected: expected[field], actual: live[field] })
      }
    }
    const expectedDigest = expected.image?.digest
    const liveDigest = live.image?.digest
    if (expectedDigest !== liveDigest) {
      drift.push({
        component: name,
        field: 'image.digest',
        expected: expectedDigest,
        actual: liveDigest,
      })
    }
  }

  for (const name of liveByName.keys()) {
    if (!expectedByName.has(name)) {
      drift.push({ component: name, field: 'component', expected: 'absent', actual: 'present' })
    }
  }
  return drift
}
