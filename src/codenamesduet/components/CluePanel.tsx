import { useRef, useState, type KeyboardEvent, type RefObject, type SubmitEvent } from 'react'
import { supabase } from '../../common/lib/supabase/supabase'
import { cls } from '../../common/lib/util/cls'
import { ActorTag } from '../../common/components/game/lists/ActorTag'
import { FloatingPanel } from '../../common/components/panels/FloatingPanel'
import { SubmitButton } from '../../common/components/buttons/SubmitButton'
import { AIButton } from '../../common/components/buttons/AIButton'
import { EndTurnButton } from '../../common/components/buttons/EndTurnButton'
import { db } from '../db'
import type { Player } from '../hooks/useGame'
import styles from './CluePanel.module.css'

type Clue = { word: string; count: number }

type CluePanelProps = {
  gameId: string
  /** True if the current user's seat == games.current_clue_giver. */
  isClueGiver: boolean
  /** True if a clue has been submitted for the current turn_number. */
  isGuessPhase: boolean
  /** The current turn's clue, if it exists. */
  currentClue: Clue | null
  /** True if game.status === 'sudden_death'. */
  inSuddenDeath: boolean
  /** The other seated player. Used to render "Clue for <name>" /
   *  "Waiting for <name>…". May be undefined briefly during the initial roster
   *  fetch, in which case the copy falls back to "your partner". */
  peer: Player | undefined
  /** Report an own-action error (a failed clue submit / suggestion / pass). Goes
   *  to PlayArea's local feedback pill — NOT an inline line, so the slot height
   *  (and the board above) never changes. */
  onError: (message: string) => void
  /** Open / update / close the AI clue-suggestion dialog. PlayArea owns the
   *  state and renders the <ClueSuggestionModal> HIGH in the tree: the board
   *  column is a flex column, and <FloatingPanel> (react-rnd) positions from its
   *  static flow position, so a panel rendered deep in the column lands
   *  off-screen. Rendered up at the `.layout` level (like GameOverModal) it
   *  sits where its coordinates intend. */
  onSuggestionChange: (state: SuggestState | null) => void
}

/**
 * The codenamesduet clue UI, rendered in the below-board input slot (PlayArea's
 * `.belowBoard`). Each state is a single horizontal line — the slot is board-wide,
 * so there's room to lay the pieces out in a row rather than stacking them.
 * Which line shows depends on who's looking + where in the turn cycle we are:
 *
 *   sudden death    → "Sudden death — any non-green reveal loses" notice
 *   guess phase &&
 *     guesser       → "Your clue: WORD · N" + Pass button
 *     clue-giver    → "Your clue: WORD · N" + "waiting for <peer> to guess"
 *   clue phase &&
 *     clue-giver    → "Clue for <peer>" + count + word + Submit + AI
 *     guesser       → "waiting for <peer> to give a clue"
 *
 * Every state is exactly ONE line, so the reserved-height slot is constant and
 * the board above never shifts (docs/ui.md → "Layout stability"). A submit /
 * suggest / pass error is reported up via `onError` (to the local flash) rather
 * than rendered inline; the AI suggestion's reasoning opens in its own floating
 * panel (see ClueForm) — neither grows the row.
 */
export function CluePanel({
  gameId,
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
  onError,
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
        <span className={styles.clueLabel}>Your clue:</span>
        <ClueDisplay clue={currentClue} />
        {!isClueGiver && <PassButton gameId={gameId} onError={onError} />}
        {isClueGiver && <PeerWaiting peer={peer} action="guess" />}
      </div>
    )
  }

  if (isClueGiver) {
    return (
      <ClueForm
        gameId={gameId}
        onError={onError}
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
function ClueDisplay({ clue }: { clue: Clue }) {
  return (
    <span className={styles.clueDisplay}>
      <strong>{clue.word.toUpperCase()}</strong> · {clue.count}
    </span>
  )
}

/** "Waiting for <peer> to <action>…" — the peer's identity via the shared
 *  <ActorTag> (name + colored disc); falls back to "your partner" when the peer
 *  hasn't loaded yet. */
function PeerWaiting({
  peer,
  action,
}: {
  peer: Player | undefined
  action: string
}) {
  return (
    <span className={cls('muted', styles.waiting)}>
      Waiting for <ActorTag actor={peer} fallback="your partner" /> to {action}…
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
 * The clue-giver's inline clue form: "[#]  [word]  [△ Submit]  [✨ AI]"
 * on ONE line (the submit's up-triangle "sends" the clue to the partner). Errors
 * are reported up via `onError` (to the local flash) so the
 * row never grows a second line; an AI suggestion fills the inputs AND opens a
 * draggable/resizable <FloatingPanel> with its reasoning (it's the requester's
 * own helper output — too long for, and the wrong channel for, the header pill).
 *
 * The server (submit_clue RPC) enforces the real preconditions (right seat, no
 * existing clue this turn, game active); we only do lightweight UX validation —
 * a non-empty word + a count.
 *
 * **Uppercase as typed.** Codenames convention shows clues in all-caps ("BIRD
 * 3"); the word input uppercases on every change (and so does the Claude
 * suggestion) to match.
 */
function ClueForm({
  gameId,
  onError,
  onSuggestionChange,
}: {
  gameId: string
  onError: (message: string) => void
  onSuggestionChange: (state: SuggestState | null) => void
}) {
  // Count is a string (not a number) so the input can start empty — defaulting
  // to a digit would tempt a Submit before the giver consciously picks one. The
  // submit guard rejects empty.
  const [count, setCount] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  // Whether a suggest request is in flight (disables the button). The dialog
  // STATE itself lives in PlayArea (via onSuggestionChange) so the panel renders
  // high in the tree where react-rnd positions it on-screen.
  const [suggesting, setSuggesting] = useState(false)

  // Keep Tab INSIDE the clue form: it toggles between the count and word inputs and
  // goes nowhere else — not the turn-log #N handles, page links, or the browser
  // tab bar (the wander codenamesduet uniquely allowed, since it uses plain inputs
  // rather than the Tab-swallowing capture-entry the single-field games share).
  // With only two fields, Tab and Shift+Tab are the same toggle. Submit is Enter
  // (the form's submit button); the AI button is a click.
  const countRef = useRef<HTMLInputElement>(null)
  const wordRef = useRef<HTMLInputElement>(null)
  function trapTab(
    e: KeyboardEvent<HTMLInputElement>,
    other: RefObject<HTMLInputElement | null>,
  ) {
    if (e.key !== 'Tab') return
    e.preventDefault()
    other.current?.focus()
  }

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const { error } = await db.rpc('submit_clue', {
      target_game: gameId,
      word: word.trim(),
      clue_count: parseInt(count, 10),
    })
    setBusy(false)
    if (error) {
      onError(error.message)
      return
    }
    // Clear on success; the panel swaps to the guess-phase view once Realtime
    // propagates the new clue row. Also dismiss any open suggestion dialog.
    setCount('')
    setWord('')
    onSuggestionChange(null)
  }

  // Calls the codenamesduet-suggest-clue Edge Function (which enforces the
  // "you are the clue-giver in an active game" check, then asks Claude for a
  // structured clue — a few seconds). The dialog opens IMMEDIATELY in `loading`
  // (so the wait is obvious — the subtle button change wasn't), then resolves to
  // the suggestion (filling the inputs too) or the API error, in the dialog. The
  // giver moves/resizes/closes it. The button is disabled while in flight, so
  // there's no double-request to guard against.
  async function onSuggest() {
    console.log('[ClueHint] button clicked → open dialog (loading)')
    setSuggesting(true)
    onSuggestionChange({ status: 'loading' })
    const { data, error } = await supabase.functions.invoke(
      'codenamesduet-suggest-clue',
      { body: { gameId } },
    )
    setSuggesting(false)
    if (error || data?.error) {
      console.log('[ClueHint] response = error')
      onSuggestionChange({
        status: 'error',
        message: error?.message ?? data?.error ?? 'Could not fetch a suggestion.',
      })
      return
    }
    const s = data.suggestion as { clue: string; count: number; reasoning: string }
    const upper = s.clue.toUpperCase()
    setWord(upper)
    setCount(String(s.count))
    console.log('[ClueHint] response = ready:', upper, s.count)
    onSuggestionChange({ status: 'ready', word: upper, count: s.count, reasoning: s.reasoning })
  }

  const submittable = count !== '' && word.trim().length > 0
  const eitherBusy = busy || suggesting

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
          onKeyDown={(e) => trapTab(e, wordRef)}
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
          onKeyDown={(e) => trapTab(e, countRef)}
          disabled={eitherBusy}
          required
          className={styles.wordInput}
          data-game-input
        />
        {/* Submit — the shared primary SubmitButton (its IconSubmit up-triangle
            "sends this clue up to your partner"). type="submit" so the form's
            onSubmit still fires (ActionButton defaults to type="button"). */}
        <SubmitButton
          type="submit"
          label={busy ? 'Submitting…' : 'Submit'}
          disabled={eitherBusy || !submittable}
          className={styles.submitBtn}
        />
        {/* AI clue suggestion — the shared AIButton (sparkles + amber warning
            tone): asking Claude for a clue is "use AI", distinct from a built-in
            "hint". Shows "Thinking…" while the edge function runs. */}
        <AIButton
          label={suggesting ? 'Thinking…' : 'AI'}
          onClick={onSuggest}
          disabled={eitherBusy}
          className={styles.aiBtn}
        />
      </div>
    </form>
  )
}

/**
 * The AI clue suggestion, in a draggable/resizable <FloatingPanel> the clue-giver
 * dismisses when done. It's the requester's OWN helper output (not a peer event)
 * and the reasoning is often long — so a panel, not the header pill. Opens
 * straight away while Claude thinks (`loading`), so the few-second wait is
 * obvious; then shows the picked clue + reasoning (`ready`, also filled into the
 * form inputs) or the API error message (`error`). Plain <FloatingPanel>, like
 * connections' HintModal — but PlayArea renders it HIGH in the tree (next to
 * GameOverModal, at the `.layout` flex-row level) so react-rnd positions it
 * on-screen; rendered deep in the flex-column board it lands below the viewport.
 */
export function ClueSuggestionModal({
  state,
  onClose,
}: {
  state: SuggestState
  onClose: () => void
}) {
  console.log('[ClueHint] ClueSuggestionModal rendering — status:', state.status)
  return (
    <FloatingPanel
      title="Clue suggestion"
      onClose={onClose}
      defaultSize={{ width: 360, height: 240 }}
      minWidth={240}
      minHeight={140}
    >
      <div className={styles.suggestionBody}>
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
      </div>
    </FloatingPanel>
  )
}

/**
 * Voluntarily end the turn without making (another) guess. Rule-legal at any
 * point during the guess phase — even before the first guess. Costs one turn
 * like any other turn end.
 */
function PassButton({
  gameId,
  onError,
}: {
  gameId: string
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <EndTurnButton
      label="Pass & End Turn"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const { error } = await db.rpc('pass_turn', { target_game: gameId })
        setBusy(false)
        if (error) onError(error.message)
      }}
    />
  )
}
