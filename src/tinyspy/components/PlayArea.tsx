import type { GamePageCtx } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import { BoardGrid } from './BoardGrid'
import { CluePanel } from './CluePanel'
import { GameLog } from './GameLog'
import { GameOverBanner } from './GameOverBanner'
import styles from './PlayArea.module.css'
import '../theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * Tinyspy's play surface — two-column viewport-bound composition:
 *
 *   - **Board column** (left, flex) — the 5×5 BoardGrid.
 *   - **Right column** (fixed-width):
 *       - Status: "{greenFound}/15 agents · {turnsRemaining} tokens left"
 *       - Action slot: CluePanel (clue/waiting/input) or GameOverBanner.
 *         Fixed minimum height so swapping between states doesn't shift
 *         the log below.
 *       - GameLog: scrolls internally.
 *
 * Cross-cutting chrome (logo, chat, pause, timer, the players strip)
 * lives on `<GamePage>` above this component. The previous in-PlayArea
 * GameHeader is gone — the GamePage header already tells you who's
 * playing (via the PlayersStrip), and the visible state of the action
 * slot (input form / "waiting for…" / displayed clue) already makes
 * the current clue-giver obvious. No need to repeat either at the
 * PlayArea level.
 *
 * Most of the game logic is server-side (in plpgsql RPCs); this
 * component's job is to load the row + board + clues via the three
 * hooks, derive phase (who clicks what, when) via `derivePhase`, and
 * hand each piece to the right sub-component. Realtime keeps
 * everything in sync.
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
  const peer = players.find((p) => p.user_id !== session.user.id)
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
    <div className={cls(styles.layout, inSuddenDeath && styles.suddenDeath)}>
      <div className={styles.boardCol}>
        <BoardGrid
          gameId={gameId}
          words={words}
          myKey={myKey}
          peerKey={peerKey}
          mySeat={mySeat}
          gameOver={gameOver}
          cellsClickable={cellsClickable}
        />
      </div>

      <div className={styles.rightCol}>
        <div className={styles.status}>
          <strong>{greenFound}</strong> / 15 agents
          <span className={styles.muted}>
            {' · '}
            {inSuddenDeath
              ? 'sudden death'
              : `${game.turns_remaining} tokens left`}
          </span>
        </div>

        <div className={styles.actionSlot}>
          {gameOver ? (
            <GameOverBanner status={playState} />
          ) : (
            <CluePanel
              gameId={gameId}
              isClueGiver={isClueGiver}
              isGuessPhase={isGuessPhase}
              currentClue={currentTurnClue}
              inSuddenDeath={inSuddenDeath}
              peer={peer}
            />
          )}
        </div>

        <div className={styles.gameLogSlot}>
          <GameLog clues={clues} words={words} players={players} />
        </div>
      </div>
    </div>
  )
}
