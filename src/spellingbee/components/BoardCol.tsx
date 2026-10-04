// cs-blessed-spellingbee

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { useSubmitWord } from '../hooks/useSubmitWord'
import { StateLine } from './StateLine'
import { Board } from './Board'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'
import type { GGameData, GTile } from '../types'

/**
 * spellingbee's board column — the honeycomb `<Board>`, a floating Shuffle
 * over its top-right, and the below-board region: the shared
 * `<WordEntryArea>`, whose typed word is drawn through `<TypedWord>` so a
 * letter off the board dims.
 *
 * It owns the **move**: submitting the typed word (`useSubmitWord`), what the
 * board shows for the answer, and the tile click that appends its letter to
 * the word. See docs/playarea.md.
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

  // The board's seven letters.
  const allowedLetters = useMemo(
    () => new Set(outerLetters + centerLetter), [outerLetters, centerLetter])

  // ─── The move ──────────────────────────────────────────
  const submission = useSubmitWord({
    gameId: gd.id,
    words: gd.puzzle.words,
    foundWords: gd.foundWords,
    allowedLetters,
    centerLetter,
    isMyTurn: isInteractive,
    localFeedbackSlot,
  })

  // ─── The pending word ──────────────────────────────────
  // The typed word is the move's, above; what this column reads off it, and
  // the tile click that adds to it, sit here.

  // The tiles the typed word is using. A Set of its letters is the whole of
  // it: a board letter can be typed more than once and there is nothing to
  // count. Empty once the board is inert, so a word left half-typed when the
  // game ended, or when I conceded, drops its marks.
  const usedLetters = useMemo(
    () => new Set(isInteractive ? submission.word : ''),
    [isInteractive, submission.word],
  )

  // A click is my next action, so it dismisses a gesture-cleared result.
  function handleTileClick(tile: GTile) {
    localFeedbackSlot.dismiss()
    submission.setWord((prev) => prev + tile.letter)
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className={cls(shared.boardCol, bee.boardCol)}>
      {/* The state line above the board, on a phone only; see `<MobileStatusBar>`. */}
      <MobileStatusBar>
        <div className={bee.mobileStatus}>
          <StateLine data={gd.stateLineData} />
        </div>
      </MobileStatusBar>
      <Board
        tiles={gd.puzzle.tiles}
        isInteractive={isInteractive}
        onTileClick={handleTileClick}
        usedLetters={usedLetters}
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
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={submission.word} allowedLetters={allowedLetters} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
