/**
 * Parse + wrap a clue's `<em>` emphasis — the shared home of the `<em>…</em>`
 * tags `htmlToText` (clueHtml.ts) keeps for a clue's `<i>`/`<em>` markup. The
 * stored `Clue.text` keeps those tags; this reconstitutes the emphasis for
 * RENDERING — real `<em>` on screen (ClueText) and italic runs in the board PDF
 * (pdf/clues.ts). The raw-text consumers (AI explain-clue prompt, .ipuz export)
 * strip the tags via `stripClueEmphasis`.
 *
 * We match the source's own tag rather than an underscore stand-in because
 * underscores collide with literal ones — NYT fill-in clues like `A_P_E` would
 * be misread as emphasis; `<em>` never appears in real clue prose.
 *
 * Pure — no React, no jsPDF. `wrapClueRuns` takes a `measure` callback so the
 * PDF can drive it with jsPDF text metrics while a test drives it with a fake.
 */

export type ClueSeg = { text: string; italic: boolean }

/** Split a clue string into styled runs; each `<em>…</em>` span becomes an
 *  italic run (tags stripped). Everything else — including literal underscores
 *  (NYT fill-in blanks) and stray `<`/`>` — stays roman. */
export function parseClueRuns(text: string): ClueSeg[] {
  const segs: ClueSeg[] = []
  for (const part of text.split(/(<em>.*?<\/em>)/i)) {
    if (part === '') continue
    const m = /^<em>(.*)<\/em>$/i.exec(part)
    if (m) segs.push({ text: m[1], italic: true })
    else segs.push({ text: part, italic: false })
  }
  return segs
}

/** Drop the `<em>` emphasis tags, leaving plain text — for the consumers that
 *  want the raw clue without markup (the AI explain-clue prompt, the .ipuz
 *  export). Leaves all other characters (including literal underscores) intact. */
export function stripClueEmphasis(text: string): string {
  return text.replace(/<\/?em>/gi, '')
}

/** Split styled runs into WORDS (whitespace-delimited). A run boundary that
 *  falls *inside* a word — e.g. italic "Heigh-Ho" immediately followed by
 *  roman "?" with no space — keeps both segs in one word, so a per-style PDF
 *  draw never orphans a fragment across a line break. */
function toWords(segs: ClueSeg[]): ClueSeg[][] {
  const words: ClueSeg[][] = []
  let cur: ClueSeg[] = []
  const flush = () => {
    if (cur.length) {
      words.push(cur)
      cur = []
    }
  }
  for (const seg of segs) {
    for (const piece of seg.text.split(/(\s+)/)) {
      if (piece === '') continue
      if (/^\s+$/.test(piece)) flush()
      else cur.push({ text: piece, italic: seg.italic })
    }
  }
  flush()
  return words
}

/**
 * Greedy word-wrap styled runs into lines that fit `width`, measuring each run
 * with `measure(text, italic)`. Each returned line is a `ClueSeg[]` with single
 * spaces re-inserted as roman segs (so a consumer just draws the segs left to
 * right, switching font per seg). A word wider than `width` overflows on its
 * own line (as plain-text wrappers do). Never empty — returns `[[]]` for no
 * content.
 */
export function wrapClueRuns(
  segs: ClueSeg[],
  width: number,
  measure: (text: string, italic: boolean) => number,
): ClueSeg[][] {
  const words = toWords(segs)
  const spaceW = measure(' ', false)
  const wordWidth = (w: ClueSeg[]) => w.reduce((a, s) => a + measure(s.text, s.italic), 0)

  const lines: ClueSeg[][] = []
  let line: ClueSeg[] = []
  let lineW = 0
  for (const word of words) {
    const ww = wordWidth(word)
    if (line.length > 0 && lineW + spaceW + ww > width) {
      lines.push(line)
      line = []
      lineW = 0
    }
    if (line.length > 0) {
      line.push({ text: ' ', italic: false })
      lineW += spaceW
    }
    line.push(...word)
    lineW += ww
  }
  if (line.length > 0) lines.push(line)
  return lines.length > 0 ? lines : [[]]
}
