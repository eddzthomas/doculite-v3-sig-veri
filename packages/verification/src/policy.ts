// Task 3 replaces the stub: this placeholder loader exists only so the
// verifier's interface churn (policy shape consumed by trust evaluation)
// lands before the real versioned policy loader is implemented.

export interface TrustAnchor {
  name: string
  sha256: string
}

export interface TrustPolicy {
  version: string | null
  anchors: Array<TrustAnchor>
}

export function loadPolicy(path: string): TrustPolicy {
  void path
  return { version: null, anchors: [] }
}
