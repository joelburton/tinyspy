import { useEffect, useRef } from 'react'
import type { FeedbackApi, FeedbackTone, GamePageCtx } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import type { TinySpySetup } from '../lib/setup'
import { BoardGrid } from './BoardGrid'
import { CluePanel } from './CluePanel'
import { GameLog } from './GameLog'
import styles from './PlayArea.module.css'
import '../theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * tinyspy's play surface — two-column viewport-bound composition:
 *
 *   - **Board column** (left, flex) — the 5×5 BoardGrid.
 *   - **Right column** (fixed-width):
 *       - Status: "{greenFound}/15 agents · {turn}/{turns} turns"
 *       - Action slot: CluePanel (clue/waiting/input) when active;
 *         GameOverIndicator (status + Back-to-club button) when
 *         terminal. Fixed minimum height so swapping between
 *         states doesn't shift the log below.
 *       - GameLog: scrolls internally.
 *
 * Cross-cutting chrome (logo, chat, pause, timer, the players strip)
 * lives on `<GamePage>` above this component.
 *
 * **Terminal handling.** Two pieces:
 *
 *   1. `<GameOverModal>` (shared) pops on terminal entry. State is
 *      a local boolean initialized to `isTerminal` (true if the
 *      user navigated into an already-won/lost game), bumped to
 *      true by an effect when `isTerminal` flips during play. No
 *      reopen after close — review mode takes over.
 *   2. The action slot shows the indicator below until the user
 *      navigates away. Same status label as the modal's title;
 *      same Back-to-club button as the modal's primary action,
 *      both wired to `ctx.goToClub`.
 *
 * Most of the game logic is server-side (in plpgsql RPCs); this
 * component's job is to load the row + board + clues via the three
 * hooks, derive phase (who clicks what, when) via `derivePhase`, and
 * hand each piece to the right sub-component. Realtime keeps
 * everything in sync.
 */

/** Per-status modal copy for tinyspy. `playState` is the
 *  authoritative input — only terminal states appear here; non-
 *  terminal callers don't render the modal. `verdict` is the
 *  centered modal line; `status` is the lowercase phrase the
 *  PlayArea indicator pairs with "Game over:". Detail-on-page
 *  intentionally: the agents-found counter sits in the right
 *  column status row, the board carries the revealed tiles.
 *
 *  Named to match wordknit's and psychicnum's equivalents so a
 *  reader scanning the per-game PlayAreas sees the same shape
 *  across all three. */
function buildOver(
  playState: string,
): { outcome: 'won' | 'lost'; verdict: string; status: string } {
  if (playState === 'won') {
    return { outcome: 'won', verdict: 'You win!', status: 'won' }
  }
  if (playState === 'lost_assassin') {
    return {
      outcome: 'lost',
      verdict: 'You lost: assassin revealed',
      status: 'assassin revealed',
    }
  }
  if (playState === 'lost_clock') {
    return {
      outcome: 'lost',
      verdict: 'You lost: out of turns',
      status: 'out of turns',
    }
  }
  // lost_timeout (and any future terminal state that doesn't match
  // above — falls back to a generic timer-out message rather than
  // crashing).
  return {
    outcome: 'lost',
    verdict: 'You lost: out of time',
    status: 'out of time',
  }
}

/**
 * Surface the current turn-state in the header feedback pill, firing once each
 * time it CHANGES (so a player doesn't miss "it's your turn now"). The two
 * "your move" states (give a clue / make your guesses) are sticky — they sit
 * there as a reminder until you act; the "waiting on your partner" states (and
 * sudden death) auto-dismiss after a few seconds. Self-contained so it can be
 * called unconditionally before PlayArea's loading early-return.
 */
function useTurnPill(args: {
  game: { current_clue_giver: string | null; turn_number: number } | null | undefined
  players: Player[]
  clues: ClueRow[]
  playState: string
  gameOver: boolean
  sessionUserId: string
  feedback: FeedbackApi
}) {
  const { game, players, clues, playState, gameOver, sessionUserId, feedback } = args

  let text: string | null = null
  let tone: FeedbackTone = 'neutral'
  let sticky = false
  if (game && !gameOver) {
    const me = players.find((p) => p.user_id === sessionUserId)
    const peer = players.find((p) => p.user_id !== sessionUserId)
    const peerName = peer?.username ?? 'your partner'
    const { isGuessPhase, isClueGiver, inSuddenDeath } = derivePhase({
      status: playState as GameStatus,
      currentClueGiver: game.current_clue_giver as Seat | null,
      mySeat: me?.seat,
      hasCurrentTurnClue: clues.some((c) => c.turn_number === game.turn_number),
    })
    if (inSuddenDeath) {
      text = 'Sudden death — any non-green reveal loses'
      tone = 'error'
    } else if (!isGuessPhase) {
      // Clue phase.
      if (isClueGiver) { text = `Give a clue to ${peerName}`; tone = 'info'; sticky = true }
      else text = `${peerName} is writing a clue`
    } else {
      // Guess phase.
      if (!isClueGiver) { text = 'Make your guesses'; tone = 'info'; sticky = true }
      else text = `${peerName} is guessing`
    }
  }

  // Fire only on an actual change (the ref also absorbs StrictMode's double
  // effect-invoke). Clearing when there's no state (game over / loading) tidies
  // up any lingering sticky pill.
  const prev = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (text === prev.current) return
    prev.current = text
    if (text === null) {
      feedback.clear()
      return
    }
    feedback.show({
      tone,
      text,
      dismiss: sticky ? { kind: 'sticky' } : { kind: 'timed', ms: 6000 },
    })
  }, [text, tone, sticky, feedback])
}

export function PlayArea({
  session,
  gameId,
  playState,
  isTerminal,
  setup,
  feedback,
  goToClub,
}: GamePageCtx) {
  // Per-game setup blob — opaque on GamePageCtx, cast to tinyspy's
  // shape here. Read-only at this layer; the only field we read
  // today is `turns` for the "X/Y turns" status counter.
  const tinyspySetup = setup as TinySpySetup
  const { game, players } = useGame(gameId)
  // `gameOver` mirrors common.games.is_terminal — derived early so
  // we can pass `revealPeer` into useBoard. `playState` carries the
  // gametype-specific value ('playing', 'sudden_death', 'won', ...)
  // for the phase derivation and the GameOverModal copy.
  const gameOver = isTerminal
  const { words, guesses, myKey, peerKey, loading } = useBoard(
    gameId,
    session.user.id,
    gameOver,
  )
  const { clues } = useClues(gameId)

  // Shared terminal-modal scaffold: open on mount if already-
  // terminal, re-pop when isTerminal flips during play, no re-pop
  // after dismiss. See common/hooks/useTerminalModal.ts.
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  // Announce turn-state changes in the header feedback pill — it's easy to miss
  // "the other player ended their turn, it's your turn now" otherwise. Called
  // before the early return (hook order); it no-ops while the game is loading.
  useTurnPill({
    game,
    players,
    clues,
    playState,
    gameOver: isTerminal,
    sessionUserId: session.user.id,
    feedback,
  })

  if (loading || !game || !myKey || words.length < 25) {
    return <p>Loading board…</p>
  }

  const me = players.find((p) => p.user_id === session.user.id)
  const mySeat = me?.seat
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

  // Modal / indicator copy is derived once.
  const over = gameOver ? buildOver(playState) : null

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
              : `${game.turn_number}/${tinyspySetup.turns} turns`}
          </span>
        </div>

        <div className={styles.actionSlot}>
          {gameOver && over ? (
            <div className={styles.gameOverIndicator}>
              <span>
                <span className="muted">Game over:</span> {over.status}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={goToClub}
              >
                Back to club
              </button>
            </div>
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
          <GameLog clues={clues} guesses={guesses} players={players} />
        </div>
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}
