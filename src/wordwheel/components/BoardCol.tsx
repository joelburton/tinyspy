// cs-met-wordwheel

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { trimClaims, type Claim } from '../lib/spend'
import { wordFitsWheel } from '../lib/tiles'
import { Wheel } from './Wheel'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'

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
  refused,
  outerLetters,
  centerLetter,
  letterCounts,
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
  /** A refused word's mark, while its answer is up: how many of each letter it
   *  used, and the outcome those tiles wear as they shake. */
  refused: Mark<{ counts: Map<string, number>; outcome: Outcome }> | null
  /** The board's outer letters (a string) — the local shuffle rearranges this. */
  outerLetters: string
  centerLetter: string
  /** Per-letter tile counts of the whole wheel (center + outers), lower-cased —
   *  the wheel is a multiset, so `<TypedWord>`'s illegal dim needs counts, not a
   *  set (a letter is legal as many times as it has tiles). */
  letterCounts: Map<string, number>

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

  // WHICH tile each use of a letter spends. A click claims the tile it landed
  // on; everything else falls to the render order (see lib/spend.ts). The claims
  // live here because this column owns both halves of a change — the click that
  // makes one and the typing that can take it away.
  const [claims, setClaims] = useState<Claim[]>([])

  const handleLetterClick = useCallback(
    (letter: string, ordinal: number) => {
      localFeedbackSlot.dismiss()
      setClaims((c) => [...c, { letter, ordinal }])
      onChange((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, onChange],
  )

  // Every OTHER way the word changes — a keystroke, a Backspace, the ArrowUp
  // recall, the box clearing on submit — can only take claims away, never make
  // one: the player named no tile. Trimming against the new word is the whole of
  // it, and an empty box drops the lot.
  const handleChange = useCallback(
    (next: SetStateAction<string>) => {
      setClaims((c) => trimClaims(c, typeof next === 'string' ? next : next(word)))
      onChange(next)
    },
    [onChange, word],
  )

  // Per-letter counts of the typed word (lower-cased). Each tile is SPENT per
  // use, so the wheel dims one same-letter tile per occurrence typed (the
  // center first — see Wheel's spend order).
  const typedCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of word.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [word])

  // ⌥Z shuffles — a fresh visual scan of the SAME letters, never a move. Bound
  // HERE rather than in the PlayArea because this column owns the display order,
  // and plainly active: shuffling writes nothing and reaches nobody else, so the
  // post-game fidget is deliberate — the round pill below is this same binding.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: handleShuffle,
  })

  return (
    <div className={cls(shared.boardCol, bee.boardCol)}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the rank bar + stat grid, above the board. A small BLOCK rather than the
          bar's one-line default, so PlayArea.module.css raises
          `--mobile-status-height` AND takes it out of `--avail-h` — the wheel
          sizes itself from that number, so leaving it alone would size a board
          that no longer fits (the hard no-scroll invariant). */}
      <MobileStatusBar>
        <div className={bee.mobileStatus}>
          <RankBar score={foundWordsScore} total={requiredWordsScore} targetIdx={targetRankIdx} />
          <Stats
            foundWordsScore={foundWordsScore}
            requiredWordsScore={requiredWordsScore}
            foundWordsCount={foundWordsCount}
            requiredWordsCount={requiredWordsCount}
          />
        </div>
      </MobileStatusBar>
      <Wheel
        refused={refused}
        outerLetters={outerShuffled}
        centerLetter={centerLetter}
        onLetterClick={handleLetterClick}
        claims={claims}
        typedCounts={typedCounts}
        // Shuffle floats over the wheel's top-right — a fresh visual scan of the
        // SAME board, not a turn action. Always clickable, even when locked (a
        // harmless rearrange). Passed into Wheel so it anchors to the visual
        // wheel, not the column.
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
            onChange={handleChange}
            onSubmit={onSubmit}
            placeholder="Type or click letters"
            disabled={isTerminal}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            // Veto submit when the typed word can't be spelled from the wheel's
            // tiles (an off-wheel letter, or a letter used more times than it has
            // tiles — the same characters <TypedWord> dims). Editing stays live;
            // only Submit + Enter are inert, so "FOOD" on a wheel without F/O
            // can't submit and read as "not a word". A word that DOES fit but is
            // missing the center / isn't in the list stays submittable — that
            // reject carries a genuinely useful reason.
            submitDisabled={!wordFitsWheel(word, letterCounts)}
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={word} letterCounts={letterCounts} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
