// cs-unmet

import { useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import type { GSuggestState } from '../types'

/** What `codenamesduet-suggest-clue` puts in `data`. Nullable because its
 *  not-ok arms carry none — including `get_clue_context`'s own refusals, which
 *  the function relays untouched rather than re-wording. */
type SuggestedClue = {
  result: 'suggested'
  suggestion: { clue: string; count: number; reasoning: string }
} | null

/**
 * Ask Claude for a clue (`act-suggest-clue`, the clue form's AI button). A
 * COMMAND the page offers, so it's an action — unlike the form's Submit, whose
 * Enter belongs to the focused field rather than to the key dispatcher.
 *
 * It calls the `codenamesduet-suggest-clue` edge function, which checks that I
 * am the clue-giver in a running game and then asks Claude — a few seconds. The
 * dialog (PlayArea's, through `onSuggestionChange`) opens at once in `loading`,
 * then resolves to the suggestion, which `fillClue` also puts in the inputs, or
 * to the sentence for a refusal. The button is disabled while in flight, so
 * there is no double request to guard against.
 *
 * Hands back the action and `suggesting` — a request is out — which the form's
 * inputs are disabled by.
 */
export function useSuggestClue({
  gameId,
  isSubmitting,
  onSuggestionChange,
  fillClue,
}: {
  gameId: string
  // The form's clue is with the server: the button waits.
  isSubmitting: boolean
  onSuggestionChange: (state: GSuggestState | null) => void
  // Put a suggested clue in the form, lowercase, as the AI's.
  fillClue: (word: string, count: number) => void
}): {
  actSuggestClue: Action
  suggesting: boolean
} {
  const [suggesting, setSuggesting] = useState(false)

  async function suggestClue() {
    console.log('[ClueHint] button clicked → open dialog (loading)')
    setSuggesting(true)
    onSuggestionChange({ status: 'loading' })
    const res = await runEdgeFn<SuggestedClue>('codenamesduet-suggest-clue',
      { gameId })
    setSuggesting(false)

    if (res.type === 'not-ok' && res.severity === 'fault') {
      // The dialog CLOSES. `runEdgeFn` has already raised the modal, and a
      // fault leaves nothing to put in the dialog — holding it open on a stale
      // "loading" is worse than dismissing it (docs/ui.md → Faults).
      console.log('[ClueHint] response = fault')
      onSuggestionChange(null)
    } else if (res.type === 'not-ok') {
      // The dialog STAYS, carrying the sentence. PN319 and PN320 are Claude
      // declining or being cut off — it ran, it just did not produce a clue —
      // and `get_clue_context`'s own refusals arrive here relayed untouched.
      console.log('[ClueHint] response = refused:', res.message)
      onSuggestionChange({ status: 'error', message: res.message })
    } else if (res.type === 'ok' && res.data?.result === 'suggested') {
      const s = res.data.suggestion
      const suggested = s.clue.toLowerCase()
      fillClue(suggested, s.count)
      console.log('[ClueHint] response = ready:', suggested, s.count)
      onSuggestionChange({
        status: 'ready',
        word: suggested,
        count: s.count,
        reasoning: s.reasoning,
      })
    } else {
      reportUnhandled('codenamesduet-suggest-clue', res)
      onSuggestionChange(null)
    }
  }

  const actSuggestClue = useBindAction('act-suggest-clue', {
    describe: () => ({
      state: isSubmitting || suggesting ? 'disabled' : 'active',
      label: suggesting ? 'Thinking…' : 'AI',
    }),
    run: suggestClue,
  })

  return { actSuggestClue, suggesting }
}
