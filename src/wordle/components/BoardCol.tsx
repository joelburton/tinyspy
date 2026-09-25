// cs-blessed-wordle

import { notOkOutcome, runRpc } from '@/common/supabase/dbResult'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { useCallback, useState } from 'react'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useCaptureKeys, asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { WORD_LENGTH } from '../lib/setup'
import { colorRank, tileColor, type TileColor } from '../lib/colors'
import type { HistorySnapshotRow, HistorySnapshot } from '../lib/history'
import { Board } from './Board'
import { GuessKeyboard, type KeyTone } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import { useMark } from '@/common/board-marks/useMark'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * What `wordle.submit_guess` puts in `data` — the fact, and nothing about how
 * it reads: the words and the color are `lib/answer.ts`'s, keyed on `result`.
 *
 * A UNION, because the two halves are not the same answer wearing one shape. A
 * soft reject burns no guess and carries no colors — there is no row to color —
 * while an accepted guess always has them.
 */
type GuessAnswer =
  // Soft rejects: the rules were applied, nothing was burned, the typed row
  // stays.
  | {
      result: 'duplicate' | 'notAWord'
      guesses_used: number
      solved: false
      terminal: false
    }
  // Accepted: the guess is recorded. `colors` and the finish reach this surface
  // by realtime like everyone else's, so neither is read here.
  | {
      result: 'correct' | 'incorrect'
      colors: string
      guesses_used: number
      solved: boolean
      terminal: boolean
    }

/**
 * wordle's board column — the `<Board>` plus the region under it: the
 * turn-viewer banner, the local-feedback pill slot, and the on-screen keyboard.
 *
 * It owns the guess being typed (`current`), the one out for judgment
 * (`pending`) and the `submit_guess` RPC that turns the first into the second.
 * The physical keys and the on-screen caps drive that same `current`.
 *
 * Everything else is handed down: the board to draw (the live `rows`, or
 * `historySnap` when a past turn is open), and `readOnly`, which this column
 * ORs with its own mid-submit state. The feedback slot belongs to PlayArea —
 * this column shows its soft rejects into it and draws it. See docs/playarea.md.
 */
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
  terminalOutcome,
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
  // Whose board is on screen, when it is not the viewer's own — at terminal a
  // compete log can open an opponent's row. Undefined for the viewer's own.
  historyActor: Actor | undefined
  maxGuesses: number
  // Brand name (manifest) for the grid's `aria-label`, a test handle.
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
  // The game is finished, and how — bands the board in that outcome. Null while
  // live.
  terminalOutcome: TerminalOutcome | null
  // Turn-order coop: a teammate holds the move, so the board dims.
  notMyTurn: boolean
  // True for a beat as the turn becomes mine — the frame flashes yellow.
  myTurnJustStarted: boolean
}) {
  // ─── Which board is on screen ──────────────────────────
  // Live, or a past turn's snapshot — and everything that would WRITE to the
  // board answers to it: the capture is frozen and the active row is not drawn.

  // Viewing a past turn ⟺ a snapshot is open (PlayArea sets `historySnap` only then).
  const isViewingHistory = historySnap !== null

  // ─── The pending guess ─────────────────────────────────
  // The state this column owns — the letters being typed and the word that is
  // out — and everything that reads or resets it.

  const [current, setCurrent] = useState('')
  // The accepted-but-not-yet-rendered guess: kept on the board (uncolored) from the
  // moment we submit until its colored server row arrives via realtime, so the letters
  // don't blink out during the round-trip. The row then flips in place. Cleared on
  // soft-reject, or once it lands.
  const [pending, setPending] = useState<string | null>(null)

  // The pending word, shown until its colored row lands and takes its place.
  // `pending` may linger stale after that, but this is the value everything
  // reads — harmless, since `rows` only grows: a Restart remounts the whole
  // surface (GamePage keys it on `restarts`), so nothing here outlives a run.
  const pendingLanded = pending != null && rows.some((r) => r.guess === pending)
  const pendingWord = pending && !pendingLanded ? pending : ''

  // Typing a letter is the player's "next move", so it dismisses a
  // gesture-cleared soft reject. Both keyboards route through here — the
  // physical one via `act-type-letter` inside the capture hook, an on-screen cap
  // by calling it — so the dismiss lives in one place. Delete needs no twin: its
  // cap IS `act-delete-last`, which dismisses on the way through.
  const typeLetter = useCallback((ch: string) => {
    localFeedbackSlot.dismiss()
    setCurrent((c) => (c.length < WORD_LENGTH ? c + ch.toLowerCase() : c))
  }, [localFeedbackSlot])

  // ─── The marks this column owns ────────────────────────

  // The refusal mark on the active row — it rings and shakes in the refusal's
  // outcome, which `<Board>` reads off the mark so the ring and the pill beside
  // it cannot name two different words. `WORD_ANSWER_MS` is the beat for a word
  // wearing its answer, and the row keys on the mark's nonce, so refusing the
  // same word twice shakes twice.
  const [reject, showReject] = useMark<Outcome>(WORD_ANSWER_MS)

  // ─── Committing a guess ────────────────────────────────
  // The move RPC and the two commands beside it, kept with the entry they
  // commit.

  const [submitting, setSubmitting] = useState(false)
  // The live gate: the game permits guessing (PlayArea) AND I'm not mid-submit / with a
  // word in flight (this column's input state).
  const canGuess = !readOnly && !submitting && !pendingWord

  /**
   * What BOTH soft rejects do — `duplicate` and `notAWord`. The rules were
   * applied and no guess was burned, so the typed row stays put and the board
   * shakes instead.
   *
   * Takes the answer's NAME and asks `lib/answer.ts` how it reads, so the words
   * have one source. The outcome then reaches the mark and the pill untouched,
   * and neither can say a different thing about one refusal.
   */
  const softReject = useCallback(
    (answerType: 'duplicate' | 'not_a_word') => {
      const { outcome, text } = answerMessage({ answerType })
      setPending(null)
      showReject(outcome)
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
    },
    [localFeedbackSlot, showReject],
  )

  // Submit a guess (stable across keystrokes).
  const doSubmit = useCallback(
    async (word: string) => {
      if (word.length !== WORD_LENGTH) {
        const { outcome, text } = answerMessage({ answerType: 'too_short' })
        localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
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
        // The mark wears the refusal's own outcome — the same word the pill
        // reads off the envelope — not whatever the last soft reject left.
        showReject(notOkOutcome(res))
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'duplicate') {
        softReject('duplicate')
        return
      } else if (res.type === 'ok' && res.data.result === 'notAWord') {
        softReject('not_a_word')
        return
      } else if (res.type === 'ok' && res.data.result === 'correct') {
        // Accepted: clear the typing buffer. `pending` holds the word in place
        // until its colored row lands (then flips). Solving shows NOTHING extra
        // here — the win arrives with the colored row over realtime, the same
        // way it reaches everyone else.
        setCurrent('')
        return
      } else if (res.type === 'ok' && res.data.result === 'incorrect') {
        // Deliberately identical to `correct`, and still its own branch: one
        // branch per answer (docs/envelopes.md → The shape of a call site).
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
    [gameId, localFeedbackSlot, softReject, showReject],
  )

  // The physical keyboard, driving the same `current` the on-screen one does.
  // wordle has no text box — letters land on the board — so it takes the shared
  // capture core alone; `useCaptureKeys` says what that core handles.
  const { actDeleteLast, actSubmitEntry } = useCaptureKeys({
    value: current,
    onChange: setCurrent,
    onSubmit: () => void doSubmit(current),
    charFor: asciiLetters('lower'),
    onAnyKey: localFeedbackSlot.dismiss,
    // Hard-off when the player can't act, and while viewing history — no
    // dispatch and no dismissal. Frozen capture is what lets a keystroke fall
    // through to `act-exit-history` instead of typing behind the banner.
    disabled: !canGuess || isViewingHistory,
    maxLength: WORD_LENGTH,
  })

  // ─── The keyboard's letters ────────────────────────────
  // What each key has earned — purely visual, this client's reading of the
  // live rows, and it touches nothing else.

  // Per-key feedback state — the strongest color each letter has earned across the LIVE
  // board (drives the on-screen keyboard tinting).
  const keyStates = new Map<string, TileColor>()
  for (const r of rows) {
    for (let i = 0; i < WORD_LENGTH; i++) {
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

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={shared.boardCol}>
      <Board
        rows={historySnap ? historySnap.rows : rows}
        liveRowCount={rows.length}
        current={current}
        pending={historySnap ? '' : pendingWord}
        maxGuesses={maxGuesses}
        active={!isViewingHistory && canGuess}
        brand={brand}
        isViewingHistory={isViewingHistory}
        historyLitBoardRow={historySnap ? historySnap.historyLitBoardRow : -1}
        reject={reject}
        terminalOutcome={terminalOutcome}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
      />
      {/* The below-board region. The feedback slot sits BETWEEN the board and
          the keyboard, both of which are always present, and `.localFeedback`
          reserves its own height so neither reflows as the slot's top message
          comes and goes. */}
      <div className={styles.belowBoard}>
        {/* The banner overlays the whole region while a past turn is open: the
            slot and the keyboard stay mounted underneath, capture frozen. */}
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
          {/* Stays at terminal, disabled — `canGuess` is already false there.
              Its caps hold the color every letter earned, which is the record of
              the game just played and is worth reading once it is over. */}
          <GuessKeyboard
            keyStates={keyTones}
            onKey={typeLetter}
            actSubmit={actSubmitEntry}
            actDelete={actDeleteLast}
            disabled={!canGuess}
          />
        </div>
      </div>
    </div>
  )
}
