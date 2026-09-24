// cs-blessed-connections

import { runRpc } from '@/common/supabase/dbResult'
import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import { useMark } from '@/common/board-marks/useMark'
import { NO_TIMER } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { ActionButton } from '@/common/actions/ActionButton'
import { StrikeMarks } from './StrikeMarks'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { Cell } from '@/common/board-cursor/stepCell'
import { db } from '../db'
import { boardShape } from '../lib/boardShape'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { answerMessage, type GuessResult } from '../lib/answer'
import { reconcileLocalOrder } from '../lib/localOrder'
import { shuffle } from '@/common/utils/shuffle'
import type { ConnectionsGame, EventRow, MatchedCategory } from '../hooks/useGame'
import { TILES_PER_CATEGORY, type Category } from '../lib/board'
import type { HistorySnapshot } from '../lib/history'
import { Board, type BoardVerdict } from './Board'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Empty selection map — the board draws no selection while viewing a past turn. */
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

/** Empty tile set — the resting value of the in-flight mark. */
const NO_TILES: ReadonlySet<string> = new Set()

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
type GuessAnswer = { result: GuessResult }

/**
 * connections' board column: the `<Board>` with its floating Shuffle, and the
 * fixed-height slot below it — the commit row with the inline mistakes, or the
 * local slot's top message, or the history banner while a past turn is open.
 *
 * It owns the marks on the guessed tiles (the in-flight dim, the verdict
 * fill), this client's view of the tile order, the keyboard's selection cursor
 * over it (`useBoardSelectionCursor`), and the `submit_guess` call.
 * The tile SELECTION is `useGame`'s, since coop shares it over Broadcast, so
 * PlayArea hands the selection primitives down and this column renders and
 * commits them; the board it draws is whatever PlayArea hands it, live or a
 * snapshot, which is what makes the turn-history viewer a drop-in. See
 * docs/playarea.md.
 */
export function BoardCol({
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  game,
  matchedCategories,
  remainingTiles,
  unmatched,
  solutionShown,
  historySnap,
  historyActor,
  showInput,
  isMyTurn,
  notMyTurn,
  myTurnJustStarted,
  gameOver,
  onExitHistory,
  // ── Tile selection (state owned by useGame; this renders + commits it) ──
  ownerByTile,
  toggleTile,
  sendClear,
  unionTiles,
  selfId,
  colorByUserId,
  sharedBoard,
  // ── Own-guess feedback (the slot is PlayArea's) ──
  localFeedbackSlot,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  guesses,
  // ── Below-board readout ──
  mistakeCount,
  mistakeBudget,
}: {
  // ── Board to render ──
  game: ConnectionsGame
  // Live matched bands (shown when not viewing).
  matchedCategories: MatchedCategory[]
  // Live remaining tiles — the shuffle source; the display order derives from these.
  remainingTiles: string[]
  // The categories nobody got, while the reveal is on; `[]` otherwise.
  unmatched: Category[]
  // Is the ANSWER on the board right now (the terminal reveal)? The unsolved
  // categories take the loose tiles' place while it's on, and the tiles come
  // back when it's off — see the `tiles` prop below.
  solutionShown: boolean
  // The viewed turn's snapshot, or null when live — PlayArea reconstructs it.
  historySnap: HistorySnapshot | null
  // Whose board is on screen, when it is not the viewer's own.
  historyActor?: Actor | null
  // May I still submit? Gates the tiles + the commit row (vs a terminal / waiting pill).
  // Participant-level (terminal / eliminated / conceded) — NOT turn-aware.
  showInput: boolean
  // Turn-order: may I act THIS moment? Always true for free-for-all / solo. When
  // false, tile selection + submit are frozen (the InfoCol TurnStatusLine explains
  // why). Kept apart from `showInput` so a non-turn doesn't read as terminal /
  // eliminated (which would flip to the reveal view).
  isMyTurn: boolean
  // Turn-order: a teammate holds the move, so the board wears the shared dim.
  // Narrower than `!isMyTurn` — a terminal board is inactive for a different
  // reason and says so with the frame instead.
  notMyTurn: boolean
  // True for a beat as the turn arrives (the shared your-turn flash).
  myTurnJustStarted: boolean
  // The outcome the game-over frame wears, or null while the board is live.
  gameOver: TerminalOutcome | null
  // Return to the live board (the banner click / ✕).
  onExitHistory: () => void

  // ── Tile selection ──
  // tile → user_id (the inverted selections map) — the per-tile mine/peer treatment.
  ownerByTile: ReadonlyMap<string, string>
  toggleTile: (tile: string) => void
  sendClear: () => void
  // The flat union of every player's selection (coop) / the caller's (compete).
  unionTiles: string[]
  selfId: string
  colorByUserId: ReadonlyMap<string, string>
  // Coop, with somebody else in the game — where "whose pick is this?" has an
  // answer worth drawing.
  sharedBoard: boolean

  // ── Own-guess feedback ──
  // PlayArea's below-board slot. This column shows each guess's result into
  // it, and while it holds anything — a result, "you're out", whose turn,
  // the verdict — the pill takes the commit row's place. A tile click is the
  // player's next move, so it dismisses a gesture-cleared result.
  localFeedbackSlot: FeedbackSlot

  // ── Guess dispatch ──
  gameId: string
  // The guess log — for FE-side dup detection before firing submit_guess.
  guesses: EventRow[]

  // ── Below-board readout ──
  mistakeCount: number
  mistakeBudget: number
}) {
  // ─── Which board is on screen ──────────────────────────
  // Live, or a past turn's snapshot — and everything that would WRITE to the
  // board answers to it: the commands hide, the selection is not drawn, a
  // teammate's verdict is not marked. And which screen: a phone shortens the
  // commit row.
  // Viewing a past turn ⟺ there is one open (docs/playarea.md → Prop
  // conventions: one prop says so, and the flag is derived, never passed).
  const isViewingHistory = historySnap !== null
  // May I act on the board right now — click a tile, move the cursor, pick?
  const interactive = showInput && isMyTurn && !isViewingHistory
  // On a phone the below-board commit row is tight.
  const phone = useIsPhone()

  // ─── The marks this column owns ────────────────────────
  // The in-flight dim on the four tiles of a guess that is out, and the
  // verdict fill on the four of the last answered one — raised by my own
  // submit or by a teammate's row arriving, and ended by the board moving on.
  // The four tiles of a guess that is OUT — they wear the shared in-flight dim
  // until the server answers, rather than a verdict guessed locally.
  const [inFlightTiles, setInFlightTiles] = useState<ReadonlySet<string>>(NO_TILES)
  // The verdict fill on the tiles of my last guess, in the outcome its PILL
  // wears — the two are one message arriving in two places, so they share a
  // lifetime as well as a color: both last until my next action (a tile
  // click, or a tap on the pill), which is what `NO_TIMER` says. The mark
  // remembers which slot entry it belongs to (`msgId`), and below it is drawn
  // only while that entry is still in the slot — so a tap on the pill takes
  // the mark with it without this column being told. `msgId` null means the
  // mark is about somebody ELSE's guess — there is no sentence of mine for it
  // to outlive, so it lives by the board rule below instead.
  //
  // ANNOUNCED, so the mark carries both beats itself: its `attention` phase is
  // the flash saying WHERE the answer landed, and its `answer` phase — which
  // begins the instant the flash has faded — is the fill and the head-shake
  // saying what it was. Every verdict that can land ON TILES is a refusal (a
  // correct guess takes its four away and becomes a band), so the shake needs
  // no outcome test. Both raisers below go through this one call, so my own
  // answer and a teammate's read the same.
  const [verdict, showVerdict, clearVerdict] =
    useMark<BoardVerdict & { msgId: string | null }>(NO_TIMER)

  /** Show a message into the slot and fill these tiles in its outcome,
   *  replaying the shake — one message, two places. */
  function showWithVerdict(tiles: string[], feedbackMsg: FeedbackMessage) {
    const msgId = localFeedbackSlot.show(feedbackMsg)
    showVerdict(
      { tiles: new Set(tiles), outcome: feedbackMsg.outcome, msgId },
      { attention: true },
    )
  }

  // Subscribes to the slot, so the mark re-derives when its message leaves.
  const top = useTopFeedbackMessage(localFeedbackSlot)
  const verdictShown =
    verdict !== null &&
    (verdict.value.msgId === null ||
      localFeedbackSlot.peek().some((entry) => entry.id === verdict.value.msgId))

  // When the verdict mark expires. It fills four particular tiles, so it is a
  // claim about the board AS IT WAS, and it has no timer: it lives until the
  // board stops being that board, which the guess log shows. What ends it is a
  // TEAMMATE'S guess — the log grows a row somebody else wrote and the board
  // has moved on. My own row growing the log is not that: it is the tail of the
  // action that set the mark, arriving a beat later over realtime, so the test
  // asks WHO wrote the newest row. (A refused guess writes no row, so waiting
  // for mine would never end for exactly the answers worth marking.)
  //
  // Run during RENDER rather than in an effect, so the cleared mark and the
  // board that cleared it land in the same commit.
  const newestGuess = guesses.length > 0 ? guesses[guesses.length - 1] : null
  const [seenGuess, setSeenGuess] = useState({
    count: guesses.length,
    id: newestGuess?.id ?? null,
  })
  if (guesses.length !== seenGuess.count || (newestGuess?.id ?? null) !== seenGuess.id) {
    const foreign = newestGuess !== null && newestGuess.user_id !== selfId
    setSeenGuess({ count: guesses.length, id: newestGuess?.id ?? null })
    if (foreign) {
      // A TEAMMATE'S guess that did not win marks THEIR four tiles here too;
      // their own client marked the same four from its own answer a beat
      // earlier. A correct guess needs no mark: its band arrives on this render.
      const marks = !isViewingHistory && newestGuess !== null && newestGuess.outcome !== 'won'
      // Raised DURING render, legally: `show` is a plain state update, so the
      // mark and the board that earned it land in one commit.
      if (marks) {
        showVerdict(
          { tiles: new Set(newestGuess.tiles), outcome: newestGuess.outcome, msgId: null },
          { attention: true },
        )
      } else {
        clearVerdict()
      }
    }
  }

  // ─── Committing a guess ────────────────────────────────
  // The move RPC and the two commands beside it, kept with the commit row
  // they fire; a tile click is the player's next move and dismisses the last.
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (submitting || unionTiles.length !== TILES_PER_CATEGORY) return
    // The tiles as they were at SEND. The selection is cleared on the way out
    // (and a teammate can move it in coop), so every mark about this guess has
    // to carry its own copy rather than re-reading `unionTiles` afterwards.
    const sent = [...unionTiles]

    // Dup detection, local (the FE-knows model): shown into the slot, and
    // filled on the four tiles it is about.
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      const { outcome, text } = answerMessage({ answerType: 'already_tried' })
      showWithVerdict(sent, FeedbackMessage.result(outcome, text))
      // Cleared like any other answered guess, so every verdict leaves the
      // board in the same state.
      sendClear()
      return
    }

    const evaluation = evaluateGuess(unionTiles, game.board.categories)
    setSubmitting(true)
    setInFlightTiles(new Set(sent))
    // Only a match names a category. The argument is OPTIONAL rather than
    // nullable, so the other two verdicts leave it out rather than send null —
    // which is why this is a spread and not a value.
    const matchedCategory =
      evaluation.result === 'correct' ? { matched_category_rank: evaluation.rank } : {}

    // No translation on the way up: `evaluateGuess` already answers in the word
    // the column stores.
    const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', {
      target_game: gameId,
      tiles: unionTiles,
      result: evaluation.result,
      ...matchedCategory,
    }))
    setSubmitting(false)
    setInFlightTiles(NO_TILES)
    // A guess that isn't taken can be a RACE — a teammate ended the game, your
    // own concede landed first, your own fourth mistake landed — or a fault.
    // The not-ok reads as the server wrote it, and stays until its × is
    // pressed (docs/envelopes.md).
    if (res.type === 'not-ok') {
      // The move wasn't taken, so the four tiles are still sitting there
      // un-played — fill them in the pill's own outcome, whatever it is.
      showWithVerdict(sent, FeedbackMessage.notOk(res))
      return
    // One branch per recorded verdict, each asserting `data` and nothing else
    // (docs/envelopes.md → The shape of a call site) — never the value this
    // client sent up. Each shows the answer, then clears the selection.
    } else if (res.type === 'ok' && res.data.result === 'correct') {
      // A correct guess that wrote NOTHING comes back as PN300, so reaching
      // here means the match is durably recorded. No mark: these four collapse
      // into a band on this very render, leaving nothing to mark.
      const { outcome, text } = answerMessage({ answerType: 'correct' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      sendClear()
      return
    } else if (res.type === 'ok' && res.data.result === 'oneAway') {
      const { outcome, text } = answerMessage({ answerType: 'one_away' })
      showWithVerdict(sent, FeedbackMessage.result(outcome, text))
      sendClear()
      return
    } else if (res.type === 'ok' && res.data.result === 'wrong') {
      const { outcome, text } = answerMessage({ answerType: 'wrong' })
      showWithVerdict(sent, FeedbackMessage.result(outcome, text))
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

  // The board's commands. Each is ONE binding behind both its button and its
  // key, so the two can't disagree about whether it applies, and each is hidden
  // while a past turn is open: a live Submit over a frozen historical board
  // would be lying about what it can do. An incomplete selection leaves Submit
  // gray rather than firing a no-op.
  const actSubmit = useBoundAction('act-submit', {
    describe: () => {
      if (!showInput || !isMyTurn || isViewingHistory) return 'hidden'
      if (submitting) return { state: 'disabled', label: 'Submitting…' }
      return unionTiles.length === TILES_PER_CATEGORY ? 'active' : 'disabled'
    },
    run: handleSubmit,
  })

  // Clear drops the selection — and BROADCASTS, so a teammate's board drops it
  // too.
  const actClearSelection = useBoundAction('act-clear-selection', {
    describe: () => {
      if (!showInput || !isMyTurn || isViewingHistory) return 'hidden'
      return unionTiles.length === 0 ? 'disabled' : 'active'
    },
    run: sendClear,
  })

  // Tile click: dismiss any lingering own-result first (the commit buttons
  // return), then toggle the tile — the player has moved on to the next
  // selection.
  function handleToggle(tile: string) {
    // A frozen board still DRAWS its tiles (the record of where the players
    // got to), and a waiting player must not build or broadcast a selection, so
    // the guard is explicit.
    if (!showInput || !isMyTurn) return
    localFeedbackSlot.dismiss()
    // The fill goes with the pill it belongs to — one message, one dismissal.
    clearVerdict()
    toggleTile(tile)
  }

  // ─── The board's display order ─────────────────────────
  // The shuffle — purely visual, this client's own view of the same sixteen,
  // and it touches nothing else.

  // NULL = `remainingTiles` as-is (the create_game shuffle, the same for every
  // player); a permutation is this client's own view.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)

  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  // One shuffle behind both triggers (the floating pill and its key), so they
  // can't drift into rearranging different things.
  const handleShuffle = () => setLocalOrder(shuffle(displayedTiles))

  // Shuffle — a fresh visual scan of the SAME sixteen tiles, never a move (the
  // selection survives it). Not gated on `isMyTurn`: rearranging your own view
  // is not acting on the board.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => {
      if (!showInput || isViewingHistory) return 'hidden'
      return displayedTiles.length === 0 ? 'disabled' : 'active'
    },
    run: handleShuffle,
  })

  // ─── The keyboard ──────────────────────────────────────
  // The selection cursor: arrows move it over the loose tiles, and Space does
  // what a click on the tile under it does. It sits on a CELL, so a shuffle
  // moves the tiles under it, and a solved band — a row fewer — pulls it onto
  // the nearest tile left. Enter is Submit's, above.

  const shape = boardShape(displayedTiles.length)

  const { cursor, point } = useBoardSelectionCursor({
    shape,
    enabled: interactive,
    onToggle: (cell: Cell) => {
      const tile = displayedTiles[cell.y * shape.cols + cell.x]
      if (tile !== undefined) handleToggle(tile)
    },
  })

  // A tile click: the cursor moves there, hidden, and the click does its move.
  function handleTileClick(tile: string) {
    const i = displayedTiles.indexOf(tile)
    point({ x: i % shape.cols, y: Math.floor(i / shape.cols) })
    handleToggle(tile)
  }

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={shared.boardCol}>
      {/* One grid: solved categories as full-width band rows + the remaining tiles.
          While viewing, the board is the historical snapshot (bands before the turn +
          its 4 guessed tiles lit); else live (tiles only while input is live). */}
      <Board
        matched={historySnap ? historySnap.matched : matchedCategories}
        unmatched={historySnap ? [] : unmatched}
        // The tiles survive the end of the game — a finished board is your
        // bands PLUS the tiles you never cracked, frozen. They step aside only
        // for the reveal, whose bands need the rows (bands + ceil(tiles/4) is a
        // fixed row count).
        tiles={historySnap ? historySnap.tiles : solutionShown ? [] : displayedTiles}
        // A historical snapshot is a record too — never clickable. `isMyTurn` is
        // in here as well as on the click guard: a tile that hovers, lifts and
        // shows a pointer while silently swallowing the click is a promise the
        // board can't keep, and the dim beside it would be saying the opposite.
        interactive={interactive}
        // No selection is drawn on a board that can't take a move — a past
        // turn, or a player who is finished — though the broadcast state
        // itself outlives both.
        ownerByTile={isViewingHistory || !showInput ? NO_OWNERS : ownerByTile}
        onToggle={handleTileClick}
        cursor={cursor}
        inFlightTiles={inFlightTiles}
        verdict={verdictShown ? verdict : null}
        colorByUserId={colorByUserId}
        sharedBoard={sharedBoard}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
        gameOver={gameOver}
        // ATTENTION's cause, read off the log rather than off the board: how many
        // guesses the server has recorded, and whether the newest was mine.
        moveCount={guesses.length}
        isViewingHistory={isViewingHistory}
        historyLitTiles={historySnap?.historyLitTiles}
        historyLitOutcome={historySnap?.outcome}
        // Shuffle floats over the board's top-right, only while the grid is
        // shown; Board anchors it to the visual board.
        floatingControl={
          showInput &&
          !isViewingHistory && (
            <ShuffleButton
              action={actShuffle}
              tooltip="Shuffle tiles"
              className={shared.floatingShuffle}
            />
          )
        }
      />

      {/* The slot below the board: the commit row (Clear/Submit + inline mistakes)
          during play, or the feedback slot's top message — a result, "you're
          out", whose turn, the verdict — all in the same reserved height so the
          flex:1 board never shifts. While viewing a past turn the history
          banner overlays it. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, isViewingHistory && history.historyBannerHost)}>
          {isViewingHistory && historySnap && (
            <HistoryBanner
              label={historySnap.historyLabel}
              actor={historyActor}
              onExit={onExitHistory}
            />
          )}
          {/* One slot, one pill: whatever ranks highest in it. A tap on a
              gesture-cleared result dismisses it, and the fill above leaves
              with it — the two are one message, so they end together. */}
          {top !== null ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
            </div>
          ) : (
              <div className={styles.moveArea}>
                {/* The caller's OWN mistakes — the team's one count in coop.
                    A phone drops "(lose at 4)": the strike marks already show
                    the budget. */}
                <div className={styles.mistakesInline}>
                  {phone ? 'Mistakes' : 'Mistakes (lose at 4)'}{' '}
                  <StrikeMarks used={mistakeCount} total={mistakeBudget} />
                </div>
                <ActionButton
                  action={actClearSelection}
                  show={phone ? 'icon' : 'both'}
                  className={styles.inputButton}
                />
                <ActionButton
                  action={actSubmit}
                  show={phone ? 'icon' : 'both'}
                  weight="primary"
                  className={styles.inputButton}
                />
              </div>
          )}
        </div>
      </div>
    </div>
  )
}
