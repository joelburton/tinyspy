// cs-unmet

import { getNotOkFeedback } from '@/common/feedback/genericPills'
import { runRpc } from '@/common/supabase/dbResult'
import { useRef, useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { GenericFeedbackMsg } from '@/common/feedback/genericFeedback'
import type { TerminalCopy, TerminalOutcome } from '@/common/terminal/terminalCopy'
import { GenericFeedbackPill } from '@/common/feedback/GenericFeedbackPill'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { SubmitButton } from '@/common/buttons/SubmitButton'
import { ClearButton } from '@/common/buttons/ClearButton'
import { StrikeMarks } from './StrikeMarks'
import { useGlobalKeyHandler } from '@/common/keyboard/useGlobalKeyHandler'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { db } from '../db'
import { evaluateGuess, sameTileSet, RESULT_FOR_OUTCOME, type GuessOutcome } from '../lib/evaluate'
import { reconcileLocalOrder, shuffleTiles } from '../lib/localOrder'
import { stickyPill, terminalPill, outOfRacePill } from '@/common/feedback/localPills'
import type { ConnectionsGame, GuessRow, MatchedCategory } from '../hooks/useGame'
import type { Category } from '../lib/board'
import type { TurnSnapshot } from '../lib/history'
import { Board, type BoardVerdict } from './Board'
import shared from '@/common/game-page/PlayArea.module.css'
import history from '@/common/turn-log/historyViewer.module.css'
import styles from './PlayArea.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Empty selection map — the board draws no selection while viewing a past turn. */
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

/** Empty tile set — the resting value of the in-flight mark. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * connections's board column — the `<Board>` (one grid of bands + tiles) with the
 * floating Shuffle, plus the fixed-height below-board slot (the
 * turn-viewer banner, the Clear/Submit commit row + inline mistakes, or a local
 * `<GenericFeedbackPill>` for an own-guess result / the terminal / eliminated verdict).
 *
 * This is the **input engine**: the local board shuffle, the in-flight + verdict
 * marks on the guessed tiles, and —
 * because the guess is a board gesture with its result via realtime (no deep
 * entangled state) — the `submit_guess` RPC, kept beside the commit row it fires.
 * The tile SELECTION itself lives in `useGame` (it's broadcast-coupled to the coop
 * realtime channel), so PlayArea passes the selection primitives (`ownerByTile` /
 * `toggleTile` / `sendClear` / `unionTiles`) DOWN and this column renders + commits
 * them. Like the other games' BoardCol it does NOT own the game state: PlayArea hands
 * it **the board to render** (live OR a `snap` snapshot) + `viewing`, which is what
 * makes the turn-history viewer a drop-in. Own-guess feedback lifts to PlayArea (its
 * `showLocalFeedback` / `clearLocalFeedback` write the shared below-board channel,
 * which InfoCol's End / Concede also write). See docs/playarea.md.
 */
/**
 * What `connections.submit_guess` puts in `data`: the verdict it RECORDED.
 *
 * The frontend adjudicates the guess itself (`evaluateGuess`, the FE-knows
 * model) and sends its answer up, so this tells it nothing new — but a call
 * site may not pick an `ok` branch by reading its own local value back
 * (docs/envelopes.md → Choosing which `ok` branch), so each recorded verdict is
 * its own answer. A guess that wrote NOTHING is not here at all: it comes back
 * as PN300 or PN301, both races.
 */
type GuessAnswer = { result: GuessOutcome }

export function BoardCol({
  // ── Board to render (live OR a historical snapshot — PlayArea picks via `snap`) ──
  game,
  matchedCategories,
  remainingTiles,
  unmatched,
  solutionShown,
  snap,
  viewing,
  showInput,
  isMyTurn,
  notMyTurn,
  myTurnJustStarted,
  gameOver,
  onExitViewing,
  // ── Tile selection (state owned by useGame; this renders + commits it) ──
  ownerByTile,
  toggleTile,
  sendClear,
  unionTiles,
  selfId,
  colorByUserId,
  sharedBoard,
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
  /** Is the ANSWER on the board right now (the terminal reveal)? The four
   *  unsolved categories take the loose tiles' place while it's on, and the
   *  tiles come back when it's off — see the `tiles` prop below. */
  solutionShown: boolean
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
  /** Turn-order: a teammate holds the move, so the board wears the shared dim.
   *  Narrower than `!isMyTurn` — a terminal board is inactive for a different
   *  reason and says so with the frame instead. */
  notMyTurn: boolean
  /** True for a beat as the turn arrives (the shared your-turn flash). */
  myTurnJustStarted: boolean
  /** The tone of the game-over frame, or null while the board is live. */
  gameOver: TerminalOutcome | null
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
  /** Coop, with somebody else in the game — the only case where "whose pick is
   *  this?" is a question the board can usefully answer. */
  sharedBoard: boolean

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
  const phone = useIsPhone()
  // Per-player local tile order. NULL = use `remainingTiles` as-is (the create_game
  // shuffle, same for every player). A permutation gives this client its own view;
  // doesn't broadcast.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // The four tiles of a guess that is OUT — they wear the shared in-flight dim
  // until the server answers. It is what earns the right not to guess the answer
  // locally: "sent, waiting" is honest, where coloring them now would be
  // inventing a verdict we'd have to take back.
  const [inFlightTiles, setInFlightTiles] = useState<ReadonlySet<string>>(NO_TILES)
  // The verdict ring on the tiles of my last guess, in the tone its PILL wears —
  // the two are one message arriving in two places, so they share a lifetime as
  // well as a color: both last until my next action (a tile click, or dismissing
  // the pill). See plans/tile-feedback.md → Every mark has a lifetime.
  const [verdict, setVerdict] = useState<BoardVerdict | null>(null)
  // Bumped per verdict so the ring's shake replays on a repeat (Board keys the
  // ringed tiles on it). A ref, not state: it is read while setting state and
  // never rendered on its own.
  const verdictSeq = useRef(0)

  /** Mark these tiles with the verdict in the given tone, replaying the shake. */
  function markVerdict(tiles: string[], tone: BoardVerdict['tone']) {
    verdictSeq.current += 1
    setVerdict({ tiles: new Set(tiles), tone, nonce: verdictSeq.current })
  }

  // ─── When the verdict mark expires ──────────────────────────────────────
  //
  // The mark rings four particular tiles, so it is a claim about the board AS IT
  // WAS. It has no timer: it lives until the board stops being that board, and
  // the guess log is where that shows up. Two events end it, neither of them
  // something this player did:
  //
  //   • a RESTART — every guess is deleted, so the log SHRINKS. Only a restart
  //     shrinks it, which is what makes the count a reliable signal.
  //   • a TEAMMATE'S GUESS — the log grows a row somebody else wrote. The board
  //     has moved on, and a mark still sitting on it now claims to be about the
  //     move that just happened.
  //
  // MY OWN row growing the log is neither of those: it is the tail of the very
  // action that set the mark, arriving a beat later over realtime. So the test
  // asks WHO wrote the newest row, not just whether the log changed.
  //
  // Two things this deliberately does NOT do:
  //
  //   • It does not wait for my own row to arrive as a signal that the guess is
  //     done — a refused guess (PN300 / PN301) writes no row at all, so that
  //     signal would never come for exactly the answers worth marking.
  //   • It does not listen to `onRestarted`, which fires only on the client that
  //     clicked Restart — everyone else's mark would be stranded.
  //
  // Run during RENDER rather than in an effect, so the cleared mark and the
  // board that cleared it land in the same commit; there is no frame in which a
  // stale ring is painted over a new board. See plans/tile-feedback.md →
  // "Check what a RESTART does".
  const newestGuess = guesses.length > 0 ? guesses[guesses.length - 1] : null
  const [seenGuess, setSeenGuess] = useState({
    count: guesses.length,
    id: newestGuess?.id ?? null,
  })
  if (guesses.length !== seenGuess.count || (newestGuess?.id ?? null) !== seenGuess.id) {
    const shrank = guesses.length < seenGuess.count
    const foreign = newestGuess !== null && newestGuess.user_id !== selfId
    setSeenGuess({ count: guesses.length, id: newestGuess?.id ?? null })
    if (shrank || foreign) setVerdict(null)
  }

  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  // One shuffle, two triggers (the floating button + the Space key), so they
  // can't drift into rearranging different things.
  const handleShuffle = () => setLocalOrder(shuffleTiles(displayedTiles))

  const canSubmit = unionTiles.length === 4 && !submitting && showInput && isMyTurn

  async function handleSubmit() {
    if (submitting || unionTiles.length !== 4) return
    // The tiles as they were at SEND. The selection is cleared on the way out
    // (and a teammate can move it in coop), so every mark about this guess has
    // to carry its own copy rather than re-reading `unionTiles` afterwards.
    const sent = [...unionTiles]

    // Dup detection (FE-side per the FE-knows model). My own action, so it flashes
    // locally (the selection stays put; clicking a tile dismisses it) — and the
    // ring goes on the four tiles it is about, in the pill's amber. A refusal is
    // the one verdict whose pill I might not be looking at: my eyes are on the
    // board, having just clicked four tiles there.
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      showLocalFeedback(stickyPill('warning', 'You already tried that'))
      markVerdict(sent, 'warning')
      // Cleared like any other answered guess. The refusal never reached the
      // server, so this one could have kept its selection for tweaking — but
      // then one of the three answers would leave the board in a different state
      // from the other two, and "what happens after a verdict" is worth more as
      // one rule than as a small convenience.
      sendClear()
      return
    }

    const evaluation = evaluateGuess(unionTiles, game.board.categories)
    setSubmitting(true)
    setInFlightTiles(new Set(sent))
    // THE OUTBOUND SEAM, the twin of useGame's: the wire word is written here
    // and nowhere else in the FE. `evaluateGuess` answers in outcomes, the
    // column stores `connections.guesses.result`, and these two lines are the
    // whole of the translation between them.
    const storedResult = RESULT_FOR_OUTCOME[evaluation.outcome]
    // Only a match names a category. The argument is OPTIONAL rather than
    // nullable, so the other two verdicts leave it out rather than send null —
    // which is why this is a spread and not a value.
    const matchedCategory =
      evaluation.outcome === 'won' ? { matched_category_rank: evaluation.rank } : {}

    const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', {
      target_game: gameId,
      tiles: unionTiles,
      result: storedResult,
      ...matchedCategory,
    }))
    setSubmitting(false)
    setInFlightTiles(NO_TILES)
    // A guess that isn't taken can be a RACE — a teammate ended the game, your
    // own concede landed first, your own fourth mistake landed — or a fault.
    // `getNotOkFeedback` decides how each reads (docs/envelopes.md).
    if (res.type === 'not-ok') {
      const msg = getNotOkFeedback(res)
      showLocalFeedback({ ...msg, mode: { kind: 'sticky' } })
      // The move wasn't taken, so the four tiles are still sitting there
      // un-played — ring them in the PILL'S OWN TONE, no translation. This used
      // to squeeze seven outcomes into three by hand (`=== 'warning' ?
      // 'warning' : 'lost'`), which painted anything it did not recognize red;
      // the tile vocabulary is complete now, so the two cannot disagree.
      markVerdict(sent, msg.tone)
      return
    // Own-result flash in the commit slot, then clear the selection — the sticky
    // flash shows over the cleared board; clicking a tile dismisses it
    // (handleToggle) and starts the next guess.
    //
    // `sendClear()` is called from each branch that takes the move rather than
    // once after the chain. It serves four of the five answers and NOT the
    // refusal above, which keeps the four tiles selected because the move was
    // not taken — and a statement at the bottom would have to be reasoned about
    // branch by branch to see that (docs/envelopes.md → The shape of a call site).
    //
    // The ring follows the pill's tone, and only where there is something left to
    // ring: a correct guess's four tiles collapse into a band on this very render,
    // so a mark on them would have nothing to land on.
    //
    // One branch per recorded verdict, each asserting `data` and nothing else.
    // The FE computed these three itself and sent the answer up — but reading
    // its own value back to pick a branch would be choosing an `ok` case by
    // something the envelope did not say, so the RPC names each one.
    } else if (res.type === 'ok' && res.data.result === 'won') {
      // A correct guess that wrote NOTHING comes back as PN300, so reaching
      // here means the match is durably recorded. No mark: these four collapse
      // into a band on this very render, leaving nothing to ring.
      showLocalFeedback(stickyPill('won', 'Correct'))
      sendClear()
      return
    } else if (res.type === 'ok' && res.data.result === 'near') {
      showLocalFeedback(stickyPill('near', 'One away!'))
      markVerdict(sent, 'near')
      sendClear()
      return
    } else if (res.type === 'ok' && res.data.result === 'lost') {
      showLocalFeedback(stickyPill('lost', 'Incorrect'))
      markVerdict(sent, 'lost')
      sendClear()
      return
    } else {
      // An unhandled answer is no reason to leave four tiles sitting on a board
      // that has moved on, so this clears too.
      reportUnhandled('submit_guess', res)
      sendClear()
      return
    }
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
  //
  // SPACE shuffles, the same board key spellingbee and wordwheel have: a fresh
  // visual scan of the SAME sixteen tiles, never a move. Deliberately NOT gated
  // on `showInput` the way Enter is — the Shuffle BUTTON is live whenever there
  // are tiles to rearrange, including on a finished board, and a key that
  // disagreed with its own button is the bug this pairs with (see
  // useCaptureKeys' extra-key note). Only `viewing` stops it, since a keystroke
  // in the history viewer means "back to live".
  useGlobalKeyHandler((e) => {
    if (viewing) return
    if (e.key === ' ') {
      e.preventDefault()
      handleShuffle()
      return
    }
    if (e.key !== 'Enter' || !showInput || !isMyTurn) return
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
    // A frozen board still DRAWS its tiles now (they're the record of where the
    // players got to), so the guard that used to be implicit — no tiles, no
    // clicks — has to be explicit.
    if (!showInput || !isMyTurn) return
    clearLocalFeedback()
    // The ring goes with the pill it belongs to — one message, one dismissal.
    setVerdict(null)
    toggleTile(tile)
  }

  // The below-board slot shows exactly ONE pill, by the shared priority
  // (localPills.ts): the terminal verdict, then "you're out of the race" while
  // the others play on, then your own move result. `null` means the slot is free
  // for the move controls instead. Resolving it here rather than branching in
  // the JSX is what keeps one render and one dismiss handler — the permanent
  // pills simply never call it.
  const slotPill = !showInput
    ? over
      ? terminalPill(over.tone, over.verdict)
      : outOfRacePill(myConceded)
    : localPill

  return (
    <div className={shared.boardCol}>
      {/* One grid: solved categories as full-width band rows + the remaining tiles.
          While viewing, the board is the historical snapshot (bands before the turn +
          its 4 guessed tiles ringed); else live (tiles only while input is live). */}
      <Board
        matched={snap ? snap.matched : matchedCategories}
        unmatched={snap ? [] : unmatched}
        // The tiles survive the end of the game — a finished board is your
        // bands PLUS the ones you never cracked, frozen, which is the only
        // record of how far you got. They step aside only for the reveal, whose
        // bands need the rows (bands + ceil(tiles/4) is a fixed row count).
        tiles={snap ? snap.tiles : solutionShown ? [] : displayedTiles}
        // A historical snapshot is a record too — never clickable. `isMyTurn` is
        // in here as well as on the click guard: a tile that hovers, lifts and
        // shows a pointer while silently swallowing the click is a promise the
        // board can't keep, and the dim beside it would be saying the opposite.
        interactive={showInput && isMyTurn && !viewing}
        // Nobody is building a move on a board that can't take one, so the
        // selection is not drawn on one: not in the history viewer (a past turn
        // is a record), and not once this player is finished — the game over,
        // eliminated, or conceded. The selection state itself is ephemeral
        // broadcast chatter that outlives all three, and a frozen board wearing
        // black selection borders reads as a move still in progress.
        ownerByTile={viewing || !showInput ? NO_OWNERS : ownerByTile}
        onToggle={handleToggle}
        inFlightTiles={inFlightTiles}
        verdict={verdict}
        colorByUserId={colorByUserId}
        sharedBoard={sharedBoard}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
        gameOver={gameOver}
        // ATTENTION's cause, read off the log rather than off the board: how many
        // guesses the server has recorded, and whether the newest was mine.
        moveCount={guesses.length}
        lastMoveMine={guesses.length > 0 && guesses[guesses.length - 1].user_id === selfId}
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
              onShuffle={handleShuffle}
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
        <div className={cls(shared.moveAreaOrLocalFeedback, viewing && history.bannerHost)}>
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
          {/* One slot, one pill. The priority is resolved into `slotPill` above,
              not branched here (localPills.ts → the below-board slot's order), so
              there's a single render and a single dismiss handler. */}
          {slotPill ? (
            <div className={shared.localFeedback}>
              {/* Dismissing the pill takes its ring off the board with it — the
                  two are one message, so they end together. */}
              <GenericFeedbackPill
                msg={slotPill}
                onClose={() => {
                  clearLocalFeedback()
                  setVerdict(null)
                }}
              />
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
                  label={phone ? null : undefined}
                  className={styles.inputButton}
                />
                <SubmitButton
                  name={submitting ? 'Submitting…' : 'Submit'}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  label={phone ? null : undefined}
                  className={styles.inputButton}
                />
              </div>
          )}
        </div>
      </div>
    </div>
  )
}
