// cs-unmet

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

type PlayAreaProps = Pick<PlayAreaLoaderProps, 'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'> & {
  gd: GGameData
}

/**
 * boggle's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own: `<BoardCol>`
 * takes the board, the word engine and the `submit_word` RPC, `<InfoCol>` the
 * readouts, the action row and the word list, and this component decides what
 * each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: whose
 * finds the state line counts, whether a teammate's find is narrated, and the
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

  // On a phone the board fills the screen and the info column moves into an
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

  // A teammate's find (coop). My own are the local slot's, so they're skipped;
  // in compete a rival's finds are withheld until the end, so there is nothing
  // to narrate.
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

  // The team's finds in coop, my own in compete.
  const finds = gd.team ?? gd.me

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
        <InfoCol gd={gd} endingMessage={endingMessage} actions={actions} />
      </InfoSheet>

      {/* My win's confetti — once, when it happens: a target reached, or a
          race won on score when the clock stopped. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title={gd.ending?.detail === 'target' ? 'Target reached! 🎉' : 'You win! 🎉'}
          body={`${finds.nFoundWords} words, ${finds.foundWordsScore} points.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
