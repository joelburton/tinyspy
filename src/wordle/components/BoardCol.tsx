// cs-fixed-outcome-fix

import { runRpc } from '@/common/supabase/dbResult'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { useEffect, useCallback, useState } from 'react'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useCaptureKeys, asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { db } from '../db'
import { colorRank, tileColor, type TileColor } from '../lib/colors'
import type { HistorySnapshotRow, HistorySnapshot } from '../lib/history'
import { Board } from './Board'
import { GuessKeyboard, type KeyTone } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * wordle's board column — the `<Board>` plus the below-board region under it
 * (the turn-viewer banner, the fixed-height local-feedback pill slot, and the
 * on-screen `<Keyboard>`).
 *
 * This is the **input engine**: the pending guess (`current`), the in-flight word
 * (`pending`), and — because a guess is a keyboard/tile gesture whose result arrives
 * via realtime (Pattern A, no deep entangled state) — the `submit_guess` RPC itself,
 * kept beside the input it commits (like psychicnum's BoardCol). The physical
 * `useCaptureKeys` + the on-screen keyboard drive the same `current`. It does NOT own
 * the game state: PlayArea hands it **the board to render** (the live `rows` + the
 * `historySnap` override) + `readOnly` (the game-state half of "is the board
 * inert", which this column ORs with its own mid-submit state). The local
 * feedback slot is PlayArea's (its standing conditions and InfoCol's End /
 * Concede show into it too); this column shows the soft rejects and draws it.
 * See docs/playarea.md.
 */
/** How long the rejected row keeps its ring — a touch past the shake, so
 *  the mark is still there when the movement stops. */
const REJECT_MARK_MS = 900

/**
 * What `wordle.submit_guess` puts in `data`. The structural fact travels even
 * where the server also wrote the sentence: the board's shake is keyed on
 * `result`, and has nothing to do with the words.
 *
 * A UNION, because the two halves are not the same answer wearing one shape. A
 * soft reject burns no guess and carries no colors — there is no row to color —
 * while an accepted guess always has them. Written as one object with `colors?`
 * that distinction was invisible, and `?` said "sometimes missing" where the
 * truth is "missing in exactly these two cases".
 */
type GuessAnswer =
  /** Soft rejects: the rules were applied, nothing was burned, the typed row
   *  stays. Both come with the server's own sentence + outcome. */
  | {
      result: 'duplicate' | 'notAWord'
      guesses_used: number | null
      solved: false
      terminal: false
    }
  /** Accepted: the guess is recorded. `colors` and the finish reach this surface
   *  by realtime like everyone else's, so neither is read here. */
  | {
      result: 'correct' | 'incorrect'
      colors: string
      guesses_used: number | null
      solved: boolean
      terminal: boolean
    }

export function BoardCol({
  // ── Board to render (live rows + the history snapshot — PlayArea picks the log,
  //    this column picks live-vs-snapshot) ──
  rows,
  historySnap,
  historyActor,
  maxGuesses,
  brand,
  // ── History viewer (its banner lives in the below-board region) ──
  onExitHistory,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  readOnly,
  localFeedbackSlot,
  // ── Board-scope marks (see <Board>) ──
  gameOver,
  notMyTurn,
  myTurnJustStarted,
}: {
  // ── Board to render ──
  // The LIVE board rows (the viewer's own / the coop team board) — drives the
  // keyboard letter-coloring, the in-flight `pendingWord` check, and the grid when
  // not viewing history.
  rows: HistorySnapshotRow[]
  // The open history turn's snapshot (its rows + ringed row + banner label), or null
  // when live. Non-null exactly when viewing, so this column derives `isViewingHistory` from
  // it.
  historySnap: HistorySnapshot | null
  /** Whose board is on screen, when it is not the viewer's own — at terminal a
   *  compete log can open an opponent's row. */
  historyActor?: Actor | null
  maxGuesses: number
  // Brand name (manifest) for the grid's screen-reader label.
  brand: string

  // ── History viewer ──
  // Return to the live board (the banner click / ✕).
  onExitHistory: () => void

  // ── Guess dispatch ──
  gameId: string
  // The GAME-STATE half of the board gate — the board is inert (not a player,
  // terminal, solved/conceded, out of guesses). This column ORs it with its own
  // mid-submit / word-in-flight state to get the live `canGuess`.
  readOnly: boolean
  // PlayArea's below-board slot. This column shows the soft rejects and RPC
  // not-oks into it and draws its top between the board and the keyboard.
  localFeedbackSlot: FeedbackSlot

  // ── Board-scope marks ──
  // The game is finished, and how — bands the board, and withdraws the keyboard
  // (there is no move left to make). Null while live.
  gameOver: TerminalOutcome | null
  // Turn-order coop: a teammate holds the move, so the board dims.
  notMyTurn: boolean
  // True for a beat as the turn becomes mine — the frame flashes yellow.
  myTurnJustStarted: boolean
}) {
  const [current, setCurrent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** Bumped on every soft reject — the active row shakes and rings in the
   *  refusal's outcome for a beat (amber for a duplicate, red for a word the
   *  dictionary refused). A NONCE rather than a boolean, because rejecting the same word twice
   *  must replay the shake: a boolean already `true` changes nothing, and the
   *  second attempt would look ignored. `<Board>` keys the row on it so the
   *  animation restarts. */
  const [rejectNonce, setRejectNonce] = useState(0)
  /** The outcome of the last rejection, written by `softReject`. */
  const [rejectOutcome, setRejectOutcome] = useState<Outcome>('lost')
  // The accepted-but-not-yet-rendered guess: kept on the board (uncolored) from the
  // moment we submit until its colored server row arrives via realtime, so the letters
  // don't blink out during the round-trip. The row then flips in place. Cleared on
  // soft-reject, or once it lands.
  const [pending, setPending] = useState<string | null>(null)

  // Viewing a past turn ⟺ a snapshot is open (PlayArea sets `historySnap` only then).
  const isViewingHistory = historySnap !== null

  // Replay-board resets the live rows. A `pending` left over from the finished
  // run would then resurrect (its row is no longer in `rows`, so the "landed"
  // check below stops absorbing it): the old word reappears as an uncolored top
  // row AND blocks input via `canGuess`. Rows can only SHRINK on a reset —
  // guesses are append-only otherwise — so drop the stale pending right there.
  // Adjusted DURING render behind a transition guard (the endorsed
  // previous-render pattern, same as useCelebration) — not an effect.
  const [prevRowCount, setPrevRowCount] = useState(rows.length)
  if (rows.length !== prevRowCount) {
    setPrevRowCount(rows.length)
    if (rows.length < prevRowCount) {
      // "Replay should start entirely blank": drop the stale in-flight word AND
      // any half-typed buffer from the previous run.
      if (pending !== null) setPending(null)
      if (current !== '') setCurrent('')
    }
  }

  // The mark is transient: clear it once the shake has played. Dropping back to
  // zero is also what lets the next rejection replay — the row is keyed on this
  // value, so 0 → 1 remounts it even if the same word is rejected twice.
  useEffect(() => {
    if (rejectNonce === 0) return
    const timer = setTimeout(() => setRejectNonce(0), REJECT_MARK_MS)
    return () => clearTimeout(timer)
  }, [rejectNonce])

  // The pending word, shown until its colored server row actually lands. Once it's in
  // the live `rows` we stop showing it (the real row flips in its place) — `pending`
  // state may linger stale, but `pendingWord` is the value everything reads, so that's
  // harmless while rows only grow (the reset case is handled above). Deriving it (vs.
  // clearing `pending` in an effect) also dodges a one-frame double-render.
  const pendingLanded = pending != null && rows.some((r) => r.guess === pending)
  const pendingWord = pending && !pendingLanded ? pending : ''
  // The live gate: the game permits guessing (PlayArea) AND I'm not mid-submit / with a
  // word in flight (this column's input state).
  const canGuess = !readOnly && !submitting && !pendingWord

  // Per-key feedback state — the strongest color each letter has earned across the LIVE
  // board (drives the on-screen keyboard tinting).
  const keyStates = new Map<string, TileColor>()
  for (const r of rows) {
    for (let i = 0; i < 5; i++) {
      const ch = r.guess[i]
      const col = tileColor(r.colors[i])
      const prev = keyStates.get(ch)
      if (!prev || colorRank(col) > colorRank(prev)) keyStates.set(ch, col)
    }
  }
  // The keyboard speaks the same vocabulary the board does, so there is nothing
  // to translate — only 'blank' to drop, which is the absence of a tone.
  const keyTones = new Map<string, KeyTone>()
  for (const [ch, col] of keyStates) {
    if (col !== 'blank') keyTones.set(ch, col)
  }

  // ─── Edit the active row (the player's next action) ─────
  // Typing a letter is the player's "next move", so it dismisses a
  // gesture-cleared soft reject. Both keyboards route through here — the
  // physical one via `act-type-letter` inside the capture hook, an on-screen
  // cap by calling it — so the dismiss lives in one place. Backspace needs no
  // twin: the ⌫ cap IS `act-delete-last`, and that binding already dismisses
  // on the way through. The slot is stable, so this stays effectively constant.
  const typeLetter = useCallback((ch: string) => {
    localFeedbackSlot.dismiss()
    setCurrent((c) => (c.length < 5 ? c + ch.toLowerCase() : c))
  }, [localFeedbackSlot])

  /**
   * What BOTH soft rejects do — `duplicate` and `notAWord`. They are separate
   * answers with separate branches; this is the work they happen to share, named
   * rather than left as a statement two branches fall into
   * (docs/envelopes.md → The shape of a call site).
   *
   * The rules were applied and no guess was burned, so the typed row stays put
   * and the board shakes instead. Takes the outcome and the sentence as ARGUMENTS
   * because the server wrote both, per answer — this function is the shared
   * mechanism, never the source of the words.
   *
   * `outcome` reaches the ring UNTOUCHED: `Board` takes the word and looks its
   * color up in the shared table, so this column narrows nothing and the ring
   * and the pill cannot say different things about one refusal. The nonce
   * beside it stays per game (docs/ui.md → "The verdict mark's state").
   */
  const softReject = useCallback(
    (outcome: Outcome, text: string) => {
      setPending(null)
      setRejectOutcome(outcome)
      setRejectNonce((n) => n + 1)
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
    },
    [localFeedbackSlot],
  )

  // ─── Submit a guess (stable across keystrokes) ────────────────
  const doSubmit = useCallback(
    async (word: string) => {
      if (word.length !== 5) {
        localFeedbackSlot.show(FeedbackMessage.result('warning', 'Not enough letters'))
        return
      }
      setSubmitting(true)
      // Optimistically keep the letters on the board through the round-trip so they
      // don't blink out. Reverted on any soft-reject below.
      setPending(word)
      const res = await runRpc<GuessAnswer>(
        db.rpc('submit_guess', { target_game: gameId, guess: word }),
      )
      setSubmitting(false)
      if (res.type === 'not-ok') {
        setPending(null)
        setRejectNonce((n) => n + 1)
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'duplicate' && res.message !== null) {
        softReject(res.outcome, res.message)
        return
      } else if (res.type === 'ok' && res.data.result === 'notAWord' && res.message !== null) {
        softReject(res.outcome, res.message)
        return
      } else if (res.type === 'ok' && res.data.result === 'correct') {
        // Accepted: clear the typing buffer. `pending` holds the word in place
        // until its colored row lands (then flips). Solving shows NOTHING extra
        // here — the win arrives with the colored row over realtime, the same
        // way it reaches everyone else.
        setCurrent('')
        return
      } else if (res.type === 'ok' && res.data.result === 'incorrect') {
        // Identical to `correct` on purpose, and a separate branch anyway: the
        // two differ in what they did to the GAME, not in what this column has
        // to do about it, and merging them would be a branch matching two
        // answers.
        setCurrent('')
        return
      } else {
        // The optimistic word is on the board waiting for a row that may never
        // arrive, so take it back before screaming.
        setPending(null)
        reportUnhandled('submit_guess', res)
        return
      }
    },
    [gameId, localFeedbackSlot, softReject],
  )

  // ─── Physical keyboard ────────────────────────────────────────
  // Drives the same pending-guess state (`current`) as the on-screen <Keyboard> below,
  // off the shared capture CORE — so wordle can't drift from the modifier bail /
  // focused-input guard / any-key-dismiss that the WordEntryInput games get. wordle has no
  // WordEntryInput (letters land on the Board, not a box), so it uses useCaptureKeys
  // ALONE â no arrows, since a played guess is on the board in front of you.
  const { actDeleteLast, actSubmitEntry } = useCaptureKeys({
    value: current,
    onChange: setCurrent,
    onSubmit: () => void doSubmit(current),
    charFor: asciiLetters('lower'),
    onAnyKey: localFeedbackSlot.dismiss,
    // Hard-off when the player can't act (loading / terminal / out of guesses /
    // mid-submit) OR while viewing history — no dispatch AND no dismissal.
    // Freezing capture while viewing lets a keystroke fall through to
    // `act-exit-history` (return to live) instead of typing behind the banner.
    // (A stray key could never remove the verdict anyway: it leaves only by
    // its owner.)
    disabled: !canGuess || isViewingHistory,
    maxLength: 5, // a guess is one 5-letter word
  })

  return (
    <div className={shared.boardCol}>
      <Board
        rows={historySnap ? historySnap.rows : rows}
        current={current}
        pending={historySnap ? '' : pendingWord}
        maxGuesses={maxGuesses}
        active={!isViewingHistory && canGuess}
        brand={brand}
        isViewingHistory={isViewingHistory}
        historyLitBoardRow={historySnap ? historySnap.historyLitBoardRow : -1}
        rejectNonce={rejectNonce}
        rejectOutcome={rejectOutcome}
        gameOver={gameOver}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
      />
      {/* The below-board region (universal). wordle is NON-SWAP: the feedback and the
          keyboard are separate and both always present, so the local feedback slot sits
          BETWEEN the board and the keyboard (Joel's call). `.localFeedback` reserves its
          own height so neither the board above nor the keyboard below reflows as the
          slot's top message comes and goes — a soft reject, "you're out", the
          whose-turn note, the verdict, whichever ranks highest. */}
      <div className={styles.belowBoard}>
        {/* The shared banner overlays the whole below-board region while a past turn
            is open — the feedback slot + the keyboard stay mounted underneath, their
            capture frozen, and the banner covers the keyboard so a stray key can't
            type. */}
        {isViewingHistory && historySnap && (
          <HistoryBanner
            label={historySnap.historyLabel}
            actor={historyActor}
            onExit={onExitHistory}
          />
        )}
        <div className={shared.localFeedback}>
          <FeedbackPill slot={localFeedbackSlot} />
        </div>
        <div className={styles.moveArea}>
          {/* Withdrawn at terminal, and its space kept — see `.gameOver` in
              GuessKeyboard.module.css. The verdict pill sits in the slot above,
              so nothing needs to move into the vacated area. */}
          <GuessKeyboard
            keyStates={keyTones}
            onKey={typeLetter}
            actSubmit={actSubmitEntry}
            actDelete={actDeleteLast}
            disabled={!canGuess}
            gameOver={gameOver !== null}
          />
        </div>
      </div>
    </div>
  )
}
