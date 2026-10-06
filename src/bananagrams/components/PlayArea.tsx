// cs-unmet

import { useCallback, useRef } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { DeviceBlockNotice } from '@/common/game-page/DeviceBlockNotice'
import { useIsCoarsePointer } from '@/common/mobile/useIsCoarsePointer'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { useShowDrawMessages } from '../hooks/useShowDrawMessages'
import { answerMessage } from '../lib/answer'
import type { GCheckResult, GGameData } from '../types'
import { PlayerBoard } from './PlayerBoard'
import '../theme.css' // bananagrams tokens + the global drag-cursor rule

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface — on a desktop. bananagrams is DESKTOP-ONLY (docs/mobile.md
 * → Where each game plays): the board is a drag-heavy 25×25 arena, so every
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
      <DeviceBlockNotice title="Bananagrams needs a desktop" actBackToClub={ctx.menu.actBackToClub}>
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

/** What `bananagrams.peel` puts in `data`. `illegal` is an ok answer on
 *  purpose: a board that isn't win-legal is a state of play — the game keeps
 *  going and the player fixes the cells and peels again. */
type PeelResult =
  | { result: 'dealt'; invalid_cells: number[] }
  | { result: 'won'; invalid_cells: number[] }
  | { result: 'illegal'; invalid_cells: number[] }
  | null

/** What `bananagrams.dump` puts in `data`. One answer: the swap either happens
 *  or is refused, and the new hand arrives with the next blob. */
type DumpResult = { result: 'dumped' } | null

/**
 * bananagrams' play surface — the outer coordinator. It owns the game data,
 * the move RPCs (peel, dump) and what each answer shows, the below-board slot
 * and the endings; `<PlayerBoard>` under it owns the board editor and the two
 * columns. Two coordinators, because the editor spans both columns
 * (docs/games/bananagrams.md).
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with
 * it, which is why the editor saves the board on unmount.
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
  // The editor flushes the board before each, so the server judges what the
  // player sees. Each is a `useCallback` because the editor holds it in its
  // own callbacks' dependencies.

  const peel = useCallback(async (): Promise<{ illegalCells: number[] } | null> => {
    const res = await runRpc<PeelResult>(db.rpc('peel', { p_game_id: gd.id }))
    if (res.type === 'not-ok') {
      // The races (the game ended, a second tab conceded) and the faults, in
      // the server's sentence; `runRpc` has already raised the modal for the
      // faults.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return null
    } else if (res.type === 'ok' && res.data?.result === 'illegal') {
      // The board isn't win-legal, so the game stays in progress and the RPC
      // hands back the offending cells for the editor to paint red.
      const { outcome, text } = answerMessage({ answerType: 'illegal' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return { illegalCells: res.data.invalid_cells }
    } else if (res.type === 'ok' && (res.data?.result === 'dealt' || res.data?.result === 'won')) {
      // Nothing to say here: the next blob carries the draw's row, or the
      // ending, and the slot's hooks react to those.
      return null
    } else {
      reportUnhandled('peel', res)
      return null
    }
  }, [gd.id, localFeedbackSlot])

  const dump = useCallback(
    async (tile: string) => {
      const res = await runRpc<DumpResult>(db.rpc('dump', { p_game_id: gd.id, p_tile: tile }))
      if (res.type === 'ok' && res.data?.result === 'dumped') {
        // Nothing to say: the next blob carries the dump's row.
      } else if (res.type === 'not-ok') {
        // The races (the game ended, a second tab conceded, a rival drained the
        // bunch, the server's hand disagrees with the screen) and the faults.
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
      } else {
        reportUnhandled('dump', res)
      }
    },
    [gd.id, localFeedbackSlot],
  )

  // Check words → its answer in the local slot. The RED CELLS are the real
  // answer; the words only say how to read them.
  const showCheckResult = useCallback(
    (r: GCheckResult) => {
      if (r.kind === 'error') {
        // The fault's modal is already up; this is what the slot says once it
        // is dismissed.
        localFeedbackSlot.show(FeedbackMessage.result('error', `Check failed: ${r.message}`))
        return
      }
      const answer =
        r.kind === 'clean'
          ? { answerType: 'check_clean' as const }
          : r.kind === 'empty'
            ? { answerType: 'check_empty' as const }
            : { answerType: 'check_invalid' as const, nTiles: r.count }
      const { outcome, text } = answerMessage(answer)
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
    },
    [localFeedbackSlot],
  )

  // My board as it is on screen, which the server's copy trails between saves.
  // The editor keeps it pointed at the live board; the print reads it.
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
      <PlayerBoard
        gd={gd}
        actions={actions}
        endingMessage={endingMessage}
        localFeedbackSlot={localFeedbackSlot}
        onPeel={peel}
        onCheckResult={showCheckResult}
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
