// cs-unmet

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import type { Outcome } from '@/common/outcomes/outcomes'
import { Letters } from './Letters'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/bee-games/foundWordsPlayArea.module.css'

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
 * spellingbee's board column — the honeycomb `<Letters>`, a floating Shuffle over its
 * top-right, and the below-board slot (the shared `<WordEntryArea>` — the typed-word input
 * + capture keyboard, whose `<WordEntryInput>` renders the per-character illegal-letter dim
 * via `<TypedWord>`).
 *
 * It owns the **local outer-letter shuffle** (a per-player view-only rearrange — never
 * persisted or shared) and a click on an outer/center letter appending to the word.
 * The word-entry ENGINE (`useFoundWordSubmit`: the typed word, the submit RPC, the
 * results) stays in PlayArea, as does the local feedback slot it shows into —
 * InfoCol's End / Concede and PlayArea's standing conditions show into the
 * same slot — so PlayArea passes the entry primitives (`word` / `onChange` /
 * `onSubmit` / the slot / …) DOWN and this column renders them (a thin-input
 * game, like boggle/connections). See docs/playarea.md.
 */
export function BoardCol({
  // ── Mobile-only status block (above the board) ──
  foundWordsScore,
  requiredWordsScore,
  targetRankIdx,
  foundWordsCount,
  requiredWordsCount,
  // ── Board to render ──
  shakeNonce,
  answered,
  outerLetters,
  centerLetter,
  allowedLetters,
  // ── Word entry (engine in PlayArea; rendered here) ──
  word,
  onChange,
  onSubmit,
  localFeedbackSlot,
  lastWord,
  isTerminal,
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
  /** The goal rank, when the game has one — marked on the mobile RankBar
   *  exactly as on the info column's copy (which is off-canvas on a phone,
   *  so this is the only place the goal shows there). */
  targetRankIdx: number | null

  // ── Board to render ──
  /** Bumped by PlayArea on every refused word — keys the hive, so it remounts
   *  and replays the head-shake. */
  shakeNonce: number
  /** The letters a refused word used, wearing its answer — those hexes take the
   *  outcome's fill and white ink. Null when nothing was just refused, which is
   *  nearly always. */
  answered: { letters: Set<string>; outcome: Outcome } | null
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
  /** PlayArea's below-board slot — the entry row draws its top in place of the
   *  controls, and a letter click is the player's next action, so it dismisses
   *  a gesture-cleared result. */
  localFeedbackSlot: FeedbackSlot
  /** The last submitted word, for ArrowUp recall. */
  lastWord: string
  /** Freeze the entry controls at terminal (the engine also blocks a conceder). */
  isTerminal: boolean
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

  // The hexes the typed word is using. A Set of its letters is the whole of it:
  // a hive letter can be typed more than once and there is nothing to count.
  const usedLetters = useMemo(() => new Set(word.toUpperCase()), [word])

  const handleLetterClick = useCallback(
    (letter: string) => {
      localFeedbackSlot.dismiss()
      onChange((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, onChange],
  )

  // ⌥Z shuffles — a fresh visual scan of the SAME letters, never a move. Bound
  // HERE rather than in the PlayArea because this column owns the display order,
  // and plainly active: shuffling writes nothing and reaches nobody else, so the
  // post-game fidget is deliberate — the round pill below is this same binding.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: handleShuffle,
  })

  return (
    <div className={cls(shared.boardCol, surface.boardCol)}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the rank ladder + score/words, above the hive. A fixed-height block —
          the hive's `--avail-h` already has it subtracted, so the board shrinks
          by exactly this much and the page still doesn't scroll. */}
      <MobileStatusBar>
        <div className={surface.mobileStatus}>
          <RankBar score={foundWordsScore} total={requiredWordsScore} targetIdx={targetRankIdx} />
          <Stats
            foundWordsScore={foundWordsScore}
            requiredWordsScore={requiredWordsScore}
            foundWordsCount={foundWordsCount}
            requiredWordsCount={requiredWordsCount}
          />
        </div>
      </MobileStatusBar>
      <Letters
        shakeNonce={shakeNonce}
        answered={answered}
        outerLetters={outerShuffled}
        centerLetter={centerLetter}
        onLetterClick={handleLetterClick}
        usedLetters={usedLetters}
        // Shuffle floats over the hive's top-right — a fresh visual scan of the
        // SAME board, not a turn action. Always clickable, even when locked (a
        // harmless rearrange). Passed into Letters so it anchors to the visual
        // hive, not the column.
        floatingControl={
          <ShuffleButton
            action={actShuffle}
            tooltip="Shuffle outer letters"
            className={shared.floatingShuffle}
          />
        }
      />
      {/* The below-board slot — the shared <WordEntryArea> (icon-only Delete + the WordEntryInput
          + icon-only Submit + the capture keyboard).
          The WordEntryInput renders the per-character illegal-letter dim via <TypedWord>.
          While the slot holds a message, WordEntryArea draws it in place of the
          controls (same slot, no reflow) — the verdict, "you're out", a word
          result, whichever ranks highest. */}
      <div className={surface.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <WordEntryArea
            value={word}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder="Type or click letters"
            disabled={isTerminal}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={word} allowedLetters={allowedLetters} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
