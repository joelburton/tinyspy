// cs-unmet

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { useRoundMarks } from '../hooks/useRoundMarks'
import { useShowPeerSubmits } from '../hooks/useShowPeerSubmits'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import type { GGameData } from '../types'

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd } = useGame(ctx)
  return (
    <PlayArea
      gd={gd}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
    />
  )
}

type PlayAreaProps =
  Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu' | 'globalFeedbackSlot'>
  & {
  gd: GGameData
}

/**
 * wordsy's play surface — the coordinator. It holds no board and draws no
 * control of its own: `<BoardCol>` takes the table and the word, `<InfoCol>`
 * the readouts and the action row, and this component decides what each is
 * handed — the table to show above all: a past round's, or the live one.
 *
 * There are no turns. The round's clock is the page header's
 * (`common.timers`, armed by the round's first submit and put away at its
 * end); what the board marks is a new round's table arriving and that clock
 * starting.
 */
function PlayArea({
  gd,
  goToFollowUpGame,
  menu,
  globalFeedbackSlot,
}: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────
  // A word is typed at the window, so Tab has nowhere to go here, and an
  // empty ring keeps it from walking out to the browser.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // The two moments a round marks: its table arriving, for everyone, and a rival's
  // first word starting the clock on me; see `useRoundMarks`.
  const roundMarks = useRoundMarks(gd)

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a word's answer, a race, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')

  // My ending's message, for the pill and the info column: the game's once it
  // has ended, mine once I have conceded and the others play on.
  const { endingMessage, endedBy } = useGetEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage: endedBy === 'game' ? endingMessage : null,
    playerEndingMessage: endedBy === 'player' ? endingMessage : null,
  })

  // ─── Narration ─────────────────────────────────────────
  // A rival's first submit of a round, in the header slot.
  useShowPeerSubmits(gd, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past round, if any, is open on the board.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  const { actions } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The table to show: a past round's while one is open, else the live one.
  const shownTiles = (historyView.round ?? gd.round).tiles

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        shownTiles={shownTiles}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
        isNewTableFlashing={roundMarks.isNewTableFlashing}
        isClockStartFlashing={roundMarks.isClockStartFlashing}
        actStartRound={actions.actStartRound}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
        />
      </InfoSheet>
    </div>
  )
}
