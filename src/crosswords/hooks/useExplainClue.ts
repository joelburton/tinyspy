// cs-unmet

import { useState } from 'react'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { GClueAsked, GExplainState, GGameData } from '../types'

/** What `crosswords-explain-clue` puts in `data`. `unsolved` is an ANSWER, not
 *  a refusal: the menu item is live on any clue under the cursor because the
 *  page cannot see which words are solved — the solution is server-only, and
 *  graying the item would leak exactly what that protects. */
type Explained =
  | { result: 'explained'; explanation: string }
  | { result: 'unsolved' }
  | null

/**
 * The AI explainer: its trip to the `crosswords-explain-clue` edge function and
 * the dialog's state. The function answers `unsolved` unless the word is
 * already filled correctly, so it is never a spoiler (docs/games/crosswords.md
 * → AI "Explain cryptic clue").
 */
export function useExplainClue({ gd }: { gd: GGameData }): {
  explanation: { state: GExplainState; label: string } | null
  explainClue: (clue: GClueAsked | null) => Promise<void>
  closeExplanation: () => void
} {
  const [explanation, setExplanation] = useState<{ state: GExplainState; label: string } | null>(null)

  async function explainClue(clue: GClueAsked | null) {
    if (clue === null) {
      setExplanation({ label: 'clue', state: { kind: 'error', message: 'Put your cursor on a clue first.' } })
      return
    }
    setExplanation({ label: clue.label, state: { kind: 'loading' } })
    const res = await runEdgeFn<Explained>('crosswords-explain-clue', {
      gameId: gd.id, cells: clue.cells, clueText: clue.clueText, enumeration: clue.enumeration,
    })
    if (res.type === 'not-ok' && res.severity === 'fault') {
      // The dialog CLOSES: the modal is up, and a fault leaves nothing to put in
      // the dialog (docs/ui.md → Faults).
      setExplanation(null)
    } else if (res.type === 'not-ok') {
      // The dialog STAYS with the sentence: the model declining or being cut
      // off — it ran, it just explained nothing.
      setExplanation({ label: clue.label, state: { kind: 'error', message: res.message } })
    } else if (res.type === 'ok' && res.data?.result === 'unsolved') {
      // Worded here, because the server must not hint at how close you are.
      setExplanation({
        label: clue.label,
        state: { kind: 'error', message: 'Solve this clue correctly first, then I can explain it.' },
      })
    } else if (res.type === 'ok' && res.data?.result === 'explained') {
      setExplanation({ label: clue.label, state: { kind: 'ok', explanation: res.data.explanation } })
    } else {
      reportUnhandled('crosswords-explain-clue', res)
      setExplanation(null)
    }
  }

  return { explanation, explainClue, closeExplanation: () => setExplanation(null) }
}
