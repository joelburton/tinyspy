import { useState, type SubmitEvent } from 'react'
import { supabase } from '../../common/lib/supabase'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
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
  /** The other seated player. Used to render "Give a clue for
   *  <name>" / "Waiting for <name>…" — replaces the previous
   *  "your partner" copy. May be undefined briefly during the
   *  initial roster fetch, in which case the copy falls back to
   *  "your partner" so the panel always reads cleanly. */
  peer: Player | undefined
}

/**
 * The action slot in the right column. Its content depends on
 * which player is looking and where in the turn cycle we are:
 *
 *   sudden death    → "any non-green reveal loses" notice
 *   guess phase &&
 *     guesser       → clue display + "Pass" button (legal any time)
 *     clue-giver    → clue display + "waiting for <peer> to guess" hint
 *   clue phase &&
 *     clue-giver    → ClueForm (count + word + submit + suggest)
 *     guesser       → "waiting for <peer> to give a clue" hint
 *
 * All four shapes render in the same fixed-height slot (set by the
 * parent's `.actionSlot` styles) — switching between them doesn't
 * shift the game log below, per docs/ui.md → "Layout stability."
 */
export function CluePanel({
  gameId,
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
}: CluePanelProps) {
  if (inSuddenDeath) {
    return (
      <div className={cls(styles.cluePanel, styles.suddenDeath)}>
        <strong>Sudden death.</strong> No more clues. Any non-green reveal
        loses.
      </div>
    )
  }

  if (isGuessPhase && currentClue) {
    return (
      <div className={styles.cluePanel}>
        <div className="muted">Current clue</div>
        <div className={styles.clueDisplay}>
          <strong>{currentClue.word.toUpperCase()}</strong> · {currentClue.count}
        </div>
        {!isClueGiver && <PassButton gameId={gameId} />}
        {isClueGiver && <PeerWaiting peer={peer} action="guess" />}
      </div>
    )
  }

  if (isClueGiver) {
    return <ClueForm gameId={gameId} peer={peer} />
  }
  return (
    <div className={styles.cluePanel}>
      <PeerWaiting peer={peer} action="give a clue" />
    </div>
  )
}

/** Render "Waiting for <peer>…" with the peer's name in their
 *  profile color so the waiting copy reinforces who you're
 *  waiting on. Falls back to "your partner" when the peer
 *  hasn't loaded yet so the panel never reads "Waiting for …" */
function PeerWaiting({
  peer,
  action,
}: {
  peer: Player | undefined
  action: string
}) {
  if (!peer) {
    return <p className="muted">Waiting for your partner to {action}…</p>
  }
  return (
    <p className="muted">
      Waiting for{' '}
      <strong style={{ color: colorVarFor(peer.color) }}>
        {peer.username}
      </strong>{' '}
      to {action}…
    </p>
  )
}

/**
 * Inline form rendered to the active clue-giver during the clue
 * phase.
 *
 * The server (submit_clue RPC) enforces all the actual preconditions
 * (right seat, no existing clue this turn, game is active). We only
 * do lightweight UX validation here — a non-empty word and a non-
 * negative count.
 *
 * **Uppercase as typed.** The word input transforms input to
 * uppercase on every onChange. Codenames convention: clues are
 * shown in all-caps both in the game ("BIRD 3") and in pop
 * culture; making the input live-uppercase matches the
 * convention and saves the clue-giver a step. Also applies to
 * the Claude suggestion, so the inputs look consistent after
 * "Need a clue?" lands its picks.
 */
function ClueForm({
  gameId,
  peer,
}: {
  gameId: string
  peer: Player | undefined
}) {
  // Count is stored as a string (not a number) so the input can
  // start empty — defaulting to a digit would tempt the clue-giver
  // into pressing Submit before consciously picking one. The
  // submit guard rejects empty.
  const [count, setCount] = useState('')
  const [word, setWord] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await db.rpc('submit_clue', {
      target_game: gameId,
      word: word.trim(),
      clue_count: parseInt(count, 10),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Clear the form on success; the panel will swap to the
    // guess-phase view automatically once Realtime propagates the
    // new clue row.
    setCount('')
    setWord('')
    setReasoning(null)
  }

  // Calls the tinyspy-suggest-clue Edge Function, which:
  //   1. invokes get_clue_context as the current user (the RPC
  //      enforces the "you are the clue-giver in an active game"
  //      check)
  //   2. asks Claude to pick a clue via tool-use for structured
  //      output
  // The returned suggestion fills the inputs — the user can edit
  // before submitting. The clue is uppercased to match the
  // capitalize-as-typed convention; the reasoning text is shown
  // as a small line below.
  async function onSuggest() {
    setError(null)
    setReasoning(null)
    setSuggesting(true)
    const { data, error } = await supabase.functions.invoke(
      'tinyspy-suggest-clue',
      { body: { gameId } },
    )
    setSuggesting(false)
    if (error || data?.error) {
      setError(error?.message ?? data?.error ?? 'failed to fetch suggestion')
      return
    }
    const s = data.suggestion as {
      clue: string
      count: number
      reasoning: string
    }
    setWord(s.clue.toUpperCase())
    setCount(String(s.count))
    setReasoning(s.reasoning)
  }

  const submittable = count !== '' && word.trim().length > 0
  const eitherBusy = busy || suggesting

  return (
    <form className={styles.cluePanel} onSubmit={onSubmit}>
      <div className={styles.clueFormHeader}>
        <span className="muted">
          Give a clue for{' '}
          {peer ? (
            <strong style={{ color: colorVarFor(peer.color) }}>
              {peer.username}
            </strong>
          ) : (
            <strong>your partner</strong>
          )}
        </span>
        <button
          type="button"
          className={cls('link-button', styles.suggestBtn)}
          onClick={onSuggest}
          disabled={eitherBusy}
        >
          {suggesting ? 'Thinking…' : 'Need a clue?'}
        </button>
      </div>
      <div className={styles.clueFormRow}>
        {/* Digit-only text input rather than type=number — no spinner chrome,
            and a clue count is a single digit. */}
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
      </div>
      {reasoning && (
        <p className={cls('muted', styles.suggestReasoning)}>{reasoning}</p>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  )
}

/**
 * Voluntarily end the turn without making (another) guess. Rule-
 * legal at any point during the guess phase — even before the
 * first guess. Costs one timer token like any other turn end.
 */
function PassButton({ gameId }: { gameId: string }) {
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
        if (error) console.error(error)
      }}
    >
      Pass (end turn)
    </button>
  )
}
