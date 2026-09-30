/** Converts AI markdown output into HTML the Tiptap editor understands. */
export function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const html: string[] = []
  let inUl = false
  let inOl = false
  let inPre = false
  let preLines: string[] = []

  const flushList = () => {
    if (inUl) { html.push('</ul>'); inUl = false }
    if (inOl) { html.push('</ol>'); inOl = false }
  }

  const inline = (t: string) =>
    t
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  for (const raw of lines) {
    const line = raw

    // fenced code block
    if (line.startsWith('```')) {
      if (!inPre) { flushList(); inPre = true; preLines = [] }
      else { html.push(`<pre><code>${preLines.join('\n')}</code></pre>`); inPre = false }
      continue
    }
    if (inPre) { preLines.push(line); continue }

    // headings
    if (/^### /.test(line)) { flushList(); html.push(`<h3>${inline(line.slice(4))}</h3>`); continue }
    if (/^## /.test(line))  { flushList(); html.push(`<h2>${inline(line.slice(3))}</h2>`); continue }
    if (/^# /.test(line))   { flushList(); html.push(`<h1>${inline(line.slice(2))}</h1>`); continue }

    // hr
    if (/^---+$/.test(line.trim())) { flushList(); html.push('<hr>'); continue }

    // blockquote
    if (/^> /.test(line)) { flushList(); html.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`); continue }

    // unordered list
    if (/^[-*] /.test(line)) {
      if (inOl) { html.push('</ol>'); inOl = false }
      if (!inUl) { html.push('<ul>'); inUl = true }
      html.push(`<li>${inline(line.slice(2))}</li>`)
      continue
    }

    // ordered list
    if (/^\d+\. /.test(line)) {
      if (inUl) { html.push('</ul>'); inUl = false }
      if (!inOl) { html.push('<ol>'); inOl = true }
      html.push(`<li>${inline(line.replace(/^\d+\. /, ''))}</li>`)
      continue
    }

    flushList()

    if (line.trim() === '') { html.push('<p></p>'); continue }
    html.push(`<p>${inline(line)}</p>`)
  }

  flushList()
  if (inPre) html.push(`<pre><code>${preLines.join('\n')}</code></pre>`)

  return html.join('')
}
