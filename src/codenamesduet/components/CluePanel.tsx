// cs-met-codenamesduet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useRef, useState, type SubmitEvent } from 'react'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { cls } from '@/common/utils/cls'
import { DotActor, ActorDot } from '@/common/members/ActorMention'
import { FormSubmitButton } from '@/common/buttons/FormSubmitButton'
import { IconSubmit } from '@/common/icons/icons'
import { ActionButton } from '@/common/actions/ActionButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { db } from '../db'
import type { Seat } from '../lib/phase'
import type { ClueEvent } from '../lib/events'
import type { Player } from '../hooks/useGame'
import styles from './CluePanel.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** What `submit_clue` answers: one `ok`, the clue as it was recorded. The word
 *  and count are echoed from the stored row, so they say what the partner will
 *  see rather than what this form sent. */
type ClueAnswer = {
  result: 'clued'
  word: string
  count: number
  turn_number: number
  by_seat: Seat
}

/** What `pass_turn` answers: one `ok`, carrying the turn state the pass
 *  produced. `play_state` is where sudden death shows up — spending the last
 *  turn is a state the board renders off the games row, not a second answer to
 *  "did my pass go through". */
type PassAnswer = {
  result: 'passed'
  turn_number: number
  turns_remaining: number
  clue_giver: Seat
  play_state: 'playing' | 'sudden_death'
}

type CluePanelProps = {
  gameId: string
  // My seat is `games.current_clue_giver`.
  isClueGiver: boolean
  // A clue is in for the current turn.
  isGuessPhase: boolean
  // The current turn's clue, if one is in.
  currentClue: ClueEvent | null
  // The turn budget is spent.
  inSuddenDeath: boolean
  // The other seated player, named in the waiting and guessing lines; the
  // lines fall back to "your partner".
  peer: Player | undefined
  // PlayArea's below-board slot: a refused clue or pass is shown into it as a
  // not-ok rather than inline, so the row's height never changes.
  localFeedbackSlot: FeedbackSlot
  // Open / update / close the AI clue-suggestion dialog; its state is PlayArea's.
  onSuggestionChange: (state: SuggestState | null) => void
}

/** What `codenamesduet-suggest-clue` puts in `data`. Nullable because its
 *  not-ok arms carry none — including `get_clue_context`'s own refusals, which
 *  the function relays untouched rather than re-wording. */
type SuggestedClue = {
  result: 'suggested'
  suggestion: { clue: string; count: number; reasoning: string }
} | null

/**
 * The codenamesduet clue UI, rendered in BoardCol's below-board slot. Which line
 * shows depends on who is looking and where in the turn we are:
 *
 *   sudden death    → the "Sudden death" notice
 *   guess phase &&
 *     guesser       → "WORD · N" + the Pass button
 *     clue-giver    → "WORD · N" + "● <peer> guessing"
 *   clue phase &&
 *     clue-giver    → the clue form: count + word + Submit + AI
 *     guesser       → "Waiting for <peer> to give a clue…"
 *
 * Every state is exactly ONE line, so the fixed-height slot holds and the board
 * above never shifts (docs/ui.md → Layout stability). A refused submit or pass
 * shows into the local feedback slot rather than inline, and the AI
 * suggestion's reasoning opens in its own floating panel — neither grows the
 * row.
 */
export function CluePanel({
  gameId,
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
  localFeedbackSlot,
  onSuggestionChange,
}: CluePanelProps) {
  if (inSuddenDeath) {
    return (
      <div className={cls(styles.cluePanel, styles.suddenDeath)}>
        <strong>Sudden death.</strong> No more clues — any non-green reveal loses.
      </div>
    )
  }

  if (isGuessPhase && currentClue) {
    return (
      <div className={styles.cluePanel}>
        {/* No "Your clue:" label — the bold WORD · N beside the Pass button is
            self-evidently the clue, and the row is tight on a phone. */}
        <ClueDisplay clue={currentClue} />
        {!isClueGiver && <PassButton gameId={gameId} localFeedbackSlot={localFeedbackSlot} />}
        {isClueGiver && <PeerActivity peer={peer} activity="guessing" />}
      </div>
    )
  }

  if (isClueGiver) {
    return (
      <ClueForm
        gameId={gameId}
        localFeedbackSlot={localFeedbackSlot}
        onSuggestionChange={onSuggestionChange}
      />
    )
  }
  return (
    <div className={styles.cluePanel}>
      <PeerWaiting peer={peer} action="give a clue" />
    </div>
  )
}

/** The active clue, inline: "WORD · N" (the word bold + prominent). */
function ClueDisplay({ clue }: { clue: ClueEvent }) {
  return (
    <span className={styles.clueDisplay}>
      <strong>{clue.clue_word.toUpperCase()}</strong> · {clue.clue_count}
    </span>
  )
}

/** "● moth guessing" — the peer as a `<DotActor>` (colored disc + name), then
 *  what they are doing. Telegraphic, because it shares the below-board row
 *  with the clue display and the Pass button, where a sentence crowds a phone.
 *  Falls back to "Your partner". */
function PeerActivity({
  peer,
  activity,
}: {
  peer: Player | undefined
  activity: string
}) {
  return (
    <span className={cls('muted', styles.waiting)}>
      {/* show="auto": on a phone the name drops to just the dot ("● guessing") so
          a long username can't overflow this tight below-board row. */}
      <DotActor actor={peer} fallback="Your partner" show="auto" /> {activity}
    </span>
  )
}

/** "Waiting for <peer> to <action>…" — the peer as an `<ActorDot>` (name +
 *  colored disc); falls back to "your partner". A sentence, because this state
 *  owns the whole below-board row and has the room. */
function PeerWaiting({
  peer,
  action,
}: {
  peer: Player | undefined
  action: string
}) {
  return (
    <span className={cls('muted', styles.waiting)}>
      {/* show="auto": on a phone the name drops to just the dot ("Waiting for ● to
          give a clue…") so a long username can't overflow this tight row. */}
      Waiting for <ActorDot actor={peer} fallback="your partner" show="auto" /> to {action}…
    </span>
  )
}

/** The clue-suggestion dialog's contents. It opens on click in `loading` (the
 *  edge function calls an AI and takes a few seconds), then resolves to the
 *  picked clue + reasoning (`ready`) or the API error message (`error`). */
export type SuggestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; word: string; count: number; reasoning: string }

/**
 * The clue-giver's clue form — count, word, Submit and AI on ONE line. A
 * refused submit shows into the local feedback slot, so the row never grows a
 * second line; an AI suggestion fills the inputs AND opens a floating panel
 * with its reasoning.
 *
 * The server (`submit_clue`) judges the move — the right seat, no clue in yet,
 * the game running; this form checks only that both fields are filled.
 *
 * **Uppercase as typed.** Clues are shown in capitals ("BIRD · 3"), so the word
 * input uppercases on every change, and so does the AI's suggestion.
 */
function ClueForm({
  gameId,
  localFeedbackSlot,
  onSuggestionChange,
}: {
  gameId: string
  // The slot a refused clue submit is shown into, as a not-ok.
  localFeedbackSlot: FeedbackSlot
  onSuggestionChange: (state: SuggestState | null) => void
}) {
  // A string, not a number, so the input can start empty; the submit guard
  // rejects empty.
  const [count, setCount] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  // A suggest request is in flight — the button's `disabled`. The dialog's
  // state itself is PlayArea's, through `onSuggestionChange`.
  const [suggesting, setSuggesting] = useState(false)
  // The last clue the AI filled in, as filled in. A clue submitted exactly as
  // this — word and count unedited — is logged as the AI's; editing either makes
  // it the giver's own.
  const [aiClue, setAiClue] = useState<{ word: string; count: number } | null>(null)
  // On a phone the below-board row is tight, so the Submit + AI buttons go
  // icon-only (label → aria-label/title). Desktop/tablet keep the labels.
  const isPhone = useIsPhone()

  // The two fields ARE this form's ring, so Tab toggles between them and goes
  // nowhere else. It is innermost while the form is up, which is why it beats
  // the page's empty ring below it.
  const countRef = useRef<HTMLInputElement>(null)
  const wordRef = useRef<HTMLInputElement>(null)
  useTabRing([countRef, wordRef])

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const clueWord = word.trim()
    const clueCount = parseInt(count, 10)
    const res = await runRpc<ClueAnswer>(db.rpc('submit_clue', {
      target_game: gameId,
      clue_word: clueWord,
      clue_count: clueCount,
      clue_from_ai: aiClue !== null && clueWord === aiClue.word && clueCount === aiClue.count,
    }))
    setBusy(false)
    // Three of the four refusals are RACES (orange), because this form is drawn
    // from state that arrives by subscription while the button unlocks on the
    // reply above: the partner's guess can hand the clue-giver seat away, and
    // your own clue can land before the row saying so does. The inputs KEEP
    // their contents on any refusal — the clue was never recorded, so it is
    // still the clue you meant to give.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'clued') {
      // Clear on success; the panel swaps to the guess-phase view once Realtime
      // propagates the new clue row. Also dismiss any open suggestion dialog.
      setCount('')
      setWord('')
      setAiClue(null)
      onSuggestionChange(null)
      return
    } else {
      reportUnhandled('submit_clue', res)
      return
    }
  }

  // Calls the `codenamesduet-suggest-clue` edge function, which checks that I am
  // the clue-giver in a running game and then asks Claude — a few seconds. The
  // dialog opens at once in `loading`, then resolves to the suggestion (which
  // also fills the inputs) or to the sentence for a refusal. The button is
  // disabled while in flight, so there is no double request to guard against.
  async function onSuggest() {
    console.log('[ClueHint] button clicked → open dialog (loading)')
    setSuggesting(true)
    onSuggestionChange({ status: 'loading' })
    const res = await runEdgeFn<SuggestedClue>('codenamesduet-suggest-clue', { gameId })
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
      const upper = s.clue.toUpperCase()
      setWord(upper)
      setCount(String(s.count))
      setAiClue({ word: upper.trim(), count: s.count })
      console.log('[ClueHint] response = ready:', upper, s.count)
      onSuggestionChange({ status: 'ready', word: upper, count: s.count, reasoning: s.reasoning })
    } else {
      reportUnhandled('codenamesduet-suggest-clue', res)
      onSuggestionChange(null)
    }
  }

  const submittable = count !== '' && word.trim().length > 0
  const eitherBusy = busy || suggesting

  // Ask Claude for a clue. A COMMAND the page offers, so it's a bound action —
  // unlike the Submit beside it, which is this form's own submit button and
  // whose Enter belongs to the focused field rather than to the key dispatcher.
  const actSuggestClue = useBoundAction('act-suggest-clue', {
    describe: () => ({
      state: eitherBusy ? 'disabled' : 'active',
      label: suggesting ? 'Thinking…' : 'AI',
    }),
    run: onSuggest,
  })

  return (
    <form className={styles.clueForm} onSubmit={onSubmit}>
      {/* No "Clue for <peer>" label — the inputs (a count + a word + the send
          arrow) make it obvious you're composing a clue, and the header pill
          already says whose turn it is. */}
      <div className={styles.clueLine}>
        {/* Digit-only text input (not type=number — no spinner chrome). */}
        <input
          ref={countRef}
          type="text"
          inputMode="numeric"
          placeholder="#"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
          disabled={eitherBusy}
          required
          className={styles.countInput}
          // Game input: "/" and "?" still open chat / menu while typing here.
          data-game-input
          autoFocus
        />
        <input
          ref={wordRef}
          type="text"
          placeholder="word"
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase())}
          disabled={eitherBusy}
          required
          className={styles.wordInput}
          data-game-input
        />
        {/* Submit — the clue box is a REAL form (docs/ui.md → Real forms), so
            this is the form's commit rather than a bound action: it submits, and
            the game's own `onSubmit` reads the two fields. The up-triangle says
            "sends this clue up to your partner". */}
        <FormSubmitButton
          icon={IconSubmit}
          label={busy ? 'Submitting…' : 'Submit'}
          show={isPhone ? 'icon' : 'both'}
          disabled={eitherBusy || !submittable}
          className={styles.submitBtn}
        />
        {/* The AI clue suggestion; its "Thinking…" while the edge function
            runs is the action's `describe`. */}
        <ActionButton
          action={actSuggestClue}
          show={isPhone ? 'icon' : 'both'}
          className={styles.aiBtn}
        />
      </div>
    </form>
  )
}

/**
 * End the turn without another guess — legal at any point in the guess phase,
 * even before the first guess, and it spends the turn like any other turn end.
 */
function PassButton({
  gameId,
  localFeedbackSlot,
}: {
  gameId: string
  // The slot a refused pass is shown into, as a not-ok.
  localFeedbackSlot: FeedbackSlot
}) {
  // Icon-only on a phone, where the below-board row is tight; the label rides
  // in the tooltip either way. No `busy` flag of its own: the action's run is
  // single-flight, so a second press while the first is out is dropped.
  const isPhone = useIsPhone()
  const actEndTurn = useBoundAction('act-end-turn', {
    describe: () => ({ state: 'active', label: 'Pass & End Turn' }),
    run: async () => {
      const res = await runRpc<PassAnswer>(db.rpc('pass_turn', { target_game: gameId }))
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'passed') {
        // Nothing to do: the new turn — and sudden death, if that was the last
        // one — arrives on the games row, which is what redraws this panel.
        return
      } else {
        reportUnhandled('pass_turn', res)
        return
      }
    },
  })
  return <ActionButton action={actEndTurn} show={isPhone ? 'icon' : 'both'} weight="primary" />
}
