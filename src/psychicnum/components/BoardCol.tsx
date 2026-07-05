import { useCallback, useMemo, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { db } from '../db'
import { capitalize } from '../lib/capitalize'
import { stickyPill, terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import { Board } from './Board'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** The terminal / waiting pills are never closeable, so the × is never rendered and
 *  this is never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

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
 * which InfoCol's Hint / Reveal / End also write). See docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
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
  showLocalFeedback,
  clearLocalFeedback,
  localPill,
  // ── Below-board slot content ──
  over,
  secrets,
  myConceded,
}: {
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
  /** May I guess right now? Gates the entry (vs a waiting / terminal pill) + tile clicks. */
  canGuess: boolean
  /** Show an own-move pill (Correct / Incorrect / a rejected guess). PlayArea owns
   *  the shared below-board channel (InfoCol's Hint / Reveal / End write it too). */
  showLocalFeedback: (msg: GenericFeedbackMsg) => void
  /** Clear the sticky own-move pill (a new guess / keystroke dismisses it). */
  clearLocalFeedback: () => void
  /** The own-move pill to render in the entry's slot, or null. */
  localPill: GenericFeedbackMsg | null

  // ── Below-board slot content ──
  /** Terminal copy — its verdict + the secret reveal show as a permanent pill. */
  over: TerminalCopy | null
  /** The three secret words, revealed at game-over (terminal only), else null. */
  secrets: string[] | null
  /** I conceded a compete race — picks the "waiting" pill's wording. */
  myConceded: boolean
}) {
  // The pending guess, shared by the board tiles and the entry below the board.
  const [pending, setPending] = useState('')
  // The last submitted guess, kept so ArrowUp can recall it into the entry.
  const [lastGuess, setLastGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      showLocalFeedback(stickyPill('error', 'Not on the board'))
      return
    }
    setSubmitting(true)
    // submit_guess returns 'won' | 'correct' | 'wrong' | 'lost'. 'won'/'correct'
    // both mean the guess hit a secret; the terminal transition we observe via
    // realtime, not the return value.
    const { data, error } = await db.rpc('submit_guess', { target_game: gameId, guess })
    setSubmitting(false)
    if (error) {
      showLocalFeedback(stickyPill('error', capitalize(error.message)))
      return
    }
    showLocalFeedback(
      stickyPill(
        data === 'won' || data === 'correct' ? 'success' : 'error',
        data === 'won' || data === 'correct' ? 'Correct' : 'Incorrect',
      ),
    )
  }

  // Picking a tile or typing both drive this one pending guess word. (A partial word
  // won't equal any board word, so the board only highlights once a tile is clicked
  // or the full word is typed.)
  const selected = pending === '' ? null : pending

  return (
    <div className={shared.boardCol}>
      <Board
        words={shuffledWords}
        results={results}
        selected={viewing ? null : selected}
        onPick={canGuess && !viewing ? handleEntryChange : undefined}
        viewing={viewing}
        highlightWord={highlightWord}
      />
      {/* Shuffle floats over the board's top-right — purely visual (a fresh scan of
          the SAME board), not a turn action, so it lives on the board, not in the
          info-column action row. Always present, even at terminal. */}
      <ShuffleButton
        onShuffle={handleShuffle}
        label="Shuffle the words"
        className={shared.floatingShuffle}
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
        <div className={cls(shared.moveAreaOrLocalFeedback, viewing && styles.slotViewing)}>
          {/* Turn-viewer banner — while inspecting a past turn it overlays this slot
              (the entry / pill stays mounted underneath, its capture frozen). Opaque
              surface + yellow border = the shared "viewing history" marker; the
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
          {over ? (
            <div className={shared.localPill}>
              <GenericFeedbackPill
                msg={terminalPill(
                  over.tone,
                  secrets ? `The words were ${secrets.join(', ').toUpperCase()}` : 'Game over.',
                )}
                onClose={noop}
              />
            </div>
          ) : canGuess ? (
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
              // While viewing history the capture is a hard no-op — so typing behind
              // the banner never accumulates, and the keystroke goes to exitOnKey.
              disabled={viewing}
              onAnyKey={clearLocalFeedback}
              recall={lastGuess}
              className={styles.bigEntry}
              pill={pending === '' ? localPill : null}
            />
          ) : (
            <div className={shared.localPill}>
              <GenericFeedbackPill
                msg={outOfRacePill(myConceded, 'Out of guesses — waiting on the rest.')}
                onClose={noop}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
