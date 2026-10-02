// cs-blessed-game-page

import { Suspense, useEffect } from 'react'
import { useFeedbackSlot } from '../feedback/useFeedbackSlot'
import { useAccountMenuSection } from '../account/useAccountMenuSection'
import { useIsMobile } from '../mobile/useIsMobile'
import { setIsInfoSheetOpen, useIsInfoSheetOpen } from '../info-sheet/infoSheetStore'
import type { useCommonGame } from './useCommonGame'
import type { Session } from '@supabase/supabase-js'
import type { GameManifest } from '../manifest/gameManifest'
import { usePageActions } from './usePageActions'
import { useClubWhileInGame } from './useClubWhileInGame'
import { useSubmitTimeoutOnExpiry } from './useSubmitTimeoutOnExpiry'
import { PauseAndClock } from './PauseAndClock'
import { ChatButton } from '../page-header/ChatButton'
import { ChatHost } from '../chat/ChatHost'
import { ScratchpadButton } from '../page-header/ScratchpadButton'
import { GameScratchpadCompanion } from '../scratchpad/GameScratchpadCompanion'
import { GameLogo } from '../branding/GameLogo'
import { PauseBoundary } from '../pause-suspend/PauseBoundary'
import { InfoSwitchButton } from '../info-sheet/InfoSwitchButton'
import { PageHeader } from '../page-header/PageHeader'
import { GameHeaderMenu } from './GameHeaderMenu'
import { PageHeaderStatusSlot } from '../page-header/PageHeaderStatusSlot'
import { PlayAreaSlotLog } from './PlayAreaSlotLog'
import { PlayAreaErrorBoundary } from './PlayAreaErrorBoundary'
import { Loading } from '../loading/Loading'
import styles from './GamePage.module.css'

/** What `useCommonGame` returned once the game loaded, less the waiting. */
type LoadedCommonGame = Omit<ReturnType<typeof useCommonGame>, 'cg' | 'loading' | 'failure'> & {
  cg: NonNullable<ReturnType<typeof useCommonGame>['cg']>
}

type Props = LoadedCommonGame & {
  manifest: GameManifest
  auth: Session
}

/**
 * The shell every game page wears: the header, the pause boundary with the play
 * surface inside it, and the panels that outlive a pause — chat, the scratchpad,
 * help.
 *
 * The last of the game route's three components — `GamePageGate` asked whether
 * the game exists, `GamePageLoader` joined its room and waited for its state,
 * and this draws it. So every prop is a value, never a maybe-value, and this
 * file never waits for anything.
 *
 * The hole in the middle is the manifest's `PlayArea`, rendered with a
 * `PlayAreaLoaderProps` while the game is unpaused; `PauseBoundary` unmounts it to show
 * the overlay, which is why anything that must survive a pause lives out here
 * or in the DB.
 *
 * doc.md holds the rest: the tree, what the shell owns, the three ways out, and
 * why the menu's sections live in a store.
 */
export function GamePage({
  auth,
  manifest,
  cg,
  gameData,
  pause,
  timer,
  sendSuspend,
  resubscribeCount,
}: Props) {
  // The header's feedback slot, shared with the PlayArea.
  const globalFeedbackSlot = useFeedbackSlot('global')
  const clubMembers = useClubWhileInGame({
    clubHandle: cg.club.handle,
    gameId: cg.id,
    myId: auth.user.id,
    globalFeedbackSlot,
  })

  const { menu, actions, goToFollowUpGame, help } =
    usePageActions({ manifest, cg, pause, sendSuspend, globalFeedbackSlot })

  useSubmitTimeoutOnExpiry({
    gameId: cg.id,
    manifest,
    expired: timer.expired,
    paused: pause.paused,
    isGameEnded: cg.ended,
  })

  const accountSection = useAccountMenuSection()

  // Which phone page is showing; false on desktop.
  const isMobile = useIsMobile()

  const isInfoSheetOpen = useIsInfoSheetOpen()

  // Each game opens on the board, whichever page the last one was left on.
  useEffect(function startOnTheBoard() {
    setIsInfoSheetOpen(false)
  }, [cg.id])

  return (
    <div className={styles.pageHeaderAndPlaySurface}>
      {/* One header whose contents swap on a phone: the board page keeps chat
          and feedback, the info page keeps the pause and the clock. On desktop
          `isInfoSheetOpen` is always false, so it all shows at once. */}
      <PageHeader
        right={
          <>
            {(!isMobile || isInfoSheetOpen) && (
              <PauseAndClock pause={pause} timer={timer} ended={cg.ended} />
            )}
            {isMobile && <InfoSwitchButton open={isInfoSheetOpen} />}
          </>
        }
      >
        <GameHeaderMenu
          logo={<GameLogo manifest={manifest} />}
          accountSection={accountSection}
        />

        {!isInfoSheetOpen && (
          <>
            <div className={styles.panelToggles}>
              <ChatButton />
              {manifest.scratchpad !== 'none' && <ScratchpadButton />}
            </div>
            <PageHeaderStatusSlot players={cg.players} globalFeedbackSlot={globalFeedbackSlot} />
          </>
        )}
      </PageHeader>

      <PauseBoundary
        pause={pause}
        players={pause.stillPlayingHumanPlayers}
        actions={actions}
      >
        {/* The log is outermost so its line lands before a broken game can
            throw; the error boundary is outside the Suspense, so a chunk that
            fails to load gets the error card. */}
        <PlayAreaSlotLog
          gametype={manifest.gametype}
          gameId={cg.id}
          isGameEnded={cg.ended}
        >
          <PlayAreaErrorBoundary>
            <Suspense fallback={<Loading />}>
              {/* Keyed on the restart count, so a restart mounts a fresh surface
                  and the finished run's local state goes with it. */}
              <manifest.PlayArea
                key={cg.restartCount}
                cg={cg}
                gameData={gameData}
                auth={auth}
                resubscribeCount={resubscribeCount}
                globalFeedbackSlot={globalFeedbackSlot}
                menu={menu}
                goToFollowUpGame={goToFollowUpGame}
              />
            </Suspense>
          </PlayAreaErrorBoundary>
        </PlayAreaSlotLog>
      </PauseBoundary>

      {/* Chat is the club's, so it gets the whole club's members. */}
      <ChatHost
        clubHandle={cg.club.handle}
        members={clubMembers}
        myId={auth.user.id}
        globalFeedbackSlot={globalFeedbackSlot}
      />

      {/* Outside the pause boundary, so it survives a pause. */}
      {manifest.scratchpad !== 'none' && (
        <GameScratchpadCompanion
          gameId={cg.id}
          ownerId={
            manifest.scratchpad === 'perPlayerInCompete' && manifest.mode === 'compete'
              ? auth.user.id
              : null
          }
          myId={auth.user.id}
          members={clubMembers}
        />
      )}

      {help.isOpen && (
        <Suspense fallback={null}>
          <manifest.help onClose={help.close} brand={manifest.name} />
        </Suspense>
      )}
    </div>
  )
}
