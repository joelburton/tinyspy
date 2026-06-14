import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ClubChatPanel } from '../../common/components/ClubChatPanel'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { LABEL_CLASS, type KeyLabel } from '../lib/labels'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import { GameOverBanner } from './GameOverBanner'
import { CluePanel } from './CluePanel'
import { GameLog } from './GameLog'

type Props = {
  session: Session
  gameId: string
  /** Leave the game and clear the URL hash, going back to home. */
  onLeave: () => void
  /** Enter a new game (used by GameOverBanner's "Play again"). */
  onEnterGame: (id: string) => void
}

/**
 * The in-game screen, shown for any non-lobby game status.
 *
 * Lays out the header (code, seats, agent count, tokens), the contextual
 * clue panel, the 5×5 board, and the game log. Game-over states swap the
 * clue panel for a banner with Play-again / Leave actions.
 *
 * Most of the game logic is server-side (in plpgsql RPCs); this component's
 * job is to:
 *   - render the appropriate state for the current phase,
 *   - decide which cells are clickable,
 *   - dispatch the submit_guess RPC on click and surface errors.
 *
 * Realtime keeps everything in sync — useGame, useBoard, and useClues each
 * subscribe to their own table, so when the partner gives a clue or makes a
 * guess on their machine, our view updates without a round trip.
 */
export function BoardScreen({ session, gameId, onLeave, onEnterGame }: Props) {
  const { game, players } = useGame(gameId)
  // `gameOver` is derived early so we can pass `revealPeer` into useBoard;
  // until `game` loads it's `false`, and useBoard reads `null` for peerKey.
  const gameOver = game ? game.status !== 'active' && game.status !== 'sudden_death' : false
  const { words, myKey, peerKey, loading } = useBoard(gameId, session.user.id, gameOver)
  const { clues } = useClues(gameId)
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const [guessError, setGuessError] = useState<string | null>(null)

  if (loading || !game || !myKey || words.length < 25) {
    return <div className="card">Loading board…</div>
  }

  const mySeat = players.find((p) => p.user_id === session.user.id)?.seat
  const opponent = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  // Phase derivation: a turn is in "guess phase" iff a clue already exists for
  // games.turn_number. The submit_clue RPC enforces the one-per-turn unique
  // constraint, so we can trust this at the client level.
  const currentTurnClue = clues.find((c) => c.turn_number === game.turn_number) ?? null

  // derivePhase is pure and unit-tested in src/lib/phase.test.ts — see there
  // for the full clickability / phase matrix.
  const { isGuessPhase, isClueGiver, inSuddenDeath, cellsClickable } = derivePhase({
    status: game.status as GameStatus,
    currentClueGiver: game.current_clue_giver as Seat | null,
    mySeat,
    hasCurrentTurnClue: currentTurnClue !== null,
  })

  async function handleGuess(position: number) {
    setGuessError(null)
    setPendingPos(position)
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      target_position: position,
    })
    setPendingPos(null)
    if (error) {
      console.error('submit_guess failed', error)
      setGuessError(error.message)
    }
    // Successful guess: the reveal arrives via Realtime → useBoard refetches →
    // the tile re-renders with its solid color. No optimistic update.
  }

  return (
    <div className={`board-wrap ${inSuddenDeath ? 'sudden-death' : ''}`}>
      <header className="board-header">
        <div>
          <div>
            <strong>{mySeat}</strong> · with{' '}
            <strong>{opponent?.username ?? '…'}</strong>
          </div>
          {!gameOver && !inSuddenDeath && (
            <div className="muted">
              clue-giver: <strong>{game.current_clue_giver}</strong>
            </div>
          )}
        </div>
        <div className="status">
          <div>
            <strong>{greenFound}</strong> / 15 agents
          </div>
          <div className="muted">
            {inSuddenDeath ? 'sudden death' : `${game.turns_remaining} tokens left`}
          </div>
          <button type="button" className="link-button status-leave" onClick={onLeave}>
            Leave game
          </button>
        </div>
      </header>

      {gameOver && (
        <GameOverBanner
          status={game.status}
          gameId={gameId}
          nextGameId={game.next_game_id}
          opponentName={opponent?.username}
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
          // Post-game we render two stripes per cell (A's view, B's view) so
          // you can review what each card "actually was" on both keys.
          const showPostGameReveal = gameOver && !revealed && peerLabel !== null

          const tintCls = revealed
            ? `tile-revealed ${LABEL_CLASS[w.revealed_as as KeyLabel]}`
            : showPostGameReveal
              ? 'tile-postgame'
              : `tile-hint ${LABEL_CLASS[myLabel]}`

          const clickable = cellsClickable && !revealed
          const isPending = pendingPos === w.position

          // For the post-game stripes, we want A's label on top and B's on
          // bottom regardless of who's looking. So we re-derive each from
          // whichever of my/peer happens to belong to that seat.
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
      {/* `players` from useGame already has {user_id, username, seat}
          for both seated members, which IS the full club roster
          (tinyspy clubs are exactly 2 members). Pass it as the
          ClubChatPanel `members` prop — same shape minus the seat
          field, which the chat panel just ignores. */}
      <ClubChatPanel clubId={game.club_id} members={players} />
    </div>
  )
}
