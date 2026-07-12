import { Fragment } from 'react'
import { parseClueRuns } from '../lib/clueRuns'

/**
 * Render a clue string, turning its `<em>…</em>` emphasis into real italics.
 * `htmlToText` (clueHtml.ts) keeps those tags from the source's `<i>` / `<em>`
 * markup, so a Guardian clue like "singer of <em>Heigh-Ho</em>?" shows
 * *Heigh-Ho* in italics the way the source does — while an NYT fill-in clue's
 * literal underscores (`A_P_E`) stay literal, not misread as emphasis.
 *
 * Display-only: the stored `Clue.text` is untouched. The raw-text consumers
 * (AI-explain, .ipuz export) drop the tags via `stripClueEmphasis`. Shares
 * `parseClueRuns` with the PDF (pdf/clues.ts), which italicizes the same runs.
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
