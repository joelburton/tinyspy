// cs-met-connections

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useState } from 'react'
import { cls } from '@/common/utils/cls'
import { useFlash } from '@/common/board-marks/useFlash'
import {
  ATTENTION_FADE_MS,
  ATTENTION_FLASH_MS,
  VERDICT_SHAKE_MS,
} from '@/common/board-marks/feedbackTiming'
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
import { db } from '../db'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { answerMessage, type GuessResult } from '../lib/answer'
import { reconcileLocalOrder } from '../lib/localOrder'
import { shuffle } from '@/common/utils/shuffle'
import type { ConnectionsGame, EventRow, MatchedCategory } from '../hooks/useGame'
import type { Category } from '../lib/board'
import type { HistorySnapshot } from '../lib/history'
import { Board, type BoardVerdict } from './Board'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './PlayArea.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Empty selection map — the board draws no selection while viewing a past turn. */
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

/** Empty tile set — the resting value of the in-flight mark. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * connections's board column — the `<Board>` (one grid of bands + tiles) with the
 * floating Shuffle, plus the fixed-height below-board slot (the turn-viewer
 * banner, the Clear/Submit commit row + inline mistakes, or the local feedback
 * slot's top message — an own-guess result, "you're out", whose turn, the
 * verdict).
 *
 * This is the **input engine**: the local board shuffle, the in-flight + verdict
 * marks on the guessed tiles, and —
 * because the guess is a board gesture with its result via realtime (no deep
 * entangled state) — the `submit_guess` RPC, kept beside the commit row it fires.
 * The tile SELECTION itself lives in `useGame` (it's broadcast-coupled to the coop
 * realtime channel), so PlayArea passes the selection primitives (`ownerByTile` /
 * `toggleTile` / `sendClear` / `unionTiles`) DOWN and this column renders + commits
 * them. Like the other games' BoardCol it does NOT own the game state: PlayArea hands
 * it **the board to render** (live OR a `snap` snapshot) + `isViewingHistory`, which is what
 * makes the turn-history viewer a drop-in. Own-guess results show into PlayArea's
 * local slot, the same slot InfoCol's End / Concede and PlayArea's standing
 * conditions show into. See docs/playarea.md.
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
type GuessAnswer = { result: GuessResult }

export function BoardCol({
  // ── Board to render (live OR a historical snapshot — PlayArea picks via `snap`) ──
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
  // Categories revealed at game-end (loss / elimination); `[]` during play.
  unmatched: Category[]
  // Is the ANSWER on the board right now (the terminal reveal)? The four
  // unsolved categories take the loose tiles' place while it's on, and the
  // tiles come back when it's off — see the `tiles` prop below.
  solutionShown: boolean
  // The viewed turn's snapshot, or null when live — PlayArea reconstructs it.
  historySnap: HistorySnapshot | null
  /** Whose board is on screen, when it is not the viewer's own. */
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
  // Coop, with somebody else in the game — the only case where "whose pick is
  // this?" is a question the board can usefully answer.
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
  // Viewing a past turn ⟺ there is one open (docs/playarea.md → Prop
  // conventions: one prop says so, and the flag is derived, never passed).
  const isViewingHistory = historySnap !== null
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
  // The verdict ring on the tiles of my last guess, in the outcome its PILL
  // wears — the two are one message arriving in two places, so they share a
  // lifetime as well as a color: both last until my next action (a tile
  // click, or a tap on the pill). The ring remembers which slot entry it
  // belongs to (`msgId`), and below it is drawn only while that entry is
  // still in the slot — so a tap on the pill takes the ring with it without
  // this column being told. See plans/tile-feedback.md → Every mark has a
  // lifetime.
  // `msgId` is the local message this mark belongs to, and `null` means the mark
  // is about somebody ELSE's guess — there is no sentence of mine for it to
  // outlive, so it lives by the board rule below instead.
  const [verdict, setVerdict] = useState<(BoardVerdict & { msgId: string | null }) | null>(null)
  // Bumped per verdict so the ring's shake replays on a repeat (Board keys the
  // ringed tiles on it). State rather than a ref because one of the two places
  // that raises a mark runs during render, where a ref may not be touched — and
  // both raises take their number from here, so a peer's mark and my own can
  // never collide on one and swallow a shake.
  const [verdictSeq, setVerdictSeq] = useState(0)

  /** Show a message into the slot and ring these tiles in its outcome,
   *  replaying the shake — one message, two places. */
  function showWithVerdict(tiles: string[], feedbackMsg: FeedbackMessage) {
    const msgId = localFeedbackSlot.show(feedbackMsg)
    setVerdictSeq(verdictSeq + 1)
    setVerdict({
      tiles: new Set(tiles),
      outcome: feedbackMsg.outcome,
      nonce: verdictSeq + 1,
      msgId,
    })
  }
  // The two beats a verdict gets on the board, in order: the attention flash says
  // WHERE the answer landed, and once it has faded the head-shake says the answer
  // was no. Both are raised here, off whichever path set the verdict — my own
  // submit, or a teammate's row arriving — so they read the same either way.
  const [attentionTiles, flashAttention] = useFlash<string>(ATTENTION_FLASH_MS)
  const [shakenTiles, shakeTiles] = useFlash<string>(VERDICT_SHAKE_MS)
  useEffect(function flashThenShake() {
    if (verdict === null) return
    flashAttention(verdict.tiles)
    // Every verdict that can land ON TILES is a refusal — a correct guess takes
    // its four away and becomes a band — so the shake needs no outcome test.
    const timer = setTimeout(() => shakeTiles(verdict.tiles), ATTENTION_FADE_MS)
    return () => clearTimeout(timer)
  }, [verdict, flashAttention, shakeTiles])

  // Subscribes to the slot, so the ring re-derives when its message leaves.
  const top = useTopFeedbackMessage(localFeedbackSlot)
  const ringShown =
    verdict !== null &&
    (verdict.msgId === null ||
      localFeedbackSlot.peek().some((entry) => entry.id === verdict.msgId))

  // ─── When the verdict mark expires ──────────────────────────────────────
  //
  // The mark rings four particular tiles, so it is a claim about the board AS IT
  // WAS. It has no timer: it lives until the board stops being that board, and
  // the guess log is where that shows up. What ends it is a TEAMMATE'S GUESS —
  // the log grows a row somebody else wrote, the board has moved on, and a mark
  // still sitting on it now claims to be about the move that just happened.
  //
  // MY OWN row growing the log is not that: it is the tail of the very action
  // that set the mark, arriving a beat later over realtime. So the test asks WHO
  // wrote the newest row, not just whether the log changed.
  //
  // A RESTART used to be the other half of this — every guess deleted, so the
  // log shrank — and is not handled here any more: the page unmounts this whole
  // surface when the run changes, on every client (common/game-page/doc.md).
  //
  // It deliberately does NOT wait for my own row to arrive as a signal that the
  // guess is done: a refused guess (PN300 / PN301) writes no row at all, so that
  // signal would never come for exactly the answers worth marking.
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
    const foreign = newestGuess !== null && newestGuess.user_id !== selfId
    setSeenGuess({ count: guesses.length, id: newestGuess?.id ?? null })
    if (foreign) {
      // A TEAMMATE'S guess that did not win: mark THEIR four tiles for everyone,
      // because "no" is news to the whole table — those four are now the four
      // nobody should try again, and the player who learns it last is the one
      // about to pick them. A correct guess needs no mark: its band arrives and
      // says the same thing in more detail.
      //
      // Their own client shows this as their own verdict, from their own answer,
      // a beat earlier; this is the same mark reaching everyone else.
      const marks = !isViewingHistory && newestGuess !== null && newestGuess.outcome !== 'won'
      setVerdictSeq(verdictSeq + 1)
      setVerdict(
        marks
          ? {
              tiles: new Set(newestGuess.tiles),
              outcome: newestGuess.outcome,
              nonce: verdictSeq + 1,
              msgId: null,
            }
          : null,
      )
    }
  }

  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  // One shuffle behind both triggers (the floating pill and ⌥Z), so they can't
  // drift into rearranging different things — they are one binding now.
  const handleShuffle = () => setLocalOrder(shuffle(displayedTiles))

  async function handleSubmit() {
    if (submitting || unionTiles.length !== 4) return
    // The tiles as they were at SEND. The selection is cleared on the way out
    // (and a teammate can move it in coop), so every mark about this guess has
    // to carry its own copy rather than re-reading `unionTiles` afterwards.
    const sent = [...unionTiles]

    // Dup detection (FE-side per the FE-knows model). My own action, so it
    // shows locally (clicking a tile dismisses it) — and the ring goes on the
    // four tiles it is about, in the pill's amber. A refusal is the one
    // verdict whose pill I might not be looking at: my eyes are on the board,
    // having just clicked four tiles there.
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      const { outcome, text } = answerMessage({ answerType: 'already_tried' })
      showWithVerdict(sent, FeedbackMessage.result(outcome, text))
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
      // un-played — ring them in the PILL'S OWN OUTCOME, no translation. This
      // used to squeeze seven outcomes into three by hand (`=== 'warning' ?
      // 'warning' : 'lost'`), which painted anything it did not recognize red;
      // the tile vocabulary is complete now, so the two cannot disagree.
      showWithVerdict(sent, FeedbackMessage.notOk(res))
      return
    // Own result in the commit slot, then clear the selection — the result
    // shows over the cleared board; clicking a tile dismisses it
    // (handleToggle) and starts the next guess.
    //
    // `sendClear()` is called from each branch that takes the move rather than
    // once after the chain. It serves four of the five answers and NOT the
    // refusal above, which keeps the four tiles selected because the move was
    // not taken — and a statement at the bottom would have to be reasoned about
    // branch by branch to see that (docs/envelopes.md → The shape of a call site).
    //
    // The ring follows the pill's outcome, and only where there is something
    // left to ring: a correct guess's four tiles collapse into a band on this
    // very render, so a mark on them would have nothing to land on.
    //
    // One branch per recorded verdict, each asserting `data` and nothing else.
    // The FE computed these three itself and sent the answer up — but reading
    // its own value back to pick a branch would be choosing an `ok` case by
    // something the envelope did not say, so the RPC names each one.
    } else if (res.type === 'ok' && res.data.result === 'correct') {
      // A correct guess that wrote NOTHING comes back as PN300, so reaching
      // here means the match is durably recorded. No mark: these four collapse
      // into a band on this very render, leaving nothing to ring.
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

  // ─── The board's three commands ────────────────────────
  // Each is ONE binding behind both its button and its key, so the two can't
  // disagree about whether it applies. All three are hidden while a past turn is
  // open — not to give the viewer its keystroke (the dispatcher does that: an
  // any-key action is a MODE and outranks a particular key), but because a live
  // Submit over a frozen historical board would be lying about what it can do.
  //
  // Enter submits the current selection from ANYWHERE on the board, not just
  // when a tile happens to hold keyboard focus. (macOS doesn't focus a <button>
  // on click, so a per-tile Enter never fired after mouse selection — the whole
  // "click four tiles, hit Return" flow was dead.) An incomplete selection
  // leaves it gray rather than firing a no-op.
  const actSubmit = useBoundAction('act-submit', {
    describe: () => {
      if (!showInput || !isMyTurn || isViewingHistory) return 'hidden'
      if (submitting) return { state: 'disabled', label: 'Submitting…' }
      return unionTiles.length === 4 ? 'active' : 'disabled'
    },
    run: handleSubmit,
  })

  // Clear drops the selection — and BROADCASTS, so a teammate's board drops it
  // too. Its ⌫ comes with the action.
  const actClearSelection = useBoundAction('act-clear-selection', {
    describe: () => {
      if (!showInput || !isMyTurn || isViewingHistory) return 'hidden'
      return unionTiles.length === 0 ? 'disabled' : 'active'
    },
    run: sendClear,
  })

  // ⌥Z shuffles — a fresh visual scan of the SAME sixteen tiles, never a move
  // (the selection survives it). Not gated on `isMyTurn`: rearranging your own
  // view is not acting on the board.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => {
      if (!showInput || isViewingHistory) return 'hidden'
      return displayedTiles.length === 0 ? 'disabled' : 'active'
    },
    run: handleShuffle,
  })

  // Tile click: dismiss any lingering own-result first (the commit buttons
  // return), then toggle the tile — connections's analog of "typing dismisses
  // the entry's result" (the player has moved on to the next selection).
  function handleToggle(tile: string) {
    // Turn-order: a waiting player can't build (or broadcast) a selection — the
    // tile toggle is shared over Broadcast in coop, so freezing it here keeps a
    // non-current player from nudging teammates' boards.
    // A frozen board still DRAWS its tiles now (they're the record of where the
    // players got to), so the guard that used to be implicit — no tiles, no
    // clicks — has to be explicit.
    if (!showInput || !isMyTurn) return
    localFeedbackSlot.dismiss()
    // The ring goes with the pill it belongs to — one message, one dismissal.
    setVerdict(null)
    toggleTile(tile)
  }

  return (
    <div className={shared.boardCol}>
      {/* One grid: solved categories as full-width band rows + the remaining tiles.
          While viewing, the board is the historical snapshot (bands before the turn +
          its 4 guessed tiles ringed); else live (tiles only while input is live). */}
      <Board
        matched={historySnap ? historySnap.matched : matchedCategories}
        unmatched={historySnap ? [] : unmatched}
        // The tiles survive the end of the game — a finished board is your
        // bands PLUS the ones you never cracked, frozen, which is the only
        // record of how far you got. They step aside only for the reveal, whose
        // bands need the rows (bands + ceil(tiles/4) is a fixed row count).
        tiles={historySnap ? historySnap.tiles : solutionShown ? [] : displayedTiles}
        // A historical snapshot is a record too — never clickable. `isMyTurn` is
        // in here as well as on the click guard: a tile that hovers, lifts and
        // shows a pointer while silently swallowing the click is a promise the
        // board can't keep, and the dim beside it would be saying the opposite.
        interactive={showInput && isMyTurn && !isViewingHistory}
        // Nobody is building a move on a board that can't take one, so the
        // selection is not drawn on one: not in the history viewer (a past turn
        // is a record), and not once this player is finished — the game over,
        // eliminated, or conceded. The selection state itself is ephemeral
        // broadcast chatter that outlives all three, and a frozen board wearing
        // black selection borders reads as a move still in progress.
        ownerByTile={isViewingHistory || !showInput ? NO_OWNERS : ownerByTile}
        onToggle={handleToggle}
        inFlightTiles={inFlightTiles}
        verdict={ringShown ? verdict : null}
        attentionTiles={attentionTiles}
        shakenTiles={shakenTiles}
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
        historyLitResult={historySnap?.result}
        // Shuffle floats over the board's top-right — a fresh visual scan of the
        // SAME tiles (not a turn action). Only while the grid is shown. Passed
        // into Board so it anchors to the visual board, not the column.
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
              gesture-cleared result dismisses it, and the ring above leaves
              with it — the two are one message, so they end together. */}
          {top !== null ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
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
