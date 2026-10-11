// cs-unmet

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { useAction } from '@/common/actions/actionsStore'
import { ActionButton } from '@/common/actions/ActionButton'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { useBoardColView } from '../hooks/useBoardColView'
import { useSubmitWord } from '../hooks/useSubmitWord'
import { useTypedWord } from '../hooks/useTypedWord'
import { makeScoredWord } from '../lib/score'
import { Board } from './Board'
import { GameScoresheet } from './GameScoresheet'
import { RoundScoresheet } from './RoundScoresheet'
import { StateLine } from './StateLine'
import { WordLines } from './WordLines'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GTile } from '../types'

/**
 * wordsy's board column. In the board's place it shows one of four surfaces
 * (`useBoardColView`): the table with the entry under it, a finished round's
 * scoresheet with "Start round N", the last round's sheet with "Show final
 * scores", or the game's sheet. Under the table sit the entry, the two lines
 * that score it, and on a phone the on-screen keyboard.
 *
 * The move is the column's: the word being typed (`useTypedWord`) and its
 * trip to `submit_word` (`useSubmitWord`). Nothing reaches the server until
 * ↵; a word that stands replaces my earlier one, unless mine is frozen.
 */
export function BoardCol({
  gd,
  shownTiles,
  historyView,
  localFeedbackSlot,
  isNewTableFlashing,
  isClockStartFlashing,
}: {
  gd: GGameData
  // The table to draw — PlayArea picks it: a past round's, or the live one.
  shownTiles: GTile[]
  historyView: GHistoryView
  // PlayArea's below-board slot: a word's answer, a race, the ending.
  localFeedbackSlot: FeedbackSlot
  // True for a beat as a new round's table arrives (`useRoundMarks`).
  isNewTableFlashing: boolean
  // True for a beat as a rival's first word starts the round's clock on me.
  isClockStartFlashing: boolean
}) {
  // ─── Which surface is on screen ───────────────────────────────
  const { view, showFinalScores } = useBoardColView(gd, historyView)
  const actions = useBoardColActions({ gd, view, showFinalScores, localFeedbackSlot })

  // The entry takes a word: I still play, my word can still change, and the
  // live round is on the board — a key over a past round is the viewer's exit.
  const isEntryOpen = gd.me.stillPlaying && !gd.me.isWordFrozen && !historyView.isViewing

  // ─── The pending move ─────────────────────────────────────────
  const submission = useSubmitWord({ gd, localFeedbackSlot })
  const entry = useTypedWord({ sendWord: submission.send })

  // The entry's ↵ and ⌫, which `<WordEntryArea>` binds; the on-screen
  // keyboard wears the same two.
  const actSubmit = useAction('act-submit')
  const actDelete = useAction('act-delete-last')

  // A tapped cap, as a typed letter: the player's next move, so it drops the
  // last answer's pill as a keystroke does.
  function typeLetter(letter: string) {
    if (!isEntryOpen || submission.inFlight) return
    localFeedbackSlot.dismiss()
    entry.edit(entry.word + letter)
  }

  // ─── Render ───────────────────────────────────────────────────

  // The typed word scores against the live round, whatever the board shows.
  const typed = isEntryOpen && entry.word !== '' ? makeScoredWord(entry.word, gd.round.tiles) : null
  const standing = gd.me.word === null
    ? null
    : { ...makeScoredWord(gd.me.word, gd.round.tiles), isFrozen: gd.me.isWordFrozen }

  function getSurface() {
    if (view === 'gameSheet') return <GameScoresheet gd={gd}/>
    if (view === 'lastRoundSheet' || view === 'roundSheet') {
      return (
        <>
          <RoundScoresheet gd={gd} round={gd.round}/>
          <div className={styles.underSheet}>
            {/* Each action hides itself on the other sheet. */}
            <ActionButton action={actions.actStartRound} show="label" weight="primary"/>
            <ActionButton action={actions.actShowFinalScores} show="label" weight="primary"/>
          </div>
        </>
      )
    }
    return (
      <>
        <Board
          tiles={shownTiles}
          isViewingHistory={historyView.isViewing}
          endingOutcome={gd.me.outcome}
          // My word is in for the round and can no longer change: there is
          // nothing left to enter on this table until the next.
          isDimmed={gd.me.isWordFrozen && !historyView.isViewing}
          isNewTableFlashing={isNewTableFlashing}
          isClockStartFlashing={isClockStartFlashing}
        />

        <div className={styles.belowBoard}>
          {/* The shared reserved-height swap box: the entry, or the slot's top
              message in its place. */}
          <div
            className={cls(
              shared.moveAreaOrLocalFeedback,
              // The banner is `inset: 0`, so its host must be positioned — but
              // only while viewing (historyViewer.module.css says why).
              historyView.isViewing && history.historyBannerHost,
            )}
          >
            {historyView.isViewing && (
              <HistoryBanner label={historyView.label} onExit={historyView.exit}/>
            )}
            <WordEntryArea
              value={entry.word}
              onChange={entry.edit}
              onSubmit={() => void entry.submit()}
              placeholder="Type a word"
              localFeedbackSlot={localFeedbackSlot}
              disabled={!isEntryOpen}
              busy={submission.inFlight}
              submitDisabled={gd.me.isBlockedByNoFlip}
              onAnyKey={localFeedbackSlot.dismiss}
              recall={entry.recall}
            />
          </div>

          <WordLines
            typed={typed}
            standing={standing}
            isBlockedByNoFlip={gd.me.isBlockedByNoFlip && isEntryOpen}
          />

          {/* A phone has no keyboard to type on: the on-screen one, wearing the
              entry's own ↵ and ⌫ actions, so a cap and its key cannot disagree.
              Desktop hides it (BoardCol.module.css). */}
          {actSubmit !== null && actDelete !== null && (
            <div className={styles.onscreenKeyboard}>
              <GuessKeyboard
                onKey={typeLetter}
                actSubmit={actSubmit}
                actDelete={actDelete}
                disabled={!isEntryOpen || submission.inFlight}
              />
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <MobileStatusBar>
        <StateLine gd={gd}/>
      </MobileStatusBar>
      {getSurface()}
    </div>
  )
}
