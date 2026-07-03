import { useCallback, useEffect, useRef, useState } from 'react'
import type { GenericFeedbackApi, GenericFeedbackMsg, GenericFeedbackTone, GamePageCtx } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/timerLabel'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import { db } from '../db'
import { TerminalModal } from '../../common/components/TerminalModal'
import { TerminalActionRow } from '../../common/components/TerminalActionRow'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/useDismissLocalFeedbackOnKey'
import { endedCopy, type TerminalCopy } from '../../common/lib/terminalCopy'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import type { CodenamesduetSetup } from '../lib/setup'
import { BoardGrid } from './BoardGrid'
import { CluePanel, ClueSuggestionModal, type SuggestState } from './CluePanel'
import { GameTurnLog } from './GameTurnLog'
import { SetupDisclosure } from '../../common/components/SetupDisclosure'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // codenamesduet-specific color tokens (lazy-loaded with this chunk)

/**
 * codenamesduet's play surface — two-column viewport-bound composition:
 *
 *   - **Board column** (left, flex) — the 5×5 BoardGrid, with the fixed-height
 *     `belowBoard` slot under it (the CluePanel during play, a local
 *     `<GenericFeedbackPill>` for an own-action error or the terminal verdict).
 *   - **Info column** (fixed-width):
 *       - Status: "{greenFound}/15 agents · {turn}/{turns} turns"
 *       - Action row: the EndGameButton while playing; at terminal the bold
 *         outcome line + a compact Back-to-club button. Fixed minimum height so
 *         swapping between them doesn't shift the log below.
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

/** Local feedback pills here are never closeable, so the × is never rendered and
 *  this is never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/** Build codenamesduet's own-action local pill: outline + TIMED (auto-clears
 *  after a beat — the only own-move feedback is a rejected guess / failed End /
 *  clue-panel error). A pure msg-builder over the shared `useLocalFeedback`. */
const ownAction = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'timed' },
})

/** Per-status terminal copy for codenamesduet. `playState` is the authoritative
 *  input — only terminal states appear here. Returns the shared `TerminalCopy`
 *  shape (the same psychicnum/connections use): `outcome` + `verdict` drive the
 *  GameOverModal and the permanent below-board pill; `message` + `tone` drive the
 *  short, bold, color-coded line in the info-column action row (won = green,
 *  lost = red, manual end = neutral). Detail-on-page intentionally: the
 *  agents-found counter sits in the info-column state line, the board carries the
 *  revealed tiles. */
function buildOver(playState: string): TerminalCopy {
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
  // Manual end (codenamesduet.end_game): the friends stopped the game on purpose
  // — the uniform neutral terminal shared with the other games, owned by the
  // shared endedCopy(). codenamesduet is coop-only.
  if (playState === 'ended') return endedCopy('coop')
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
  feedback: GenericFeedbackApi
}) {
  const { game, players, clues, playState, gameOver, sessionUserId, feedback } = args

  let text: string | null = null
  let tone: GenericFeedbackTone = 'neutral'
  // The leading player-color disc for peer-status messages ("● Moth is …"),
  // via the GenericFeedbackPill's `dot` + outline variant — same identity treatment
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
  globalFeedback,
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

  // ─── Own-action feedback (local) + guess dispatch ──────
  // A board click is the guess move; PlayArea owns the submit_guess RPC + the
  // pending-tile state (like psychicnum/connections own their submit) so the
  // own-action local <GenericFeedbackPill> lives in the below-board slot next to the
  // clue UI — the LOCAL half of the feedback split (turn-state changes go to the
  // pill via useTurnPill). codenamesduet's guess RESULT shows on the board (the
  // tile reveal) + the turn log, so this flash is ERROR-ONLY: a rejected guess
  // or a failed End. Shared machinery; PlayArea owns where it renders.
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const { localFeedback, showLocalFeedback, clearLocalFeedback } =
    useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill. Guarded by
  // useGlobalKeyHandler, so typing in the clue field (a focused input) never
  // triggers it — only a key with nothing focused does. No-op at terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // The AI clue-suggestion dialog. State lives HERE (not in the deep ClueForm)
  // so the <ClueSuggestionModal> renders at the `.layout` level — a panel
  // rendered deep in the flex-column board lands off-screen (react-rnd positions
  // from the static flow position). ClueForm drives it via onSuggestionChange.
  const [clueSuggestion, setClueSuggestion] = useState<SuggestState | null>(null)
  console.log('[ClueHint] PlayArea render — clueSuggestion:', clueSuggestion)

  // In-flight guard against a double-guess. A synchronous ref, not the `pendingPos`
  // state, because it must block BEFORE any re-render: the tile's `disabled` gate
  // only follows setPendingPos → re-render, so it misses a same-tick double-tap on
  // the tile AND a click on a DIFFERENT tile while the first guess is still
  // committing (you shouldn't guess again until the reveal resolves).
  const guessInFlight = useRef(false)
  const handleGuess = useCallback(
    async (position: number) => {
      if (guessInFlight.current) return
      guessInFlight.current = true
      clearLocalFeedback()
      setPendingPos(position)
      const { error } = await db.rpc('submit_guess', {
        target_game: gameId,
        target_position: position,
      })
      setPendingPos(null)
      guessInFlight.current = false
      if (error) {
        console.error('submit_guess failed', error)
        showLocalFeedback(ownAction('error', error.message))
      }
      // Success: the reveal arrives via Realtime → useBoard refetches → the tile
      // re-renders with its result color. No optimistic update, no flash.
    },
    [gameId, showLocalFeedback, clearLocalFeedback],
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
    if (error) showLocalFeedback(ownAction('error', `End game failed: ${error.message}`))
  }, [gameId, isTerminal, showLocalFeedback])

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
    feedback: globalFeedback,
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
    <div className={cls(shared.layout, styles.layout)}>
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
        {/* The below-board slot — codenamesduet's move-input zone
            (docs/design-decisions.md → BoardCol → belowBoard). Three states, all
            in the same fixed-height slot so the top-anchored board never shifts as
            it swaps:
              - terminal → a PERMANENT (fill, outcome-colored) <GenericFeedbackPill>
                carrying the verdict — the terminal state always also lands as
                local feedback, alongside the info-column outcome line
                (docs/design-decisions.md → Feedback);
              - own-action error → a transient (outline, error) <GenericFeedbackPill> for
                a beat (a rejected guess / failed End — the LOCAL half of the
                feedback split; turn-state changes go to the header pill);
              - else → the CluePanel (clue form / clue display + Pass / waiting). */}
        <div className={styles.belowBoard}>
          <div className={shared.moveAreaOrLocalFeedback}>
          {over ? (
            <div className={shared.localFeedback}>
              <GenericFeedbackPill
                msg={{
                  tone:
                    over.tone === 'won'
                      ? 'success'
                      : over.tone === 'lost'
                        ? 'error'
                        : 'neutral',
                  text: over.verdict,
                  variant: 'fill', // permanent → lightened-tone fill
                  dismiss: { kind: 'sticky' }, // never auto- or user-dismissed
                }}
                onClose={noop}
              />
            </div>
          ) : localFeedback ? (
            <div className={shared.localFeedback}>
              {/* Own-action flash is error-only here (a rejected guess / failed
                  End); the success path shows on the board + turn log instead. */}
              <GenericFeedbackPill msg={localFeedback} onClose={noop} />
            </div>
          ) : (
            <div className={styles.moveArea}>
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
              onError={(m) => showLocalFeedback(ownAction('error', m))}
              onSuggestionChange={setClueSuggestion}
            />
            </div>
          )}
          </div>
        </div>
      </div>

      <div className={shared.infoCol}>
        {/* The non-log info column — the shared named readouts (.infoSetup /
            .infoState / .infoHelp / .infoActions) from PlayArea.module.css, so
            they read the same across games. */}
        {/* Info-column readouts in the shared canonical order
            (docs/design-decisions.md → Info column): STATE → [opponent strip —
            n/a, peer status rides the header pill] → ACTIONS → HELP → SETUP
            disclosure, then the turn log below. codenamesduet's finished-player
            banners are a loud live-state announcement, so they sit right under
            the state line. */}
        <div className={shared.actionSlot}>
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
              reads the lopsided turn flow as a bug — a prominent colored banner
              right under the live state it explains. */}
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

          {/* Action row. Playing: End. Terminal: the bold, outcome-colored
              result line + a compact back-to-club button (the shared swap). */}
          {over ? (
            <TerminalActionRow over={over} onBackToClub={goToClub} />
          ) : (
            <div className={shared.infoActions}>
              {/* Manual "we're done" stop — the shared EndGameButton (flag +
                  error/red tone, the canonical "End" label). codenamesduet is coop,
                  so End (a mutual stop), not Concede. It reads distinctly from this
                  game's "Pass & end turn" below the board (a different component +
                  glyph), so it keeps the same plain "End" as every other v3 game. */}
              <EndGameButton
                onClick={() => void handleEndGame()}
                className={shared.helperButton}
              />
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

          {/* Setup — a disclosure, LAST before the turn log (closed by default so
              it doesn't claim space; opening it grows the slot, the one allowed
              exception since it's closable). */}
          <SetupDisclosure>
              <li>{codenamesduetSetup.turns} turns</li>
              <li>First clue: {firstClueGiver?.username ?? '—'}</li>
              <li>{timerLabel(codenamesduetSetup.timer)}</li>
            </SetupDisclosure>
        </div>

        <GameTurnLog
          clues={clues}
          guesses={guesses}
          players={players}
          currentTurn={game.turn_number}
          gameOver={gameOver}
        />
      </div>

      {/* The AI clue-suggestion dialog. Rendered HERE — a child of `.layout`
          (a flex row), like GameOverModal — so react-rnd places it on-screen.
          (Deep inside the flex-column board column it lands below the viewport.) */}
      {clueSuggestion && (
        <ClueSuggestionModal
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}
