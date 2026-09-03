// cs-unmet

import { getNotOkFeedback } from '../../common/lib/game/genericPills'
import { runRpc } from '../../common/lib/supabase/dbResult'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg, Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { MobileStatusBar } from '../../common/components/game/MobileStatusBar'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { db } from '../db'
import { stickyPill, terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import { Board } from './Board'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '../../common/lib/supabase/dbEnvelope'

/** What `psychicnum.submit_guess` puts in `data` for a guess it TOOK — the
 *  caller's own verdict, plus whether that guess completed the set.
 *
 *  Nullable because the RPC's other `ok` — PA002, the word was already guessed —
 *  arrives through a raise, and `common.raised_envelope` always builds
 *  `data: null`. That answer is named by its `dbcode` instead. */
type GuessAnswer = { verdict: 'hit' | 'miss'; found_all: boolean } | null

/** Fisher–Yates shuffle on a copy. Pure — doesn't mutate input. */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * psychicnum's board column — the `Board` (with the floating Shuffle) plus the
 * fixed-height below-board slot under it (the turn-viewer banner, the guess entry,
 * or a local `<GenericFeedbackPill>` for an own-move result / the waiting / terminal
 * verdict).
 *
 * This is the **input engine**: the pending guess (a board tile click and the entry
 * drive the same word), the local board shuffle, and — because the guess is a board
 * gesture with its result arriving via realtime (no deep entangled state) — the
 * `submit_guess` RPC itself, kept beside the entry it commits. Like the other games'
 * BoardCol it does NOT own the game state: PlayArea hands it **the board to render**
 * (the live `results` OR a historical snapshot) + `viewing`, which is what makes the
 * turn-history viewer a drop-in. Own-move feedback lifts to PlayArea (its
 * `showLocalFeedback` / `clearLocalFeedback` write the shared below-board channel,
 * which InfoCol's Hint / Reveal / End also write). See docs/playarea.md.
 */
export function BoardCol({
  // ── Mobile-only status strip (above the board) ──
  mobileStatus,
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  words,
  results,
  highlightWord,
  // ── History viewer (its overlay lives in the below-board region) ──
  viewing,
  viewingDescription,
  onExitViewing,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  canGuess,
  isMyTurn,
  showLocalFeedback,
  clearLocalFeedback,
  localPill,
  // ── Below-board slot content ──
  over,
  decidedBy,
  gameOver,
  notMyTurn,
  myTurnJustStarted,
  moveCount,
  myConceded,
}: {
  // ── Mobile-only status strip ──
  /** The core state readout (the `<StateLine>` the InfoCol also renders), shown
   *  above the board ONLY below the `--mobile` breakpoint — where the info
   *  column is off-canvas in the InfoSheet and would otherwise take a tap to
   *  read. Hidden by CSS on desktop; see `<MobileStatusBar>`. */
  mobileStatus: ReactNode

  // ── Board to render ──
  /** The board words (the shuffle source + the client-side board-word check). */
  words: string[]
  /** Guessed words → was-it-a-secret — the live map OR a snapshot's (PlayArea picks). */
  results: ReadonlyMap<string, boolean>
  /** Turn-history: the word the viewed turn decided — ring its tile (null live). */
  highlightWord: string | null

  // ── History viewer ──
  viewing: boolean
  /** The viewed turn's description while inspecting history (drives the banner), or
   *  null when live. */
  viewingDescription: string | null
  /** Return to the live board (the banner click / ✕). */
  onExitViewing: () => void

  // ── Guess dispatch ──
  gameId: string
  /** Am I a live participant? Picks the entry (vs a waiting / terminal pill) — the
   *  play-vs-done LOOK. NOT turn-aware: a waiting player is still a participant. */
  canGuess: boolean
  /** Turn-order: may I act THIS moment? Always true for free-for-all / solo. When
   *  false the entry stays visible but inert (the tiles + capture are frozen); the
   *  InfoCol's TurnStatusLine explains whose turn it is. Kept separate from
   *  `canGuess` so a non-current turn doesn't read as "out of guesses". */
  isMyTurn: boolean
  /** Show an own-move pill (Correct / Incorrect / a rejected guess). PlayArea owns
   *  the shared below-board channel (InfoCol's Hint / Reveal / End write it too). */
  showLocalFeedback: (msg: GenericFeedbackMsg) => void
  /** Clear the sticky own-move pill (a new guess / keystroke dismisses it). */
  clearLocalFeedback: () => void
  /** The own-move pill to render in the entry's slot, or null. */
  localPill: GenericFeedbackMsg | null

  // ── Below-board slot content ──
  /** Terminal copy — non-null means the game is over; its `verdict` + `tone` are
   *  the permanent below-board pill (the same contract the other games use). The
   *  secret reveal moved to the board's rings. */
  over: TerminalCopy | null
  /** The three secret words, revealed at game-over (terminal only), else null.
  /** I conceded a compete race — picks the "waiting" pill's wording. */
  myConceded: boolean

  // ── Board-scope marks (see `<Board>`) ──
  /** Who decided each tile, for the identity dot — null outside coop. */
  decidedBy: ReadonlyMap<string, Pick<Member, 'username' | 'color'> | undefined> | null
  /** The game is finished, and how — bands the board in that outcome's gray. */
  gameOver: 'won' | 'lost' | 'neutral' | null
  /** Turn-order coop: a teammate holds the move, so the board dims. */
  notMyTurn: boolean
  /** True for a beat as the turn becomes mine — the frame flashes. */
  myTurnJustStarted: boolean
  /** Guesses the server has recorded — the CAUSE the attention flash reads. */
  moveCount: number
}) {
  // The pending guess, shared by the board tiles and the entry below the board.
  const [pending, setPending] = useState('')
  // The last submitted guess, kept so ArrowUp can recall it into the entry.
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
   *  cleared it and the success branch never did). */
  const inFlightWord = submittedWord !== null && !results.has(submittedWord) ? submittedWord : null

  // ─── Board shuffle (a fresh visual scan, local only) ────
  // A counter the Shuffle button bumps; the display order is derived from it. Keyed
  // on the words STRING (not the array — useGame returns a fresh array on every
  // realtime refetch, which would re-shuffle on every guess).
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const wordsKey = words.join('\n') // '\n' never appears inside a dictionary word
  const shuffledWords = useMemo(() => {
    if (wordsKey === '') return []
    void shuffleSeed
    return shuffled(wordsKey.split('\n'))
  }, [wordsKey, shuffleSeed])
  const handleShuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])

  // SPACE shuffles, the same board key spellingbee, wordwheel and connections
  // have: a fresh visual scan of the SAME words, never a move.
  //
  // A window handler rather than the capture entry's `onExtraKey` (where the
  // other two games put theirs), because psychicnum's <EntryRow> is UNMOUNTED
  // once you can't guess — at terminal, while viewing history, on someone
  // else's turn — and the Shuffle button is live in every one of those states
  // ("Always present, even at terminal"). Hanging the key off the entry would
  // make it disagree with its own button exactly when the board is most worth
  // re-reading. Only `viewing` stops it: a keystroke in the history viewer
  // means "back to live".
  //
  // The shared hook already ignores keys aimed at a text field or a floating
  // panel, so chat and the setup dialog keep their own Space.
  useGlobalKeyHandler(
    useCallback(
      (e: KeyboardEvent) => {
        if (viewing || e.key !== ' ') return
        e.preventDefault()
        handleShuffle()
      },
      [viewing, handleShuffle],
    ),
  )

  // A user-driven entry change — typing a letter, or clicking a board tile — also
  // dismisses a sticky own-move result, so route both through here: clear the flash,
  // then update the pending guess. (submitGuess sets `pending` to '' directly, NOT
  // through this, so it doesn't clear the flash it is about to show.)
  const handleEntryChange = useCallback(
    (next: string) => {
      clearLocalFeedback()
      setPending(next)
    },
    [clearLocalFeedback],
  )

  // Every submit clears the entry and shows a flash IN the box (success or error) —
  // so feedback always lands in the entry's already-claimed space, never a new line
  // that would reflow the board.
  const submitGuess = async () => {
    const guess = pending.trim().toLowerCase()
    // Remember the submitted entry so ArrowUp can recall it (covers a rejected guess
    // too — recalling lets the player fix it).
    setLastGuess(pending)
    setPending('')
    // Client-side board-word check for snappy feedback; the server re-validates.
    if (!words.includes(guess)) {
      showLocalFeedback(stickyPill('lost', 'Not on the board'))
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
      showLocalFeedback({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
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
      showLocalFeedback(stickyPill(res.outcome, res.message))
    } else if (res.type === 'ok' && res.data?.verdict === 'hit') {
      showLocalFeedback(stickyPill('won', 'Correct'))
    } else if (res.type === 'ok' && res.data?.verdict === 'miss') {
      showLocalFeedback(stickyPill('lost', 'Incorrect'))
    } else {
      // Nothing named this answer, so the tile must not keep claiming to be in
      // flight — there is no result coming that would release it.
      setSubmittedWord(null)
      reportUnhandled('submit_guess', res)
    }
  }

  // Picking a tile or typing both drive this one pending guess word. (A partial word
  // won't equal any board word, so the board only highlights once a tile is clicked
  // or the full word is typed.)
  const selected = pending === '' ? null : pending

  // The below-board slot's one pill, by the shared priority (localPills.ts):
  // the terminal verdict, then "out of guesses" while the others play on.
  // `null` hands the slot to the entry row, which shows the own-move pill in
  // place of its controls while nothing is typed.
  const slotPill = over
    ? terminalPill(over.tone, over.verdict)
    : !canGuess
      ? outOfRacePill(myConceded, 'Out of guesses — race continues')
      : null

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
        selected={viewing ? null : selected}
        decidedBy={decidedBy}
        gameOver={gameOver}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
        moveCount={moveCount}
        // The word with the server, if any: its tile dims until the answer lands.
        inFlightWord={inFlightWord}
        onPick={canGuess && isMyTurn && !viewing ? handleEntryChange : undefined}
        viewing={viewing}
        highlightWord={highlightWord}
        // Shuffle floats over the board's top-right — purely visual (a fresh scan
        // of the SAME board), not a turn action, so it lives on the board, not in
        // the info-column action row. Always present, even at terminal. Passed
        // into Board so it anchors to the visual board, not the column.
        floatingControl={
          <ShuffleButton
            onShuffle={handleShuffle}
            label="Shuffle the words"
            className={shared.floatingShuffle}
          />
        }
      />
      {/* The below-board slot: one fixed-height slot below the top-anchored board. It
          ALWAYS renders (never null) so it can't collapse and let the flex:1 board
          grow (docs/ui.md → Layout stability). Three states + the history banner:
            - terminal → a PERMANENT (fill, outcome-colored) pill carrying the secret
              reveal;
            - playing + can guess → the shared <EntryRow> (or a transient own-move pill);
            - locally done but game not over (out of guesses OR conceded) → a sticky
              "waiting" pill. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, viewing && history.bannerHost)}>
          {/* Turn-viewer banner — while inspecting a past turn it overlays this slot
              (the entry / pill stays mounted underneath, its capture frozen). Opaque
              surface + blue border = the shared "viewing history" marker; the
              description names the turn. Click anywhere / the ✕ exits. */}
          {viewing && viewingDescription && (
            <div className={history.banner} onClick={onExitViewing} title="Click to exit">
              <span className={history.bannerLabel}>{viewingDescription}</span>
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
          {/* One slot, one pill: the priority is resolved into `slotPill` above
              rather than branched here (localPills.ts → the below-board slot's
              order), so there's a single render and a single dismiss handler. */}
          {slotPill ? (
            <div className={shared.localFeedback}>
              <GenericFeedbackPill msg={slotPill} onClose={clearLocalFeedback} />
            </div>
          ) : (
            /* The shared <EntryRow> (icon-only Delete + the EntryBox + icon-only
               Submit + the capture keyboard). `bigEntry` bumps the entry font
               (psychicnum's one short guess word reads large). The own-move pill
               replaces the controls while the entry is empty (typing reclaims it). */
            <EntryRow
              value={pending}
              onChange={handleEntryChange}
              onSubmit={submitGuess}
              placeholder="Click on a tile or type"
              busy={submitting}
              // Disabled while viewing history (capture is a hard no-op so typing
              // behind the banner never accumulates, and the keystroke goes to
              // exitOnKey) OR when it's not my turn (the entry stays but inert).
              disabled={viewing || !isMyTurn}
              onAnyKey={clearLocalFeedback}
              recall={lastGuess}
              className={styles.bigEntry}
              onDismissPill={clearLocalFeedback}
              pill={pending === '' ? localPill : null}
            />
          )}
        </div>
      </div>
    </div>
  )
}
