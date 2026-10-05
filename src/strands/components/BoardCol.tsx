// cs-fixed-outcome-fix

import { useEffect } from 'react'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useBindAction } from '@/common/actions/useBindAction'
import { useMark } from '@/common/board-marks/useMark'
import { AMBIGUOUS_PICK_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import { WordEntryRow } from '@/common/word-entry/WordEntryRow'
import { WordEntryInput } from '@/common/word-entry/WordEntryInput'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { coordKey, coordOf, makeLetterRows, type Coord } from '../lib/board'
import { BOARD_SHAPE, cellAt, coordAt } from '../lib/boardShape'
import { hintShortfallText } from '../lib/hintCopy'
import { typeLetter } from '../lib/trace'
import { useTrace } from '../hooks/useTrace'
import type { GBoard, GGameData, GHistoryView, GResult, GTile, GWord } from '../types'
import { Board } from './Board'
import { HintBar } from './HintBar'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'

/** No tiles — the resting value of the ambiguous-letter mark, reused so a
 *  render without one passes a stable empty list. */
const NO_TILES: GTile[] = []

/** What `submit_path` answers: the verdict, and my hint bar after the move. */
type SubmitAnswer = { result: GResult; hint_points: number }

/** What `spend_hint` answers: one `ok`, and the ring lands with the blobs. */
type HintAnswer = { result: 'hinted' }

/** A word as the coordinate-based `<Board>` draws it. */
function toFoundPath(w: GWord) {
  return { path: w.tiles.map(coordOf), isSpangram: w.spangram }
}

/**
 * strands' board column: the grid, the word-entry-row / pill slot, and the
 * hint bar — and the move, which it builds and sends: tile clicks and typed
 * letters become a trace (`useTrace`), and Submit or Enter sends it to
 * `submit_path`.
 *
 * `PlayArea` hands it **the board to show** — the live one OR a past turn's —
 * and the words the reveal draws in gray. That split is what makes the
 * turn-history viewer a drop-in: viewing a past turn is just "draw this
 * board", with the input path frozen.
 *
 * The **word-entry row and the pill share one fixed-height slot** because they
 * are mutually exclusive in time — you are either building a word or reading
 * what the last one did. (The same swap `<WordEntryArea>` makes.)
 *
 * The **hint bar lives here rather than in the info column**, deliberately: on
 * a phone the info column goes off-canvas into the InfoSheet, and the hint
 * economy is core play, not a readout you check occasionally.
 */
export function BoardCol({
  gd,
  shownBoard,
  missedWords,
  historyView,
  localFeedbackSlot,
}: {
  gd: GGameData
  // The board to show — PlayArea picks it: a past turn's while the history
  // viewer is open, the live one otherwise.
  shownBoard: GBoard
  // The words my board did not find, while the solution is shown; else empty.
  missedWords: GWord[]
  historyView: GHistoryView
  // PlayArea's below-board slot. While it holds a message — a move's result,
  // the theme prompt, whose turn, the verdict — the pill takes the word-entry
  // row's place.
  localFeedbackSlot: FeedbackSlot
}) {
  // ─── Which board is on screen ─────────────────────────────────
  // Live, or a past turn's (PlayArea picks); everything that would write to the
  // board answers to it.

  // The board responds to me: the move is mine, on the live board (a click
  // over a past turn leaves history instead). strands does not draft off-turn,
  // so submitting asks what picking asks.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  // ─── The pending move ─────────────────────────────────────────
  // The word being traced (`useTrace`), its trip to the server, the hint, and
  // the column's keys.

  const trace = useTrace(gd)

  // Send the trace. The send is this action's run, so its `pending` is the
  // word in flight — the one in-flight guard every other control here asks.
  const canSubmit = isInteractive && trace.tiles.length > 0
  const actSubmit = useBindAction('act-submit', {
    describe: () => (canSubmit ? 'active' : 'disabled'),
    run: () => {
      // The cursor goes to the word's last letter, and hides.
      setCursorTo(cellAt(coordOf(trace.tiles[trace.tiles.length - 1]!)))
      return submitTrace(trace.tiles)
    },
  })

  // May I pick or take back a tile right now? The board responds to me, and no
  // word is with the server.
  const canPick = isInteractive && !actSubmit.pending

  /** Send a trace to `submit_path` and say what it got. */
  async function submitTrace(tiles: readonly GTile[]) {
    const res = await runRpc<SubmitAnswer>(db.rpc('submit_path', {
      p_game_id: gd.id,
      p_path: tiles.map(coordOf),
    }))
    // A refusal here is NOT a verdict on the word — the six verdicts are all
    // `ok`. It is a trace this board could not have produced (a fault), or a
    // move somebody else overtook: `Crosses a found word` when a teammate's
    // find lands on tiles you were drawing through, `Game over`, `Not your
    // turn`. Either way the trace goes, because it no longer describes anything
    // on the board.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      trace.clear()
      return
    } else if (res.type === 'ok') {
      // ONE branch over the six: `answerMessage` says each one's words and
      // outcome. What the six differ on here is the trace, below.
      const word = tiles.map((t) => t.letter).join('')
      const { result } = res.data
      const answer = result === 'hint_word'
        ? { answerType: result, word, filledBar: res.data.hint_points >= gd.hintBarData.hintCost }
        : { answerType: result, word }
      const message = answerMessage(answer)
      localFeedbackSlot.show(FeedbackMessage.result(message.outcome, message.text))
      // Only a found word keeps its tiles: they stay lit as the trace until
      // the blob lands and `useTrace`'s derived clear hands them over to their
      // found colors — no blank flash in between. Everything else clears at
      // once.
      if (result !== 'theme' && result !== 'spangram') trace.clear()
      return
    } else {
      reportUnhandled('submit_path', res)
      trace.clear()
      return
    }
  }

  // The ambiguous-letter flash: a typed letter matched several tiles, so they
  // ring red for a beat and the player clicks the one they meant.
  const [ambiguousMark, flashAmbiguous, clearAmbiguous] =
    useMark<{ tiles: GTile[] }>(AMBIGUOUS_PICK_FLASH_MS)
  const ambiguousTiles = ambiguousMark?.value.tiles ?? NO_TILES

  /** A click on a tile, or Space on the cursor's: the trace's move. */
  function pickTile(tile: GTile) {
    // A click while replaying returns to live rather than starting a trace on
    // a board that isn't the current one.
    if (historyView.isViewing) {
      historyView.exit()
      return
    }
    if (!canPick) return
    localFeedbackSlot.dismiss() // a click is the next move, like a keystroke
    // A click ANSWERS the ambiguous-letter question, so the red rings go now.
    clearAmbiguous()
    trace.click(tile)
  }

  // The keyboard's selection cursor: arrows move a ring over the letters, and
  // Space is a CLICK on the ringed one. A typed letter or a submitted word
  // moves it to the trace's end and hides it, as a click does.
  const { cell: cursor, setTo: setCursorTo } = useBoardSelectionCursor({
    shape: BOARD_SHAPE,
    enabled: canPick,
    onToggle: (cell) => pickTile(gd.puzzle.tilesById[coordKey(coordAt(cell))]!),
  })

  /** A click on a letter: the cursor moves there, hidden, and the click does
   *  its move. */
  function clickAt(at: Coord) {
    setCursorTo(cellAt(at))
    pickTile(gd.puzzle.tilesById[coordKey(at)]!)
  }

  // Take a tile back — the ⌫ button and Backspace, one action. DISABLED rather
  // than hidden where it doesn't apply, so the row keeps its slot — and a
  // disabled action leaves its key for whoever else wants it, which is how the
  // history viewer gets Backspace.
  const canDelete = canPick && trace.tiles.length > 0
  const actDropLastCell = useBindAction('act-drop-last-cell', {
    describe: () => (canDelete ? 'active' : 'disabled'),
    run: () => {
      localFeedbackSlot.dismiss()
      trace.dropLast()
    },
  })

  // Any key dismisses the last result, matching every other game. A watcher
  // that claims nothing, so the same press still traces its letter.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // A letter EXTENDS the trace, if exactly one tile that could come next bears
  // it (`typeLetter`, lib/trace.ts). A pattern action, so it is handed
  // whichever letter fired it.
  useBindAction('act-extend-trace', {
    describe: () => (canPick ? 'active' : 'disabled'),
    run: (key) => {
      if (!key) return
      const r = typeLetter(trace.tiles, key, gd.puzzle.tiles, trace.consumedTileIds)
      if (r.kind === 'extend') {
        // Same as a click: this keystroke resolved things, so any rings from a
        // previous one stop pointing.
        clearAmbiguous()
        trace.extend(r.tile)
        // The cursor goes with the typed letter, and hides.
        setCursorTo(cellAt(coordOf(r.tile)))
      } else if (r.kind === 'ambiguous') {
        // No message here on purpose: that row IS the entry area, so a pill
        // would hide the word being built to say something the board says
        // better. The red rings ARE the message.
        flashAmbiguous({ tiles: r.candidates })
      } else {
        // Nothing matched: nothing on the board to point at, and nearly always
        // a mistake rather than a choice — so it gets words.
        localFeedbackSlot.show(
          FeedbackMessage.result(
            'lost',
            trace.tiles.length
              ? `No “${key.toUpperCase()}” next to that letter`
              : `No “${key.toUpperCase()}” left on the board`,
          ),
        )
      }
    },
  })

  // Cash a hint — the hint bar's button, and nothing else.
  //
  // Live on an UNFILLED bar on purpose. Clicking early is a question — "how many
  // more?" — and a dead button refuses to answer, so the run says the number in
  // the slot instead. A hint already on the board is the one state that does
  // gray it: the board can only ring one word legibly, and the server refuses a
  // second anyway. Not turn-gated: spending a hint is a team decision, not a
  // move.
  const hintShowing = gd.me.board.hintTiles !== null
  async function spendHint() {
    const short = gd.hintBarData.hintCost - gd.hintBarData.hintPoints
    if (short > 0) {
      localFeedbackSlot.show(FeedbackMessage.result('warning', hintShortfallText(short)))
      return
    }
    const res = await runRpc<HintAnswer>(db.rpc('spend_hint', { p_game_id: gd.id }))
    // Its refusals are the SHARED POOL moving between the check above and this
    // call — a teammate filled the bar, spent it, or ringed a word.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hinted') {
      // Nothing to say: the ring lands on the board with the blob.
      return
    } else {
      reportUnhandled('spend_hint', res)
      return
    }
  }
  const actHint = useBindAction('act-hint', {
    describe: () => {
      const { hintPoints, hintCost } = gd.hintBarData
      if (!gd.me.stillPlaying || actSubmit.pending || historyView.isViewing || hintShowing) {
        return { state: 'disabled', tooltip: hintShowing ? 'A hint is already showing' : undefined }
      }
      return hintPoints >= hintCost
        ? { state: 'active', tooltip: 'Reveal the tiles of one theme word' }
        : {
          state: 'active',
          tooltip: `Find ${hintCost - hintPoints} more valid word${hintCost - hintPoints === 1 ? '' : 's'}`,
        }
    },
    run: spendHint,
  })

  // The THEME, quoted, on an untouched board — what an empty slot says before
  // anything has happened. The prompt also sits in the info column, but that
  // column is off-canvas on a phone. It leaves the moment a trace begins (the
  // entry needs the row) and comes back if that trace is taken back or
  // rejected, until the first row is logged — a `prompt`, which everything
  // else outranks.
  const isUntouched = gd.events.length === 0 && trace.tiles.length === 0
  const title = gd.puzzle.title
  useEffect(function showThemeTitle() {
    if (!isUntouched) return
    const id = localFeedbackSlot.show(FeedbackMessage.prompt(`“${title}”`))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isUntouched, title])

  // ─── Render ───────────────────────────────────────────────────

  const letters = makeLetterRows(gd.puzzle.tiles)
  const topMessage = useWatchAndGetTopFeedbackMsg(localFeedbackSlot)

  return (
    <div className={shared.boardCol}>
      <Board
        board={letters}
        found={shownBoard.words.map(toFoundPath)}
        // The missed-word reveal is a game-end artifact — drawing it on a past
        // turn's board would mix the endgame's gray lines into a board that
        // hadn't reached it.
        missed={historyView.isViewing ? [] : missedWords.map((w) => w.tiles.map(coordOf))}
        trace={historyView.isViewing ? [] : trace.tiles.map(coordOf)}
        // A hint rings its tiles with no connecting line — it never gave you
        // the order. Live, it's the ringed hint on my board; replaying, the
        // hint the viewed turn spent.
        hintCoords={shownBoard.hintTiles?.map(coordOf) ?? null}
        onTileClick={clickAt}
        cursor={cursor}
        // Not `!canPick`: over a past turn the letters stay live, because a
        // click there is how the board goes back to the live one.
        disabled={!gd.me.onTurn || actSubmit.pending}
        isViewingHistory={historyView.isViewing}
        historyLitTiles={historyView.litTiles.map(coordOf)}
        ambiguous={historyView.isViewing ? [] : ambiguousTiles.map(coordOf)}
      />

      {/* While replaying, the banner takes the entry/pill slot: what you want
          there is "which turn am I looking at". `bannerHost` only WHILE
          VIEWING — the banner is `position: absolute; inset: 0` and needs a
          positioning context. */}
      <div className={cls(styles.echoSlot, historyView.isViewing && history.historyBannerHost)}>
        {historyView.isViewing ? (
          <HistoryBanner label={historyView.label!} actor={historyView.actor} onExit={historyView.exit} />
        ) : topMessage !== null ? (
          <FeedbackPill slot={localFeedbackSlot} />
        ) : (
          /* The shared word-entry row (docs/playarea.md → Text entry) around the
             traced word. strands can't use <WordEntryArea>: its string is
             DERIVED from the trace, so `value`/`onChange` run backwards. On a
             phone the Submit button is the ONLY way to send a word. */
          <WordEntryRow className={styles.wordEntryRow} actDelete={actDropLastCell} actSubmit={actSubmit}>
            <WordEntryInput value={trace.tiles.map((t) => t.letter).join('')} className={styles.echo} />
          </WordEntryRow>
        )}
      </div>

      <HintBar
        points={gd.hintBarData.hintPoints}
        cost={gd.hintBarData.hintCost}
        showing={hintShowing}
        actHint={actHint}
      />
    </div>
  )
}
