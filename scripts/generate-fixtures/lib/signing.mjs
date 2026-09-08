import { plainAddPlaceholder, SignPdf } from 'node-signpdf'

export function sign(pdfBytes, pkcs12) {
  // node-signpdf signs into an existing /ByteRange + /Contents placeholder;
  // plainAddPlaceholder appends one (a second call supports incremental
  // dual-signature construction for SIG-006).
  const prepared = plainAddPlaceholder({
    pdfBuffer: pdfBytes,
    reason: 'Doculite synthetic fixture',
    signatureLength: 8192,
  })
  return Buffer.from(new SignPdf().sign(prepared, Buffer.from(pkcs12)))
}

export function tamperOneByte(pdfBytes) {
  // Single-byte mutation inside the signed content region (the PDF header
  // is covered by ByteRange[0]) — same length, signature breaks.
  const out = Buffer.from(pdfBytes)
  const i = out.indexOf(Buffer.from('%PDF-1.7', 'latin1'))
  if (i === -1) throw new Error('pdf header not found for tampering')
  out[i + 7] = 0x38 // '7' -> '8'
  return out
}

export function corruptContainer(pdfBytes) {
  // Flip bytes inside the PKCS#7 hex blob so the container no longer parses.
  const out = Buffer.from(pdfBytes)
  const text = out.toString('latin1')
  const m = /\/Contents\s*<([0-9A-Fa-f]+)>/.exec(text)
  if (!m) throw new Error('no signature container found')
  const start = m.index + m[0].length - m[1].length - 1
  for (let i = 0; i < 32; i++) out[start + i] = 0x41 + (i % 6) // 'A'..'F'
  return out
}
