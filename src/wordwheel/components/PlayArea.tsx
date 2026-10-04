// cs-blessed-wordwheel

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { useShowOppsRankMessages } from '../hooks/useShowOppsRankMessages'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'
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
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
    />
  )
}

type PlayAreaProps = Pick<
  PlayAreaLoaderProps,
  'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'
> & {
  gd: GGameData
}

/**
 * wordwheel's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own: `<BoardCol>`
 * takes the wheel, the word engine and the `submit_word` RPC, `<InfoCol>` the
 * readouts, the action row and the word list, and this component decides what
 * each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: whose
 * finds the state line counts, what a peer's move is worth narrating (a
 * teammate's find in coop, a rival's rank climbed in compete), and the
 * ending's words.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 */
function PlayArea({
  gd,
  globalFeedbackSlot,
  goToFollowUpGame,
  menu,
}: PlayAreaProps) {

  // ─── Page hooks ────────────────────────────────────────

  // Tab isn't used; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the wheel fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it: the team's
  // in coop, mine alone in a race. It is shown only when it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // ─── The local slot, and what stands in it ─────────────

  // The slot under the board is for messages about ME.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I am out of the race and the others play on.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  const playerEndingMessage = useGetPlayerEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage,
  })

  // ─── What a PEER did, in the header slot ───────────────
  // Each mode reaches exactly one of these (docs/ui.md → Where a message goes).

  // A teammate's find (coop), in the outcome the finder saw. My own are the
  // local slot's, so they're skipped; in compete a rival's finds are withheld
  // until the end, so there is nothing to narrate.
  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.foundWords,
    keyOf: (w) => `${w.by.id}:${w.word}`,
    messageFor: (w) => {
      if (w.by === gd.me) return null
      const { outcome, text } = peerAnswerMessage(w)
      return FeedbackMessage.peer(w.by, outcome, text)
    },
    globalFeedbackSlot,
  })

  // A rival climbed a rank (compete): say so, never which words.
  useShowOppsRankMessages(gd, globalFeedbackSlot)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them.
  const { actions } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage
  const sld = gd.stateLineData

  return (
    <div
      className={cls(
        shared.layout,
        shared.responsiveInfoCol,
        shared.mobileFill,
        surface.layout,
        styles.layout,
      )}
    >
      <BoardCol gd={gd} localFeedbackSlot={localFeedbackSlot} />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={endingMessage}
          actions={actions}
        />
      </InfoSheet>

      {/* My win's confetti — once, when it happens. Only a game with a target
          rank can reach it: a coop that set one, or a race, which always has one. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={
            `Reached "${sld.rankName}"` +
            `${gd.compete ? ' first' : ''} — ` +
            `${sld.foundWordsScore}/${sld.reqdWordsScore} points.`
          }
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
