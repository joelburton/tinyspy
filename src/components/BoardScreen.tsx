import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useGame } from '../hooks/useGame'
import { useBoard, type KeyLabel } from '../hooks/useBoard'
import { useClues, type ClueRow } from '../hooks/useClues'
import type { Database } from '../types/db'

type WordRow = Database['public']['Tables']['words']['Row']

type Props = {
  session: Session
  gameId: string
  onLeave: () => void
  onEnterGame: (id: string, joinCode: string) => void
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

export function BoardScreen({ session, gameId, onLeave, onEnterGame }: Props) {
  const { game, players } = useGame(gameId)
  const gameOver = game ? game.status !== 'active' && game.status !== 'sudden_death' : false
  const { words, myKey, peerKey, loading } = useBoard(gameId, session.user.id, gameOver)
  const { clues } = useClues(gameId)
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const [guessError, setGuessError] = useState<string | null>(null)

  if (loading || !game || !myKey || words.length < 25) {
    return <div className="card">Loading board…</div>
  }

  const mySeat = players.find((p) => p.user_id === session.user.id)?.seat as 'A' | 'B' | undefined
  const opponent = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  const currentTurnClue = clues.find((c) => c.turn_number === game.turn_number) ?? null
  const isGuessPhase = currentTurnClue !== null
  const isClueGiver = mySeat === game.current_clue_giver
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
    <div className={`board-wrap ${inSuddenDeath ? 'sudden-death' : ''}`}>
      <header className="board-header">
        <div>
          <div className="muted">Game {game.join_code}</div>
          <div>
            <strong>{mySeat}</strong> · with{' '}
            <strong>{opponent?.display_name ?? '…'}</strong>
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
        <GameOverBanner
          status={game.status}
          gameId={gameId}
          nextGameId={game.next_game_id}
          opponentName={opponent?.display_name}
          onLeave={onLeave}
          onEnterGame={onEnterGame}
        />
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
          const peerLabel = peerKey?.[w.position] ?? null
          const revealed = w.revealed_as !== null
          const showPostGameReveal = gameOver && !revealed && peerLabel !== null
          const tintCls = revealed
            ? `tile-revealed ${LABEL_CLASS[w.revealed_as as KeyLabel]}`
            : showPostGameReveal
              ? 'tile-postgame'
              : `tile-hint ${LABEL_CLASS[myLabel]}`
          const clickable = cellsClickable && !revealed
          const isPending = pendingPos === w.position

          const aLabel: KeyLabel = mySeat === 'A' ? myLabel : (peerLabel ?? myLabel)
          const bLabel: KeyLabel = mySeat === 'B' ? myLabel : (peerLabel ?? myLabel)

          return (
            <button
              key={w.position}
              type="button"
              className={`tile ${tintCls} ${clickable ? 'tile-clickable' : ''} ${isPending ? 'tile-pending' : ''}`}
              disabled={!clickable || isPending}
              onClick={() => clickable && handleGuess(w.position)}
            >
              {showPostGameReveal && (
                <span className={`tile-stripe stripe-a ${LABEL_CLASS[aLabel]}`}>A</span>
              )}
              <span className="tile-word">{w.word}</span>
              {showPostGameReveal && (
                <span className={`tile-stripe stripe-b ${LABEL_CLASS[bLabel]}`}>B</span>
              )}
              {isPending && <span className="tile-key">…</span>}
            </button>
          )
        })}
      </div>

      <GameLog clues={clues} words={words} />

      <p className="muted board-help">
        <button type="button" className="link-button" onClick={onLeave}>
          Leave game
        </button>
      </p>
    </div>
  )
}

function GameOverBanner({
  status,
  gameId,
  nextGameId,
  opponentName,
  onLeave,
  onEnterGame,
}: {
  status: string
  gameId: string
  nextGameId: string | null
  opponentName?: string
  onLeave: () => void
  onEnterGame: (id: string, joinCode: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const banner = STATUS_BANNER[status]
  if (!banner) return null

  async function playAgain() {
    setError(null)
    setBusy(true)
    const { data, error } = await supabase
      .rpc('play_again', { prev_game: gameId })
      .single()
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to start a new game')
      return
    }
    onEnterGame(data.id, data.join_code)
  }

  const playAgainLabel = nextGameId
    ? `Join ${opponentName ?? 'partner'}'s new game`
    : opponentName
      ? `Play again with ${opponentName}`
      : 'Play again'

  return (
    <div className={`game-over ${banner.tone}`}>
      <strong>{banner.text}</strong>
      <div className="game-over-actions">
        <button type="button" onClick={playAgain} disabled={busy}>
          {busy ? '…' : playAgainLabel}
        </button>
        <button type="button" className="secondary" onClick={onLeave}>
          Back to home
        </button>
      </div>
      {error && <p className="error">{error}</p>}
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

// Game log: turn-by-turn, clue then guesses (ordered by reveal time).
function GameLog({ clues, words }: { clues: ClueRow[]; words: WordRow[] }) {
  if (clues.length === 0) return null

  const guesses = words
    .filter((w) => w.revealed_at !== null)
    .sort((a, b) =>
      (a.revealed_in_turn ?? 0) - (b.revealed_in_turn ?? 0)
      || (a.revealed_at ?? '').localeCompare(b.revealed_at ?? ''),
    )

  // Group by turn_number; turns may have no clue (sudden death).
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...guesses.map((g) => g.revealed_in_turn ?? 0),
    ]),
  ).sort((a, b) => a - b)

  return (
    <section className="game-log">
      <h3>Game log</h3>
      <ol>
        {turnNumbers.map((t) => {
          const clue = clues.find((c) => c.turn_number === t)
          const turnGuesses = guesses.filter((g) => g.revealed_in_turn === t)
          return (
            <li key={t}>
              <span className="muted">turn {t}</span>
              {clue && (
                <span>
                  {' '}· <strong>{clue.by_seat}</strong>: {clue.word.toUpperCase()} · {clue.count}
                </span>
              )}
              {turnGuesses.map((g) => (
                <div key={g.position} className="log-guess">
                  <strong>{g.revealed_by}</strong> → {g.word}{' '}
                  <span className={`log-label log-label-${g.revealed_as}`}>
                    {labelName(g.revealed_as)}
                  </span>
                </div>
              ))}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function labelName(l: string | null): string {
  if (l === 'G') return 'green'
  if (l === 'N') return 'neutral'
  if (l === 'A') return 'assassin'
  return '?'
}
