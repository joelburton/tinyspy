import { useEffect, useRef } from 'react'
import type { FeedbackApi, FeedbackTone, GamePageCtx } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import { db } from '../db'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import type { CodenamesduetSetup } from '../lib/setup'
import { BoardGrid } from './BoardGrid'
import { CluePanel } from './CluePanel'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // codenamesduet-specific color tokens (lazy-loaded with this chunk)

/**
 * codenamesduet's play surface — two-column viewport-bound composition:
 *
 *   - **Board column** (left, flex) — the 5×5 BoardGrid.
 *   - **Right column** (fixed-width):
 *       - Status: "{greenFound}/15 agents · {turn}/{turns} turns"
 *       - Action slot: CluePanel (clue/waiting/input) when active;
 *         GameOverIndicator (status + Back-to-club button) when
 *         terminal. Fixed minimum height so swapping between
 *         states doesn't shift the log below.
 *       - GameTurnLog: the shared TurnLog table, scrolls internally.
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

/** Per-status modal copy for codenamesduet. `playState` is the
 *  authoritative input — only terminal states appear here; non-
 *  terminal callers don't render the modal. `verdict` is the
 *  centered modal line; `status` is the lowercase phrase the
 *  PlayArea indicator pairs with "Game over:". Detail-on-page
 *  intentionally: the agents-found counter sits in the right
 *  column status row, the board carries the revealed tiles.
 *
 *  Named to match connections's and psychicnum's equivalents so a
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
  if (playState === 'ended') {
    // Manual end (codenamesduet.end_game): the friends stopped the game on
    // purpose. Neutral, not a loss — outcome:'won' gives the modal
    // green/neutral coloring (GameOverModal only supports 'won'|'lost',
    // and 'won' is the non-red one). No "you lost" framing.
    return { outcome: 'won', verdict: 'Game ended.', status: 'ended' }
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
  menu,
  goToClub,
}: GamePageCtx) {
  // Per-game setup blob — opaque on GamePageCtx, cast to codenamesduet's
  // shape here. Read-only at this layer; the only field we read
  // today is `turns` for the "X/Y turns" status counter.
  const codenamesduetSetup = setup as CodenamesduetSetup
  const { game, players } = useGame(gameId)
  // `gameOver` mirrors common.games.is_terminal — derived early so
  // we can pass `revealPeer` into useBoard. `playState` carries the
  // gametype-specific value ('playing', 'sudden_death', 'won', ...)
  // for the phase derivation and the GameOverModal copy.
  const gameOver = isTerminal
  const { words, guesses, myKey, peerKey, myAgentsDone, peerAgentsDone, loading } =
    useBoard(gameId, session.user.id, gameOver)
  const { clues } = useClues(gameId)

  // Shared terminal-modal scaffold: open on mount if already-
  // terminal, re-pop when isTerminal flips during play, no re-pop
  // after dismiss. See common/hooks/useTerminalModal.ts.
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  // ─── End-game action (per-game menu item) ──────────────
  // The friends' explicit "we're done" affordance. codenamesduet has
  // automatic terminals (won / lost_*), but this lets them abandon an
  // in-progress game early — fires codenamesduet.end_game, which writes a
  // neutral terminal (play_state='ended', everyone {won:false}).
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

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

  // Duet's finished-player rule, surfaced to BOTH players so neither
  // reads the lopsided turn flow as a bug (enforced server-side in
  // `_end_turn`): once a seat's agents are all contacted it gives no
  // more clues and its partner takes every remaining turn. The flags
  // come from `useBoard`. Only meaningful in normal play — not sudden
  // death (nobody clues then) nor once the game is over.
  //   - viewerFinished: I'm done → my partner now gives every clue.
  //   - peerFinished:   my partner's done → I now give every clue
  //     (so I'm always the clue-giver — without this banner, "why does
  //     the clue never come back to me to guess?" looks broken).
  const bannerEligible = !gameOver && !inSuddenDeath
  const viewerFinished = bannerEligible && myAgentsDone
  const peerFinished = bannerEligible && peerAgentsDone

  return (
    <div className={cls(shared.layout, inSuddenDeath && styles.suddenDeath)}>
      <div className={shared.boardCol}>
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

      <div className={shared.infoCol}>
        <div className={styles.status}>
          <strong>{greenFound}</strong> / 15 agents
          <span className={styles.muted}>
            {' · '}
            {inSuddenDeath
              ? 'sudden death'
              : `${game.turn_number}/${codenamesduetSetup.turns} turns`}
          </span>
        </div>

        <div className={styles.actionSlot}>
          {gameOver && over ? (
            <div className={styles.gameOverIndicator}>
              <span>
                <span className="muted">Game over:</span> {over.status}
              </span>
              <BackToClubButton onClick={goToClub} />
            </div>
          ) : (
            <>
              {viewerFinished && (
                <div className={styles.finishedNote}>
                  All your agents have been found! From here{' '}
                  {peer ? (
                    <strong style={{ color: colorVarFor(peer.color) }}>
                      {peer.username}
                    </strong>
                  ) : (
                    'your partner'
                  )}{' '}
                  gives every remaining clue — keep guessing to find theirs.
                </div>
              )}
              {peerFinished && (
                <div className={styles.peerDoneNote}>
                  {peer ? (
                    <strong style={{ color: colorVarFor(peer.color) }}>
                      {peer.username}
                    </strong>
                  ) : (
                    'Your partner'
                  )}{' '}
                  has found all their agents — you give every remaining clue
                  now, and they do the guessing.
                </div>
              )}
              <CluePanel
                gameId={gameId}
                isClueGiver={isClueGiver}
                isGuessPhase={isGuessPhase}
                currentClue={currentTurnClue}
                inSuddenDeath={inSuddenDeath}
                peer={peer}
              />
            </>
          )}
        </div>

        <div className={styles.gameLogSlot}>
          <GameTurnLog clues={clues} guesses={guesses} players={players} />
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
