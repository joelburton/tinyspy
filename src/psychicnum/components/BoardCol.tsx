// cs-blessed-psychicnum

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { ActionButton } from '@/common/actions/ActionButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { db } from '../db'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import type { TileResults } from '../lib/tileResults'
import { answerMessage, type Answer } from '../lib/answer'
import { boardShape } from '../lib/boardShape'
import { Board } from './Board'
import { StateLine } from './StateLine'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import historyViewerStyles from '@/common/event-log/historyViewer.module.css'
import { shuffle } from '@/common/utils/shuffle'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** What `psychicnum.submit_guess` puts in `data` — the caller's own result,
 *  plus whether that guess completed the set. Every `ok` this RPC answers
 *  carries one; its refusals are all `not-ok`. */
type GuessAnswer = { result: 'hit' | 'miss'; found_all: boolean }

/**
 * psychicnum's board column — the `Board` (with the floating Shuffle) plus the
 * fixed-height below-board slot under it (the turn-viewer banner, Clear and
 * Submit, or the local feedback slot's top message: an own-move result, the
 * whose-turn note, the verdict).
 *
 * This is the **input engine**: the picked word (a tile click, or the keyboard's
 * selection cursor and Space — `useBoardSelectionCursor`), the local board
 * shuffle, and — because the guess is a board gesture with its result arriving
 * via realtime (no deep entangled state) — the `submit_guess` RPC itself, kept
 * beside the Submit that commits it. Like the other games'
 * BoardCol it does NOT own the game state: PlayArea hands it **the board to render**
 * (the live `tileResults` OR a historical snapshot) and the viewed turn's label, from
 * which it derives `isViewingHistory` — which is what makes the turn-history
 * viewer a drop-in. The local feedback slot is PlayArea's (its
 * standing conditions and InfoCol's Hint / Spoiler / Stop also show into it);
 * this column shows the guess results and draws it. See docs/playarea.md.
 */
export function BoardCol({
  // ── The game ──
  gd,
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  tileResults,
  // ── History viewer (its overlay lives in the below-board region) ──
  historyView,
  // ── Guess dispatch (this column owns submit_guess) ──
  localFeedbackSlot,
  endingOutcome,
  myTurnJustStarted,
}: {
  // ── The game ──
  // The game data: the board's words, where I stand, who decided each tile,
  // how many guesses have been made, and the counts for the mobile status bar.
  gd: GameData

  // ── Board to render ──
  // Guessed words → was-it-a-secret — the live map OR a snapshot's (PlayArea picks).
  tileResults: TileResults

  // ── History viewer ──
  // The past turn open on the board, if any: its label drives the banner, its
  // lit word rings a tile, and its exit is the banner's ✕.
  historyView: HistoryView

  // ── Guess dispatch ──
  // PlayArea's below-board slot. This column shows the guess results into it
  // (Correct / Wrong / a rejected guess) and draws its top.
  localFeedbackSlot: FeedbackSlot

  // ── Board-scope marks (see `<Board>`) ──
  // How the ending that applies to me came out — frames the board in that
  // outcome's color.
  endingOutcome: EndOutcome | null
  // True for a beat as the turn becomes mine — the frame flashes.
  myTurnJustStarted: boolean
}) {
  // ─── Which board is on screen ──────────────────────────
  // Live, or a past turn's snapshot. PlayArea has already picked which `tileResults`
  // to hand down, so this column only needs to know WHICH it got — and then
  // everything that would WRITE to the board answers to it: the tiles go inert,
  // the pick and the in-flight dim are dropped, the keys and Clear/Submit
  // go inert, and the banner overlays the slot.

  // Viewing a past turn ⟺ there is one open (docs/playarea.md → Prop
  // conventions: one prop says so, and the flag is derived, never passed).
  const isViewingHistory = historyView.viewedEventId !== null

  // May I pick (or clear) a word right now, and may I guess it? A past turn on
  // screen blocks both: any click or key there leaves history.
  const canPick = gd.standing.isBoardInteractive && !isViewingHistory
  const canCommit = gd.standing.isMyTurn && !isViewingHistory

  // ─── The picked word ───────────────────────────────────
  // The guess being built, and everything that reads it. A tile click and the
  // keyboard's Space are the same gesture as far as this column is concerned:
  // both go through `choosePickedWord`.

  const [pickedWord, setPickedWord] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The word I last sent, or null. It outlives the guess: nothing clears it when
  // the result lands, so what is still in flight is derived below.
  const [submittedWord, setSubmittedWord] = useState<string | null>(null)
  // Its result is on the board. The SERVER'S answer is what ends the flight —
  // once the word is in `tileResults` it is decided, whatever this component still
  // remembers — and deriving it, rather than clearing the state, means no branch
  // can leave a dim stuck on a tile forever.
  const submittedLanded = submittedWord !== null && tileResults.has(submittedWord)
  // The word with the server, whose tile takes the shared in-flight dim; null
  // when nothing is out. Held until the RESULT lands rather than until the RPC
  // resolves: the reply and the colored row are two separate events, and
  // un-dimming at the first would flash an undecided tile back to normal.
  //
  // Two cases where this reads "in flight" for a word that is not: a past turn's
  // snapshot cannot contain a word guessed after it, which the `<Board>` call
  // below gates on `isViewingHistory`; and a restart empties `tileResults` entirely,
  // which needs no gate because the page unmounts this whole surface when the
  // run changes (common/game-page/doc.md).
  const inFlightWord = submittedLanded ? null : submittedWord

  // Drawn only while I can still play: a pick means "the move I am
  // building", and a finished board or a player out of the race builds
  // nothing — so a tile picked just before that moment must not keep the
  // border, since nothing else would ever take it off. Waiting my turn is not
  // that: the pick stays for when the turn comes back.
  const drawnPick = gd.standing.isStillPlaying ? pickedWord : null

  // The player chooses a word (or un-chooses it, with null). That is their next
  // action, so it also dismisses a gesture-cleared result — unlike a plain
  // `setPickedWord`, which submitGuess calls directly so as not to dismiss the
  // result it is about to show.
  const choosePickedWord = useCallback(
    (word: string | null) => {
      localFeedbackSlot.dismiss()
      setPickedWord(word)
    },
    [localFeedbackSlot],
  )

  // ─── Committing a guess ────────────────────────────────

  // Every submit clears the pick and shows its answer in the below-board slot's
  // already-claimed space, never a new line that would reflow the board.
  const submitGuess = async () => {
    // Every answer this function has reaches the player the same way: one
    // `Answer` in, its words and its color out of `lib/answer.ts`.
    function show(answer: Answer) {
      const { outcome, text } = answerMessage(answer);
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text));
    }

    const guess = pickedWord
    if (guess === null) return
    setPickedWord(null)
    // A refusal the board can make itself, because it is face-up and its
    // results are already here: a teammate may have guessed the word since I
    // picked it. It never reaches the server; the server keeps the check, and
    // its answer is then a race rather than a verdict (docs/envelopes.md →
    // "was anything local consulted first?"). `tileResults` is scoped exactly as
    // the server's check is — everyone's guesses in coop, the caller's own in
    // compete, since RLS never shows more.
    if (tileResults.has(guess)) {
      show({ answerType: 'already_guessed' })
      return
    }
    setSubmitting(true)
    setSubmittedWord(guess)
    // `result` is the caller's OWN answer and nothing else. Whether the game
    // ended rides beside it in `found_all`, which this surface ignores: every
    // game ending reaches us by realtime, and a hit that empties the
    // budget is still a hit to the person who made it. That is also why the two
    // result branches below cover THREE server returns (the win, the guess that
    // spends the last of the budget, and the ordinary one) — they differ in what
    // they did to the game, not in what they did for the player.
    const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', { p_game_id: gd.gameId, p_guess: guess }))
    setSubmitting(false)
    if (res.type === 'not-ok') {
      setSubmittedWord(null)
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data.result === 'hit') {
      show({ answerType: 'hit', word: guess })
    } else if (res.type === 'ok' && res.data.result === 'miss') {
      show({ answerType: 'miss', word: guess })
    } else {
      // Nothing named this answer, so the tile must not keep claiming to be in
      // flight — there is no result coming that would release it.
      setSubmittedWord(null)
      reportUnhandled('submit_guess', res)
    }
  }

  // ─── The board's display order ─────────────────────────
  // Purely visual and purely local: the same words in a fresh arrangement,
  // never a move and never sent anywhere.

  // A counter the Shuffle button bumps; the display order is derived from it. Keyed
  // on the words STRING (not the array — useGame returns a fresh array on every
  // realtime refetch, which would re-shuffle on every guess).
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const wordsKey = gd.board.words.join('\n') // '\n' never appears inside a dictionary word
  const shuffledWords = useMemo(() => {
    if (wordsKey === '') return []
    void shuffleSeed
    return shuffle(wordsKey.split('\n'))
  }, [wordsKey, shuffleSeed])
  const handleShuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])

  // Bound here with the board rather than in the entry: the entry unmounts
  // when I cannot guess, and the Shuffle button stays live in every state,
  // an ended game included, so its key must too.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: handleShuffle,
  })

  // ─── The keyboard ──────────────────────────────────────
  // The selection cursor: arrows move it over the tiles, Space picks the word
  // under it, Enter guesses. It sits on a CELL, so a shuffle moves the words
  // under it while the pick, being a word, moves with its tile.

  const shape = boardShape(shuffledWords.length)
  const wordAt = (cell: Cell) => shuffledWords[positionAt(cell.x, cell.y, shape.cols)]

  // Space toggles, so a second press un-picks. A decided tile can't be picked,
  // as it can't be clicked.
  function toggleAt(cell: Cell) {
    const word = wordAt(cell)
    if (word === undefined || tileResults.has(word)) return
    choosePickedWord(pickedWord === word ? null : word)
  }

  const { cursor, setCursorTo } = useBoardSelectionCursor({
    shape,
    enabled: canPick,
    onToggle: toggleAt,
  })

  // A tile click: the pick, and the cursor moves there, hidden.
  function handleTileClick(word: string) {
    const i = shuffledWords.indexOf(word)
    setCursorTo(cellAt(i, shape.cols))
    choosePickedWord(word)
  }

  // Submit guesses the picked word, on its button or Enter — whether or not the
  // cursor shows, since the pick is always drawn.
  const actSubmit = useBoundAction('act-submit', {
    describe: () => (canCommit && pickedWord !== null && !submitting ? 'active' : 'disabled'),
    run: submitGuess,
  })

  // Clear un-picks, on its button or ⌫.
  const actClearPicks = useBoundAction('act-clear-picks', {
    describe: () => (canPick && pickedWord !== null ? 'active' : 'disabled'),
    run: () => choosePickedWord(null),
  })

  // Any key clears a gesture-cleared result, as a click on a tile does.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Render ────────────────────────────────────────────

  const phone = useIsPhone()
  const top = useTopFeedbackMessage(localFeedbackSlot)

  return (
    <div className={shared.boardCol}>
      {/* The info column's StateLine, above the board where that column is
          off-canvas; CSS hides it elsewhere (see `MobileStatusBar`). */}
      <MobileStatusBar>
        <StateLine
          found={gd.foundSecretsCount}
          secretCount={gd.requiredSecretsCount}
          guessesUsed={gd.guessesUsed}
          maxGuesses={gd.maxGuesses}
        />
      </MobileStatusBar>
      <Board
        words={shuffledWords}
        results={tileResults}
        picked={isViewingHistory ? null : drawnPick}
        cursor={cursor}
        // Who decided each tile — only where the answer can differ: a SHARED
        // board (compete shows you nobody's guesses but your own) with more than
        // one player on it (in a solo game every tile has the same one possible
        // author, so a dot per tile is a label that says "you" nine times). A
        // history snapshot carries the same rows, so it keeps its dots.
        decidedBy={!gd.isCompete && Object.keys(gd.players).length > 1 ? gd.board.decidedBy : null}
        endingOutcome={endingOutcome}
        isWaitingForTurn={gd.standing.isWaitingForTurn}
        myTurnJustStarted={myTurnJustStarted}
        // The CAUSE the attention flash reads: a board that changed while this
        // stood still was revealed or re-dealt, not played into. Restart deletes
        // the guess rows, so it moves back down.
        moveCount={gd.board.guessCount}
        // The word with the server, if any: its tile dims until the answer lands.
        // Never while viewing a past turn — that board is not the one the guess
        // is in flight on, the same reason the pick is dropped above.
        inFlightWord={isViewingHistory ? null : inFlightWord}
        isBoardInteractive={gd.standing.isBoardInteractive}
        onPick={handleTileClick}
        isViewingHistory={isViewingHistory}
        historyLitWord={historyView.litWord}
        // Shuffle floats over the board's top-right — purely visual (a fresh scan
        // of the SAME board), not a turn action, so it lives on the board, not in
        // the info-column action row. Always present, even once the game has
        // ended. Passed
        // into Board so it anchors to the visual board, not the column.
        floatingControl={
          <ShuffleButton
            action={actShuffle}
            tooltip="Shuffle the words"
            className={shared.floatingShuffle}
          />
        }
      />
      {/* The below-board slot: one fixed-height slot below the top-anchored board. It
          ALWAYS renders (never null) so it can't collapse and let the flex:1 board
          grow (docs/ui.md → Layout stability). While the local feedback slot
          holds a message it takes the place of Clear and Submit — the verdict
          once the game has ended, "out of guesses" while the others play on, the
          whose-turn note, an own-move result — and the history banner
          overlays it all while a past turn is open. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, isViewingHistory && historyViewerStyles.historyBannerHost)}>
          {isViewingHistory && (
            <HistoryBanner label={historyView.label} actor={historyView.actor} onExit={historyView.exit} />
          )}
          {top !== null ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
            </div>
          ) : (
            <div className={styles.moveArea}>
              <ActionButton
                action={actClearPicks}
                show={phone ? 'icon' : 'both'}
              />
              <ActionButton
                action={actSubmit}
                show={phone ? 'icon' : 'both'}
                weight="primary"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
