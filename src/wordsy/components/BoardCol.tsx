// cs-unmet

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { useSubmitWord } from '../hooks/useSubmitWord'
import { useTypedWord } from '../hooks/useTypedWord'
import { scoreWord } from '../lib/score'
import { Board } from './Board'
import { StateLine } from './StateLine'
import { WordLines } from './WordLines'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GTile } from '../types'

/**
 * wordsy's board column: the table, the entry and the two lines under it —
 * and the move, which it builds and sends: the word being typed
 * (`useTypedWord`) and its trip to `submit_word` (`useSubmitWord`). Nothing
 * reaches the server until ↵; a word that stands replaces my earlier one,
 * unless mine is frozen.
 */
export function BoardCol({
  gd,
  shownTiles,
  historyView,
  localFeedbackSlot,
  clockJustStarted,
}: {
  gd: GGameData
  // The table to draw — PlayArea picks it: a past round's, or the live one.
  shownTiles: GTile[]
  historyView: GHistoryView
  // PlayArea's below-board slot: a word's answer, a race, the ending.
  localFeedbackSlot: FeedbackSlot
  // True for a beat as a rival's first submit starts the round's clock.
  clockJustStarted: boolean
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

  // ─── Render ───────────────────────────────────────────────────

  // The typed word scores against the live round, whatever the board shows.
  const typed = isEntryOpen && entry.word !== ''
    ? { word: entry.word, score: scoreWord(entry.word, gd.round.tiles) }
    : null
  const standing = gd.me.word === null
    ? null
    : { word: gd.me.word, score: scoreWord(gd.me.word, gd.round.tiles), isFrozen: gd.me.isWordFrozen }

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <MobileStatusBar>
        <StateLine gd={gd}/>
      </MobileStatusBar>

      <Board
        tiles={shownTiles}
        isViewingHistory={historyView.isViewing}
        endingOutcome={gd.me.outcome}
        clockJustStarted={clockJustStarted}
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
      </div>
    </div>
  )
}
