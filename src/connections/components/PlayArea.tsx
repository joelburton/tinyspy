import { useCallback, useEffect, useState } from 'react'
import { Eraser, Flag, Lightbulb, Play } from 'lucide-react'
import { cls } from '../../common/lib/cls'
import type { FeedbackTone, GamePageCtx, TimerMode } from '../../common/lib/games'
import { colorByUserIdMap } from '../../common/lib/memberColor'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { ShuffleButton } from '../../common/components/ShuffleButton'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import type { ConnectionsSetup } from '../lib/setup'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { reconcileLocalOrder, shuffleTiles } from '../lib/localOrder'
import { Board } from './Board'
import { GuessHistory } from './GuessHistory'
import { HintModal } from './HintModal'
import { MistakeDots } from './MistakeDots'
import shared from '../../common/components/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)

/** Four categories to find, four mistakes allowed — the NYT Connections
 *  constants, shown in the setup disclosure + the "N/4 found" state line. */
const CATEGORY_COUNT = 4
const MISTAKE_BUDGET = 4

/** One-line timer summary for the setup disclosure. */
function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}

/**
 * connections's play surface, shared between the coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - **Selection**: coop shares via Broadcast (the Board
 *     shows per-tile peer attribution); compete keeps selections
 *     local (every tile reads as "mine" because the broadcast
 *     send is suppressed in useGame).
 *   - **Mistakes**: coop shows a single shared dot row; compete
 *     shows an OpponentStrip with everyone's per-player
 *     counts.
 *   - **Eliminated state** (compete only, non-terminal): caller's
 *     mistake_count >= 4 → render the unmatched categories
 *     revealed + a "you're out" indicator; let the game continue
 *     for the survivors (opponents' counts keep ticking via the
 *     realtime players-row subscription).
 *   - **Terminal copy**: coop says "you win/lose" (team verdict);
 *     compete distinguishes "you won the race" from "beaten to
 *     the punch" using the caller's matched-count.
 *
 * Submission flow (unchanged from baseline):
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/games/connections.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      in compete the log is RLS-filtered to caller, so dup-
 *      detection only catches the caller's own repeats. Good.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate to every player; the
 *      hook refetches automatically (players + guesses + games).
 *   5. Broadcast a `clear` (no-op in compete because broadcast is
 *      local-only there; coop drops everyone's selection).
 *
 * **Pause behavior**: PauseBoundary in GamePage unmounts this
 * component on pause and remounts on resume. The shared selection
 * state lives in `useGame` (component-local + broadcast); the
 * unmount drops it automatically.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  setup,
  feedback,
  goToClub,
}: GamePageCtx) {
  const {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentMistakes,
    isEliminated,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    loading,
  } = useGame(session, gameId)
  const [submitting, setSubmitting] = useState(false)
  const [hintsOpen, setHintsOpen] = useState(false)
  // Per-player local tile order. NULL = use upstream
  // `remainingTiles` as-is (the shuffle the create_game RPC
  // baked in, same for every player). Setting to a permutation
  // gives this client its own view; doesn't broadcast.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // Tiles currently playing the wrong-guess shake. PlayArea sets
  // this for ~500ms after `submit_guess` returns 'wrong', then
  // the cleanup effect below clears it. Board reads the set
  // and applies its shake class.
  const [shakingTiles, setShakingTiles] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  // Auto-clear the shake set ~500ms after we set it (just past
  // the animation's 400ms duration).
  useEffect(function autoClearShakeAfterAnimation() {
    if (shakingTiles.size === 0) return
    const t = setTimeout(() => setShakingTiles(new Set()), 500)
    return () => clearTimeout(t)
  }, [shakingTiles])

  // Local helper: every connections feedback today is `closeable`.
  //
  // NOTE the arg order is (tone, text) — the OPPOSITE of spellingbee's
  // showFeedback(text, tone). Don't copy a spellingbee call site verbatim.
  //
  // Defined here (above the menu-sync effect) because handleEndGame
  // below closes over it, and that closure is in turn referenced by
  // the syncMenuItems effect. Keeping the declaration order
  // feedback-helper → handleEndGame → effect avoids any
  // temporal-dead-zone / hooks-order problem.
  // Memoized (like spellingbee's showFeedback) so handleEndGame's dep
  // array stays stable across renders — an un-memoized function here
  // would make the useCallback below rebuild every render.
  const showFeedback = useCallback(
    (tone: FeedbackTone, text: string) => {
      feedback.show({ tone, text, dismiss: { kind: 'closeable' } })
    },
    [feedback],
  )

  // ─── End-game action (info-column action-row button) ───
  // Available in both modes. Manual end terminates the game with
  // everyone {won:false} and a NEUTRAL green "Game ended" modal —
  // friends agreeing to stop is a valid outcome, not a "you lose"
  // punishment. Fired by the End button in the info column (like
  // psychicnum), not a GamePage-menu item.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('End the game now? You can\'t undo this.')) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      showFeedback('error', `End game failed: ${error.message}`)
    }
  }, [gameId, isTerminal, showFeedback])

  // Hints + End now live in the info-column action row (buttons), not the
  // GamePage menu — see the .infoActions block below. Hints opens the HintModal
  // (disabled once the caller can't submit); End fires handleEndGame.

  // Shared terminal-modal scaffold: open on mount if already-
  // terminal, re-pop when isTerminal flips during play, no re-pop
  // after dismiss.
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  async function handleSubmit() {
    if (submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model).
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      showFeedback('error', 'You already tried that')
      return
    }

    const verdict = evaluateGuess(unionTiles, game.board.categories)
    setSubmitting(true)
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      tiles: unionTiles,
      result: verdict.kind,
      ...(verdict.kind === 'correct'
        ? { matched_category_rank: verdict.rank }
        : {}),
    })
    setSubmitting(false)
    if (error) {
      showFeedback('error', error.message)
      return
    }
    if (verdict.kind === 'oneAway') showFeedback('neutral', 'One away!')
    else if (verdict.kind === 'wrong') {
      showFeedback('error', 'Incorrect')
      setShakingTiles(new Set(unionTiles))
    }
    sendClear()
  }

  function handleClear() {
    sendClear()
  }

  function handleShuffle() {
    setLocalOrder(shuffleTiles(displayedTiles))
  }

  if (loading) return <p>Loading board…</p>
  if (!game) return <p>Game not found.</p>

  const matchedTiles = new Set<string>()
  for (const mc of matchedCategories) {
    for (const t of mc.tiles) matchedTiles.add(t)
  }
  const remainingTiles = game.board.tileOrder.filter(
    (t) => !matchedTiles.has(t),
  )

  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  // tile → user_id mapping. In coop this carries every peer's
  // contribution; in compete it only ever has the caller's tiles
  // (broadcast is local-only there) so every tile reads as "mine"
  // and the peer-frame logic in Board never activates.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const colorByUserId = colorByUserIdMap(players)

  // Eliminated-but-not-terminal: caller hit 4 mistakes in compete
  // but the game continues for survivors. Treat the reveal +
  // input-freeze like a personal game-over while the rest play on.
  const showReveal = isTerminal || isEliminated
  const showInput = !isTerminal && !isEliminated

  const canSubmit =
    unionTiles.length === 4
    && !submitting
    && showInput

  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = showReveal
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  // Modal copy. Compete distinguishes "you won the race" from
  // "beaten to the punch" using the caller's own matched count —
  // RLS hides peer matches, so caller-with-4-matched is the
  // server-confirmed winner; anyone else terminal-with-fewer-matches
  // got beaten. Coop verdicts are team-wide.
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfMatched: matchedCategories.length,
  }) : null

  const connSetup = setup as ConnectionsSetup
  const found = matchedCategories.length

  return (
    <div className={shared.layout}>
      <div className={shared.boardCol}>
        <HintModal
          categories={game.board.categories}
          open={hintsOpen}
          onClose={() => setHintsOpen(false)}
        />

        {/* One grid: solved categories as full-width band rows + the remaining
            tiles. Tiles only while input is live (terminal/eliminated shows the
            revealed bands alone). */}
        <Board
          matched={matchedCategories}
          unmatched={unmatched}
          tiles={showInput ? displayedTiles : []}
          ownerByTile={ownerByTile}
          selfUserId={session.user.id}
          onToggle={toggleTile}
          shakingTiles={shakingTiles}
          colorByUserId={colorByUserId}
        />

        {/* Compete: the per-player mistakes strip below the board (each
            player's dots, the caller's included). Coop's shared "Mistakes
            remaining" instead rides the commit row below — see it there. The
            textual N/4 count is also in the info column's state line. */}
        {game.mode === 'compete' && (
          <OpponentStrip
            players={players}
            selfId={session.user.id}
            metricFor={(p, isSelf) => {
              const mistakes = isSelf
                ? mistakeCount
                : (opponentMistakes.get(p.user_id) ?? 0)
              return (
                <>
                  <MistakeDots used={mistakes} />
                  {mistakes >= MISTAKE_BUDGET && (
                    <span className="muted"> out</span>
                  )}
                </>
              )
            }}
          />
        )}

        {/* Shuffle floats over the board's top-right — a fresh visual scan of
            the SAME tiles (not a turn action), like psychicnum. Only while the
            grid is shown: at terminal the bands replace the tiles, so there's
            nothing to reshuffle. */}
        {showInput && (
          <ShuffleButton
            onShuffle={handleShuffle}
            disabled={displayedTiles.length === 0}
            label="Shuffle tiles"
            className={shared.floatingShuffle}
          />
        )}

        {/* The commit row below the board: clicking tiles is the input, these
            commit the current 4-tile selection. Sits below the top-anchored
            board, like psychicnum's entry row. */}
        {showInput && (
          <div className={styles.commit}>
            {/* Coop: "Mistakes remaining ●●●○" left-justified on this row
                (margin-right:auto pushes the buttons to the right). */}
            {game.mode === 'coop' && (
              <div className={styles.mistakesInline}>
                Mistakes remaining <MistakeDots used={mistakeCount} />
              </div>
            )}
            <button
              type="button"
              className={cls('secondary', styles.commitButton)}
              onClick={handleClear}
              disabled={unionTiles.length === 0}
            >
              <Eraser size={15} aria-hidden />
              Clear
            </button>
            <button
              type="button"
              className={styles.commitButton}
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              <Play size={15} aria-hidden />
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}
      </div>

      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {/* Setup — the choices made at game creation, behind a disclosure
              (closed by default so it doesn't claim space). */}
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{game.board.tileOrder.length} words</li>
              <li>{CATEGORY_COUNT} categories to find</li>
              <li>{MISTAKE_BUDGET} mistakes allowed</li>
              <li>{timerLabel(connSetup.timer)}</li>
            </ul>
          </details>

          {/* Live state: categories found + mistakes made (the dots live below
              the board; this is the at-a-glance textual count). */}
          <p className={shared.infoState}>
            <strong>{found}/{CATEGORY_COUNT}</strong> categories found ·{' '}
            <strong>{mistakeCount}/{MISTAKE_BUDGET}</strong> mistakes
          </p>

          {/* Help — playing only. The eliminated spectator gets their status
              here (input is frozen; the rest race on). */}
          {!over && (
            <p className={shared.infoHelp}>
              {isEliminated
                ? "You're out — the rest are still racing."
                : 'Pick 4 tiles that share a connection, then Submit.'}
            </p>
          )}

          {/* Action row. Playing / eliminated: Hints + End buttons. Terminal:
              the bold outcome line + a compact back-to-club button. */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : (
            <div className={shared.infoActions}>
              {/* Hints opens the per-player HintModal; disabled once the caller
                  can't submit (eliminated). */}
              <button
                type="button"
                className={cls('secondary', shared.helperButton)}
                onClick={() => setHintsOpen(true)}
                disabled={isEliminated}
              >
                <Lightbulb size={15} aria-hidden />
                Hints
              </button>
              <button
                type="button"
                className={cls('secondary', shared.helperButton)}
                onClick={() => void handleEndGame()}
              >
                <Flag size={15} aria-hidden />
                End
              </button>
            </div>
          )}
        </div>

        {/* Guess log: coop shows every player's guesses; in compete RLS already
            filters to the caller's own, so the FE does nothing special. */}
        <GuessHistory
          guesses={guesses}
          matchedCategories={matchedCategories}
          players={players}
        />
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

/**
 * Per-status terminal copy. `outcome` + `verdict` drive the GameOverModal;
 * `message` + `tone` drive the short, bold, color-coded line in the info-column
 * action row (won = green, lost = red, manual end = neutral). Same shape as
 * psychicnum's buildOver. Coop verdicts are team-wide; compete distinguishes
 * the racer who hit 4 matches (the winner) from everyone else (beaten to the
 * punch). Detail-on-page intentionally: the matched/unmatched categories show
 * on the bands and mistake counts on the strip; the modal + line stay
 * focused on the verdict.
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfMatched,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfMatched: number
}): {
  outcome: 'won' | 'lost'
  verdict: string
  message: string
  tone: 'won' | 'lost' | 'neutral'
} {
  // Manual end (connections.end_game) — NEUTRAL terminal in BOTH modes.
  // play_state='ended' means the friends chose to stop: nobody won,
  // nobody lost. We render the green "won"-style modal (outcome:'won')
  // with neutral copy, NOT the red loss modal. This branch must come
  // first because 'ended' is mode-independent.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      message: 'Game over',
      tone: 'neutral',
    }
  }
  if (mode === 'coop') {
    if (playState === 'solved') {
      return { outcome: 'won', verdict: 'You win!', message: 'You won!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired
        ? 'You lost: out of time'
        : 'You lost: out of mistakes',
      message: timerExpired ? 'Out of time' : 'Out of mistakes',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'solved_compete') {
    return selfMatched >= CATEGORY_COUNT
      ? { outcome: 'won', verdict: 'You won the race!', message: 'You won!', tone: 'won' }
      : { outcome: 'lost', verdict: 'Beaten to the punch.', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete (everyone eliminated OR timeout)
  return {
    outcome: 'lost',
    verdict: timerExpired
      ? 'Out of time — nobody won.'
      : 'Everyone eliminated — nobody won.',
    message: timerExpired ? 'Out of time' : 'All eliminated',
    tone: 'lost',
  }
}
