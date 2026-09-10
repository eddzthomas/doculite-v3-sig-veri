import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import forge from 'node-forge'
import type {
  CoveredRange,
  Integrity,
  IntegrityEvaluation,
  PerSignatureIntegritySummary,
  ScannedSignature,
  ScannedSignatureOrMalformed,
  SignatureCryptoFacts,
  SignatureVerification,
} from './types.ts'

// RFC 5652 OIDs. The messageDigest attribute OID is deliberately pinned here
// as 1.2.840.113549.1.9.4 (RFC 5652) — do not "correct" it to a PKCS#9/10 OID.
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2'
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4'
const OID_SHA1 = '1.3.14.3.2.26'
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1'

const DIGEST_NAMES: Record<string, string> = {
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
}

// DER tag bytes used by PKCS#7/CMS structures.
const TAG_INTEGER = 0x02
const TAG_OCTET_STRING = 0x04
const TAG_OID = 0x06
const TAG_SEQUENCE = 0x30
const TAG_SET = 0x31
const TAG_CONTEXT_0 = 0xa0
const TAG_CONTEXT_1 = 0xa1

/** Step-named parse failure. Message is safe to surface (never contains bytes). */
export class ParseError extends Error {
  readonly step: string
  constructor(step: string, message: string) {
    super(message)
    this.step = step
  }
}

/**
 * Byte-exact DER walker. Offsets are absolute in the buffer so every TLV can
 * be re-sliced verbatim: PKCS#7 signature verification requires the exact
 * DER encoding of signedAttributes from the raw stream, never a re-encode.
 */
interface DerTlv {
  tag: number
  contentStart: number
  contentEnd: number
  rawStart: number
  rawEnd: number
}

function readTlv(buf: Uint8Array, offset: number): DerTlv {
  if (offset < 0 || offset + 2 > buf.length) throw new ParseError('der', 'truncated header')
  const tag = buf[offset]
  const firstLengthByte = buf[offset + 1]
  if (tag === undefined || firstLengthByte === undefined)
    throw new ParseError('der', 'truncated header')
  if ((tag & 0x1f) === 0x1f) throw new ParseError('der', 'long-form tags unsupported')
  let pos = offset + 2
  let length: number
  if (firstLengthByte & 0x80) {
    const count = firstLengthByte & 0x7f
    if (count === 0) throw new ParseError('der', 'indefinite length is not DER')
    if (pos + count > buf.length) throw new ParseError('der', 'truncated length')
    length = 0
    for (let i = 0; i < count; i++) {
      const lengthByte = buf[pos + i]
      if (lengthByte === undefined) throw new ParseError('der', 'truncated length')
      length = length * 0x100 + lengthByte
    }
    pos += count
  } else {
    length = firstLengthByte
  }
  const contentStart = pos
  const contentEnd = contentStart + length
  if (contentEnd > buf.length) throw new ParseError('der', 'truncated content')
  return { tag, contentStart, contentEnd, rawStart: offset, rawEnd: contentEnd }
}

function children(buf: Uint8Array, tlv: DerTlv): Array<DerTlv> {
  const out: Array<DerTlv> = []
  let pos = tlv.contentStart
  while (pos < tlv.contentEnd) {
    const next = readTlv(buf, pos)
    if (next.rawEnd > tlv.contentEnd) throw new ParseError('der', 'child overflows parent')
    out.push(next)
    pos = next.rawEnd
  }
  return out
}

function child(buf: Uint8Array, tlv: DerTlv, index: number): DerTlv {
  const found = children(buf, tlv)[index]
  if (!found) throw new ParseError('der', 'missing child')
  return found
}

function decodeOid(buf: Uint8Array, tlv: DerTlv): string {
  if (tlv.tag !== TAG_OID) throw new ParseError('der', 'expected an OID')
  const arcs: Array<number> = []
  let value = 0
  for (const byte of contentBytes(buf, tlv)) {
    value = value * 0x80 + (byte & 0x7f)
    if (byte & 0x80) continue
    if (arcs.length === 0) {
      arcs.push(Math.floor(value / 40), value % 40)
    } else {
      arcs.push(value)
    }
    value = 0
  }
  return arcs.join('.')
}

function contentBytes(buf: Uint8Array, tlv: DerTlv): Uint8Array {
  return buf.subarray(tlv.contentStart, tlv.contentEnd)
}

function expectTag(tlv: DerTlv, tag: number, step: string, message: string): void {
  if (tlv.tag !== tag) throw new ParseError(step, message)
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * SHA-256 hex fingerprint over a certificate's exact DER bytes (the full
 * certificate TLV, byte-for-byte). This is the single fingerprint convention
 * shared by signer-cert facts (SignatureCryptoFacts.signerCertFingerprint)
 * and trust-policy anchors, so anchor-vs-signer comparisons are always
 * apples-to-apples — never re-encode, always hash the exact DER stream.
 */
export function certificateFingerprint(der: Uint8Array): string {
  return sha256Hex(der)
}

/**
 * ByteRange scan + /Contents extraction. Pairing rule: each /ByteRange is
 * paired with the first /Contents occurring after it and before the next
 * /ByteRange (PDF signature dictionaries emit /ByteRange first). Odd or
 * empty hex, or a missing /Contents, marks the dictionary `malformed`.
 */
export function scanSignatures(bytes: Uint8Array): Array<ScannedSignatureOrMalformed> {
  const text = latin1(bytes)
  const byteRanges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)]
  const contents = [...text.matchAll(/\/Contents\s*<([0-9A-Fa-f]+)>/g)]
  const out: Array<ScannedSignatureOrMalformed> = []
  let contentIndex = 0
  for (const rangeMatch of byteRanges) {
    const rangeText = rangeMatch[0] ?? ''
    const nextRange = byteRanges.find((m) => m.index > rangeMatch.index)
    let content = contents[contentIndex]
    while (content && content.index < rangeMatch.index + rangeText.length) {
      contentIndex++
      content = contents[contentIndex]
    }
    const paired =
      content !== undefined &&
      (nextRange === undefined || content.index < nextRange.index) &&
      (content[1]?.length ?? 0) > 0 &&
      (content[1]?.length ?? 0) % 2 === 0
    if (!paired || !content) {
      out.push({ malformed: true })
      continue
    }
    contentIndex++
    // Byte offset of the first hex character: match start + '/Contents ' + '<'
    const contentsHexStart =
      (content.index ?? 0) + (content[0]?.length ?? 0) - (content[1]?.length ?? 0) - 1
    out.push({
      byteRange: [
        Number(rangeMatch[1]),
        Number(rangeMatch[2]),
        Number(rangeMatch[3]),
        Number(rangeMatch[4]),
      ],
      contentsHex: content[1] ?? '',
      contentsHexStart,
    })
  }
  return out
}

/**
 * Pinned ContentInfo → SignedData walk shared by signature verification and
 * trust-chain extraction, so both consumers agree on the same structure
 * rules. Returns the certificates [0] and signerInfos SET TLVs.
 */
function parseSignedDataEnvelope(der: Uint8Array): {
  certificates: DerTlv | null
  signerInfos: DerTlv | null
} {
  // ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT }
  const root = readTlv(der, 0)
  expectTag(root, TAG_SEQUENCE, 'cms-parse', 'container is not parseable as PKCS#7 SignedData')
  const contentInfo = children(der, root)
  const oidTlv = contentInfo[0]
  const contentTlv = contentInfo[1]
  if (!oidTlv || !contentTlv || contentInfo.length !== 2) {
    throw new ParseError('cms-parse', 'ContentInfo structure unexpected')
  }
  if (decodeOid(der, oidTlv) !== OID_SIGNED_DATA) {
    throw new ParseError('cms-parse', 'container is not SignedData')
  }
  expectTag(contentTlv, TAG_CONTEXT_0, 'cms-parse', 'SignedData wrapper unexpected')
  const wrapper = readTlv(der, contentTlv.contentStart)
  expectTag(wrapper, TAG_SEQUENCE, 'cms-parse', 'SignedData structure unexpected')

  // SignedData ::= SEQUENCE { version, digestAlgorithms SET, contentInfo,
  // certificates [0] IMPLICIT OPTIONAL, crls [1] OPTIONAL, signerInfos SET }
  let innerContentInfo: DerTlv | null = null
  let certificates: DerTlv | null = null
  let signerInfos: DerTlv | null = null
  for (const part of children(der, wrapper)) {
    if (part.tag === TAG_INTEGER && innerContentInfo === null) {
      // version
      continue
    }
    if (part.tag === TAG_SEQUENCE && innerContentInfo === null) {
      // inner detached contentInfo
      innerContentInfo = part
      continue
    }
    if (part.tag === TAG_SET) {
      // digestAlgorithms precedes the inner contentInfo; signerInfos follows it
      if (innerContentInfo === null) continue
      if (signerInfos !== null) throw new ParseError('cms-parse', 'SignedData structure unexpected')
      signerInfos = part
      continue
    }
    if (part.tag === TAG_CONTEXT_0 && innerContentInfo !== null) {
      certificates = part
      continue
    }
    if (part.tag === TAG_CONTEXT_1 && innerContentInfo !== null) {
      // CRLs are out of scope at M0-D (no revocation claims)
      continue
    }
    throw new ParseError('cms-parse', 'SignedData structure unexpected')
  }
  return { certificates, signerInfos }
}

/**
 * Trust-chain extraction: walks the certificates from the signer up to a
 * self-signed root, matching each issuer to a certificate whose subject DER
 * is byte-identical. Candidates are the certificates embedded in the CMS
 * container first, then `extraCerts` — the caller's complete known-root
 * store for containers that embed only the leaf (fixture roots at M0-D).
 * The store must be a SUPERSET of the policy anchors: which root is trusted
 * is decided solely by the policy, never by candidate availability.
 * Returns the chain leaf-first, root-last, as each certificate's exact DER
 * bytes (same convention as `certificateFingerprint`). Throws ParseError
 * when the signer cannot be located or no issuer resolves to a self-signed
 * root — the caller maps that to trust `error` (never a validity status).
 *
 * SECURITY (RISK-007): no chain-link signature or AKI/serial validation is
 * performed — a leaf whose issuer DN bytes equal a committed anchor's
 * subject DN terminates here, so the trust claim is forgeable. Acceptable
 * only while the adapter stays on the offline fixture proof (Draft policy);
 * path validation is a BLOCKING M1 security prerequisite before any
 * real-document path (docs/delivery/risk-register.md).
 */
export function extractSignerChain(
  sig: ScannedSignature,
  extraCerts: Array<Uint8Array> = [],
): Array<Uint8Array> {
  const der = Buffer.from(sig.contentsHex, 'hex')
  const { certificates, signerInfos } = parseSignedDataEnvelope(der)
  const signerTlv = signerInfos === null ? undefined : children(der, signerInfos)[0]
  if (!signerTlv) throw new ParseError('chain-parse', 'no signerInfos')
  // SignerInfo ::= SEQUENCE { version, issuerAndSerialNumber, ... }
  const issuerAndSerial = child(der, signerTlv, 1)
  expectTag(issuerAndSerial, TAG_SEQUENCE, 'chain-parse', 'SignerInfo structure unexpected')
  const serialHex = Buffer.from(contentBytes(der, child(der, issuerAndSerial, 1))).toString('hex')

  const certList = certificates === null ? [] : children(der, certificates)
  const embedded = certList.map((certTlv) => toEmbeddedCert(der, certTlv))
  const extras = extraCerts.map((certDer) => toEmbeddedCert(certDer, readTlv(certDer, 0)))
  const start = embedded.find((cert) => cert.serialHex === serialHex)
  if (!start) throw new ParseError('chain-parse', 'signer certificate not found')

  const bySubject = new Map<string, Array<EmbeddedCert>>()
  for (const cert of [...embedded, ...extras]) {
    const sameSubject = bySubject.get(cert.subjectKey) ?? []
    sameSubject.push(cert)
    bySubject.set(cert.subjectKey, sameSubject)
  }
  // Walk signer → root. A self-signed certificate (issuer DER === subject
  // DER) terminates the chain; anything else must resolve to a known issuer
  // certificate or the chain is broken (fail-safe: throw, never guess).
  const chain: Array<EmbeddedCert> = [start]
  const seen = new Set<EmbeddedCert>([start])
  let current = start
  while (current.issuerKey !== current.subjectKey) {
    const next = bySubject.get(current.issuerKey)?.find((cert) => !seen.has(cert))
    if (!next) {
      throw new ParseError(
        'chain-parse',
        'issuer certificate missing: chain does not reach a self-signed root',
      )
    }
    chain.push(next)
    seen.add(next)
    current = next
  }
  return chain.map((cert) => cert.derBytes)
}

/** One embedded certificate reduced to the fields chain building compares. */
interface EmbeddedCert {
  derBytes: Uint8Array
  serialHex: string
  /** Hex of the exact issuer Name TLV bytes (byte-exact DN comparison). */
  issuerKey: string
  /** Hex of the exact subject Name TLV bytes. */
  subjectKey: string
}

/**
 * Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm,
 * signatureValue }; tbsCertificate ::= SEQUENCE { version [0] OPTIONAL,
 * serialNumber, signature, issuer, validity, subject, ... }.
 */
function toEmbeddedCert(der: Uint8Array, certTlv: DerTlv): EmbeddedCert {
  expectTag(certTlv, TAG_SEQUENCE, 'chain-parse', 'certificate structure unexpected')
  const tbs = child(der, certTlv, 0)
  expectTag(tbs, TAG_SEQUENCE, 'chain-parse', 'certificate structure unexpected')
  const fields = children(der, tbs)
  let index = 0
  if (fields[0]?.tag === TAG_CONTEXT_0) index += 1 // [0] EXPLICIT version
  const serial = fields[index]
  const issuer = fields[index + 2]
  const validity = fields[index + 3]
  const subject = fields[index + 4]
  if (!serial || !issuer || !validity || !subject) {
    throw new ParseError('chain-parse', 'certificate structure unexpected')
  }
  expectTag(serial, TAG_INTEGER, 'chain-parse', 'certificate structure unexpected')
  return {
    derBytes: Buffer.from(der.subarray(certTlv.rawStart, certTlv.rawEnd)),
    serialHex: Buffer.from(contentBytes(der, serial)).toString('hex'),
    issuerKey: Buffer.from(der.subarray(issuer.rawStart, issuer.rawEnd)).toString('hex'),
    subjectKey: Buffer.from(der.subarray(subject.rawStart, subject.rawEnd)).toString('hex'),
  }
}

/**
 * Cryptographic core for one scanned signature. Step order is the evidence:
 * coverage → CMS parse → digest algorithm → key algorithm → content digest →
 * messageDigest attribute comparison → RSA verify. Parse/structure failures
 * are `error`; computed-fact mismatches are `invalid` (SIG-004 vs SIG-005).
 */
export function verifySignature(bytes: Uint8Array, sig: ScannedSignature): SignatureVerification {
  // Structural checks for this signature: it must start at byte 0 and its
  // revision must not extend past the file. Whole-document gap-free coverage
  // is enforced once per document (see evaluateIntegrity) because in
  // incremental multi-signature files earlier signatures cover only their
  // own revision, not the appended bytes.
  const [start1, length1, start2, length2] = sig.byteRange
  if (start1 !== 0 || start2 + length2 > bytes.length) {
    return {
      integrity: 'error',
      detail: 'coverage: /ByteRange does not cover the document exactly',
    }
  }

  try {
    const der = Buffer.from(sig.contentsHex, 'hex')
    const { certificates, signerInfos } = parseSignedDataEnvelope(der)
    const signerTlv = signerInfos === null ? undefined : children(der, signerInfos)[0]
    if (!signerTlv) throw new ParseError('cms-parse', 'no signerInfos')

    // SignerInfo ::= SEQUENCE { version, issuerAndSerialNumber, digestAlgorithm,
    // signedAttrs [0] IMPLICIT OPTIONAL, digestEncryptionAlgorithm,
    // encryptedDigest OCTET STRING, unsignedAttrs [1] IMPLICIT OPTIONAL }
    expectTag(child(der, signerTlv, 0), TAG_INTEGER, 'cms-parse', 'SignerInfo structure unexpected')
    const issuerAndSerial = child(der, signerTlv, 1)
    expectTag(issuerAndSerial, TAG_SEQUENCE, 'cms-parse', 'SignerInfo structure unexpected')
    const digestAlgorithmTlv = child(der, signerTlv, 2)
    expectTag(digestAlgorithmTlv, TAG_SEQUENCE, 'cms-parse', 'SignerInfo structure unexpected')
    const digestOid = decodeOid(der, child(der, digestAlgorithmTlv, 0))

    // Digest-algorithm flexibility: SHA-256 supported; SHA-1 recognized only
    // to classify legacy containers as error (never verified, never guessed).
    if (digestOid === OID_SHA1) {
      return {
        integrity: 'error',
        detail:
          'digest-algorithm: SHA-1 legacy container classified as error (M0-D supports SHA-256)',
      }
    }
    const digestName = DIGEST_NAMES[digestOid]
    if (!digestName) {
      return { integrity: 'error', detail: 'digest-algorithm: unsupported message digest OID' }
    }

    const signerFields = children(der, signerTlv).slice(3)
    let cursor = 0
    const signedAttrs = signerFields[cursor]?.tag === TAG_CONTEXT_0 ? signerFields[cursor] : null
    if (signedAttrs) cursor++
    const keyAlgorithmTlv = signerFields[cursor]
    const encryptedDigestTlv = signerFields[cursor + 1]
    if (!keyAlgorithmTlv || !encryptedDigestTlv) {
      throw new ParseError('cms-parse', 'SignerInfo structure unexpected')
    }
    expectTag(keyAlgorithmTlv, TAG_SEQUENCE, 'cms-parse', 'SignerInfo structure unexpected')
    expectTag(encryptedDigestTlv, TAG_OCTET_STRING, 'cms-parse', 'SignerInfo structure unexpected')

    // Key algorithm: exactly rsaEncryption at M0-D (fixtures are RSA-2048
    // PKCS#1 v1.5). Other RSA-family OIDs (RSASSA-PSS, OAEP, md5WithRSA…)
    // use padding/hashing our verifier does not evaluate — a PKCS#1 v1.5
    // check on them would assert invalidity for a container we cannot
    // evaluate. Fail-safe: error, never a guess.
    const keyOid = decodeOid(der, child(der, keyAlgorithmTlv, 0))
    if (keyOid !== OID_RSA_ENCRYPTION) {
      return {
        integrity: 'error',
        detail: 'key-algorithm: unsupported digestEncryptionAlgorithm OID',
      }
    }

    // Content digest: SHA-256 over the two covered byte regions concatenated.
    const range1 = bytes.subarray(start1, start1 + length1)
    const range2 = bytes.subarray(start2, start2 + length2)
    const contentDigest = createHash('sha256').update(range1).update(range2).digest()

    // Signer certificate: match the issuerAndSerialNumber serial. Both hex
    // strings derive from the exact INTEGER content, so equality is sound.
    const serialTlv = child(der, issuerAndSerial, 1)
    const serialHex = Buffer.from(contentBytes(der, serialTlv)).toString('hex')
    const certList = certificates === null ? [] : children(der, certificates)
    let certTlv: DerTlv | null = null
    for (const candidate of certList) {
      expectTag(candidate, TAG_SEQUENCE, 'cms-parse', 'certificate structure unexpected')
      const tbs = child(der, candidate, 0)
      const certSerial = child(der, tbs, 1)
      if (Buffer.from(contentBytes(der, certSerial)).toString('hex') === serialHex) {
        certTlv = candidate
        break
      }
    }
    if (certTlv === null) throw new ParseError('cms-parse', 'signer certificate not found')

    // Full certificate TLV (header + content) — forge parses complete DER
    // structures, and the fingerprint is over the exact certificate DER.
    const certBytes = Buffer.from(der.subarray(certTlv.rawStart, certTlv.rawEnd))
    let cert: forge.pki.Certificate
    try {
      const certAsn = forge.asn1.fromDer(certBytes.toString('binary'))
      cert = forge.pki.certificateFromAsn1(certAsn)
    } catch (e) {
      // forge refuses to parse certificates whose public key is not RSA
      const message = e instanceof Error ? e.message : ''
      if (message.includes('OID is not RSA')) {
        return {
          integrity: 'error',
          detail: 'key-algorithm: signer certificate key algorithm is not RSA',
        }
      }
      throw new ParseError('cms-parse', 'signer certificate is not parseable')
    }

    const subject = cert.subject.attributes
      .map((a) => `${a.shortName ?? a.name}=${a.value}`)
      .join(', ')

    let signatureOk: boolean
    if (signedAttrs) {
      // RFC 5652 §9.3.11: the RSA signature covers the DER encoding of
      // signedAttributes with the IMPLICIT [0] tag replaced by SET OF.
      // Full [0] TLV (header + content), tag byte swapped — byte-exact
      // from the container, never a re-encode.
      const attrsRaw = Buffer.from(der.subarray(signedAttrs.rawStart, signedAttrs.rawEnd))
      attrsRaw[0] = TAG_SET
      const messageDigestAttr = findMessageDigestAttr(der, signedAttrs)
      if (!messageDigestAttr) {
        return {
          integrity: 'error',
          detail: 'message-digest-attribute: no messageDigest attribute present',
        }
      }
      const signerFacts = facts(certBytes, digestName, subject, cert, [
        start1,
        length1,
        start2,
        length2,
      ])
      if (!Buffer.from(messageDigestAttr).equals(contentDigest)) {
        // Content changed after signing (SIG-004 recipe): a computed-fact
        // mismatch, so invalid — not a parse error.
        return {
          integrity: 'invalid',
          detail: 'message-digest-attribute-mismatch: content changed after signing',
          signer: signerFacts,
        }
      }
      signatureOk = cryptoVerify(
        'sha256',
        attrsRaw,
        createPublicKey(forge.pki.publicKeyToPem(cert.publicKey)),
        contentBytes(der, encryptedDigestTlv),
      )
    } else {
      // No signedAttributes: the RSA signature covers the content itself.
      signatureOk = cryptoVerify(
        'sha256',
        Buffer.concat([Buffer.from(range1), Buffer.from(range2)]),
        createPublicKey(forge.pki.publicKeyToPem(cert.publicKey)),
        contentBytes(der, encryptedDigestTlv),
      )
    }
    if (!signatureOk) {
      return {
        integrity: 'invalid',
        detail: 'rsa-verify: signature does not verify against the signer certificate',
        signer: facts(certBytes, digestName, subject, cert, [start1, length1, start2, length2]),
      }
    }
    return {
      integrity: 'valid',
      detail: 'verified: coverage, digest attribute, and RSA signature all consistent',
      signer: facts(certBytes, digestName, subject, cert, [start1, length1, start2, length2]),
    }
  } catch (e) {
    if (e instanceof ParseError) {
      return { integrity: 'error', detail: `${e.step}: ${e.message}` }
    }
    return { integrity: 'error', detail: 'cms-parse: container verification failed' }
  }
}

function findMessageDigestAttr(der: Uint8Array, signedAttrs: DerTlv): Uint8Array | null {
  for (const attr of children(der, signedAttrs)) {
    expectTag(attr, TAG_SEQUENCE, 'cms-parse', 'signed attribute structure unexpected')
    const parts = children(der, attr)
    const oidTlv = parts[0]
    const valueSet = parts[1]
    if (!oidTlv || !valueSet) {
      throw new ParseError('cms-parse', 'signed attribute structure unexpected')
    }
    if (decodeOid(der, oidTlv) === OID_MESSAGE_DIGEST) {
      expectTag(valueSet, TAG_SET, 'cms-parse', 'signed attribute structure unexpected')
      const value = child(der, valueSet, 0)
      expectTag(value, TAG_OCTET_STRING, 'cms-parse', 'signed attribute structure unexpected')
      return contentBytes(der, value)
    }
  }
  return null
}

function facts(
  certBytes: Uint8Array,
  digestName: string,
  subject: string,
  cert: forge.pki.Certificate,
  ranges: [number, number, number, number],
): SignatureCryptoFacts {
  const [s1, l1, s2, l2] = ranges
  const coveredRanges: Array<CoveredRange> = [
    { start: s1, end: s1 + l1 - 1 },
    { start: s2, end: s2 + l2 - 1 },
  ]
  return {
    coveredRanges,
    digestAlgorithm: digestName,
    // Only reached after the key-algorithm gate passed (rsaEncryption).
    signatureAlgorithm: `RSA with ${digestName}`,
    signerSubject: subject,
    // Fingerprint = SHA-256 of the certificate's exact DER bytes (same
    // convention the Task 3 trust anchors use for root certificates).
    signerCertFingerprint: sha256Hex(certBytes),
    certValidityWindow: {
      notBefore: cert.validity.notBefore.toISOString(),
      notAfter: cert.validity.notAfter.toISOString(),
    },
  }
}

// Exported for the Task 4 orchestrator, which must distinguish the stage
// marker from real evaluation notes when naming an error step in evidence.
export const STAGE_NOTE = 'integrity-only pass: trust and provenance are not evaluated here'

function coveredRangesOf(byteRange: ScannedSignature['byteRange']): Array<CoveredRange> {
  const [s1, l1, s2, l2] = byteRange
  return [
    { start: s1, end: s1 + l1 - 1 },
    { start: s2, end: s2 + l2 - 1 },
  ]
}

function toSummary(
  verification: SignatureVerification,
  byteRange: ScannedSignature['byteRange'],
): PerSignatureIntegritySummary {
  return {
    coveredRanges: verification.signer?.coveredRanges ?? coveredRangesOf(byteRange),
    digestAlgorithm: verification.signer?.digestAlgorithm ?? 'unknown',
    signatureAlgorithm: verification.signer?.signatureAlgorithm ?? 'unknown',
    signerSubject: verification.signer?.signerSubject ?? '',
    signerCertFingerprint: verification.signer?.signerCertFingerprint ?? '',
    chainAnchoredAt: null,
    certValidityWindow: verification.signer?.certValidityWindow ?? {
      notBefore: null,
      notAfter: null,
    },
    integrity: verification.integrity,
    trust: 'not_evaluated',
    provenance: 'not_evaluated',
    notes: verification.integrity === 'valid' ? [STAGE_NOTE] : [STAGE_NOTE, verification.detail],
  }
}

function aggregate(integrityResults: Array<Integrity>): Integrity {
  if (integrityResults.includes('error')) return 'error'
  if (integrityResults.includes('invalid')) return 'invalid'
  return 'valid'
}

/**
 * Document-level structural coverage check. In a PDF signature the byte
 * region between the two ByteRange ranges is the signature's own
 * `/Contents <hex>` placeholder (including the `<`/`>` delimiters) — those
 * bytes are legitimately uncovered and must be later covered by an
 * incremental signature's ranges. Every byte outside such placeholder gaps
 * must be covered by at least one signature, or the document is
 * structurally broken (error, not a per-signature fact).
 */
function coversWholeDocument(bytes: Uint8Array, signatures: Array<ScannedSignature>): boolean {
  if (signatures.length === 0) return true // unsigned document: nothing to falsify
  const gaps: Array<[number, number]> = []
  const covered: Array<[number, number]> = []
  for (const sig of signatures) {
    const [start1, length1, start2, length2] = sig.byteRange
    if (start2 < start1 + length1) return false // ranges overlap
    const gapStart = start1 + length1
    const gapEnd = start2
    const hexStart = sig.contentsHexStart
    const hexEnd = hexStart + sig.contentsHex.length
    // the gap must be exactly '<' + hex + '>' for this signature
    if (gapStart !== hexStart - 1 || gapEnd !== hexEnd + 1) return false
    gaps.push([gapStart, gapEnd])
    covered.push([start1, start1 + length1])
    covered.push([start2, start2 + length2])
  }
  covered.sort((a, b) => a[0] - b[0])
  const inGap = (from: number, to: number): boolean =>
    gaps.some(([gapStart, gapEnd]) => gapStart <= from && to <= gapEnd)
  let coveredEnd = 0
  for (const [start, end] of covered) {
    if (end <= coveredEnd) continue
    if (start > coveredEnd && !inGap(coveredEnd, start)) return false
    coveredEnd = Math.max(coveredEnd, end)
  }
  return coveredEnd >= bytes.length || inGap(coveredEnd, bytes.length)
}

/**
 * Minimal PDF plausibility check, used only to route garbage input to
 * `error` (never a validity status): starts with %PDF- and ends with %%EOF.
 */
function isPdfStructurePlausible(bytes: Uint8Array): boolean {
  const text = latin1(bytes)
  return text.startsWith('%PDF-') && /%%EOF\s*$/u.test(text)
}

/**
 * Document-level integrity evaluation: scan → per-signature verification →
 * fail-safe roll-up (any error → error, else any invalid → invalid).
 * Per-signature summaries carry `not_evaluated` trust/provenance — their
 * evaluation stages run later (Task 3 / Task 4).
 */
export function evaluateIntegrity(bytes: Uint8Array): IntegrityEvaluation {
  try {
    if (!isPdfStructurePlausible(bytes)) {
      return {
        integrity: 'error',
        perSignature: [],
        raw: { detail: 'pdf-structure-check: input is not a parseable PDF' },
      }
    }
    const scanned = scanSignatures(bytes)
    const signatures = scanned.filter((s): s is ScannedSignature => !('malformed' in s))
    const perSignature: Array<PerSignatureIntegritySummary> = []
    for (const scannedSig of scanned) {
      if ('malformed' in scannedSig) {
        perSignature.push({
          coveredRanges: [],
          digestAlgorithm: 'unknown',
          signatureAlgorithm: 'unknown',
          signerSubject: '',
          signerCertFingerprint: '',
          chainAnchoredAt: null,
          certValidityWindow: { notBefore: null, notAfter: null },
          integrity: 'error',
          trust: 'not_evaluated',
          provenance: 'not_evaluated',
          notes: [STAGE_NOTE, 'byteRange-scan: signature dictionary incomplete'],
        })
        continue
      }
      perSignature.push(toSummary(verifySignature(bytes, scannedSig), scannedSig.byteRange))
    }
    // Whole-document coverage is a structural property: on failure the
    // document is error, but the already-computed per-signature entries are
    // kept (with a coverage note) so debugging detail survives to Task 4.
    const coverageFailed = !coversWholeDocument(bytes, signatures)
    if (coverageFailed) {
      for (const entry of perSignature) {
        entry.notes.push('coverage: signed byte ranges do not cover the document exactly')
      }
    }
    return {
      integrity: coverageFailed ? 'error' : aggregate(perSignature.map((entry) => entry.integrity)),
      perSignature,
      // SECURITY: `raw` embeds the full /Contents hex blobs (signature
      // containers) — never log it, never persist it, never return it to a
      // browser. M0-D offline proof only; M1+ replaces it with a reference.
      raw: { scan: scanned, perSignature },
    }
  } catch {
    return { integrity: 'error', perSignature: [], raw: { detail: 'unexpected verifier failure' } }
  }
}
