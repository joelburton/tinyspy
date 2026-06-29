import { useState, type SubmitEvent } from 'react'
import { supabase } from '../../common/lib/supabase'
import { cls } from '../../common/lib/cls'
import { ActorTag } from '../../common/components/ActorTag'
import { IconHint } from '../../common/components/icons'
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
   *  to PlayArea's local <ResultFlash> — NOT an inline line, so the slot height
   *  (and the board above) never changes. */
  onError: (message: string) => void
  /** Report the AI clue suggestion's reasoning. Goes to the header pill (it'd
   *  grow the one-line slot if shown inline). */
  onReasoning: (text: string) => void
}

/**
 * The codenamesduet clue UI, rendered in the below-board input slot (PlayArea's
 * `.inputRow`). Each state is a single horizontal line — the slot is board-wide,
 * so there's room to lay the pieces out in a row rather than stacking them.
 * Which line shows depends on who's looking + where in the turn cycle we are:
 *
 *   sudden death    → "Sudden death — any non-green reveal loses" notice
 *   guess phase &&
 *     guesser       → "Your clue: WORD · N" + Pass button
 *     clue-giver    → "Your clue: WORD · N" + "waiting for <peer> to guess"
 *   clue phase &&
 *     clue-giver    → "Clue for <peer>" + count + word + Submit + Clue Hint
 *     guesser       → "waiting for <peer> to give a clue"
 *
 * Every state is exactly ONE line, so the reserved-height slot is constant and
 * the board above never shifts (docs/ui.md → "Layout stability"). Anything that
 * would add a second line — a submit/suggest error, the AI reasoning — is
 * reported up via `onError` / `onReasoning` (to the local flash / header pill)
 * rather than rendered inline.
 */
export function CluePanel({
  gameId,
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
  onError,
  onReasoning,
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
        peer={peer}
        onError={onError}
        onReasoning={onReasoning}
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

/**
 * The clue-giver's inline clue form: "Clue for <peer>  [#]  [word]  ▲  Clue Hint"
 * on ONE line. Errors + the AI reasoning are reported up (onError / onReasoning)
 * rather than rendered below, so the row never grows a second line.
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
  peer,
  onError,
  onReasoning,
}: {
  gameId: string
  peer: Player | undefined
  onError: (message: string) => void
  onReasoning: (text: string) => void
}) {
  // Count is a string (not a number) so the input can start empty — defaulting
  // to a digit would tempt a Submit before the giver consciously picks one. The
  // submit guard rejects empty.
  const [count, setCount] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

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
    // propagates the new clue row.
    setCount('')
    setWord('')
  }

  // Calls the codenamesduet-suggest-clue Edge Function (which enforces the
  // "you are the clue-giver in an active game" check, then asks Claude for a
  // structured clue). The suggestion fills the inputs — editable before submit;
  // the clue is uppercased to match the type-as-caps convention, the reasoning
  // surfaced via the header pill.
  async function onSuggest() {
    setSuggesting(true)
    const { data, error } = await supabase.functions.invoke(
      'codenamesduet-suggest-clue',
      { body: { gameId } },
    )
    setSuggesting(false)
    if (error || data?.error) {
      onError(error?.message ?? data?.error ?? 'failed to fetch suggestion')
      return
    }
    const s = data.suggestion as { clue: string; count: number; reasoning: string }
    setWord(s.clue.toUpperCase())
    setCount(String(s.count))
    if (s.reasoning) onReasoning(s.reasoning)
  }

  const submittable = count !== '' && word.trim().length > 0
  const eitherBusy = busy || suggesting

  return (
    <form className={styles.clueForm} onSubmit={onSubmit}>
      <div className={styles.clueLine}>
        <span className={styles.clueFor}>
          Clue for <ActorTag actor={peer} fallback="your partner" />
        </span>
        {/* Digit-only text input (not type=number — no spinner chrome). */}
        <input
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
          type="text"
          placeholder="word"
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase())}
          disabled={eitherBusy}
          required
          className={styles.wordInput}
          data-game-input
        />
        {/* Up-arrow (the same "peer" marker the board uses) — points toward the
            partner, reading as "send this to them." */}
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={eitherBusy || !submittable}
          aria-label="Submit clue"
          title="Submit clue"
        >
          {busy ? '…' : '▲'}
        </button>
        {/* AI clue suggestion — the hint (lightbulb) icon + "Clue Hint". */}
        <button
          type="button"
          className={cls('secondary', 'icon-button', styles.hintBtn)}
          onClick={onSuggest}
          disabled={eitherBusy}
        >
          <IconHint size={15} aria-hidden />
          {suggesting ? 'Thinking…' : 'Clue Hint'}
        </button>
      </div>
    </form>
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
    <button
      type="button"
      className="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const { error } = await db.rpc('pass_turn', { target_game: gameId })
        setBusy(false)
        if (error) onError(error.message)
      }}
    >
      Pass (end turn)
    </button>
  )
}
