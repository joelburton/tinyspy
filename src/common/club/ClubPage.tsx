// cs-blessed-club-page

import { useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cls } from '../utils/cls'
import { navigate } from '../routing/router'
import { gamePath } from '../routing/routes'
import { useTabRing } from '../keyboard/useTabRing'
import { ChatButton } from '../page-header/ChatButton'
import { ChatHost } from '../chat/ChatHost'
import { ClubHelpCompanion } from './ClubHelpCompanion'
import { EditClubModal } from './EditClubModal'
import { GametypeFilter } from './GametypeFilter'
import { ModeFilter } from './ModeFilter'
import { NewGameCol } from './NewGameCol'
import { YourGamesCol } from './YourGamesCol'
import { Segmented } from '../buttons/Segmented'
import { PageHeader } from '../page-header/PageHeader'
import { PageHeaderMenu } from '../page-header/PageHeaderMenu'
import { PuzpuzpuzLogo } from '../branding/PuzpuzpuzLogo'
import { SetupGameModal } from '../setup-form/SetupGameModal'
import { PageHeaderStatusSlot } from '../page-header/PageHeaderStatusSlot'
import { useFeedbackSlot } from '../feedback/useFeedbackSlot'
import { useClubGames } from './useClubGames'
import { useClubGametypes } from './useClubGametypes'
import { useClubPageActions } from './useClubPageActions'
import { useClubRoomPresence } from './useClubRoomPresence'
import { useGamesListFilter } from './useGamesListFilter'
import { useSetupDialog } from './useSetupDialog'
import { useStartListFilter } from './useStartListFilter'
import { deleteClubGame } from './deleteClubGame'
import type { Database } from '@/types/db'
import type { Member } from '../members/member'
import styles from './ClubPage.module.css'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". The club half of `get_club_page`'s payload; a new column
// reaches the page only by being listed both here and in that RPC.
type ClubRow = Pick<
  Database['common']['Tables']['clubs']['Row'],
  'handle' | 'name' | 'is_solo'
>

/** What `common.get_club_page` answers with: everything this page needs to
 *  render, in one read. Why it is one read rather than three is docs/common.md
 *  → `get_club_page`. */
export type ClubPageData = {
  // The RPC's one answer. A call site's ok branch asserts this rather than
  // `type` alone, so an answer added later cannot sail into it.
  result: 'loaded'
  club: ClubRow
  members: Member[]
  // The club's enrolled set, each with the setup its friends last played —
  // one shape, because a second read for the defaults is what the RPC
  // exists to avoid.
  gametypes: { gametype: string; default_setup: unknown }[]
}

type Props = {
  club: ClubRow
  // The club's members, alphabetical. Fixed for the page's life: membership is
  // set at creation.
  members: Member[]
  // The club's gametypes as they were at load; `useClubGametypes` owns them
  // from there.
  initialGametypes: ClubPageData['gametypes']
  authSession: Session
}

/**
 * The club room: who is here, what is being played, what could be started, and
 * everything the club has played. `<ClubPageLoader>` renders it at
 * `/c/<handle>` once the club has answered, so every prop is loaded.
 *
 * Each job is a hook — the club's gametypes, its games, presence, the two
 * filters, the setup dialog and the menu — and the two columns are
 * `NewGameCol` and `YourGamesCol`. What stays here is the page's own: the
 * phone's tab, the keyboard's tab ring, and the dialogs. See `club/doc.md` for
 * how the pieces sit together.
 */
export function ClubPage({
  club,
  members,
  initialGametypes,
  authSession,
}: Props) {
  const selfId = authSession.user.id

  // The header's feedback slot. This page has no second slot, so its own news
  // goes here too (club/doc.md → A failed games read).
  const globalFeedbackSlot = useFeedbackSlot('global')

  const clubGametypes = useClubGametypes(initialGametypes)
  const clubGames = useClubGames(club.handle, members, globalFeedbackSlot)
  const pageActions = useClubPageActions({ globalFeedbackSlot })

  const startListRef = useRef<HTMLDivElement | null>(null)
  const gamesListRef = useRef<HTMLDivElement | null>(null)
  const setupDialog = useSetupDialog(startListRef)

  const presentUserIds = useClubRoomPresence({
    clubHandle: club.handle,
    selfId,
    members,
    currentGameId: clubGames.currentGameId,
    setupManifest: setupDialog.manifest,
  })

  const startFilter = useStartListFilter(selfId, club.is_solo, clubGametypes.startable)
  const gamesFilter = useGamesListFilter(clubGames.games)

  // Which column a phone shows; desktop shows both and ignores it.
  const [mobileTab, setMobileTab] = useState<'new' | 'games'>('new')

  // The page's tab ring is its two lists (club/doc.md → The keyboard).
  useTabRing([startListRef, gamesListRef], 'keys-next-list')

  // An open dialog owns Enter and the arrows, so the lists keep their cursors.
  const kbDialogUp = setupDialog.manifest !== null
    || pageActions.editClub.isOpen
    || pageActions.help.isOpen

  // Close the setup dialog and open the game it just started.
  function goToStartedGame(gameId: string) {
    // Only the open setup dialog calls this, so its manifest is there.
    const gametype = setupDialog.manifest!.gametype
    setupDialog.close()
    navigate(gamePath(gametype, gameId))
  }

  // The club editor saved: the start list takes the new gametypes at once.
  function applyClubGametypes(next: Set<string>) {
    clubGametypes.setAllowed(next)
    pageActions.editClub.close()
  }

  return (
    <div className={cls('pageHeaderAndMainArea', styles.clubPageWrapper)}>
      <PageHeader>
        <PageHeaderMenu
          logo={<PuzpuzpuzLogo/>}
          sections={pageActions.menuSections}
          label="Club menu"/>
        <ChatButton/>
        <PageHeaderStatusSlot
          players={members}
          globalFeedbackSlot={globalFeedbackSlot}
          presentUserIds={presentUserIds}
        />
      </PageHeader>

      {/* Four stacked blocks: the club's name, the phone's tab bar, the phone's
          filter row, and the two columns that take the rest of the height. */}
      <main className={cls('pageMain', 'pageMain-fills', styles.main)}>
        <div className={styles.clubNameBlock}>
          <h1 className={styles.clubName}>
            {club.is_solo ? 'Solo Club: ' : 'Club: '}
            {club.name}
          </h1>
        </div>

        {/* Phone only. Toggle buttons rather than ARIA tabs: see <Segmented>. */}
        <Segmented label="Show new game or your games" className={styles.tabs}>
          <button
            type="button"
            aria-pressed={mobileTab === 'new'}
            className={styles.tab}
            onClick={() => setMobileTab('new')}
          >
            New game
          </button>
          <button
            type="button"
            aria-pressed={mobileTab === 'games'}
            className={styles.tab}
            onClick={() => setMobileTab('games')}
          >
            Your games
          </button>
        </Segmented>

        {/* Phone only: the showing tab's filter, a second copy of the one in its
            column's heading (club/doc.md → Each filter is in the tree twice).
            A solo club's "New game" tab has no filter, and no empty row either. */}
        {!(mobileTab === 'new' && club.is_solo) && (
          <div className={styles.mobileFilters} data-testid="mobile-filters">
            {mobileTab === 'new'
              ? <ModeFilter filter={startFilter} soloClub={club.is_solo}/>
              : <GametypeFilter filter={gamesFilter}/>}
          </div>
        )}

        <div className={styles.columns} data-tab={mobileTab}>
          <section className={styles.left}>
            <NewGameCol
              currentGame={clubGames.currentGame}
              startFilter={startFilter}
              startListRef={startListRef}
              numMembers={members.length}
              soloClub={club.is_solo}
              isFrozen={kbDialogUp}
              onStart={setupDialog.open}
              onDelete={deleteClubGame}
            />
          </section>
          <section className={styles.right}>
            <YourGamesCol
              gamesFilter={gamesFilter}
              gamesListRef={gamesListRef}
              hasReadFailed={clubGames.hasReadFailed}
              soloClub={club.is_solo}
              isFrozen={kbDialogUp}
              onDelete={deleteClubGame}
            />
          </section>
        </div>
      </main>

      <ChatHost
        clubHandle={club.handle}
        members={members}
        selfId={selfId}
        globalFeedbackSlot={globalFeedbackSlot}
      />

      {pageActions.help.isOpen && <ClubHelpCompanion onClose={pageActions.help.close}/>}

      {setupDialog.manifest && (
        <SetupGameModal
          manifest={setupDialog.manifest}
          members={members}
          selfId={selfId}
          clubHandle={club.handle}
          soloClub={club.is_solo}
          savedDefault={clubGametypes.savedDefaults.get(setupDialog.manifest.gametype)}
          onStarted={goToStartedGame}
          onCancel={setupDialog.close}
        />
      )}

      {pageActions.editClub.isOpen && (
        <EditClubModal
          clubHandle={club.handle}
          clubName={club.name}
          allowedGametypes={clubGametypes.allowed}
          onSaved={applyClubGametypes}
          onCancel={pageActions.editClub.close}
        />
      )}
    </div>
  )
}
