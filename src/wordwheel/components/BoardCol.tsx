import { useCallback, useMemo, useState, type Dispatch, type SetStateAction , type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { terminalPill } from '../../common/lib/game/localPills'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { asciiLetters } from '../../common/hooks/input/useCaptureKeys'
import { MobileStatusBar } from '../../common/components/game/MobileStatusBar'
import { RankBar } from '../../common/components/game/RankBar'
import { Stats } from '../../common/components/game/Stats'
import { wordFitsWheel } from '../lib/tiles'
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
  // ── Mobile-only status block (above the board) ──
  foundWordsScore,
  requiredWordsScore,
  foundWordsCount,
  requiredWordsCount,
  // ── Board to render ──
  outerLetters,
  centerLetter,
  letterCounts,
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
  // ── Mobile-only status block ──
  /** The four figures behind the RankBar + Stats unit — the SAME components the
   *  info column renders, mirrored above the board below the `--mobile`
   *  breakpoint (where the info column is off-canvas in the InfoSheet). Hidden by
   *  CSS on desktop; see `<MobileStatusBar>`. */
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number

  // ── Board to render ──
  /** The board's outer letters (a string) — the local shuffle rearranges this. */
  outerLetters: string
  centerLetter: string
  /** Per-letter tile counts of the whole wheel (centre + outers), lower-cased —
   *  the wheel is a multiset, so `<TypedWord>`'s illegal dim needs counts, not a
   *  set (a letter is legal as many times as it has tiles). */
  letterCounts: Map<string, number>

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
  /** The shared `TerminalCopy`, extended with an optional NODE verdict — the one
   *  case (compete's "● alice won at …") where the pill needs a widget rather
   *  than a string. Same `over` object InfoCol receives as a plain
   *  `TerminalCopy`; this column reads `tone` + the verdict to show a permanent
   *  below-board pill at game-over. */
  over: (TerminalCopy & { verdictNode?: ReactNode }) | null
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

  // Per-letter counts of the typed word (lower-cased). Each tile is SPENT per
  // use, so the wheel dims one same-letter tile per occurrence typed (the
  // centre first — see Wheel's spend order).
  const typedCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of word.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [word])

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
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the rank bar + stat grid, above the board. A small BLOCK rather than the
          bar's one-line default, so PlayArea.module.css raises
          `--mobile-status-height` AND takes it out of `--avail-h` — the wheel
          sizes itself from that number, so leaving it alone would size a board
          that no longer fits (the hard no-scroll invariant). */}
      <MobileStatusBar>
        <div className={styles.mobileStatus}>
          <RankBar score={foundWordsScore} total={requiredWordsScore} />
          <Stats
            foundWordsScore={foundWordsScore}
            requiredWordsScore={requiredWordsScore}
            foundWordsCount={foundWordsCount}
            requiredWordsCount={requiredWordsCount}
          />
        </div>
      </MobileStatusBar>
      <Wheel
        outerLetters={outerShuffled}
        centerLetter={centerLetter}
        onLetterClick={handleLetterClick}
        typedCounts={typedCounts}
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
            // Veto submit when the typed word can't be spelled from the wheel's
            // tiles (an off-wheel letter, or a letter used more times than it has
            // tiles — the same characters <TypedWord> dims). Editing stays live;
            // only Submit + Enter are inert, so "FOOD" on a wheel without F/O
            // can't submit and read as "not a word". A word that DOES fit but is
            // missing the centre / isn't in the list stays submittable — that
            // reject carries a genuinely useful reason.
            submitDisabled={!wordFitsWheel(word, letterCounts)}
            pill={
              isTerminal && over
                ? terminalPill(over.tone, over.verdictNode ?? over.verdict)
                : word === ''
                  ? localPill
                  : null
            }
          >
            <TypedWord word={word} letterCounts={letterCounts} />
          </EntryRow>
        </div>
      </div>
    </div>
  )
}
