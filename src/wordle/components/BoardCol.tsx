import { useCallback, useState } from 'react'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { useCaptureKeys, asciiLetters } from '../../common/hooks/input/useCaptureKeys'
import { db } from '../db'
import { stickyPill } from '../../common/lib/game/localPills'
import { colorRank, tileColor, type TileColor } from '../lib/colors'
import type { SnapshotRow, TurnSnapshot } from '../lib/history'
import { Board } from './Board'
import { Keyboard } from './Keyboard'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** The below-board pill is never closeable, so the × never renders and this is
 *  never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

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
 * `snap` history override) + `readOnly` (the game-state half of "is the board
 * inert", which this column ORs with its own mid-submit state). Own-move
 * feedback lifts to PlayArea (its `showLocalFeedback` / `clearLocalFeedback` write the
 * shared below-board channel, which InfoCol's End / Concede also write), and the
 * fully-resolved below-board pill comes down as `localPill`. See
 * docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
  // ── Board to render (live rows + the history snapshot — PlayArea picks the log,
  //    this column picks live-vs-snapshot) ──
  rows,
  snap,
  maxGuesses,
  brand,
  // ── History viewer (its banner lives in the below-board region) ──
  onExitViewing,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  readOnly,
  showLocalFeedback,
  clearLocalFeedback,
  // ── Below-board pill (resolved by PlayArea) ──
  localPill,
}: {
  // ── Board to render ──
  /** The LIVE board rows (the viewer's own / the coop team board) — drives the
   *  keyboard letter-coloring, the in-flight `pendingWord` check, and the grid when
   *  not viewing history. */
  rows: SnapshotRow[]
  /** The open history turn's snapshot (its rows + ringed row + banner label), or null
   *  when live. Non-null exactly when viewing, so this column derives `viewing` from
   *  it. */
  snap: TurnSnapshot | null
  maxGuesses: number
  /** Brand name (manifest) for the grid's screen-reader label. */
  brand: string

  // ── History viewer ──
  /** Return to the live board (the banner click / ✕). */
  onExitViewing: () => void

  // ── Guess dispatch ──
  gameId: string
  /** The GAME-STATE half of the board gate — the board is inert (not a player,
   *  terminal, solved/conceded, out of guesses). This column ORs it with its own
   *  mid-submit / word-in-flight state to get the live `canGuess`. */
  readOnly: boolean
  /** Show an own-move pill (soft reject / RPC error). PlayArea owns the shared
   *  below-board channel (InfoCol's End / Concede write it too). */
  showLocalFeedback: (msg: GenericFeedbackMsg) => void
  /** Clear the sticky own-move pill (a keystroke / edit dismisses it). */
  clearLocalFeedback: () => void

  // ── Below-board pill ──
  /** The one pill to render in the fixed-height slot (terminal verdict / "you're out"
   *  / own-move soft-reject — resolved by PlayArea), or null. */
  localPill: GenericFeedbackMsg | null
}) {
  const [current, setCurrent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The accepted-but-not-yet-rendered guess: kept on the board (uncolored) from the
  // moment we submit until its colored server row arrives via realtime, so the letters
  // don't blink out during the round-trip. The row then flips in place. Cleared on
  // soft-reject, or once it lands.
  const [pending, setPending] = useState<string | null>(null)

  // Viewing a past turn ⟺ a snapshot is open (PlayArea sets `snap` only then).
  const viewing = snap !== null

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

  // ─── Edit the active row (dismisses any sticky local pill) ─────
  // Typing a letter or backspacing is the player's "next move", so it clears the last
  // soft-reject pill. Both the physical and on-screen keyboards route through these, so
  // the clear lives in one place. `clearLocalFeedback` is stable (the hook memoizes
  // it), so these stay effectively constant.
  const typeLetter = useCallback((ch: string) => {
    clearLocalFeedback()
    setCurrent((c) => (c.length < 5 ? c + ch.toLowerCase() : c))
  }, [clearLocalFeedback])
  const deleteLetter = useCallback(() => {
    clearLocalFeedback()
    setCurrent((c) => c.slice(0, -1))
  }, [clearLocalFeedback])

  // ─── Submit a guess (stable across keystrokes) ────────────────
  const doSubmit = useCallback(
    async (word: string) => {
      if (word.length !== 5) {
        showLocalFeedback(stickyPill('warning', 'Not enough letters'))
        return
      }
      setSubmitting(true)
      // Optimistically keep the letters on the board through the round-trip so they
      // don't blink out. Reverted on any soft-reject below.
      setPending(word)
      const { data, error } = await db.rpc('submit_guess', {
        target_game: gameId,
        guess: word,
      })
      setSubmitting(false)
      if (error) {
        setPending(null)
        // A real failure (not a soft reject) → error-toned, still sticky.
        showLocalFeedback(stickyPill('error', error.message))
        return
      }
      const res = data as { result: string }
      // Soft rejects (no guess burned, the typed row stays). An invalid word
      // (`notAWord`) reads as an error; the rest are non-error nudges (warning).
      if (res.result === 'notAWord') {
        setPending(null)
        showLocalFeedback(stickyPill('error', 'Not in word list'))
        return
      }
      if (res.result === 'duplicate') {
        setPending(null)
        showLocalFeedback(stickyPill('warning', 'Already guessed'))
        return
      }
      if (res.result === 'invalid') {
        setPending(null)
        showLocalFeedback(stickyPill('warning', 'Not enough letters'))
        return
      }
      // accepted (correct/incorrect): clear the typing buffer. `pending` holds the word
      // in place until its colored row lands (then flips).
      setCurrent('')
    },
    [gameId, showLocalFeedback],
  )

  // ─── Physical keyboard ────────────────────────────────────────
  // Drives the same pending-guess state (`current`) as the on-screen <Keyboard> below,
  // off the shared capture CORE — so wordle can't drift from the modifier bail /
  // focused-input guard / any-key-dismiss that the EntryBox games get. wordle is NOT an
  // EntryBox (letters land on the Board, not a box), so it uses useCaptureKeys
  // ALONE — no ArrowUp-recall / ArrowDown-clear (those are useArrowHistory, layered on
  // by <EntryRow> for the EntryBox games only).
  useCaptureKeys({
    value: current,
    onChange: setCurrent,
    onSubmit: () => void doSubmit(current),
    charFor: asciiLetters('lower'),
    onAnyKey: clearLocalFeedback,
    // Hard-off when the player can't act (loading / terminal / out of guesses /
    // mid-submit) OR while viewing history — no dispatch AND no feedback dismissal (the
    // sticky verdict survives a stray key). Freezing capture while viewing lets a
    // keystroke fall through to exitOnKey (return to live) instead of typing behind the
    // banner. clearLocalFeedback is a no-op at terminal anyway.
    disabled: !canGuess || viewing,
    maxLength: 5, // a guess is one 5-letter word
  })

  return (
    <div className={shared.boardCol}>
      <Board
        rows={snap ? snap.rows : rows}
        current={current}
        pending={snap ? '' : pendingWord}
        maxGuesses={maxGuesses}
        active={!viewing && canGuess}
        brand={brand}
        viewing={viewing}
        highlightRow={snap ? snap.highlightRow : -1}
      />
      {/* The below-board region (universal). wordle is NON-SWAP: the feedback and the
          keyboard are separate and both always present, so the local feedback area sits
          BETWEEN the board and the keyboard (Joel's call). `.localFeedback` reserves its
          own height so neither the board above nor the keyboard below reflows when its
          pill appears/clears; it holds exactly one centered pill (own-move soft-reject,
          sticky "you're out", or the permanent terminal verdict — see
          `localPill`) — or nothing. */}
      <div className={styles.belowBoard}>
        {/* Turn-viewer banner — while inspecting a past turn it overlays the whole
            below-board region (the feedback slot + the keyboard stay mounted underneath,
            their capture frozen). Opaque surface + yellow border = the shared "viewing
            history" marker; the description names the turn. Clicking anywhere / the ✕
            exits (the banner covers the keyboard so a stray key can't type). */}
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
        <div className={shared.localFeedback}>
          {localPill && <GenericFeedbackPill msg={localPill} onClose={noop} />}
        </div>
        <div className={styles.moveArea}>
          <Keyboard
            keyStates={keyStates}
            onKey={typeLetter}
            onEnter={() => void doSubmit(current)}
            onBackspace={deleteLetter}
            disabled={!canGuess}
          />
        </div>
      </div>
    </div>
  )
}
