import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { terminalPill } from '../../common/lib/game/localPills'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { asciiLetters } from '../../common/hooks/input/useCaptureKeys'
import { Wheel } from './Wheel'
import { TypedWord } from './TypedWord'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

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
 * wordwheel's board column — the `<Wheel>`, a floating Shuffle over its
 * top-right, and the below-board slot (the shared `<EntryRow>` — the typed-word input
 * + capture keyboard, whose `<EntryBox>` renders the per-character illegal-letter dim
 * via `<TypedWord>`).
 *
 * It owns the **local outer-letter shuffle** (a per-player view-only rearrange — never
 * persisted or shared), a click on an outer/center letter appending to the word, and
 * the Space-shuffles capture extra key. The word-entry ENGINE (`useWordSubmit`: the
 * typed word, the submit RPC, the feedback) stays in PlayArea, because its feedback
 * channel is also written by InfoCol's End / Concede — so PlayArea passes the entry
 * primitives (`word` / `onChange` / `onSubmit` / `localPill` / …) DOWN and this column
 * renders them (a thin-input game, like boggle/connections). See
 * docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
  // ── Board to render ──
  outerLetters,
  centerLetter,
  allowedLetters,
  // ── Word entry (engine in PlayArea; rendered here) ──
  word,
  onChange,
  onSubmit,
  localPill,
  clearLocalFeedback,
  lastWord,
  isTerminal,
  // ── Below-board pill ──
  over,
}: {
  // ── Board to render ──
  /** The board's outer letters (a string) — the local shuffle rearranges this. */
  outerLetters: string
  centerLetter: string
  /** The center + outer letters, lower-cased — drives `<TypedWord>`'s illegal dim. */
  allowedLetters: Set<string>

  // ── Word entry ──
  /** The pending typed word. */
  word: string
  /** Set the pending word (a value or an updater — a letter click appends). */
  onChange: Dispatch<SetStateAction<string>>
  onSubmit: () => void
  /** The own-move pill to show while the entry is empty (a word result), or null. */
  localPill: GenericFeedbackMsg | null
  /** Dismiss the sticky own-move pill (a keystroke / letter click clears it). */
  clearLocalFeedback: () => void
  /** The last submitted word, for ArrowUp recall. */
  lastWord: string
  /** Freeze the entry controls at terminal (the engine also blocks a conceder). */
  isTerminal: boolean

  // ── Below-board pill ──
  /** The shared `TerminalCopy`, extended with a wordwheel-specific `indicator`
   *  (the detailed below-board status line, e.g. "Genius! 12/93 points"). Same
   *  `over` object InfoCol receives as a plain `TerminalCopy`; this column reads
   *  `tone` + `indicator` to show a permanent below-board pill at game-over. */
  over: (TerminalCopy & { indicator: string }) | null
}) {
  // Local visual shuffle of the outer letters — a `shuffleSeed` counter drives a memo
  // (avoids storing the order in state + a sync effect). Keyed on the outer-letters
  // STRING (not the game object — a realtime refetch returns a fresh object even when
  // the letters didn't change, which would re-shuffle on every submit).
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const outerShuffled = useMemo(() => {
    if (!outerLetters) return []
    void shuffleSeed
    return shuffled(Array.from(outerLetters))
  }, [outerLetters, shuffleSeed])
  const handleShuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])

  const handleLetterClick = useCallback(
    (letter: string) => {
      clearLocalFeedback()
      onChange((prev) => prev + letter.toUpperCase())
    },
    [clearLocalFeedback, onChange],
  )

  // Letters already in the typed word (lower-cased). Each tile is used ONCE per
  // word, so the wheel disables a tile once its letter appears here.
  const usedLetters = useMemo(() => new Set(word.toLowerCase()), [word])

  // Space shuffles the outer letters — wordwheel's one capture-entry extra key (the
  // shared <EntryRow> owns the rest of the keyboard).
  const handleEntryExtraKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        handleShuffle()
        return true
      }
      return false
    },
    [handleShuffle],
  )

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <Wheel
        outerLetters={outerShuffled}
        centerLetter={centerLetter}
        onLetterClick={handleLetterClick}
        usedLetters={usedLetters}
        // Shuffle floats over the wheel's top-right — a fresh visual scan of the
        // SAME board, not a turn action. Always clickable, even when locked (a
        // harmless rearrange). Passed into Wheel so it anchors to the visual
        // wheel, not the column.
        floatingControl={
          <ShuffleButton
            onShuffle={handleShuffle}
            label="Shuffle outer letters"
            className={shared.floatingShuffle}
          />
        }
      />
      {/* The below-board slot — the shared <EntryRow> (icon-only Delete + the EntryBox
          + icon-only Submit + the capture keyboard; Space shuffles via onExtraKey).
          The EntryBox renders the per-character illegal-letter dim via <TypedWord>.
          When `pill` is set, EntryRow shows it in place of the controls (same slot, no
          reflow): the terminal verdict (permanent fill) takes precedence over an
          own-move result, which shows only while the entry is empty. */}
      <div className={styles.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <EntryRow
            value={word}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder="Type or click letters"
            disabled={isTerminal}
            onAnyKey={clearLocalFeedback}
            charFor={asciiLetters('upper')}
            onExtraKey={handleEntryExtraKey}
            recall={lastWord}
            pill={
              isTerminal && over
                ? terminalPill(over.tone, `Game over — ${over.indicator}`)
                : word === ''
                  ? localPill
                  : null
            }
          >
            <TypedWord word={word} allowedLetters={allowedLetters} />
          </EntryRow>
        </div>
      </div>
    </div>
  )
}
