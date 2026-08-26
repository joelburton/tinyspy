// cs-audited

import { Companion } from '../../common/components/floating-panels/Companion'
import type { SuggestState } from './CluePanel'
import styles from './CodenamesduetAISuggestCompanion.module.css'

/**
 * The AI clue suggestion — Claude's picked clue and its reasoning, for the
 * clue-giver who asked for one. The requester's OWN helper output rather than a
 * peer event, and the reasoning runs long, so it gets a floating panel instead
 * of the header pill. Opens straight away while Claude thinks (`loading`) so the
 * few-second wait is obvious, then shows the clue + reasoning (`ready`, also
 * filled into the form inputs) or the API error (`error`).
 *
 * **A COMPANION, not a modal** (Joel, 2026-08-25). §20 filed it as
 * `modal-normal` — "it demands attention, dim is right" — and that is backwards:
 * you need the BOARD to judge the advice. "On a small screen you want to see the
 * board to understand the advice; you should be able to drag it to cover the
 * infoCol area and resize it to see the board." A scrim denies exactly that, and
 * one was briefly added here by the family rollout before this was corrected.
 *
 * It is also not asking anything — a modal-normal is a question worth thinking
 * about; this is information you requested and then act on the board with. Being
 * short-lived does not make it a modal: Help is a companion too, and what makes
 * one is that the page beneath stays LIVE and you place the thing yourself.
 *
 * PlayArea renders it HIGH in the tree (at the `.layout` flex-row level) so
 * react-rnd positions it on-screen; rendered deep in the flex-column board it
 * lands below the viewport.
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
