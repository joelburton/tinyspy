import { useCallback, useEffect, useState } from 'react'
import { cls } from '../../common/lib/cls'
import type { GamePageCtx, GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/timerLabel'
import { colorByUserIdMap, colorVarFor } from '../../common/lib/memberColor'
import { TerminalModal } from '../../common/components/TerminalModal'
import { TerminalActionRow } from '../../common/components/TerminalActionRow'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { SubmitButton } from '../../common/components/buttons/SubmitButton'
import { ClearButton } from '../../common/components/buttons/ClearButton'
import { HintButton } from '../../common/components/buttons/HintButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/useDismissLocalFeedbackOnKey'
import { useGlobalFeedback } from '../../common/hooks/useGlobalFeedback'
import { memberById } from '../../common/lib/peers'
import { endedCopy, type TerminalCopy } from '../../common/lib/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import type { ConnectionsSetup } from '../lib/setup'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { reconcileLocalOrder, shuffleTiles } from '../lib/localOrder'
import { Board } from './Board'
import { GameTurnLog } from './GameTurnLog'
import { HintModal } from './HintModal'
import { StrikeMarks } from '../../common/components/StrikeMarks'
import { SetupDisclosure } from '../../common/components/SetupDisclosure'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)

/** Four categories to find, four mistakes allowed — the NYT Connections
 *  constants, shown in the setup disclosure + the "N/4 found" state line. */
const CATEGORY_COUNT = 4
const MISTAKE_BUDGET = 4

/** Local feedback pills are never closeable, so the × never renders and this is
 *  never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/** Build connections' own-guess local pill: outline + STICKY (a tile click
 *  dismisses it). A pure msg-builder over the shared `useLocalFeedback`. */
const ownGuess = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'sticky' },
})

/** Format a puzzle's NYT date (`YYYY-MM-DD`) for the setup disclosure. Parsed as
 *  UTC so a calendar date never shifts by a local-tz offset (matches Calendar). */
function formatPuzzleDate(d: string | null): string {
  if (!d) return 'custom puzzle'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
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
 *   - **Feedback split** (docs/deferred.md → Feedback channels;
 *     mirrors psychicnum): my OWN guess result flashes green/red
 *     in the commit slot below the board (local — near my eyes,
 *     about what I just did); a teammate's guess is narrated in
 *     the GamePage header pill (group). Compete reaches neither
 *     header branch — the guesses log is RLS-scoped to the caller,
 *     so there are no peer events to announce.
 *
 * Submission flow:
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/games/connections.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      in compete the log is RLS-filtered to caller, so dup-
 *      detection only catches the caller's own repeats. Good.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate to every player; the
 *      hook refetches automatically (players + guesses + games).
 *   5. On a CORRECT guess only, broadcast a `clear` (no-op in
 *      compete because broadcast is local-only there; coop drops
 *      everyone's selection). A wrong / one-away guess keeps the
 *      selection so the player can tweak it and resubmit.
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
  globalFeedback,
  goToClub,
}: GamePageCtx) {
  const {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentFound,
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

  // ─── Commit-slot flash (own-action feedback, local) ─────
  // A transient message shown *in place of the commit buttons* for the
  // player's own guess: "Correct!" (green) / "One away!" (amber) /
  // "Incorrect" (red), or a validation/RPC error (red). It lives in the
  // commit row's already-reserved height (never a new line that would
  // reflow the board — docs/ui.md → Layout stability), and `clearLocalFeedback`
  // dismisses it the moment the player clicks a tile to start a fresh selection
  // (handleToggle below) — the tile-click analog of psychicnum's "typing
  // dismisses the flash". Local channel: near my eyes, about what I just did
  // (docs/deferred.md → Feedback channels). Shared machinery; the host owns
  // where it renders + when it clears early.
  const {
    localFeedback,
    showLocalFeedback,
    clearLocalFeedback,
  } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill, even though
  // connections has no keyboard entry (guesses are tile clicks). No-op at
  // terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess is narrated in the GamePage header: correct →
  // "Bea found ANIMALS!" (green), one-away → "Bea was one away" (amber),
  // wrong → "Bea guessed wrong" (red). My own guesses are excluded — they
  // get the local commit flash above; my guess also already shows in the
  // turn log. Compete never reaches here: the guesses log is RLS-scoped to
  // the caller server-side, so no foreign rows arrive, and we gate on coop
  // besides. globalFeedback.show is a prop callback, so no local set-state here.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: guesses,
    keyOf: (g) => g.id,
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → local commit flash
      const member = memberById(players, g.user_id)
      const name = member?.username ?? 'Someone'
      const dot = colorVarFor(member?.color)
      if (g.result === 'correct') {
        // Name the solved category — coop reveals its band to everyone anyway,
        // so there's nothing to hide.
        const cat = game?.board.categories.find((c) => c.rank === g.matched_category_rank)
        return {
          tone: 'success',
          variant: 'outline',
          dot,
          text: cat ? `${name} found ${cat.name.toUpperCase()}!` : `${name} found a category!`,
          dismiss: { kind: 'timed', ms: 3000 },
        }
      }
      return {
        tone: g.result === 'oneAway' ? 'near' : 'error',
        variant: 'outline',
        dot,
        text: g.result === 'oneAway' ? `${name} was one away` : `${name} guessed wrong`,
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

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
      showLocalFeedback(ownGuess('error', `End game failed: ${error.message}`))
    }
  }, [gameId, isTerminal, showLocalFeedback])

  // Hints + End now live in the info-column action row (buttons), not the
  // GamePage menu — see the .infoActions block below. Hints opens the HintModal
  // (disabled once the caller can't submit); End fires handleEndGame.

  // Shared terminal-modal scaffold: open on mount if already-
  // terminal, re-pop when isTerminal flips during play, no re-pop
  // after dismiss.

  async function handleSubmit() {
    if (submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model). My own action, so it
    // flashes locally (the selection stays put; clicking a tile dismisses it).
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      showLocalFeedback(ownGuess('error', 'You already tried that'))
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
      showLocalFeedback(ownGuess('error', error.message))
      return
    }
    // Own-result flash in the commit slot (green/near/red), then clear the
    // selection in EVERY case: correct (those four tiles become a solved band and
    // leave the grid) and wrong / one-away (start fresh rather than leave a
    // rejected set selected). The sticky flash shows over the cleared board;
    // clicking a tile dismisses it (handleToggle) and starts the next guess.
    if (verdict.kind === 'correct') {
      showLocalFeedback(ownGuess('success', 'Correct!'))
    } else if (verdict.kind === 'oneAway') {
      showLocalFeedback(ownGuess('near', 'One away!'))
    } else {
      showLocalFeedback(ownGuess('error', 'Incorrect'))
      setShakingTiles(new Set(unionTiles))
    }
    sendClear()
  }

  function handleClear() {
    sendClear()
  }

  // Tile click: dismiss any lingering own-result flash first (the commit
  // buttons return), then toggle the tile. This is connections's analog of
  // psychicnum's "typing dismisses the entry flash" — the player has moved on
  // to the next selection, so the last guess's result should clear at once.
  function handleToggle(tile: string) {
    clearLocalFeedback()
    toggleTile(tile)
  }

  function handleShuffle() {
    setLocalOrder(shuffleTiles(displayedTiles))
  }

  if (loading) return <p>Loading board…</p>
  if (!game) return <p>Game not found.</p>

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), not
  // connections.players. `myConceded` folds into the locally-terminal branch
  // below (same treatment as a 4-mistake elimination); `concededIds` marks a
  // dropped-out opponent 'out' in the strip.
  const myConceded =
    players.find((p) => p.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(
    players.filter((p) => p.conceded).map((p) => p.user_id),
  )

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

  // Locally terminal (compete, not game-over): caller is out of the race but
  // the game continues for the survivors — either eliminated (hit 4 mistakes)
  // OR they conceded (dropped out). Both freeze this player's input + reveal
  // the unmatched bands, a personal game-over while the rest play on.
  const locallyDone = isEliminated || myConceded
  const showReveal = isTerminal || locallyDone
  const showInput = !isTerminal && !locallyDone

  const canSubmit =
    unionTiles.length === 4
    && !submitting
    && showInput

  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = showReveal
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  // Modal copy. Compete distinguishes the winner (caller hit 4 matches —
  // RLS hides peer matches, so caller-with-4-matched is the server-confirmed
  // winner) from two kinds of loser: eliminated (used all 4 mistakes) vs
  // "beaten to the punch" (still racing when an opponent solved it). Coop
  // verdicts are team-wide.
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfMatched: matchedCategories.length,
    selfEliminated: mistakeCount >= MISTAKE_BUDGET,
  }) : null

  const connSetup = setup as ConnectionsSetup
  const found = matchedCategories.length

  // Concede — drop out of a compete race (a real loss; the others keep racing).
  // Distinct from End: connections.concede flips the caller's conceded flag then
  // re-runs the compete terminal check (which now counts them as done). A plain
  // function (not the useCallback handleEndGame is) because it reads `myConceded`,
  // which is derived after the hooks/loading guard. An RPC failure flashes in the
  // local commit slot.
  const handleConcede = async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(ownGuess('error', `Concede failed: ${error.message}`))
  }

  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out
  // of the race → connections.concede); coop uses the neutral "End" (a mutual
  // "we're done" → end_game). Shared by the playing and the locally-terminal
  // (eliminated / conceded) action rows.
  const endButton =
    game.mode === 'compete' ? (
      <ConcedeGameButton
        onClick={() => void handleConcede()}
        className={shared.helperButton}
        disabled={myConceded}
      />
    ) : (
      <EndGameButton onClick={() => void handleEndGame()} className={shared.helperButton} />
    )

  return (
    <div className={cls(shared.layout, styles.layout)}>
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
          onToggle={handleToggle}
          onSubmit={() => void handleSubmit()}
          shakingTiles={shakingTiles}
          colorByUserId={colorByUserId}
        />

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

        {/* The slot below the board: during play it's the commit row (clicking
            tiles is the input; these commit the current 4-tile selection). Two
            things can REPLACE the buttons in the SAME reserved height (so the
            flex:1 board above never shifts — docs/ui.md → Layout stability):
              - while input is live, my own guess result flashes here for ~1.4s
                (green/neutral/red), the local half of the feedback split —
                mirrors psychicnum's entry-box flash;
              - once input goes away (terminal / eliminated), the outcome
                message fills it, the way psychicnum's reveal does.
            The shared `.moveAreaOrLocalFeedback` swap box reserves the height so
            every state is the same height. */}
        <div className={styles.belowBoard}>
          <div className={shared.moveAreaOrLocalFeedback}>
          {showInput ? (
            localFeedback ? (
              // My own guess result — a centered local <GenericFeedbackPill> (sticky;
              // clicking a tile dismisses it). Same register as the header pill.
              <div className={shared.localFeedback}>
                <GenericFeedbackPill msg={localFeedback} onClose={noop} />
              </div>
            ) : (
              <div className={styles.moveArea}>
                {/* "Mistakes (lose at 4)" — the caller's OWN mistakes MADE (shared
                    team count in coop, personal in compete; never an opponent
                    comparison). Fills left-to-right, reading the same direction as
                    the info-column "N/4 mistakes". margin-right:auto pushes the
                    buttons right. */}
                <div className={styles.mistakesInline}>
                  Mistakes (lose at 4) <StrikeMarks used={mistakeCount} total={MISTAKE_BUDGET} />
                </div>
                <ClearButton
                  onClick={handleClear}
                  disabled={unionTiles.length === 0}
                  className={styles.inputButton}
                />
                <SubmitButton
                  label={submitting ? 'Submitting…' : 'Submit'}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={styles.inputButton}
                />
              </div>
            )
          ) : (
            // Terminal / eliminated — the local feedback area carries the message
            // (no separate below-board element): a PERMANENT outcome pill at game
            // over, or a sticky "you're out" while the rest race on.
            <div className={shared.localFeedback}>
              <GenericFeedbackPill
                msg={
                  over
                    ? {
                        tone:
                          over.tone === 'won'
                            ? 'success'
                            : over.tone === 'lost'
                              ? 'error'
                              : 'neutral',
                        text: over.verdict,
                        variant: 'fill',
                        dismiss: { kind: 'sticky' },
                      }
                    : {
                        tone: 'neutral',
                        text: myConceded
                          ? 'You conceded — the rest are still racing.'
                          : "You're out — the rest are still racing.",
                        variant: 'outline',
                        dismiss: { kind: 'sticky' },
                      }
                }
                onClose={noop}
              />
            </div>
          )}
          </div>
        </div>
      </div>

      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {/* State — categories found + mistakes (the mistakes dots live below
              the board; this is the at-a-glance textual count, kept here too). */}
          <p className={shared.infoState}>
            <strong>{found}/{CATEGORY_COUNT}</strong> categories found ·{' '}
            <strong>{mistakeCount}/{MISTAKE_BUDGET}</strong> mistakes
          </p>

          {/* Opponent strip (compete) — the race comparison: each player's
              categories FOUND (public via players.matched_count). Mirrors
              psychicnum's compete opponent strip. */}
          {game.mode === 'compete' && (
            <OpponentStrip
              players={players}
              selfId={session.user.id}
              metricLabel="Found"
              metricFor={(p, isSelf) =>
                // A dropped-out racer reads 'out' mid-game (their found-count is
                // frozen and no longer part of the race); everyone else shows
                // their live categories-found.
                concededIds.has(p.user_id)
                  ? 'out'
                  : isSelf
                    ? matchedCategories.length
                    : (opponentFound.get(p.user_id) ?? 0)
              }
            />
          )}

          {/* Action row — three states. Playing: Hints + End/Concede. Locally
              terminal (out of mistakes OR conceded, the rest race on): the
              terminal LOOK, a bold status ("You're out" / "You conceded") +
              Concede (like psychicnum's out-of-guesses). Terminal: the outcome
              line + a compact back-to-club button. */}
          {over ? (
            <TerminalActionRow over={over} onBackToClub={goToClub} />
          ) : locallyDone ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared.outcome_neutral)}>
                {myConceded ? 'You conceded' : 'You’re out'}
              </span>
              {endButton}
            </div>
          ) : (
            <div className={shared.infoActions}>
              {/* Hints opens the per-player HintModal (warning-toned, amber). */}
              <HintButton
                label="Hints"
                onClick={() => setHintsOpen(true)}
                className={shared.helperButton}
              />
              {endButton}
            </div>
          )}

          {/* Help — shown only while you can act on it (never silently swaps);
              the eliminated state is carried loudly by the action row above. */}
          {showInput && (
            <p className={shared.infoHelp}>
              Pick 4 tiles that share a connection, then Submit.
            </p>
          )}

          {/* Setup — last, behind a disclosure (closed by default so it doesn't
              claim space). */}
          <SetupDisclosure>
              <li>Puzzle: {formatPuzzleDate(game.puzzleDate)}</li>
              <li>{game.board.tileOrder.length} words</li>
              <li>{CATEGORY_COUNT} categories to find</li>
              <li>{MISTAKE_BUDGET} mistakes allowed</li>
              <li>{timerLabel(connSetup.timer)}</li>
            </SetupDisclosure>
        </div>

        {/* Turn log: coop shows every player's guesses; in compete RLS already
            filters to the caller's own, so the FE does nothing special. */}
        <GameTurnLog
          guesses={guesses}
          matchedCategories={matchedCategories}
          players={players}
        />
      </div>

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Per-status terminal copy. `outcome` + `verdict` drive the GameOverModal;
 * `message` + `tone` drive the short, bold, color-coded line in the info-column
 * action row (won = green, lost = red, manual end = neutral). Same shape as
 * psychicnum's buildOver. Coop verdicts are team-wide; compete distinguishes the
 * racer who hit 4 matches (the winner) from two losers — eliminated (used all 4
 * mistakes) vs beaten to the punch (an opponent solved it first). Detail-on-page
 * intentionally: the matched/unmatched categories show on the bands and mistake
 * counts on the strip; the modal + line stay focused on the verdict.
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfMatched,
  selfEliminated,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfMatched: number
  /** Compete: did the caller use all their mistakes? Distinguishes the
   *  out-of-mistakes loss from "beaten to the punch". */
  selfEliminated: boolean
}): TerminalCopy {
  // Manual end (connections.end_game) — NEUTRAL terminal in BOTH modes: the
  // friends chose to stop, nobody won or lost. The shared endedCopy() owns it
  // (green modal, neutral copy). Must come first — 'ended' is mode-independent.
  if (playState === 'ended') return endedCopy(mode)
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
    if (selfMatched >= CATEGORY_COUNT) {
      return { outcome: 'won', verdict: 'You won the race!', message: 'You won!', tone: 'won' }
    }
    // I lost — but WHY matters. If I used all my mistakes I was eliminated
    // (out of mistakes); "beaten to the punch" is only for a still-racing player
    // whose opponent solved it first.
    if (selfEliminated) {
      return { outcome: 'lost', verdict: 'You lost: out of mistakes', message: 'Out of mistakes', tone: 'lost' }
    }
    return { outcome: 'lost', verdict: 'Beaten to the punch.', message: 'Opponent won', tone: 'lost' }
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
