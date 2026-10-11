// cs-unmet

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import { StandardButton } from '@/common/buttons/StandardButton'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { useAction } from '@/common/actions/actionsStore'
import { ActionButton } from '@/common/actions/ActionButton'
import type { Action } from '@/common/actions/useBindAction'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { useSubmitWord } from '../hooks/useSubmitWord'
import { useTypedWord } from '../hooks/useTypedWord'
import { scoreLetters, scoreWord } from '../lib/score'
import { Board } from './Board'
import { GameScoresheet, RoundScoresheet } from './Scoresheet'
import { StateLine } from './StateLine'
import { WordLines } from './WordLines'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import sheet from './Scoresheet.module.css'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GTile } from '../types'

/**
 * wordsy's board column: the table, the entry and the two lines under it, and
 * on a phone the on-screen keyboard — or, in their place, a scoresheet: the
 * round's between rounds, with "Start round N" under it, unless a past round
 * is open; the game's, for good, once it has ended — after the last round's,
 * with "Show final scores" under it, when the game ends in front of me. And the move, which it
 * builds and sends:
 * the word being typed
 * (`useTypedWord`) and its trip to `submit_word` (`useSubmitWord`). Nothing
 * reaches the server until ↵; a word that stands replaces my earlier one,
 * unless mine is frozen.
 */
export function BoardCol({
  gd,
  shownTiles,
  historyView,
  localFeedbackSlot,
  isNewTableFlashing,
  isClockStartFlashing,
  actStartRound,
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
  // "Start round N", under the round's scoresheet.
  actStartRound: Action
}) {
  // ─── Which board is on screen ─────────────────────────────────
  // The entry takes a word: I still play, my word can still change, and the
  // live round is on the board — a key over a past round is the viewer's exit.
  const isEntryOpen = gd.me.stillPlaying && !gd.me.isWordFrozen && !historyView.isViewing

  // ─── The pending move ─────────────────────────────────────────
  const submission = useSubmitWord({ gd, localFeedbackSlot })
  const entry = useTypedWord({ sendWord: submission.send })

  // The rulebook's No Flip: last round's Fastest may not start this round's
  // clock, until someone else has, while more than two still play.
  const nStillPlaying = gd.players.filter((p) => p.stillPlaying).length
  const holdsNoFlip = gd.round.noFlipHolder === gd.me && gd.round.fastest === null && nStillPlaying > 2

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
  const typed = isEntryOpen && entry.word !== ''
    ? { letters: scoreLetters(entry.word, gd.round.tiles), score: scoreWord(entry.word, gd.round.tiles) }
    : null
  const standing = gd.me.word === null
    ? null
    : {
        letters: scoreLetters(gd.me.word, gd.round.tiles),
        score: scoreWord(gd.me.word, gd.round.tiles),
        isFrozen: gd.me.isWordFrozen,
      }

  // The last round's sheet comes before the game's, for a game that ends in
  // front of me; opening one already over goes straight to the game's.
  const [isShowingFinalScores, setIsShowingFinalScores] = useState(gd.ended)

  const statusBar = (
    <MobileStatusBar>
      <StateLine gd={gd}/>
    </MobileStatusBar>
  )

  if (gd.ended && gd.round.ended && !isShowingFinalScores) {
    return (
      <div className={cls(shared.boardCol, styles.boardCol)}>
        {statusBar}
        <RoundScoresheet gd={gd} round={gd.round}/>
        <div className={sheet.startRound}>
          <StandardButton
            label="Show final scores"
            show="label"
            weight="primary"
            onClick={() => setIsShowingFinalScores(true)}
          />
        </div>
      </div>
    )
  }

  if (gd.ended) {
    return (
      <div className={cls(shared.boardCol, styles.boardCol)}>
        {statusBar}
        <GameScoresheet gd={gd}/>
      </div>
    )
  }

  if (gd.isBetweenRounds && !historyView.isViewing) {
    return (
      <div className={cls(shared.boardCol, styles.boardCol)}>
        {statusBar}
        <RoundScoresheet gd={gd} round={gd.round}/>
        <div className={sheet.startRound}>
          <ActionButton action={actStartRound} show="label" weight="primary"/>
        </div>
      </div>
    )
  }

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      {statusBar}

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
            submitDisabled={holdsNoFlip}
            onAnyKey={localFeedbackSlot.dismiss}
            recall={entry.recall}
          />
        </div>

        <WordLines typed={typed} standing={standing} holdsNoFlip={holdsNoFlip && isEntryOpen}/>

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
    </div>
  )
}
