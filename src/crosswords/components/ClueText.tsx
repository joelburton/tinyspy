import { Fragment } from 'react'
import { parseClueRuns } from '../lib/clueRuns'

/**
 * Render a clue string, turning the `_emphasis_` markers back into real
 * italics. Those underscores are `htmlToText`'s (clueHtml.ts) plaintext
 * stand-in for a clue's `<i>` / `<em>` tags — the right STORED form (it
 * round-trips cleanly to the plaintext PDF / .ipuz export), but on screen a
 * Guardian clue like "singer of _Heigh-Ho_?" should show *Heigh-Ho* in
 * italics the way the source does, not literal underscores.
 *
 * Display-only: the stored `Clue.text` is untouched, so export/AI-explain keep
 * the plaintext form. Shares `parseClueRuns` with the PDF (pdf/clues.ts), which
 * italicizes the same runs on the printed page.
 */
export function ClueText({ text }: { text: string }) {
  return (
    <>
      {parseClueRuns(text).map((seg, i) =>
        seg.italic ? <em key={i}>{seg.text}</em> : <Fragment key={i}>{seg.text}</Fragment>,
      )}
    </>
  )
}
