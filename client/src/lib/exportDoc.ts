import { sanitizeHtml } from './sanitize'

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Print-friendly styles shared by the PDF and Word exports. */
const DOCUMENT_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.6; font-size: 11pt; max-width: 720px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22pt; margin: 0 0 12pt; } h2 { font-size: 15pt; margin: 18pt 0 6pt; } h3 { font-size: 12pt; margin: 14pt 0 4pt; }
  p { margin: 0 0 8pt; } ul, ol { margin: 0 0 8pt; padding-left: 22pt; }
  blockquote { border-left: 3px solid #999; margin: 8pt 0; padding: 2pt 10pt; color: #444; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; } th, td { border: 1px solid #bbb; padding: 4pt 6pt; text-align: left; } th { background: #f0f0f0; }
  code { font-family: Menlo, Consolas, monospace; font-size: 9.5pt; background: #f2f2f2; padding: 0 3px; }
  pre { background: #f2f2f2; padding: 8pt; white-space: pre-wrap; } mark { background: #fff3a3; }
  @page { margin: 18mm; }
`

function standaloneHtml(title: string, bodyHtml: string, headExtra = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${headExtra}<style>${DOCUMENT_CSS}</style></head><body>${sanitizeHtml(bodyHtml)}</body></html>`
}

/**
 * Opens the browser's print dialog for the document, where "Save as PDF"
 * produces a PDF with selectable text.
 */
export function printAsPdf(title: string, contentHtml: string) {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  document.body.appendChild(frame)

  const win = frame.contentWindow
  if (!win) { frame.remove(); return }
  win.document.open()
  win.document.write(standaloneHtml(title, contentHtml))
  win.document.close()
  win.onafterprint = () => frame.remove()
  // Give the frame a moment to lay out before printing
  setTimeout(() => {
    win.focus()
    win.print()
    // Fallback cleanup for browsers that don't fire afterprint
    setTimeout(() => frame.remove(), 60_000)
  }, 150)
}

/**
 * Word-compatible .doc file (HTML with Office namespaces). Opens in Microsoft Word,
 * and Google Docs converts it when uploaded to Drive.
 */
export function wordDocument(title: string, contentHtml: string): Blob {
  const head = '<meta name="ProgId" content="Word.Document"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->'
  const html = standaloneHtml(title, contentHtml, head)
    .replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">')
  return new Blob(['﻿', html], { type: 'application/msword' })
}
