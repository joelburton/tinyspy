// cs-unmet

import { useRef } from 'react'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { DeviceBlockNotice } from '@/common/game-page/DeviceBlockNotice'
import { useIsCoarsePointer } from '@/common/mobile/useIsCoarsePointer'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import {
  useDismissLocalFeedbackOnKey,
} from '@/common/feedback/useDismissLocalFeedbackOnKey'
import {
  CelebrationBlockingModal,
} from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { useShowDrawMessages } from '../hooks/useShowDrawMessages'
import { usePeel } from '../hooks/usePeel'
import { useDump } from '../hooks/useDump'
import { useCheckBoard } from '../hooks/useCheckBoard'
import type { GGameData } from '../types'
import { EditingBoard } from './EditingBoard'
import '../theme.css' // bananagrams tokens + the global drag-cursor rule

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface — on a desktop. bananagrams is DESKTOP-ONLY (docs/mobile.md
 * → Where each game plays): the board is a drag-heavy 25×25 grid, so every
 * touch device gets the block screen instead, and the surface never mounts.
 * The gate keys off the pointer, not the width: a touch tablet is desktop-wide
 * but has no mouse to drag with.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const isTouch = useIsCoarsePointer()
  const { gd } = useGame(ctx)

  if (isTouch) {
    // The shell's own exit, so a blocked player leaves the way anyone does: the
    // game is shelved for the group to pick another, and waiting to resume.
    return (
      <DeviceBlockNotice
        title="Bananagrams needs a desktop"
        actBackToClub={ctx.menu.actBackToClub}>
        You play by dragging tiles around a big board — that wants a mouse and a
        full-size screen, so it&rsquo;s not available on phones or tablets. Open
        this game on a computer to play.
      </DeviceBlockNotice>
    )
  }

  return (
    <PlayArea
      gd={gd}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
    />
  )
}

type PlayAreaProps = Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'> & {
  gd: GGameData
}

/**
 * bananagrams' play surface — the outer coordinator. It owns the game data, the
 * trips to the server (peel, dump, Check words — a hook each), the below-board
 * slot and the endings; `<EditingBoard>` under it holds the editing board and
 * lays out the two columns. Two coordinators, because the editing board spans
 * both columns (docs/games/bananagrams.md).
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with
 * it, which is why the editing board saves the board on unmount.
 */
function PlayArea({ gd, goToFollowUpGame, menu }: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // Confetti at the moment I go out. A race, so the winner alone celebrates;
  // everyone else gets the verdict pill.
  const celebration = useCelebration(gd.ended && gd.me.outcome === 'won')

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a draw, a check's answer, a refusal, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move → dismiss a gesture-cleared message.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I have conceded and the others race on.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  const playerEndingMessage = useGetPlayerEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage,
  })

  // A peel's and my dump's acknowledgment, off the log's newest row.
  useShowDrawMessages(gd, localFeedbackSlot)

  // ─── The moves ─────────────────────────────────────────
  // The editing board saves the board before a peel and a check, so the server
  // judges what the player sees, and paints the cells either hands back.
  const { peel } = usePeel({ gd, localFeedbackSlot })
  const { dump } = useDump({ gd, localFeedbackSlot })
  const { checkBoard } = useCheckBoard({ gd, localFeedbackSlot })

  // My board as it is on screen, which the server's copy trails between saves.
  // The editing board keeps it pointed at the live board; the print reads it.
  const myBoardRef = useRef<string>('')

  // ─── The commands, and the menu that lists them ────────
  const { actions } = useActionsAndMenu({
    gd,
    myBoardRef,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <>
      <EditingBoard
        gd={gd}
        actions={actions}
        endingMessage={endingMessage}
        localFeedbackSlot={localFeedbackSlot}
        onPeel={peel}
        onCheckBoard={checkBoard}
        onDump={dump}
        reportBoardRef={myBoardRef}
      />
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="Bananas! 🍌"
          body="You went out first."
          onClose={celebration.close}
        />
      )}
    </>
  )
}
