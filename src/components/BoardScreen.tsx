import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useGame } from '../hooks/useGame'
import { useBoard, type KeyLabel } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'

type Props = {
  session: Session
  gameId: string
  onLeave: () => void
}

const LABEL_CLASS: Record<KeyLabel, string> = {
  G: 'tile-green',
  N: 'tile-neutral',
  A: 'tile-assassin',
}

const STATUS_BANNER: Record<string, { text: string; tone: 'win' | 'loss' }> = {
  won: { text: 'Victory! All 15 agents found.', tone: 'win' },
  lost_assassin: { text: 'Game over — an assassin was revealed.', tone: 'loss' },
  lost_clock: { text: 'Game over — ran out of time in sudden death.', tone: 'loss' },
}

export function BoardScreen({ session, gameId, onLeave }: Props) {
  const { game, players } = useGame(gameId)
  const { words, myKey, loading } = useBoard(gameId, session.user.id)
  const { clues } = useClues(gameId)
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const [guessError, setGuessError] = useState<string | null>(null)

  if (loading || !game || !myKey || words.length < 25) {
    return <div className="card">Loading board…</div>
  }

  const mySeat = players.find((p) => p.user_id === session.user.id)?.seat as 'A' | 'B' | undefined
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  // Phase derivation: did a clue exist for the current turn?
  const currentTurnClue = clues.find((c) => c.turn_number === game.turn_number) ?? null
  const isGuessPhase = currentTurnClue !== null
  const isClueGiver = mySeat === game.current_clue_giver
  const gameOver = game.status !== 'active' && game.status !== 'sudden_death'
  const inSuddenDeath = game.status === 'sudden_death'

  const cellsClickable =
    !gameOver &&
    ((inSuddenDeath) || (game.status === 'active' && isGuessPhase && !isClueGiver))

  async function handleGuess(position: number) {
    setGuessError(null)
    setPendingPos(position)
    const { error } = await supabase.rpc('submit_guess', {
      target_game: gameId,
      target_position: position,
    })
    setPendingPos(null)
    if (error) {
      console.error('submit_guess failed', error)
      setGuessError(error.message)
    }
  }

  return (
    <div className="board-wrap">
      <header className="board-header">
        <div>
          <div className="muted">Game {game.join_code}</div>
          <div>
            You are <strong>{mySeat}</strong>
            {!gameOver && !inSuddenDeath && (
              <> · clue-giver: <strong>{game.current_clue_giver}</strong></>
            )}
          </div>
        </div>
        <div className="status">
          <div>
            <strong>{greenFound}</strong> / 15 agents
          </div>
          <div className="muted">
            {inSuddenDeath ? 'sudden death' : `${game.turns_remaining} tokens left`}
          </div>
        </div>
      </header>

      {gameOver && (
        <GameOverBanner status={game.status} onLeave={onLeave} />
      )}

      {!gameOver && (
        <CluePanel
          gameId={gameId}
          isClueGiver={isClueGiver}
          isGuessPhase={isGuessPhase}
          currentClue={currentTurnClue}
          inSuddenDeath={inSuddenDeath}
        />
      )}

      {guessError && (
        <div className="error-banner">
          {guessError}{' '}
          <button type="button" className="link-button" onClick={() => setGuessError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="board-grid">
        {words.map((w) => {
          const myLabel = myKey[w.position]
          const revealed = w.revealed_as !== null
          const tintCls = revealed
            ? `tile-revealed ${LABEL_CLASS[w.revealed_as as KeyLabel]}`
            : `tile-hint ${LABEL_CLASS[myLabel]}`
          const clickable = cellsClickable && !revealed
          const isPending = pendingPos === w.position
          return (
            <button
              key={w.position}
              type="button"
              className={`tile ${tintCls} ${clickable ? 'tile-clickable' : ''} ${isPending ? 'tile-pending' : ''}`}
              disabled={!clickable || isPending}
              onClick={() => clickable && handleGuess(w.position)}
            >
              <span className="tile-word">{w.word}</span>
              {isPending && <span className="tile-key">…</span>}
            </button>
          )
        })}
      </div>

      {clues.length > 0 && (
        <section className="clue-history">
          <h3>Clue history</h3>
          <ol>
            {clues.map((c) => (
              <li key={c.id}>
                <span className="muted">turn {c.turn_number}, {c.by_seat}:</span>{' '}
                <strong>{c.word.toUpperCase()}</strong> · {c.count}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="muted board-help">
        <button type="button" className="link-button" onClick={onLeave}>
          Leave game
        </button>
      </p>
    </div>
  )
}

function GameOverBanner({ status, onLeave }: { status: string; onLeave: () => void }) {
  const banner = STATUS_BANNER[status]
  if (!banner) return null
  return (
    <div className={`game-over ${banner.tone}`}>
      <strong>{banner.text}</strong>
      <button type="button" onClick={onLeave}>Back to home</button>
    </div>
  )
}

function CluePanel({
  gameId,
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
}: {
  gameId: string
  isClueGiver: boolean
  isGuessPhase: boolean
  currentClue: { word: string; count: number } | null
  inSuddenDeath: boolean
}) {
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

  // Clue phase
  if (isClueGiver) {
    return <ClueForm gameId={gameId} />
  }
  return (
    <div className="clue-panel">
      <p className="muted">Waiting for your partner to give a clue…</p>
    </div>
  )
}

function ClueForm({ gameId }: { gameId: string }) {
  const [word, setWord] = useState('')
  const [count, setCount] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('submit_clue', {
      target_game: gameId,
      word: word.trim(),
      count,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setWord('')
    setCount(1)
  }

  return (
    <form className="clue-panel clue-form" onSubmit={onSubmit}>
      <div className="muted">Give a clue for your partner</div>
      <div className="clue-form-row">
        <input
          type="text"
          placeholder="word"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          disabled={busy}
          required
          autoFocus
        />
        <input
          type="number"
          min={0}
          max={15}
          value={count}
          onChange={(e) => setCount(Math.max(0, parseInt(e.target.value || '0', 10)))}
          disabled={busy}
          className="count-input"
        />
        <button type="submit" disabled={busy || !word.trim()}>
          {busy ? 'Sending…' : 'Submit'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

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
