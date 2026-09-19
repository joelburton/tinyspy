// cs-fixed-outcome-fix

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cls } from '@/common/utils/cls'
import type { Actor } from '@/common/members/member'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { db } from '../db'
import { ANSWER_OUTCOME } from '../lib/answer'
import { Board } from './Board'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import { shuffle } from '@/common/utils/shuffle'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** What `psychicnum.submit_guess` puts in `data` for a guess it TOOK — the
 *  caller's own verdict, plus whether that guess completed the set.
 *
 *  Nullable because the RPC's other `ok` — PA002, the word was already guessed —
 *  arrives through a raise, and `common.raised_envelope` always builds
 *  `data: null`. That answer is named by its `dbcode` instead. */
type GuessAnswer = { verdict: 'hit' | 'miss'; found_all: boolean } | null

/**
 * psychicnum's board column — the `Board` (with the floating Shuffle) plus the
 * fixed-height below-board slot under it (the turn-viewer banner, the guess
 * entry, or the local feedback slot's top message: an own-move result, the
 * whose-turn note, the verdict).
 *
 * This is the **input engine**: the pending guess (a board tile click and the entry
 * drive the same word), the local board shuffle, and — because the guess is a board
 * gesture with its result arriving via realtime (no deep entangled state) — the
 * `submit_guess` RPC itself, kept beside the entry it commits. Like the other games'
 * BoardCol it does NOT own the game state: PlayArea hands it **the board to render**
 * (the live `results` OR a historical snapshot) + `isViewingHistory`, which is what makes the
 * turn-history viewer a drop-in. The local feedback slot is PlayArea's (its
 * standing conditions and InfoCol's Hint / Spoiler / End also show into it);
 * this column shows the guess results and draws it. See docs/playarea.md.
 */
export function BoardCol({
  // ── Mobile-only status strip (above the board) ──
  mobileStatus,
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  words,
  results,
  historyLitWord,
  // ── History viewer (its overlay lives in the below-board region) ──
  historyLabel,
  historyActor,
  onExitHistory,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  isStillPlaying,
  isMyTurn,
  localFeedbackSlot,
  decidedBy,
  gameOver,
  notMyTurn,
  myTurnJustStarted,
  moveCount,
}: {
  // ── Mobile-only status strip ──
  // The core state readout (the `<StateLine>` the InfoCol also renders), shown
  // above the board ONLY below the `--mobile` breakpoint — where the info
  // column is off-canvas in the InfoSheet and would otherwise take a tap to
  // read. Hidden by CSS on desktop; see `<MobileStatusBar>`.
  mobileStatus: ReactNode

  // ── Board to render ──
  // The board words (the shuffle source + the client-side board-word check).
  words: string[]
  // Guessed words → was-it-a-secret — the live map OR a snapshot's (PlayArea picks).
  results: ReadonlyMap<string, boolean>
  // Turn-history: the word the viewed turn decided — ring its tile (null live).
  historyLitWord: string | null

  // The viewed turn's description while inspecting history (drives the banner), or
  // null when live.
  historyLabel: string | null
  /** Whose board is on screen, when it is not the viewer's own — a compete log
   *  at terminal can open an opponent's row. */
  historyActor?: Actor | null
  // Return to the live board (the banner click / ✕).
  onExitHistory: () => void

  // ── Guess dispatch ──
  gameId: string
  // Am I a live participant? Picks the entry (vs a waiting / terminal pill) — the
  // play-vs-done LOOK. NOT turn-aware: a waiting player is still a participant.
  isStillPlaying: boolean
  // Turn-order: may I act THIS moment? Always true for free-for-all / solo. When
  // false the entry stays visible but inert (the tiles + capture are frozen); the
  // InfoCol's TurnStatusLine explains whose turn it is. Kept separate from
  // `isStillPlaying` so a non-current turn doesn't read as "out of guesses".
  isMyTurn: boolean
  // PlayArea's below-board slot. This column shows the guess results into it
  // (Correct / Incorrect / a rejected guess) and the entry row draws its top.
  localFeedbackSlot: FeedbackSlot

  // ── Board-scope marks (see `<Board>`) ──
  // Who decided each tile, for the identity dot — null outside coop.
  decidedBy: ReadonlyMap<string, Actor | undefined> | null
  // The game is finished, and how — bands the board in that outcome's gray.
  gameOver: TerminalOutcome | null
  // Turn-order coop: a teammate holds the move, so the board dims.
  notMyTurn: boolean
  // True for a beat as the turn becomes mine — the frame flashes.
  myTurnJustStarted: boolean
  // Guesses the server has recorded — the CAUSE the attention flash reads.
  moveCount: number
}) {
  // ─── Which board is on screen ──────────────────────────
  // Live, or a past turn's snapshot. PlayArea has already picked which `results`
  // to hand down, so this column only needs to know WHICH it got — and then
  // everything that would WRITE to the board answers to it: the tiles go inert,
  // the selection and the in-flight dim are dropped, the entry is disabled, and
  // the banner overlays the slot.

  // Viewing a past turn ⟺ there is one open (docs/playarea.md → Prop
  // conventions: one prop says so, and the flag is derived, never passed).
  const isViewingHistory = historyLabel !== null

  // ─── The pending guess ─────────────────────────────────
  // The word being assembled, and everything that reads it. A board tile click
  // and a typed letter are the same gesture as far as this column is concerned:
  // both set `pending`, and both go through `handleEntryChange`.

  // The pending guess, shared by the board tiles and the entry below the board.
  const [pending, setPending] = useState('')
  // The last submitted guess, handed to the entry as its `recall`.
  const [lastGuess, setLastGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** The word currently with the server. Its tile takes the shared in-flight dim
   *  — clicking a tile used to leave the board saying nothing at all until the
   *  answer arrived. Held until the RESULT lands rather than until the RPC
   *  resolves: the reply and the colored row are two separate events, and
   *  un-dimming at the first would flash an undecided tile back to normal. */
  const [submittedWord, setSubmittedWord] = useState<string | null>(null)
  /** …and the SERVER'S answer is what ends it: once the word is in `results` it is
   *  decided, so it stops being in flight whatever this component still remembers.
   *  Derived rather than cleared, so there is no path that can leave a dim stuck on
   *  a tile forever (which is exactly what the first version did — the error branch
   *  cleared it and the success branch never did).
   *
   *  `results` is the board being DISPLAYED, which while viewing a past turn is a
   *  snapshot that cannot contain a word guessed after it — so this reads as "in
   *  flight" for a decided word, and the gate at the `<Board>` call below is what
   *  keeps that off a historical board.
   *
   *  A RESTART would strand it the same way — the word is not in the new, empty
   *  results — but nothing here handles that: the page unmounts this whole
   *  surface when the run changes, so there is no memory left to strand
   *  (common/game-page/doc.md). */
  const inFlightWord = submittedWord !== null && !results.has(submittedWord) ? submittedWord : null

  // Picking a tile or typing both drive this one pending guess word. (A partial word
  // won't equal any board word, so the board only highlights once a tile is clicked
  // or the full word is typed.)
  const selected = pending === '' ? null : pending

  // A user-driven entry change — typing a letter, or clicking a board tile — is
  // the player's next action, so it dismisses a gesture-cleared result: route
  // both through here. (submitGuess sets `pending` to '' directly, NOT through
  // this, so it doesn't dismiss the result it is about to show.)
  const handleEntryChange = useCallback(
    (next: string) => {
      localFeedbackSlot.dismiss()
      setPending(next)
    },
    [localFeedbackSlot],
  )

  // ─── Committing a guess ────────────────────────────────

  // Every submit clears the entry and shows a flash IN the box (success or error) —
  // so feedback always lands in the entry's already-claimed space, never a new line
  // that would reflow the board.
  const submitGuess = async () => {
    const guess = pending.trim().toLowerCase()
    // Remembered for the entry's recall — including a guess the server refuses,
    // which is the case where recalling it is worth something.
    setLastGuess(pending)
    setPending('')
    // Client-side board-word check for snappy feedback; the server re-validates.
    if (!words.includes(guess)) {
      localFeedbackSlot.show(
        FeedbackMessage.result(ANSWER_OUTCOME.not_on_board, 'Not on the board'),
      )
      return
    }
    setSubmitting(true)
    setSubmittedWord(guess)
    // `verdict` is the caller's OWN answer and nothing else. Whether the game
    // ended rides beside it in `found_all`, which this surface ignores: every
    // terminal transition reaches us by realtime, and a hit that empties the
    // budget is still a hit to the person who made it. That is also why the two
    // verdict branches below cover THREE server returns (the win, the guess that
    // spends the last of the budget, and the ordinary one) — they differ in what
    // they did to the game, not in what they did for the player.
    const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', { target_game: gameId, guess }))
    setSubmitting(false)
    if (res.type === 'not-ok') {
      setSubmittedWord(null)
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.dbcode === 'PA002' && res.message !== null) {
      // ALREADY GUESSED — an `ok`, because the rules were applied and nothing
      // moved. psychicnum's FE deliberately does not check for duplicates, so
      // this is reached by ordinary typing rather than by a bug. Named by its
      // `dbcode` because it arrives through a raise, and a raise carries no
      // `data`; the message assertion is the other half of what the case
      // promises, and it is what makes `outcome` non-null here.
      //
      // No `setSubmittedWord(null)`: the word is refused BECAUSE it is already
      // in the log, so it is already in `results` and the in-flight dim has
      // released itself.
      localFeedbackSlot.show(FeedbackMessage.result(res.outcome, res.message))
    } else if (res.type === 'ok' && res.data?.verdict === 'hit' && res.outcome !== null) {
      // The server sends no sentence — "Correct" / "Incorrect" is this surface's
      // word for a verdict the player is already looking at on the board. What
      // it does send is how that reads, so the outcome is the other half of each
      // case's promise and the branch asserts it.
      localFeedbackSlot.show(FeedbackMessage.result(res.outcome, 'Correct'))
    } else if (res.type === 'ok' && res.data?.verdict === 'miss' && res.outcome !== null) {
      localFeedbackSlot.show(FeedbackMessage.result(res.outcome, 'Incorrect'))
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
  const wordsKey = words.join('\n') // '\n' never appears inside a dictionary word
  const shuffledWords = useMemo(() => {
    if (wordsKey === '') return []
    void shuffleSeed
    return shuffle(wordsKey.split('\n'))
  }, [wordsKey, shuffleSeed])
  const handleShuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])

  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: handleShuffle,
  })

  // ─── Render ────────────────────────────────────────────

  return (
    <div className={shared.boardCol}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the live found/guesses readout, above the board. It's a fixed-height
          row, so on a phone the board is that much shorter — the deliberate
          trade for keeping the core state on the play surface. */}
      <MobileStatusBar>{mobileStatus}</MobileStatusBar>
      <Board
        words={shuffledWords}
        results={results}
        selected={isViewingHistory ? null : selected}
        decidedBy={decidedBy}
        gameOver={gameOver}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
        moveCount={moveCount}
        // The word with the server, if any: its tile dims until the answer lands.
        // Never while viewing a past turn — that board is not the one the guess
        // is in flight on, the same reason `selected` is dropped above.
        inFlightWord={isViewingHistory ? null : inFlightWord}
        onPick={isStillPlaying && isMyTurn && !isViewingHistory ? handleEntryChange : undefined}
        isViewingHistory={isViewingHistory}
        historyLitWord={historyLitWord}
        // Shuffle floats over the board's top-right — purely visual (a fresh scan
        // of the SAME board), not a turn action, so it lives on the board, not in
        // the info-column action row. Always present, even at terminal. Passed
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
          grow (docs/ui.md → Layout stability). The entry row is always mounted;
          while the local feedback slot holds a message and nothing is typed, the
          row draws that message in place of its controls — the verdict at
          terminal, "out of guesses" while the others play on, the whose-turn
          note, an own-move result — and the history banner overlays it all
          while a past turn is open. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, isViewingHistory && history.historyBannerHost)}>
          {/* The shared banner overlays this slot while a past turn is open — the
              entry / pill stays mounted underneath, its capture frozen. */}
          {isViewingHistory && (
            <HistoryBanner label={historyLabel} actor={historyActor} onExit={onExitHistory} />
          )}
          {/* The shared <WordEntryArea> (icon-only Delete + the WordEntryInput + icon-only
              Submit + the capture keyboard). `bigEntry` bumps the entry font
              (psychicnum's one short guess word reads large). */}
          <WordEntryArea
            value={pending}
            onChange={handleEntryChange}
            onSubmit={submitGuess}
            placeholder="Click on a tile or type"
            busy={submitting}
            // Disabled while viewing history (capture is a hard no-op so typing
            // behind the banner never accumulates, and the viewer's
            // `act-exit-history` consumes the keystroke), when it's not my turn,
            // and once I'm done (out of guesses, conceded, the game over) —
            // the entry stays, inert, under whatever the slot shows.
            disabled={isViewingHistory || !isMyTurn || !isStillPlaying}
            onAnyKey={localFeedbackSlot.dismiss}
            recall={lastGuess}
            className={styles.bigEntry}
            localFeedbackSlot={localFeedbackSlot}
          />
        </div>
      </div>
    </div>
  )
}
