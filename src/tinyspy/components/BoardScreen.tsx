import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ClubChatPanel } from '../../common/components/ClubChatPanel'
import { cls } from '../../common/lib/cls'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { type KeyLabel } from '../lib/labels'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import { GameOverBanner } from './GameOverBanner'
import { CluePanel } from './CluePanel'
import { GameLog } from './GameLog'
import { HowToPlayModal } from './HowToPlayModal'
import styles from './BoardScreen.module.css'

/**
 * Per-label module-class lookup. Local to BoardScreen since it's
 * the only consumer; the actual style rules live in
 * BoardScreen.module.css under `.tileAgent`, `.tileNeutral`,
 * `.tileAssassin`. Indirection lets the rest of the file say
 * `styles[TILE_BG[label]]` and have everything stay scoped.
 *
 * The data-side KeyLabel ('G'|'N'|'A') keeps its single-letter
 * shape — those letters are persisted in tinyspy.words.revealed_as
 * and tinyspy.game_players.key_card. The mapping below is the one
 * place that translates from the data alphabet to the
 * presentation-layer's semantic class names.
 */
const TILE_BG: Record<KeyLabel, 'tileAgent' | 'tileNeutral' | 'tileAssassin'> = {
  G: 'tileAgent',
  N: 'tileNeutral',
  A: 'tileAssassin',
}

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
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)

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
    <div className={cls(styles.boardWrap, inSuddenDeath && styles.suddenDeath)}>
      <header className={styles.boardHeader}>
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
        <div className={styles.status}>
          <div>
            <strong>{greenFound}</strong> / 15 agents
          </div>
          <div className="muted">
            {inSuddenDeath ? 'sudden death' : `${game.turns_remaining} tokens left`}
          </div>
          <div className={styles.statusLinks}>
            <button
              type="button"
              className={cls('link-button', styles.statusLeave)}
              onClick={() => setHowToPlayOpen(true)}
            >
              How to play
            </button>
            <button
              type="button"
              className={cls('link-button', styles.statusLeave)}
              onClick={onLeave}
            >
              Leave game
            </button>
          </div>
        </div>
      </header>

      {gameOver && (
        <div className={styles.gameOverSlot}>
          <GameOverBanner
            status={game.status}
            gameId={gameId}
            nextGameId={game.next_game_id}
            opponentName={opponent?.username}
            onLeave={onLeave}
            onEnterGame={onEnterGame}
          />
        </div>
      )}

      {!gameOver && (
        <div className={styles.cluePanelSlot}>
          <CluePanel
            gameId={gameId}
            isClueGiver={isClueGiver}
            isGuessPhase={isGuessPhase}
            currentClue={currentTurnClue}
            inSuddenDeath={inSuddenDeath}
          />
        </div>
      )}

      {guessError && (
        <div className={styles.errorBanner}>
          {guessError}{' '}
          <button type="button" className="link-button" onClick={() => setGuessError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className={styles.boardGrid}>
        {words.map((w) => {
          const myLabel = myKey[w.position]
          const peerLabel = peerKey?.[w.position] ?? null
          const revealed = w.revealed_as !== null
          // Post-game we render two stripes per cell (A's view, B's view) so
          // you can review what each card "actually was" on both keys.
          const showPostGameReveal = gameOver && !revealed && peerLabel !== null

          const tintCls = revealed
            ? cls(styles.tileRevealed, styles[TILE_BG[w.revealed_as as KeyLabel]])
            : showPostGameReveal
              ? styles.tilePostgame
              : cls(styles.tileHint, styles[TILE_BG[myLabel]])

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
              className={cls(
                styles.tile,
                tintCls,
                clickable && styles.tileClickable,
                isPending && styles.tilePending,
              )}
              disabled={!clickable || isPending}
              onClick={() => clickable && handleGuess(w.position)}
            >
              {showPostGameReveal && (
                <span className={cls(styles.tileStripe, styles[TILE_BG[aLabel]])}>A</span>
              )}
              <span className={styles.tileWord}>{w.word}</span>
              {showPostGameReveal && (
                <span className={cls(styles.tileStripe, styles[TILE_BG[bLabel]])}>B</span>
              )}
              {isPending && <span className={styles.tileKey}>…</span>}
            </button>
          )
        })}
      </div>

      <div className={styles.gameLogSlot}>
        <GameLog clues={clues} words={words} />
      </div>
      {/* `players` from useGame already has {user_id, username, seat}
          for both seated members, which IS the full club roster
          (tinyspy clubs are exactly 2 members). Pass it as the
          ClubChatPanel `members` prop — same shape minus the seat
          field, which the chat panel just ignores. */}
      <div className={styles.chatPanelSlot}>
        <ClubChatPanel clubId={game.club_id} members={players} />
      </div>

      <HowToPlayModal
        open={howToPlayOpen}
        onClose={() => setHowToPlayOpen(false)}
      />
    </div>
  )
}
