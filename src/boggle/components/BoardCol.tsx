// cs-unmet

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { useTracedWord } from '../hooks/useTracedWord'
import { Board } from './Board'
import { StateLine } from './StateLine'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import styles from './BoardCol.module.css'
import type { GGameData } from '../types'

/**
 * boggle's board column — the `<Board>`, and the below-board region: the
 * shared `<WordEntryArea>`, whose typed word is drawn through `<TypedWord>` so
 * the letters past where the board can follow dim. The word they share, and
 * the move, are `useTracedWord`'s. See docs/playarea.md.
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
  // ─── Which board is on screen ─────────────────────────────────
  // Always the live one: boggle has no turn-history viewer.

  // The board is mine to touch: tiles take taps, the entry takes letters, and
  // a word can be submitted. False once the game is over, or I conceded a race
  // the others play on.
  const isInteractive = gd.me.onTurn

  // ─── The pending move ─────────────────────────────────────────
  // The word being traced or typed, and its trip to the server
  // (`useTracedWord`).
  const traced = useTracedWord({ gd, isInteractive, localFeedbackSlot })

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div
      className={cls(shared.boardCol, styles.boardCol)}
      style={{
        ['--cols' as string]: gd.puzzle.boardSideSize,
        ['--rows' as string]: gd.puzzle.boardSideSize,
      }}
    >
      {/* The state line above the board, on a phone only; see `<MobileStatusBar>`. */}
      <MobileStatusBar>
        <div className={styles.mobileStatus}>
          <StateLine facts={gd.me} puzzle={gd.puzzle} />
        </div>
      </MobileStatusBar>
      <Board
        tiles={gd.puzzle.tiles}
        boardSideSize={gd.puzzle.boardSideSize}
        marks={traced.marks}
        isInteractive={isInteractive}
        onTileTap={traced.tapTile}
      />
      {/* The below-board slot: `<WordEntryArea>` draws the controls, or the
          slot's message in their place — the same slot, so nothing reflows. */}
      <div className={surface.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <WordEntryArea
            value={traced.word}
            onChange={traced.changeWord}
            onSubmit={traced.submitWord}
            placeholder="Type or tap letters"
            disabled={!isInteractive}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters()}
            recall={traced.lastWord}
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={traced.word} reach={traced.reach} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
