import { useEffect, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { SubmitButton } from '../../common/components/buttons/SubmitButton'
import { ClearButton } from '../../common/components/buttons/ClearButton'
import { StrikeMarks } from '../../common/components/game/StrikeMarks'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { usePhone } from '../../common/hooks/ui/usePhone'
import { db } from '../db'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { reconcileLocalOrder, shuffleTiles } from '../lib/localOrder'
import { stickyPill, terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import type { ConnectionsGame, GuessRow, MatchedCategory } from '../hooks/useGame'
import type { Category } from '../lib/board'
import type { TurnSnapshot } from '../lib/history'
import { Board } from './Board'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './PlayArea.module.css'

/** The terminal / waiting pills are never closeable, so the × is never rendered and
 *  this is never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/** Empty selection map — the board draws no selection while viewing a past turn. */
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

/**
 * connections's board column — the `<Board>` (one grid of bands + tiles) with the
 * floating Shuffle, plus the fixed-height below-board slot (the
 * turn-viewer banner, the Clear/Submit commit row + inline mistakes, or a local
 * `<GenericFeedbackPill>` for an own-guess result / the terminal / eliminated verdict).
 *
 * This is the **input engine**: the local board shuffle, the wrong-guess shake, and —
 * because the guess is a board gesture with its result via realtime (no deep
 * entangled state) — the `submit_guess` RPC, kept beside the commit row it fires.
 * The tile SELECTION itself lives in `useGame` (it's broadcast-coupled to the coop
 * realtime channel), so PlayArea passes the selection primitives (`ownerByTile` /
 * `toggleTile` / `sendClear` / `unionTiles`) DOWN and this column renders + commits
 * them. Like the other games' BoardCol it does NOT own the game state: PlayArea hands
 * it **the board to render** (live OR a `snap` snapshot) + `viewing`, which is what
 * makes the turn-history viewer a drop-in. Own-guess feedback lifts to PlayArea (its
 * `showLocalFeedback` / `clearLocalFeedback` write the shared below-board channel,
 * which InfoCol's End / Concede also write). See docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
  // ── Board to render (live OR a historical snapshot — PlayArea picks via `snap`) ──
  game,
  matchedCategories,
  remainingTiles,
  unmatched,
  snap,
  viewing,
  showInput,
  isMyTurn,
  onExitViewing,
  // ── Tile selection (state owned by useGame; this renders + commits it) ──
  ownerByTile,
  toggleTile,
  sendClear,
  unionTiles,
  selfId,
  colorByUserId,
  // ── Own-guess feedback (channel owned by PlayArea) ──
  localPill,
  showLocalFeedback,
  clearLocalFeedback,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  guesses,
  // ── Below-board readout / slot content ──
  mistakeCount,
  mistakeBudget,
  over,
  myConceded,
}: {
  // ── Board to render ──
  game: ConnectionsGame
  /** Live matched bands (shown when not viewing). */
  matchedCategories: MatchedCategory[]
  /** Live remaining tiles — the shuffle source; the display order derives from these. */
  remainingTiles: string[]
  /** Categories revealed at game-end (loss / elimination); `[]` during play. */
  unmatched: Category[]
  /** The viewed turn's snapshot, or null when live — PlayArea reconstructs it. */
  snap: TurnSnapshot | null
  viewing: boolean
  /** May I still submit? Gates the tiles + the commit row (vs a terminal / waiting pill).
   *  Participant-level (terminal / eliminated / conceded) — NOT turn-aware. */
  showInput: boolean
  /** Turn-order: may I act THIS moment? Always true for free-for-all / solo. When
   *  false, tile selection + submit are frozen (the InfoCol TurnStatusLine explains
   *  why). Kept apart from `showInput` so a non-turn doesn't read as terminal /
   *  eliminated (which would flip to the reveal view). */
  isMyTurn: boolean
  /** Return to the live board (the banner click / ✕). */
  onExitViewing: () => void

  // ── Tile selection ──
  /** tile → user_id (the inverted selections map) — the per-tile mine/peer treatment. */
  ownerByTile: ReadonlyMap<string, string>
  toggleTile: (tile: string) => void
  sendClear: () => void
  /** The flat union of every player's selection (coop) / the caller's (compete). */
  unionTiles: string[]
  selfId: string
  colorByUserId: ReadonlyMap<string, string>

  // ── Own-guess feedback ──
  /** The own-guess pill to render in the commit slot, or null. */
  localPill: GenericFeedbackMsg | null
  showLocalFeedback: (msg: GenericFeedbackMsg) => void
  clearLocalFeedback: () => void

  // ── Guess dispatch ──
  gameId: string
  /** The guess log — for FE-side dup detection before firing submit_guess. */
  guesses: GuessRow[]

  // ── Below-board readout / slot content ──
  mistakeCount: number
  mistakeBudget: number
  /** Terminal copy — its verdict shows as a permanent below-board pill at game-over. */
  over: TerminalCopy | null
  /** I conceded a compete race — picks the "you're out / conceded" pill's wording. */
  myConceded: boolean
}) {
  const [submitting, setSubmitting] = useState(false)
  // On a phone the below-board commit row is tight: the Clear/Submit buttons go
  // icon-only (the shared buttons support it) and the mistakes label shortens to
  // "Mistakes" (the strike dots already carry "lose at 4"). Desktop keeps the full
  // labels. (docs/mobile.md — same phone treatment as codenamesduet's action row.)
  const phone = usePhone()
  // Per-player local tile order. NULL = use `remainingTiles` as-is (the create_game
  // shuffle, same for every player). A permutation gives this client its own view;
  // doesn't broadcast.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // Tiles currently playing the wrong-guess shake (set for ~500ms after a 'wrong').
  const [shakingTiles, setShakingTiles] = useState<ReadonlySet<string>>(() => new Set())

  // Auto-clear the shake set ~500ms after we set it (just past the 400ms animation).
  useEffect(
    function autoClearShakeAfterAnimation() {
      if (shakingTiles.size === 0) return
      const t = setTimeout(() => setShakingTiles(new Set()), 500)
      return () => clearTimeout(t)
    },
    [shakingTiles],
  )

  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  const canSubmit = unionTiles.length === 4 && !submitting && showInput && isMyTurn

  async function handleSubmit() {
    if (submitting || unionTiles.length !== 4) return

    // Dup detection (FE-side per the FE-knows model). My own action, so it flashes
    // locally (the selection stays put; clicking a tile dismisses it).
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      showLocalFeedback(stickyPill('error', 'You already tried that'))
      return
    }

    const verdict = evaluateGuess(unionTiles, game.board.categories)
    setSubmitting(true)
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      tiles: unionTiles,
      result: verdict.kind,
      ...(verdict.kind === 'correct' ? { matched_category_rank: verdict.rank } : {}),
    })
    setSubmitting(false)
    if (error) {
      showLocalFeedback(stickyPill('error', error.message))
      return
    }
    // Own-result flash in the commit slot, then clear the selection in EVERY case:
    // correct (those four become a band and leave the grid) and wrong / one-away
    // (start fresh). The sticky flash shows over the cleared board; clicking a tile
    // dismisses it (handleToggle) and starts the next guess.
    if (verdict.kind === 'correct') {
      showLocalFeedback(stickyPill('success', 'Correct!'))
    } else if (verdict.kind === 'oneAway') {
      showLocalFeedback(stickyPill('near', 'One away!'))
    } else {
      showLocalFeedback(stickyPill('error', 'Incorrect'))
      setShakingTiles(new Set(unionTiles))
    }
    sendClear()
  }

  // Enter submits the current selection from ANYWHERE on the board, not just when
  // a tile happens to hold keyboard focus. (macOS doesn't focus a <button> on
  // click, so the per-tile Enter never fired after mouse selection — the whole
  // "click four tiles, hit Return" flow was dead.) Gated to live input: not while
  // viewing a past turn (a keystroke there exits the viewer instead). `handleSubmit`
  // self-guards on the 4-tile / in-flight conditions, so a stray Enter with an
  // incomplete selection is a harmless no-op. The shared hook already ignores keys
  // aimed at a focused text field (chat, etc.). (Hints is now an inline info-column
  // list, not a board modal, so it no longer needs to suppress Enter.)
  useGlobalKeyHandler((e) => {
    if (e.key !== 'Enter' || viewing || !showInput || !isMyTurn) return
    e.preventDefault()
    void handleSubmit()
  })

  // Tile click: dismiss any lingering own-result flash first (the commit buttons
  // return), then toggle the tile — connections's analog of "typing dismisses the
  // entry flash" (the player has moved on to the next selection).
  function handleToggle(tile: string) {
    // Turn-order: a waiting player can't build (or broadcast) a selection — the
    // tile toggle is shared over Broadcast in coop, so freezing it here keeps a
    // non-current player from nudging teammates' boards.
    if (!isMyTurn) return
    clearLocalFeedback()
    toggleTile(tile)
  }

  return (
    <div className={shared.boardCol}>
      {/* One grid: solved categories as full-width band rows + the remaining tiles.
          While viewing, the board is the historical snapshot (bands before the turn +
          its 4 guessed tiles ringed); else live (tiles only while input is live). */}
      <Board
        matched={snap ? snap.matched : matchedCategories}
        unmatched={snap ? [] : unmatched}
        tiles={snap ? snap.tiles : showInput ? displayedTiles : []}
        ownerByTile={viewing ? NO_OWNERS : ownerByTile}
        selfId={selfId}
        onToggle={handleToggle}
        shakingTiles={shakingTiles}
        colorByUserId={colorByUserId}
        viewing={viewing}
        highlightTiles={snap?.highlightTiles}
        highlightOutcome={snap?.outcome}
        // Shuffle floats over the board's top-right — a fresh visual scan of the
        // SAME tiles (not a turn action). Only while the grid is shown. Passed
        // into Board so it anchors to the visual board, not the column.
        floatingControl={
          showInput &&
          !viewing && (
            <ShuffleButton
              onShuffle={() => setLocalOrder(shuffleTiles(displayedTiles))}
              disabled={displayedTiles.length === 0}
              label="Shuffle tiles"
              className={shared.floatingShuffle}
            />
          )
        }
      />

      {/* The slot below the board: the commit row (Clear/Submit + inline mistakes)
          during play, or an own-guess / terminal / eliminated pill — all in the same
          reserved height so the flex:1 board never shifts. While viewing a past turn
          the history banner overlays it. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, viewing && styles.slotViewing)}>
          {viewing && snap && (
            <div className={history.banner} onClick={onExitViewing} title="Click to exit">
              <span className={history.bannerLabel}>{snap.description}</span>
              <button
                type="button"
                className={history.bannerExit}
                onClick={(e) => {
                  e.stopPropagation()
                  onExitViewing()
                }}
                aria-label="Exit viewing"
              >
                ✕
              </button>
            </div>
          )}
          {showInput ? (
            localPill ? (
              // My own guess result — a centered local pill (sticky; a tile click
              // dismisses it). Same register as the header pill.
              <div className={shared.localFeedback}>
                <GenericFeedbackPill msg={localPill} onClose={noop} />
              </div>
            ) : (
              <div className={styles.moveArea}>
                {/* "Mistakes (lose at 4)" — the caller's OWN mistakes made (shared in
                    coop, personal in compete). margin-right:auto pushes the buttons
                    right. */}
                <div className={styles.mistakesInline}>
                  {phone ? 'Mistakes' : 'Mistakes (lose at 4)'}{' '}
                  <StrikeMarks used={mistakeCount} total={mistakeBudget} />
                </div>
                <ClearButton
                  onClick={sendClear}
                  disabled={unionTiles.length === 0}
                  iconOnly={phone}
                  className={styles.inputButton}
                />
                <SubmitButton
                  label={submitting ? 'Submitting…' : 'Submit'}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  iconOnly={phone}
                  className={styles.inputButton}
                />
              </div>
            )
          ) : (
            // Terminal / eliminated — a PERMANENT outcome pill at game over, or a
            // sticky "you're out" while the rest race on.
            <div className={shared.localFeedback}>
              <GenericFeedbackPill
                msg={over ? terminalPill(over.tone, over.verdict) : outOfRacePill(myConceded)}
                onClose={noop}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
