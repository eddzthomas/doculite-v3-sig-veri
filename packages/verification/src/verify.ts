import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildEvidence } from './evidence.ts'
import {
  evaluateTrust,
  loadPolicy,
  type TrustEvaluationResult,
  type TrustPolicy,
} from './policy.ts'
import {
  aggregateProvenance,
  determineProvenance,
  PROVENANCE_HEURISTIC_NOTE,
} from './provenance.ts'
import { deriveStatus } from './result.ts'
import type {
  PerSignatureIntegritySummary,
  PerSignatureSummary,
  Provenance,
  ScannedSignatureOrMalformed,
  Trust,
  VerificationResult,
} from './types.ts'
import { evaluateIntegrity, extractSignerChain, STAGE_NOTE, scanSignatures } from './verifier.ts'

const DEFAULT_POLICY_PATH = join(import.meta.dirname, '..', 'policies', 'v1.json')

/**
 * M0-D offline-evaluation pattern (Task 3 review item): chain building needs
 * candidate certificates, and the committed fixture roots are the known-root
 * store for M0-D. The store is a SUPERSET of the v1 policy anchors — which
 * root is trusted is decided solely by the policy, never by candidate
 * availability. M1+ replaces this with a configured, server-side store.
 */
const KNOWN_ROOT_FILES = ['root-a.pem', 'root-b.pem'] as const

let knownRootStore: Array<Uint8Array> | null = null

function knownRoots(): Array<Uint8Array> {
  if (knownRootStore === null) {
    knownRootStore = KNOWN_ROOT_FILES.map(
      (name) =>
        new Uint8Array(
          Buffer.from(
            readFileSync(
              join(import.meta.dirname, '..', '..', '..', 'fixtures', 'signatures', name),
              'utf8',
            )
              .replace(/-----[A-Z ]*CERTIFICATE-----/g, '')
              .replace(/\s+/g, ''),
            'base64',
          ),
        ),
    )
  }
  return knownRootStore
}

export interface VerifyPdfOptions {
  /** Trust policy to evaluate against; defaults to the v1 policy. */
  policyPath?: string
}

/**
 * Document-level trust roll-up (fail-safe): any per-signature `error` →
 * `error`; else any `untrusted` → `untrusted`; else `trusted`. An unsigned
 * document (no signatures) is `untrusted` — nothing is trusted, but an
 * absent trust evaluation is never an error.
 */
export function aggregateTrust(values: Array<Trust>): Trust {
  if (values.length === 0) return 'untrusted'
  if (values.includes('error')) return 'error'
  if (values.includes('untrusted')) return 'untrusted'
  return 'trusted'
}

interface PerSignatureTrust {
  verdict: Trust
  anchoredAt: string | null
  note: string
}

/**
 * Trust for one signature, evaluated AFTER integrity (fail-safe ordering):
 * integrity `error` → trust `error` (never assert a verdict on an
 * unevaluable container); integrity `invalid` → trust `untrusted` (a
 * tampered signature is never trusted, regardless of its chain); integrity
 * `valid` → chain build + policy evaluation. Chain/parse failures are
 * `error`, never a validity status.
 */
function evaluatePerSignatureTrust(
  entry: PerSignatureIntegritySummary,
  scanned: ScannedSignatureOrMalformed,
  policy: TrustPolicy,
): PerSignatureTrust {
  if (entry.integrity === 'error') {
    return {
      verdict: 'error',
      anchoredAt: null,
      note: 'trust: error — integrity evaluation failed, trust not asserted',
    }
  }
  if (entry.integrity === 'invalid') {
    return {
      verdict: 'untrusted',
      anchoredAt: null,
      note: 'trust: untrusted — integrity invalid (a tampered signature is never trusted)',
    }
  }
  if ('malformed' in scanned) {
    return {
      verdict: 'error',
      anchoredAt: null,
      note: 'trust: error — signature dictionary incomplete, chain not evaluable',
    }
  }
  try {
    const chain = extractSignerChain(scanned, knownRoots())
    const evaluated: TrustEvaluationResult = evaluateTrust(chain, policy)
    return {
      verdict: evaluated.trust,
      anchoredAt: evaluated.anchoredAt,
      note:
        evaluated.trust === 'trusted'
          ? `trust: trusted — chain anchored at ${evaluated.anchoredAt ?? 'unknown anchor'}`
          : evaluated.trust === 'untrusted'
            ? 'trust: untrusted — chain root is not a configured anchor'
            : 'trust: error — chain could not be evaluated',
    }
  } catch {
    return {
      verdict: 'error',
      anchoredAt: null,
      note: 'trust: error — signer chain could not be built from the container',
    }
  }
}

/**
 * Step-named error detail for the evidence record, derived without embedding
 * input bytes: a structural detail when the pipeline failed before any
 * signature summary existed, else the first failing signature's detail
 * (the integrity stage records it as the note following the stage marker).
 */
function errorDetailOf(
  evaluationRaw: unknown,
  perSignature: Array<PerSignatureIntegritySummary>,
): string | undefined {
  const structural =
    typeof evaluationRaw === 'object' && evaluationRaw !== null && 'detail' in evaluationRaw
      ? (evaluationRaw as { detail: unknown }).detail
      : undefined
  if (typeof structural === 'string' && structural.length > 0) return structural
  const failed = perSignature.find((entry) => entry.integrity === 'error')
  if (!failed) return undefined
  return failed.notes.find((note) => note !== STAGE_NOTE && !note.startsWith('coverage:'))
}

/** Full error result for a pipeline that cannot be evaluated at all. */
function failureResult(
  bytes: Uint8Array,
  errorDetail: string,
  policyVersion: string | null,
): VerificationResult {
  return {
    status: deriveStatus({ signed: false, integrity: 'error', trust: 'error' }),
    integrity: 'error',
    trust: 'error',
    provenance: 'none',
    perSignature: [],
    evidence: buildEvidence({
      bytes,
      policyVersion,
      raw: { detail: errorDetail },
      errorDetail,
    }),
  }
}

/**
 * Public API: verify the exact document bytes end-to-end — integrity →
 * per-signature trust → per-signature provenance → fail-safe roll-up →
 * status → evidence. Pure and synchronous; throws nothing (all failures
 * surface as `error` results with step-named evidence). The evidence `raw`
 * embeds signature container hex (SECURITY: never log or persist it).
 */
export function verifyPdf(bytes: Uint8Array, options: VerifyPdfOptions = {}): VerificationResult {
  // Policy first (throwing loader): a defective policy fails safe to a
  // full error result — never evaluated against an unintended trust set,
  // never blanket-untrusted.
  let policy: TrustPolicy
  try {
    policy = loadPolicy(options.policyPath ?? DEFAULT_POLICY_PATH)
  } catch {
    return failureResult(bytes, 'policy-load: trust policy could not be loaded', null)
  }

  const evaluation = evaluateIntegrity(bytes)
  // Same pure scan evaluateIntegrity ran → index-aligned with its summaries.
  const scanned = scanSignatures(bytes)

  const perSignature: Array<PerSignatureSummary> = evaluation.perSignature.map((entry, index) => {
    const aligned = scanned[index]
    if (!aligned) {
      throw new Error('orchestration: integrity summaries and scanned signatures misaligned')
    }
    const trust = evaluatePerSignatureTrust(entry, aligned, policy)
    const provenance: Provenance = determineProvenance(entry.signerSubject)
    return {
      ...entry,
      trust: trust.verdict,
      provenance,
      chainAnchoredAt: trust.anchoredAt,
      notes: [...entry.notes, trust.note, PROVENANCE_HEURISTIC_NOTE],
    }
  })

  const signed = perSignature.length > 0
  const integrity = evaluation.integrity
  // Fail-safe: an unevaluable document (integrity error) asserts no trust
  // fact at document level; an unsigned document is untrusted (nothing is
  // trusted, never an error).
  const trust =
    integrity === 'error' ? 'error' : aggregateTrust(perSignature.map((entry) => entry.trust))
  const provenance = aggregateProvenance(perSignature.map((entry) => entry.provenance))
  const status = deriveStatus({ signed, integrity, trust })

  const errorDetail =
    status === 'error' ? errorDetailOf(evaluation.raw, evaluation.perSignature) : undefined

  return {
    status,
    integrity,
    trust,
    provenance,
    perSignature,
    evidence: buildEvidence({
      bytes,
      policyVersion: policy.version,
      raw: {
        integrity: evaluation.raw,
        trust: perSignature.map((entry, index) => ({
          signature: index,
          trust: entry.trust,
          anchoredAt: entry.chainAnchoredAt,
        })),
        provenanceHeuristic: PROVENANCE_HEURISTIC_NOTE,
      },
      errorDetail,
    }),
  }
}
