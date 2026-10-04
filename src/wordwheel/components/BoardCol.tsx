// cs-blessed-wordwheel

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { useSubmitWord } from '../hooks/useSubmitWord'
import { wordFitsWheel } from '../lib/tiles'
import { Board } from './Board'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'
import type { GGameData, GTile } from '../types'

/**
 * wordwheel's board column — the `<Board>`, a floating Shuffle over its
 * top-right, and the below-board region: the shared `<WordEntryArea>`, whose
 * typed word is drawn through `<TypedWord>` so a letter the wheel cannot spell
 * dims.
 *
 * It owns the **move**: submitting the typed word (`useSubmitWord`, which also
 * holds which tile each click spent), what the board shows for the answer, and
 * the tile click that appends its letter to the word. See docs/playarea.md.
 */
export function BoardCol({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  // PlayArea's below-board slot — every answer shows into it, and the entry
  // row draws it in place of the controls.
  localFeedbackSlot: FeedbackSlot
}) {
  // The board is mine to touch: the board and the entry take letters, and a
  // word can be submitted. False once the game is over, or I conceded a race
  // the others play on.
  const isInteractive = gd.me.onTurn

  const { centerLetter, outerLetters } = gd.puzzle

  // The wheel's tile counts — the typed word's dim and the submit
  // gate. The wheel is a MULTISET — a letter may sit on two tiles — so a word
  // may use a letter as many times as it has tiles: a COUNT, not membership.
  const letterToCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of outerLetters + centerLetter) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [outerLetters, centerLetter])

  // ─── The move ──────────────────────────────────────────
  const submission = useSubmitWord({
    gameId: gd.id,
    words: gd.puzzle.words,
    tilesById: gd.puzzle.tilesById,
    foundWords: gd.foundWords,
    centerLetter,
    isMyTurn: isInteractive,
    localFeedbackSlot,
  })

  // ─── The pending word ──────────────────────────────────
  // The typed word is the move's, above; what this column reads off it, and
  // the tile click that adds to it, sit here.

  // A click is my next action, so it dismisses a gesture-cleared result.
  function handleTileClick(tile: GTile) {
    localFeedbackSlot.dismiss()
    submission.addClickedTile(tile)
  }

  // Per-letter counts of the typed word: each use SPENDS one tile
  // of its letter, and `lib/spend.ts` says which. Empty once the board is
  // inert, so a word left half-typed when the game ended, or when I conceded,
  // drops its marks.
  const typedCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (!isInteractive) return m
    for (const ch of submission.word) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [isInteractive, submission.word])

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={cls(shared.boardCol, bee.boardCol)}>
      {/* Mobile only (`<MobileStatusBar>` is CSS-hidden on desktop): the rank
          ladder and the figures, above the board. A fixed-height block, already
          subtracted from the board's `--avail-h`. */}
      <MobileStatusBar>
        <div className={bee.mobileStatus}>
          <RankBar
            score={gd.stateLineData.foundWordsScore}
            total={gd.stateLineData.reqdWordsScore}
            targetIdx={gd.stateLineData.targetRankIdx}
          />
          <Stats
            foundWordsScore={gd.stateLineData.foundWordsScore}
            requiredWordsScore={gd.stateLineData.reqdWordsScore}
            foundWordsCount={gd.stateLineData.nFoundWords}
            requiredWordsCount={gd.stateLineData.nReqdWords}
          />
        </div>
      </MobileStatusBar>
      <Board
        tiles={gd.puzzle.tiles}
        isInteractive={isInteractive}
        onTileClick={handleTileClick}
        typedCounts={typedCounts}
        claimedTileIds={submission.claimedTileIds}
        refused={submission.refused}
      />
      {/* The below-board slot: `<WordEntryArea>` draws the controls, or the
          slot's message in their place — the same slot, so nothing reflows. */}
      <div className={surface.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <WordEntryArea
            value={submission.word}
            onChange={submission.setWord}
            onSubmit={submission.submit}
            placeholder="Type or click letters"
            disabled={!isInteractive}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters()}
            recall={submission.lastWord}
            // Submit and Enter are inert while the word cannot be spelled from
            // the wheel's tiles — the same characters `<TypedWord>` dims. A word
            // that fits but misses the center, or is not in the list, still
            // submits and gets its answer.
            submitDisabled={!wordFitsWheel(submission.word, letterToCounts)}
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={submission.word} letterCounts={letterToCounts} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
