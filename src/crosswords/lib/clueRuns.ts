/**
 * Parse + wrap a clue's `_emphasis_` markers — the shared home of the
 * underscore convention `htmlToText` (clueHtml.ts) emits for a clue's
 * `<i>`/`<em>` tags. The stored `Clue.text` keeps that plaintext form (it
 * round-trips to the plaintext PDF / .ipuz export); this reconstitutes the
 * emphasis for RENDERING — real `<em>` on screen (ClueText) and italic runs in
 * the board PDF (pdf/clues.ts).
 *
 * Pure — no React, no jsPDF. `wrapClueRuns` takes a `measure` callback so the
 * PDF can drive it with jsPDF text metrics while a test drives it with a fake.
 */

export type ClueSeg = { text: string; italic: boolean }

/** Split a clue string into styled runs; the `_…_` markers become italic runs
 *  (markers stripped). Crossword clue text never contains a lone underscore,
 *  so paired `_…_` is unambiguous; an unpaired underscore stays literal. */
export function parseClueRuns(text: string): ClueSeg[] {
  const segs: ClueSeg[] = []
  for (const part of text.split(/(_[^_]+_)/)) {
    if (part === '') continue
    if (/^_[^_]+_$/.test(part)) segs.push({ text: part.slice(1, -1), italic: true })
    else segs.push({ text: part, italic: false })
  }
  return segs
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
