import { useState } from 'react'
import { supabase } from '../lib/supabase'

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
}

/**
 * The panel between the board header and the grid. Its content depends on
 * which player is looking and where in the turn cycle we are:
 *
 *   sudden death    → "any non-green reveal loses" notice (no clue/pass UI)
 *   guess phase &&
 *     guesser       → clue display + "Pass" button (legal at any time)
 *     clue-giver    → clue display + "waiting for partner to guess" hint
 *   clue phase &&
 *     clue-giver    → ClueForm
 *     guesser       → "waiting for partner to give a clue" hint
 *
 * All four screens render in roughly the same spot so the layout doesn't jump.
 */
export function CluePanel({
  gameId,
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
}: CluePanelProps) {
  if (inSuddenDeath) {
    return (
      <div className="clue-panel sudden-death">
        <strong>Sudden death.</strong> No more clues. Any non-green reveal loses.
      </div>
    )
  }

  if (isGuessPhase && currentClue) {
    return (
      <div className="clue-panel">
        <div className="muted">Current clue</div>
        <div className="clue-display">
          <strong>{currentClue.word.toUpperCase()}</strong> · {currentClue.count}
        </div>
        {!isClueGiver && <PassButton gameId={gameId} />}
        {isClueGiver && <p className="muted">Waiting for your partner to guess…</p>}
      </div>
    )
  }

  if (isClueGiver) {
    return <ClueForm gameId={gameId} />
  }
  return (
    <div className="clue-panel">
      <p className="muted">Waiting for your partner to give a clue…</p>
    </div>
  )
}

/**
 * Inline form rendered to the active clue-giver during the clue phase.
 *
 * The server (submit_clue RPC) enforces all the actual preconditions
 * (right seat, no existing clue this turn, game is active). We only do
 * lightweight UX validation here — a non-empty word and a non-negative
 * count.
 */
function ClueForm({ gameId }: { gameId: string }) {
  // Count is stored as a string (not a number) so the input can start empty
  // — defaulting to a digit would tempt the clue-giver into pressing Submit
  // before consciously picking one. The submit guard rejects empty.
  const [count, setCount] = useState('')
  const [word, setWord] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('submit_clue', {
      target_game: gameId,
      word: word.trim(),
      clue_count: parseInt(count, 10),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Clear the form on success; the panel will swap to the guess-phase view
    // automatically once Realtime propagates the new clue row.
    setCount('')
    setWord('')
  }

  const submittable = count !== '' && word.trim().length > 0

  return (
    <form className="clue-panel clue-form" onSubmit={onSubmit}>
      <div className="muted">Give a clue for your partner</div>
      <div className="clue-form-row">
        <input
          type="number"
          min={0}
          placeholder="count"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={busy}
          required
          className="count-input"
          autoFocus
        />
        <input
          type="text"
          placeholder="word or phrase"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          disabled={busy}
          required
        />
        <button type="submit" disabled={busy || !submittable}>
          {busy ? 'Sending…' : 'Submit'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

/**
 * Voluntarily end the turn without making (another) guess. Rule-legal at
 * any point during the guess phase — even before the first guess. Costs
 * one timer token like any other turn end.
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
        const { error } = await supabase.rpc('pass_turn', { target_game: gameId })
        setBusy(false)
        if (error) console.error(error)
      }}
    >
      Pass (end turn)
    </button>
  )
}
