import { PDFDocument, StandardFonts } from 'pdf-lib'

const TRAILING_NEWLINE = Buffer.from('\n', 'latin1')

export async function buildDocument(title) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  page.drawText(title, { x: 72, y: 720, size: 18, font })
  page.drawText('Synthetic Doculite fixture — no real person signed this.', {
    x: 72,
    y: 690,
    size: 10,
    font,
  })
  // node-signpdf requires the buffer to end with a newline; object streams
  // must be disabled so plainAddPlaceholder gets a classic xref table
  // (pdf-lib's default cross-reference-stream output is unparsable by it).
  const base = Buffer.from(await pdf.save({ useObjectStreams: false }))
  return Buffer.concat([base, TRAILING_NEWLINE])
}
