export { buildEvidence, type EvidenceInput } from './evidence.ts'
export { evaluateTrust, loadPolicy, type TrustAnchor, type TrustPolicy } from './policy.ts'
export {
  aggregateProvenance,
  determineProvenance,
  PROVENANCE_HEURISTIC_NOTE,
} from './provenance.ts'
export { ADAPTER_VERSION, type Dimensions, deriveStatus } from './result.ts'
export type {
  CertValidityWindow,
  CoveredRange,
  EvidenceRecord,
  Integrity,
  IntegrityEvaluation,
  NotEvaluated,
  PerSignatureIntegritySummary,
  PerSignatureSummary,
  Provenance,
  ProvenanceEvaluation,
  ScannedSignature,
  ScannedSignatureOrMalformed,
  SignatureCryptoFacts,
  SignatureVerification,
  Trust,
  TrustEvaluation,
  VerificationResult,
  VerificationStatus,
} from './types.ts'
export {
  certificateFingerprint,
  evaluateIntegrity,
  extractSignerChain,
  scanSignatures,
} from './verifier.ts'
export { aggregateTrust, type VerifyPdfOptions, verifyPdf } from './verify.ts'
