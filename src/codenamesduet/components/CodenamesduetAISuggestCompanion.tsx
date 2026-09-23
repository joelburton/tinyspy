// cs-met-codenamesduet

import { Companion } from '@/common/floating-panels/Companion'
import type { SuggestState } from './CluePanel'
import styles from './CodenamesduetAISuggestCompanion.module.css'

/**
 * The AI clue suggestion — Claude's picked clue and its reasoning, for the
 * clue-giver who asked for one. The requester's OWN helper output rather than a
 * peer event, and the reasoning runs long, so it gets a floating panel instead
 * of the header pill. Opens straight away while Claude thinks (`loading`) so the
 * few-second wait is obvious, then shows the clue + reasoning (`ready`, also
 * filled into the form inputs) or the sentence of a refusal or a declined
 * suggestion (`error`).
 *
 * A companion, not a modal: the board stays live and visible beneath it, since
 * the board is what the advice is about. PlayArea owns the state and places it.
 */
export function CodenamesduetAISuggestCompanion({
  state,
  onClose,
}: {
  state: SuggestState
  onClose: () => void
}) {
  console.log('[ClueHint] CodenamesduetAISuggestCompanion rendering — status:', state.status)
  return (
    <Companion
      // Companions remember where you put them, and this one earns it: the giver
      // parks it over the info column, in the same place, every turn.
      persistKey="codenamesduet:aiSuggest:rect"
      title="Clue suggestion"
      onClose={onClose}
      defaultSize={{ width: 360, height: 240 }}
      minWidth={240}
      minHeight={140}
    >
      {state.status === 'loading' && (
        <p className={styles.suggestionLoading}>Asking Claude for a clue…</p>
      )}
      {state.status === 'error' && (
        <p className={styles.suggestionError}>{state.message}</p>
      )}
      {state.status === 'ready' && (
        <>
          <div className={styles.suggestionClue}>
            <strong>{state.word}</strong> · {state.count}
          </div>
          <p className={styles.suggestionReasoning}>{state.reasoning}</p>
        </>
      )}
    </Companion>
  )
}
