import type { GamePageCtx } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import { BoardGrid } from './BoardGrid'
import { CluePanel } from './CluePanel'
import { GameHeader } from './GameHeader'
import { GameLog } from './GameLog'
import { GameOverBanner } from './GameOverBanner'
import styles from './PlayArea.module.css'
import '../theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * Tinyspy's play surface — composes the in-game pieces. The
 * cross-cutting chrome (title, timer, Pause, Back-to-club, chat)
 * lives on `<GamePage>` above this component in the route tree;
 * here we just stitch together the gametype-specific pieces.
 *
 * Most of the game logic is server-side (in plpgsql RPCs); this
 * component's job is to:
 *   - load the row + board + clues via the three hooks
 *   - derive phase (who clicks what, when) via `derivePhase`
 *   - hand each piece to the right sub-component
 *
 * Realtime keeps everything in sync — useGame, useBoard, and
 * useClues each subscribe to their own table, so when the
 * partner gives a clue or makes a guess on their machine, our
 * view updates without a round trip.
 */
export function PlayArea({
  session,
  gameId,
  playState,
  isTerminal,
}: GamePageCtx) {
  const { game, players } = useGame(gameId)
  // `gameOver` mirrors common.games.is_terminal — derived early so
  // we can pass `revealPeer` into useBoard. `playState` carries the
  // gametype-specific value ('playing', 'sudden_death', 'won', ...)
  // for the phase derivation and the GameOverBanner copy.
  const gameOver = isTerminal
  const { words, myKey, peerKey, loading } = useBoard(
    gameId,
    session.user.id,
    gameOver,
  )
  const { clues } = useClues(gameId)

  if (loading || !game || !myKey || words.length < 25) {
    return <p>Loading board…</p>
  }

  const mySeat = players.find((p) => p.user_id === session.user.id)?.seat
  const opponent = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  // Phase derivation: a turn is in "guess phase" iff a clue already
  // exists for games.turn_number. The submit_clue RPC enforces the
  // one-per-turn unique constraint, so we can trust this at the
  // client level.
  const currentTurnClue =
    clues.find((c) => c.turn_number === game.turn_number) ?? null

  // derivePhase is pure and unit-tested in src/lib/phase.test.ts —
  // see there for the full clickability / phase matrix.
  const { isGuessPhase, isClueGiver, inSuddenDeath, cellsClickable } =
    derivePhase({
      status: playState as GameStatus,
      currentClueGiver: game.current_clue_giver as Seat | null,
      mySeat,
      hasCurrentTurnClue: currentTurnClue !== null,
    })

  return (
    <div className={cls(styles.boardWrap, inSuddenDeath && styles.suddenDeath)}>
      <GameHeader
        mySeat={mySeat}
        opponent={opponent}
        currentClueGiver={game.current_clue_giver}
        greenFound={greenFound}
        turnsRemaining={game.turns_remaining}
        inSuddenDeath={inSuddenDeath}
        gameOver={gameOver}
      />

      {gameOver && (
        <div className={styles.gameOverSlot}>
          <GameOverBanner status={playState} />
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

      <BoardGrid
        gameId={gameId}
        words={words}
        myKey={myKey}
        peerKey={peerKey}
        mySeat={mySeat}
        gameOver={gameOver}
        cellsClickable={cellsClickable}
      />

      <div className={styles.gameLogSlot}>
        <GameLog clues={clues} words={words} players={players} />
      </div>
    </div>
  )
}
