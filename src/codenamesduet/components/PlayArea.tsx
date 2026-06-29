import { useCallback, useEffect, useRef, useState } from 'react'
import type { FeedbackApi, FeedbackTone, GamePageCtx, TimerMode } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import { db } from '../db'
import { IconEnd } from '../../common/components/icons'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { ResultFlash } from '../../common/components/ResultFlash'
import { useResultFlash } from '../../common/hooks/useResultFlash'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import type { CodenamesduetSetup } from '../lib/setup'
import { BoardGrid } from './BoardGrid'
import { CluePanel, ClueSuggestionPanel, type SuggestState } from './CluePanel'
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

/** One-line timer summary for the setup disclosure (same shape connections
 *  uses). */
function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}

/** Per-status terminal copy for codenamesduet. `playState` is the authoritative
 *  input — only terminal states appear here. `outcome` + `verdict` drive the
 *  GameOverModal (and `verdict` the below-board echo); `message` + `tone` drive
 *  the short, bold, color-coded line in the info-column action row (won = green,
 *  lost = red, manual end = neutral). Same shape as psychicnum's / connections's
 *  buildOver so a reader scanning the per-game PlayAreas sees one shape across
 *  all three. Detail-on-page intentionally: the agents-found counter sits in the
 *  info-column state line, the board carries the revealed tiles. */
function buildOver(
  playState: string,
): {
  outcome: 'won' | 'lost'
  verdict: string
  message: string
  tone: 'won' | 'lost' | 'neutral'
} {
  if (playState === 'won') {
    return { outcome: 'won', verdict: 'You win!', message: 'You won!', tone: 'won' }
  }
  if (playState === 'lost_assassin') {
    return {
      outcome: 'lost',
      verdict: 'You lost: assassin revealed',
      message: 'Assassin revealed',
      tone: 'lost',
    }
  }
  if (playState === 'lost_clock') {
    return {
      outcome: 'lost',
      verdict: 'You lost: out of turns',
      message: 'Out of turns',
      tone: 'lost',
    }
  }
  if (playState === 'ended') {
    // Manual end (codenamesduet.end_game): the friends stopped the game on
    // purpose. Neutral, not a loss — outcome:'won' gives the modal green/neutral
    // coloring (GameOverModal only supports 'won'|'lost', and 'won' is the
    // non-red one); tone:'neutral' keeps the info-column line plain. No "you
    // lost" framing.
    return { outcome: 'won', verdict: 'Game ended.', message: 'Game ended', tone: 'neutral' }
  }
  // lost_timeout (and any future terminal state that doesn't match above —
  // falls back to a generic timer-out message rather than crashing).
  return {
    outcome: 'lost',
    verdict: 'You lost: out of time',
    message: 'Out of time',
    tone: 'lost',
  }
}

/**
 * Surface the current turn-state in the header feedback pill, firing once each
 * time it CHANGES. The header describes **what the PEER is doing** — never what
 * YOU should do (your own to-do is conveyed by the below-board clue UI). So all
 * four turn states read as "{peer} is …", neutral and sticky (they describe an
 * ongoing peer state, not a transient nudge, so they persist until it changes).
 *
 * The one exception is **sudden death** — a standing danger warning, not a peer
 * action — which stays here in `error` tone (and is also shown, persistently,
 * below the board via the CluePanel notice).
 *
 * Self-contained so it can be called unconditionally before PlayArea's loading
 * early-return.
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
  // The leading player-color disc for peer-status messages ("● Moth is …"),
  // via the FeedbackPill's `dot` + outline variant — same identity treatment
  // psychicnum/connections use for their peer pills. Undefined for sudden death
  // (a warning, not a peer message).
  let dot: string | undefined
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
    } else {
      dot = colorVarFor(peer?.color)
      if (!isGuessPhase) {
        // Clue phase — what the peer is doing about the clue.
        text = isClueGiver
          ? `${peerName} is waiting for your clue`
          : `${peerName} is writing a clue`
      } else {
        // Guess phase — the guesser is the NON-clue-giver, so if I'm the
        // clue-giver the peer is guessing; otherwise the peer is waiting on me.
        text = isClueGiver
          ? `${peerName} is making guesses`
          : `${peerName} is waiting for your turn to complete`
      }
    }
  }

  // Fire only on an actual change (the ref also absorbs StrictMode's double
  // effect-invoke). Clearing when there's no state (game over / loading) tidies
  // up the pill. Every message is sticky — it's an ongoing state, not a nudge.
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
      // Peer-status pills carry the leading identity disc (outline so the disc
      // isn't fighting a fill); sudden death is a plain filled warning.
      ...(dot ? { variant: 'outline' as const, dot } : {}),
      dismiss: { kind: 'sticky' },
    })
  }, [text, tone, dot, feedback])
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

  // ─── Own-action feedback (local) + guess dispatch ──────
  // A board click is the guess move; PlayArea owns the submit_guess RPC + the
  // pending-tile state (like psychicnum/connections own their submit) so the
  // own-action <ResultFlash> lives in the below-board slot next to the clue UI —
  // the LOCAL half of the feedback split (turn-state changes go to the header
  // pill via useTurnPill). codenamesduet's guess RESULT shows on the board (the
  // tile reveal) + the turn log, so this flash is ERROR-ONLY: a rejected guess
  // or a failed End. Shared machinery; PlayArea owns where it renders.
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const { flash: actionFlash, show: flashAction, clear: clearActionFlash } =
    useResultFlash()

  // The AI clue-suggestion dialog. State lives HERE (not in the deep ClueForm)
  // so the <ClueSuggestionPanel> renders at the `.layout` level — a panel
  // rendered deep in the flex-column board lands off-screen (react-rnd positions
  // from the static flow position). ClueForm drives it via onSuggestionChange.
  const [clueSuggestion, setClueSuggestion] = useState<SuggestState | null>(null)
  console.log('[ClueHint] PlayArea render — clueSuggestion:', clueSuggestion)

  const handleGuess = useCallback(
    async (position: number) => {
      clearActionFlash()
      setPendingPos(position)
      const { error } = await db.rpc('submit_guess', {
        target_game: gameId,
        target_position: position,
      })
      setPendingPos(null)
      if (error) {
        console.error('submit_guess failed', error)
        flashAction('bad', error.message)
      }
      // Success: the reveal arrives via Realtime → useBoard refetches → the tile
      // re-renders with its result color. No optimistic update, no flash.
    },
    [gameId, flashAction, clearActionFlash],
  )

  // ─── End-game action (info-column action-row button) ───
  // The friends' explicit "we're done" affordance — an action-row button (like
  // psychicnum/connections) rather than a GamePage menu item. codenamesduet has
  // automatic terminals (won / lost_*), but this lets them abandon an in-progress
  // game early — fires codenamesduet.end_game, a neutral terminal
  // (play_state='ended', everyone {won:false}). Confirmed; it's irreversible. An
  // error is an own-action error → the same local flash as a rejected guess.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) flashAction('bad', `End game failed: ${error.message}`)
  }, [gameId, isTerminal, flashAction])

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
  const firstClueGiver = players.find(
    (p) => p.user_id === codenamesduetSetup.firstClueGiverUserId,
  )
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
    <div className={shared.layout}>
      <div className={shared.boardCol}>
        <BoardGrid
          words={words}
          myKey={myKey}
          peerKey={peerKey}
          mySeat={mySeat}
          gameOver={gameOver}
          cellsClickable={cellsClickable}
          pendingPos={pendingPos}
          onGuess={handleGuess}
        />
        {/* The below-board slot — codenamesduet's move-input zone (docs/ui.md →
            "Text entry"): a verdict echo at terminal; else an own-action error
            <ResultFlash> for a beat (a rejected guess / failed End — the local
            half of the feedback split); else the CluePanel (clue form / clue
            display + Pass / waiting copy). A reserved height keeps the
            top-anchored board from shifting as the slot swaps. */}
        <div className={styles.inputRow}>
          {over ? (
            <p className={styles.inputMessage}>{over.verdict}</p>
          ) : actionFlash ? (
            <ResultFlash
              tone={actionFlash.tone}
              label={actionFlash.label}
              className={styles.actionFlash}
            />
          ) : (
            <CluePanel
              gameId={gameId}
              isClueGiver={isClueGiver}
              isGuessPhase={isGuessPhase}
              currentClue={currentTurnClue}
              inSuddenDeath={inSuddenDeath}
              peer={peer}
              // Own-action errors → the local flash (replaces the slot for a
              // beat, never grows it). The AI clue suggestion opens its own
              // draggable panel (rendered at the .layout level below, so it's
              // on-screen) — the requester's helper output, not peer feedback.
              onError={(m) => flashAction('bad', m)}
              onSuggestionChange={setClueSuggestion}
            />
          )}
        </div>
      </div>

      <div className={shared.infoCol}>
        {/* The non-log info column — the shared named readouts (.infoSetup /
            .infoState / .infoHelp / .infoActions) from playArea.module.css, so
            they read the same across games. */}
        <div className={shared.actionSlot}>
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{codenamesduetSetup.turns} turns</li>
              <li>First clue: {firstClueGiver?.username ?? '—'}</li>
              <li>{timerLabel(codenamesduetSetup.timer)}</li>
            </ul>
          </details>

          <p className={shared.infoState}>
            <strong>{greenFound}</strong>/15 agents ·{' '}
            {inSuddenDeath ? (
              'sudden death'
            ) : (
              <>
                <strong>{game.turn_number}</strong>/{codenamesduetSetup.turns} turns
              </>
            )}
          </p>

          {/* Duet's finished-player rule, surfaced to BOTH players so neither
              reads the lopsided turn flow as a bug — kept as a prominent colored
              banner here in the info column. */}
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
              has found all their agents — you give every remaining clue now, and
              they do the guessing.
            </div>
          )}

          {/* Help — a stable orienting line during play (the per-phase guidance
              lives below the board + in the header pill). In sudden death it
              switches to the sudden-death rules; the help is muted and easily
              skimmed-past as "unchanged", so it leads with a RED "SUDDEN DEATH:"
              tag to flag that it's different now. */}
          {!over && (
            <p className={shared.infoHelp}>
              {inSuddenDeath ? (
                <>
                  <strong className={styles.suddenDeathTag}>SUDDEN DEATH:</strong>{' '}
                  no clues left — every reveal must be an agent. One non-green
                  guess (a bystander or the assassin) ends the game.
                </>
              ) : (
                'Give clues for your agents; guess the clues your partner gives you.'
              )}
            </p>
          )}

          {/* Action row. Playing: End. Terminal: the bold, outcome-colored
              result line + a compact back-to-club button (the shared swap). */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : (
            <div className={shared.infoActions}>
              <button
                type="button"
                className={cls('secondary', 'icon-button', shared.helperButton)}
                onClick={() => void handleEndGame()}
              >
                <IconEnd size={15} aria-hidden />
                End
              </button>
            </div>
          )}
        </div>

        <GameTurnLog clues={clues} guesses={guesses} players={players} />
      </div>

      {/* The AI clue-suggestion dialog. Rendered HERE — a child of `.layout`
          (a flex row), like GameOverModal — so react-rnd places it on-screen.
          (Deep inside the flex-column board column it lands below the viewport.) */}
      {clueSuggestion && (
        <ClueSuggestionPanel
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

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
