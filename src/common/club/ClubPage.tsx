// cs-blessed-club-page

import { runRpc } from '../supabase/dbResult'
import { showToast, DEFAULT_TOAST_MS } from '../toasts/toastStore'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../supabase/db'
import { supabase } from '../supabase/supabase'
import { channelLeaving, releaseChannel } from '../realtime/channelTeardown'
import { cls } from '../utils/cls'
import { navigate } from '../routing/router'
import { gamePath } from '../routing/routes'
import { useBoundAction } from '../actions/useBoundAction'
import { useTabRing } from '../keyboard/useTabRing'
import { useAccountMenuSection } from '../account/useAccountMenuSection'
import { useStickyChoice } from '../web-storage/useStickyChoice'
import { MODE_LABEL, playerCountFits, playerCountLabel } from '../manifest/gameManifest'
import { useClubPresence } from '../realtime/useClubPresence'
import { useClubSetupPresence } from '../realtime/useClubSetupPresence'
import { ChatButton } from '../page-header/ChatButton'
import { Chat } from '../chat/Chat'
import { CurrentGameCard } from './CurrentGameCard'
import { ClubGameRow } from './ClubGameRow'
import { ClubHelpCompanion } from './ClubHelpCompanion'
import { EditClubModal } from './EditClubModal'
import { GametypeFilter, type GametypeOption } from './GametypeFilter'
import { ModeFilter } from './ModeFilter'
import { Segmented } from '../buttons/Segmented'
import { MODE_FILTER_VALUES, type ModeFilterValue } from './modeFilterOptions'
import { PageHeader } from '../page-header/PageHeader'
import { PageHeaderMenu } from '../page-header/PageHeaderMenu'
import { PuzpuzpuzLogo } from '../branding/PuzpuzpuzLogo'
import { SetupGameModal } from '../setup-form/SetupGameModal'
import { StartGameRow } from './StartGameRow'
import { SelectionList } from '../lists/SelectionList'
import { PageHeaderStatusSlot } from '../page-header/PageHeaderStatusSlot'
import { gametypes } from '@/gametypes'
import { useFeedbackSlot } from '../feedback/useFeedbackSlot'
import { useClubGames, type ListedGame } from './useClubGames'
import { useSetupDialog } from './useSetupDialog'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { MenuSection } from '../menu/menuModel'
import type { Database } from '@/types/db'
import type { Member } from '../members/member'
import { reportUnhandled } from '../supabase/dbEnvelope'
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

/** What `common.unset_current_view` puts in `data` when it cleared the pointer.
 *  Nullable because its other `ok` — PA001, the game is gone — comes through a
 *  raise, and `common.raised_envelope` always builds `data: null`. */
type UnsetAnswer = { result: 'cleared' } | null

/** What `common.delete_game` puts in `data`. One `ok` answer, named anyway —
 *  a branch matching merely by being `ok` would draw a second one as this. */
type DeleteAnswer = { result: 'deleted' }

type Props = {
  // The club itself, already loaded — see ClubPageLoader for why it is a prop
  // and not state.
  club: ClubRow
  // Its full roster, alphabetical. Fixed for the page's life: membership is
  // set at creation.
  members: Member[]
  // The enrolled set as it was at load, which seeds the page's own state —
  // the club editor changes it while the page is up.
  initialGametypes: ClubPageData['gametypes']
  // Signed-in session — its user id is this client's identity on the club
  // presence channel (member dots + abandoned-game heal).
  session: Session
}

/**
 * The club room: who is here, what is being played, what could be started, and
 * everything the club has played. `<ClubPageLoader>` renders it at
 * `/c/<handle>` once the club has answered.
 *
 * Takes the club, its roster and the gametypes it plays — all loaded, none
 * nullable. `initialGametypes` is a SEED rather than a fact: the club editor
 * changes the enrolled set while the page is up, so the page owns it from
 * here. Everything else is the page's own: the two filters, the mobile tab,
 * which dialog is open, and what a delete answer says.
 *
 * The games list is not here either — `useClubGames` reads and re-reads it.
 * See `club/doc.md` for how the pieces sit together.
 */
export function ClubPage({ club, members, initialGametypes, session }: Props) {
  const selfId = session.user.id
  const handle = club.handle
  // One-player club. Suppresses the "Co-op" mode badge on this page's cards
  // and rows — see ModeBadge. `is_solo` is a generated column over the handle's
  // '=' prefix, so the convention is stated in the database and read here.
  const soloClub = club.is_solo
  // Whether the club Help companion is mounted — opened by the menu's "Help"
  // item (the club-page counterpart to each game's Help on GamePage).
  const [helpOpen, setHelpOpen] = useState(false)
  // Which body column is showing on MOBILE (phones + portrait tablets). On
  // desktop the two columns sit side by side and this is ignored — the tab bar
  // that drives it is display:none there (see ClubPage.module.css's mobile
  // breakpoint). Below the breakpoint only one column renders at a time so the
  // page still fits the viewport; the tabs pick which. 'new' = the left column
  // (current game + start-a-new-game); 'games' = the right column ("Your
  // games" — every game the club has, the current one included). It also
  // picks which filter the mobile filter row shows, since only one list is on
  // screen.
  const [mobileTab, setMobileTab] = useState<'new' | 'games'>('new')

  // ─── The two list filters ────────────────────────────────────────────────
  // One per column, each narrowing only its own list. Why one persists and the
  // other does not is common/club/doc.md.
  //
  // Keyed by user id so two accounts sharing a browser don't inherit each
  // other's taste. `selfId` is prop-derived and available on the first render,
  // which is what `useStickyChoice`'s read-the-key-once contract needs.
  const [modeFilter, setModeFilter] = useStickyChoice<ModeFilterValue>(
    `puzpuzpuz:club:modeFilter:${selfId}`,
    MODE_FILTER_VALUES,
    'all',
  )
  const [gametypeFilter, setGametypeFilter] = useState<string>('all')

  // The page's GLOBAL feedback slot — the header's status slot draws its top
  // message in place of the members strip. Nothing is handed down: this page
  // has no render-prop child.
  //
  // `feedback/doc.md` splits the two slots by WHO a message is about, and gives
  // the header to other people's news. This page has no second slot, so it uses
  // this one for its own news too: the chat producer below, the "coming soon"
  // acknowledgment on the placeholder menu item, and a failed games read. That
  // last one is why hiding the members strip is acceptable here — a page whose
  // list has gone stale with nothing to refresh it is a page to reload, and the
  // roster and chat pills are not what the player needs to see while it is.
  const globalFeedbackSlot = useFeedbackSlot('global')
  // The club's games, kept fresh by their own Realtime subscription: the list
  // in last-played order, the current game's id (the `is_current_view` row),
  // and whether the last read failed.
  const { games: allGames, currentGameId, failed: gamesFailed } =
    useClubGames(handle, globalFeedbackSlot)
  // Club presence: who's in the club orbit right now (this page, or
  // any game page of the club) and which game they're viewing. We
  // pass `null` for our own location — we're in the club room, not a
  // game. Drives the member-strip dots + the abandoned-game heal.
  const presence = useClubPresence(handle, null, selfId)

  const accountSection = useAccountMenuSection()

  const presentUserIds = useMemo(
    () => new Set(presence.map((e) => e.userId)),
    [presence],
  )

  // Heal an abandoned current-view pointer: a game flagged current with nobody
  // present in it gets its flag cleared. How the flag sticks is docs/common.md
  // → the current-view pointer; this is here because presence is the reliable
  // answer to "is anyone viewing it?", and the club page is where the
  // staleness shows.
  const healedRef = useRef<string | null>(null)
  useEffect(function healAbandonedCurrentGame() {
    if (!currentGameId) {
      healedRef.current = null
      return
    }
    // Someone present is viewing it — game pages announce their
    // gameId on this same channel — so it's genuinely current.
    if (presence.some((e) => e.gameId === currentGameId)) {
      healedRef.current = null
      return
    }
    // Don't re-fire while a prior unset propagates back through the
    // realtime refetch.
    if (healedRef.current === currentGameId) return
    // Grace period: a just-arriving viewer's presence may not have
    // synced yet (or we just mounted with an empty roster). If a
    // viewer appears within the window, `presence` changes, this
    // effect re-runs, the someone-viewing branch returns, and the
    // cleanup cancels this timer — so we only unset a genuinely
    // unattended game.
    const timer = setTimeout(() => {
      healedRef.current = currentGameId
      void runRpc<UnsetAnswer>(
        commonDb.rpc('unset_current_view', { target_game: currentGameId }),
      ).then((res) => {
        // No manual refetch on any of these — the is_current_view UPDATE flows
        // back through the club-games postgres-changes subscription, which
        // re-runs loadGames and clears currentGameId.
        if (res.type === 'not-ok' && res.severity === 'fault') {
          // Logged, not surfaced: nobody asked for this heal, so there is
          // nobody to tell, and `runRpc` has already put the modal up. The line
          // is what names WHICH call it was.
          //
          // The severity is asserted rather than assumed, because it is the
          // whole reason a console line is enough. A fault is the only not-ok
          // this RPC can give today (PN011 / PN012, from require_club_member),
          // and it is the only one this page can safely leave unsaid — the
          // modal has said it. A race or a service-error would need a surface,
          // and this page has none for news nobody asked for, so rather than
          // becoming a quiet console line it goes to the scream below.
          console.error('heal unset_current_view failed', res.message)
        } else if (res.type === 'ok' && res.dbcode === 'PA001') {
          // The game was deleted inside the 2.5s grace window. Not a failure at
          // all: a deleted game has no pointer left to clear, which is what the
          // heal wanted. Named by its `dbcode` because it arrives through a
          // raise, and a raise carries no `data`.
        } else if (res.type === 'ok' && res.data?.result === 'cleared') {
          // The pointer is cleared — or was already false, the RPC's own
          // `where is_current_view = true` guard making a lost race a no-op.
        } else {
          reportUnhandled('unset_current_view', res)
        }
      })
    }, 2500)
    return () => clearTimeout(timer)
  }, [currentGameId, presence])
  // The set of gametypes this club is allowed to play, read from
  // common.clubs_gametypes. Seeded at club-creation (every gametype
  // for friend clubs; the solo-playable subset for solo clubs) and
  // editable via the "Edit club" dialog (set_club_gametypes). The start
  // list is gated on this set; the EditClubModal hands back the new set
  // on save so the list updates without a refetch.
  const [allowedGametypes, setAllowedGametypes] = useState<Set<string>>(
    () => new Set(initialGametypes.map((k) => k.gametype)),
  )
  // Saved setup defaults per gametype — what the friends played last time,
  // handed to SetupGameModal as `savedDefault` so the form pre-fills. A
  // gametype with none falls through to the manifest's static defaults. See
  // common.create_game's saved_default arg for the write side.
  //
  // Derived, not state: unlike the enrolled set beside it, nothing on this
  // page changes a saved default. Editing the club can only remove a gametype,
  // and a removed one draws no start row to open a dialog from.
  const savedDefaults = useMemo(
    () =>
      new Map(
        initialGametypes
          .filter((k) => k.default_setup !== null)
          .map((k) => [k.gametype, k.default_setup]),
      ),
    [initialGametypes],
  )
  const startListRef = useRef<HTMLDivElement | null>(null)
  const gamesListRef = useRef<HTMLDivElement | null>(null)

  // Whether the setup dialog is open and on what — a start row's press or a
  // `?new=` arrival, collapsed into one answer.
  const { manifest: activeSetup, open: handleStartSetup, close: closeSetup } =
    useSetupDialog(startListRef)

  // Announce "I'm setting up a game" to the club while MY setup dialog is open,
  // and toast when a PEER is — so two members don't both start the next game
  // unaware of each other. Driven straight off `activeSetup` (non-null = my
  // dialog is open, however it was opened); cancel/start clears it → my
  // announcement drops → peers' toasts clear. Presence-based (auto-clears on
  // disconnect, syncs to late-joiners); see useClubSetupPresence.
  const selfUsername = members.find((m) => m.user_id === selfId)?.username ?? 'You'
  useClubSetupPresence({
    clubHandle: handle,
    selfId,
    announce: activeSetup
      ? { brand: activeSetup.name, mode: activeSetup.mode, username: selfUsername }
      : null,
  })

  // Whether the "Edit club" options dialog is open. Like the setup
  // dialog, the component is mounted iff this is true.
  const [editing, setEditing] = useState(false)

  // ─── Keyboard navigation ────────────────────────────────
  // The cursor, the ring, Enter and focus-on-arrival belong to each
  // <SelectionList> (docs/ui.md → Selection lists). What stays here is the part
  // that is about the RELATIONSHIP between the two lists: Tab toggles focus
  // from one to the other. Everything else on the page is deliberately
  // mouse-only — `useTabRing` below keeps Tab inside the two lists so focus can
  // never wander into other controls — while an open overlay's own ring is
  // innermost and answers Tab instead (chat / setup / help / lookup), and
  // the global shortcuts (/, ?, ~) are untouched.
  // This page's TAB RING is its two lists, in this order — skipping whichever
  // the mobile one-column layout has hidden, and entered at the start list from
  // anywhere else, which is how the keyboard comes back after a click on some
  // blank part of the page. Nothing else on the page is in
  // it: not the header marks, not the filters, not a row's delete affordance.
  useTabRing([startListRef, gamesListRef], 'keys-next-list')

  // The startable games in DISPLAY order — alphabetical by brand, and coop
  // before compete inside the tie a sibling pair makes (both export the same
  // `name`). Both halves are spelled out here, so the order this list renders
  // in is this sort's alone and not the registry's. Here rather than in the
  // row, so the keyboard cursor indexes the order the list renders in.
  const startableGames = useMemo(
    () =>
      gametypes
        .filter((g) => allowedGametypes.has(g.gametype))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            (a.mode === b.mode ? 0 : a.mode === 'coop' ? -1 : 1),
        ),
    [allowedGametypes],
  )

  // `<` → Back to home (the club list), mirroring the game menu's `<` → Back to
  // club. One key, one meaning: "up a level from wherever I am". It is also the
  // menu's row, which is what makes the key discoverable — the row shows it.
  const actBackToHome = useBoundAction('act-back-to-home', {
    describe: () => 'active',
    run: () => navigate('/'),
  })

  // The club menu's other rows. Key-less, but actions all the same: one row
  // shape, one place that says what a row is called and whether it applies.
  const actHelp = useBoundAction('act-help', {
    describe: () => 'active',
    run: () => setHelpOpen(true),
  })
  const actEditClub = useBoundAction('act-edit-club', {
    describe: () => 'active',
    run: () => setEditing(true),
  })
  const actRenameClub = useBoundAction('act-rename-club', {
    describe: () => 'active',
    run: () => {
      globalFeedbackSlot.show(FeedbackMessage.acknowledgment('noted', 'Rename club: coming soon'))
    },
  })

  /**
   * Delete a game from this club. Same RPC for current vs
   * non-current games; the FE-side difference is that the
   * current-view game has peers on the GamePage who need to be
   * moved out BEFORE the row vanishes. We broadcast a `suspend`
   * event on the game's channel — exactly what the suspend-
   * confirm modal does — and useCommonGame's handler navigates
   * each peer back to the club page. Once they've cleared, the
   * DELETE cascades and `useClubGames`' subscription refetches the
   * games list.
   *
   * For non-current games no peers are viewing them by
   * definition (is_current_view=false ⟹ nobody on the GamePage),
   * so we skip the broadcast and call the RPC directly.
   *
   * `ClubGameDeleteButton` owns the confirm-flow state (idle →
   * confirming → deleting) and the auto-revert timeout; this function
   * is called only when the user has already confirmed.
   *
   * Both answers are toasts. The page's one feedback slot is the header's,
   * and a message parked there hides the members strip — which a failed games
   * read earns and a delete's own answer does not (docs/ui.md → Toasts).
   */
  async function handleDelete(gameId: string, isCurrent: boolean) {
    if (isCurrent) {
      // Open a temp channel matching the game's stable name and
      // broadcast the suspend event so any peer on the GamePage
      // navigates back to the club page. The handler in
      // useCommonGame is already wired for this. We close the
      // channel as soon as the send completes — we're not
      // listening for anything on it.
      // Same stable room name useCommonGame uses, so the same teardown race
      // applies: someone who just left this game's page (back to the club,
      // then Delete) can still have its channel leaving. Joining inside that
      // window gets the dying instance back, which would never reach
      // SUBSCRIBED and would silently cost the peers their suspend broadcast.
      // Already in an async function here, so the gate is a plain await.
      // See channelTeardown.ts.
      await (channelLeaving(`game:${gameId}`) ?? Promise.resolve())
      const ch = supabase.channel(`game:${gameId}`)
      // The broadcast is friendliness, not correctness (peers handle a
      // vanished game gracefully), so it must NEVER block the delete. Wait
      // only until the channel reaches a TERMINAL status — SUBSCRIBED (we can
      // send) or CHANNEL_ERROR / TIMED_OUT / CLOSED (give up) — and race a
      // short timeout in case no status ever fires. Without this, a wedged
      // Realtime connection would hang the delete on "Deleting…" forever —
      // exactly when someone wants to remove a stuck game and the RPC below
      // would have worked.
      const subscribed = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 1000)
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer)
            resolve(true)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timer)
            resolve(false)
          }
        })
      })
      if (subscribed) {
        await ch.send({
          type: 'broadcast',
          event: 'suspend',
          payload: { type: 'suspend' },
        })
      }
      void releaseChannel(ch)
      // Brief beat so peers have time to receive + navigate before the row
      // disappears — only meaningful if the broadcast actually went out.
      if (subscribed) await new Promise((r) => setTimeout(r, 150))
    }

    const res = await runRpc<DeleteAnswer>(commonDb.rpc('delete_game', { target_game: gameId }))
    if (res.type === 'not-ok') {
      // EVERY severity gets the toast, a fault included. Its modal has already
      // been raised centrally, and the toast is what survives dismissing it —
      // without one, pressing OK leaves a club page that looks like nothing
      // happened and a game still sitting in the list (docs/envelopes.md → the
      // modal is an escalation, not a replacement).
      //
      // No `ms`, so it waits to be dismissed: the toast is the only lasting
      // record here, since this page has no pill of its own.
      //
      // `tone` by hand, and NOT from `FeedbackMessage.notOk`: a toast has its own
      // three-value vocabulary (`info` / `success` / `error`, an accent stripe
      // — docs/ui.md → Toasts), not the seven outcomes. It has exactly one red,
      // so every severity that reads red lands on it and the envelope's own
      // `outcome` has nothing finer to say here.
      showToast({ message: res.message, tone: 'error' })
      // The Error is only a signal to the card, which catches it and goes from
      // 'deleting' back to 'idle'. The words are already on screen.
      throw new Error(res.message)
    } else if (res.type === 'ok' && res.data.result === 'deleted') {
      // Look up the title BEFORE the postgres-changes refetch sweeps the row
      // out of allGames; the value is captured by the closure and survives the
      // rerender.
      const deleted = allGames.find((g) => g.gameId === gameId)
      showToast({
        message: `${deleted?.title ?? 'Game'} deleted`,
        tone: 'success',
        ms: DEFAULT_TOAST_MS,
      })
      // No explicit list refresh — `useClubGames` sees the DELETE on
      // common.games and re-reads.
    } else {
      // Throws as well as screams: the button only leaves "Deleting…" when this
      // function rejects (ClubGameDeleteButton's catch), so a fallen-through
      // answer would otherwise strand it there with the game still listed.
      reportUnhandled('delete_game', res)
      throw new Error('delete_game: unreadable answer')
    }
  }

  // The current game — the one whose id matches the is_current_view=true row
  // from common.games. It gets its own prominent callout above the start list.
  const currentGame = currentGameId
    ? allGames.find((g) => g.gameId === currentGameId) ?? null
    : null

  // How a game reads in the list: the club's current game, a shelved one, or a
  // finished one. Only the corner flag varies, and GameEntry draws it. Terminal
  // vs non-terminal is a rendering distinction, not a schema one
  // (docs/states.md → no special 'suspended' category in the listing).
  const gameState = (g: ListedGame) =>
    g.gameId === currentGameId ? 'current' : g.isTerminal ? 'completed' : 'suspended'

  // ─── Apply the two filters ───────────────────────────────────────
  // Everything downstream — rendering AND the keyboard cursors — reads the
  // VISIBLE lists, so a filtered-out game is unreachable by arrow keys too
  // (the cursor indexes exactly what's on screen; see common/club/doc.md →
  // the keyboard).
  // A solo club only ever renders the "All" option (mode is noise with one
  // player — see ModeFilter), so pin the filter open there rather than trusting
  // that nothing can have set it: the alternative failure is a list filtered
  // with no visible control to unfilter it.
  const effectiveMode = soloClub ? 'all' : modeFilter
  const visibleStartable = startableGames.filter(
    (g) => effectiveMode === 'all' || g.mode === effectiveMode,
  )

  // The gametype families present in "Your games", as dropdown options —
  // built from the games actually listed, so the dropdown can never offer a
  // choice that empties the list. One entry per family (the Map dedupes the
  // coop/compete siblings onto their shared baseGametype), ordered by brand
  // to match the alphabetical-by-brand start list.
  const gametypeOptions: GametypeOption[] = [
    ...new Map(allGames.map((g) => [g.manifest.baseGametype, g.manifest.name])).entries(),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // Deleting the last game of the filtered family (or a realtime refetch that
  // drops it) leaves the selection pointing at a family that's no longer an
  // option. Fall back to showing everything, DERIVED here rather than repaired
  // by an effect — this repo bans setState-in-effect (see the eslint rule),
  // and a stale selection is a render-time question anyway.
  const selectedGametype = gametypeOptions.some((o) => o.value === gametypeFilter)
    ? gametypeFilter
    : 'all'
  const visibleGames = allGames.filter(
    (g) => selectedGametype === 'all' || g.manifest.baseGametype === selectedGametype,
  )

  // While one of our dialogs is up it owns Enter and the arrows, and the list
  // that opened it must keep its cursor rather than reading the dialog's
  // autofocus as "the user left". Both are what `frozen` means; the page is the
  // only thing that knows which of its dialogs are open.
  const kbDialogUp = activeSetup !== null || editing || helpOpen

  // Menu sections for the club logo's dropdown; the shape is docs/ui.md →
  // "ClubPage header". One common section — there is no PlayArea here to push
  // a dynamic one — and "Rename club" is a placeholder that acknowledges in
  // the global feedback slot, so a click still has visible feedback.
  const menuSections: MenuSection[] = [
    // Each row IS its action — its words, its glyph and its `<` come from the
    // registry, so the row and the key cannot disagree about any of them.
    { items: [actHelp, actBackToHome, actEditClub, actRenameClub] },
    // The account submenu, last — the least club-y thing in the menu. Same row
    // in the same place as GamePage's and HomePage's.
    accountSection,
  ]

  return (
    <div className={cls('pageHeaderAndMainArea', styles.clubPageWrapper)}>
      <PageHeader>
        <PageHeaderMenu logo={<PuzpuzpuzLogo />} sections={menuSections} label="Club menu" />
        <ChatButton />
        {/* The `players` prop takes this club's roster: it is a `Member[]`
            either way, and the strip draws the same dot-and-name shape for
            both. */}
        <PageHeaderStatusSlot
          players={members}
          globalFeedbackSlot={globalFeedbackSlot}
          presentUserIds={presentUserIds}
        />
      </PageHeader>

      {/* THE PAGE'S MAIN — one element around everything below the header, and
          the only place this page's content well is declared. Inside it are four
          stacked blocks: the club's name, the mobile tab bar, the mobile filter
          row, and the two columns that take the rest of the height. */}
      <main className={cls('pageMain', 'pageMain-fills', styles.main)}>
        {/* Club title — a full-width row spanning both body columns.
            The "Club:" / "Solo Club:" prefix says what kind of venue
            this page is (solo = the '='-prefixed one-member club). */}
        <div className={styles.clubNameBlock}>
          <h1 className={styles.clubName}>
            {soloClub ? 'Solo Club: ' : 'Club: '}
            {club.name}
          </h1>
        </div>

        {/* Mobile-only view switcher: `display: none` on desktop, where both
            columns show side by side. "New game" is the left column, "Your
            games" the right; below the breakpoint only the selected one
            renders, so the page still fits the viewport. Labels are short and
            count-free because the headings that carried the count are hidden
            here. Why it is toggle buttons rather than an ARIA tabs pattern is
            <Segmented>'s own docstring. */}
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

        {/* Mobile-only filter row. On desktop each filter lives at the right of
            its column's heading (below); on mobile those headings are gone —
            the tab bar names the view — so the filter for the SHOWING tab goes
            directly under the tabs, where the heading would have been.

            Both filters are therefore in the tree twice, one instance hidden
            by the breakpoint; why that is the shape and not a failing is in
            club/doc.md.

            The ROW ITSELF is conditional, not just its contents: a solo club has
            no mode filter (see ModeFilter), and an empty row would still take the
            main column's 1rem gap — a mystery band of space under the tabs. */}
        {!(mobileTab === 'new' && soloClub) && (
          <div className={styles.mobileFilters} data-testid="mobile-filters">
            {mobileTab === 'new' ? (
              <ModeFilter value={effectiveMode} onChange={setModeFilter} soloClub={soloClub} />
            ) : (
              <GametypeFilter
                value={selectedGametype}
                options={gametypeOptions}
                onChange={setGametypeFilter}
              />
            )}
          </div>
        )}

        {/* Two-column body that takes the rest of the viewport height
            (per docs/ui.md → "Page-height fits the viewport"). Left
            column holds the current-game card + the start list; right
            column is the "Your games" list as a fixed-size frame with
            internal overflow-y: auto. The `data-tab` attr
            drives the mobile single-column view (see the CSS); it's
            inert on desktop where both columns are always shown. */}
        <div className={styles.columns} data-tab={mobileTab}>
          <section className={styles.left}>
            {currentGame && (
              <div>
                <h3>Join the current game</h3>
                {/* The prominent callout — UNCHANGED by the current game also
                    being listed on the right, where it appears as an ordinary
                    row flying its orange flag. Not a list of one: this is its
                    own component with its own box (docs/ui.md → Selection lists). */}
                <CurrentGameCard
                  gameId={currentGame.gameId}
                  manifest={currentGame.manifest}
                  title={currentGame.title}
                  statusLabel={currentGame.statusLabel}
                  lastActiveAt={currentGame.lastActiveAt}
                  soloClub={soloClub}
                  onDelete={() => handleDelete(currentGame.gameId, true)}
                />
              </div>
            )}

            <div className={styles.startBlock}>
              {/* Heading + its filter, one row. The whole row is hidden on
                  mobile (the tab bar names the view and the mobile filter row
                  above carries the control). */}
              <div
                className={cls('heading-with-controls', styles.headingRow)}
                // Both heading rows carry it: the filters a test reaches for
                // are in the tree twice (club/doc.md), and this is what tells
                // the desktop pair from the mobile row below.
                data-testid="heading-controls"
              >
                <h3>Start a new game</h3>
                <ModeFilter value={effectiveMode} onChange={setModeFilter} soloClub={soloClub} />
              </div>
              {/* The heading above stays put; only the list inside this frame
                  scrolls, matching the right column. Also one of the page's two
                  KEYBOARD tab stops (see the kb-nav block above): the container
                  takes focus, arrows move the cursor, Enter starts. */}
              {/* visibleStartable = the registry filtered by the club's
                  allowed-gametype m2m AND by the mode filter, in display order.
                  ClubPage stays game-agnostic; the RPC call lives inside the
                  manifest, so adding a game makes a row appear here on its own
                  (assuming the m2m is populated for this club).

                  Unlike the games list, THIS one a filter really can empty: a
                  club enrolled in only coop gametypes, filtered to Compete. */}
              <SelectionList
                ref={startListRef}
                items={visibleStartable}
                rowKey={(g) => g.gametype}
                label="Start a new game"
                frozen={kbDialogUp}
                fills
                density="packed"
                // Focus starts here on arrival, so arrows and Enter work with no
                // first Tab. closeSetup() hands focus back when a dialog closes.
                autoFocus
                onActivate={(g) => handleStartSetup(g.gametype)}
                // The one predicate, evaluated once: the list dims the row AND
                // declines Enter from this single answer.
                disabled={(g) => !playerCountFits(g.numberOfPlayers, members.length)}
                rowTitle={(g) =>
                  playerCountFits(g.numberOfPlayers, members.length)
                    ? undefined
                    : playerCountLabel(g.numberOfPlayers)
                }
                empty={
                  effectiveMode === 'all'
                    ? 'No games available in this club.'
                    : `No ${MODE_LABEL[effectiveMode]} games in this club.`
                }
                renderRow={(g) => <StartGameRow game={g} soloClub={soloClub} />}
              />
            </div>
          </section>

          <section className={styles.right}>
            {/* "Your games" = every game this club has, the current one
                included — current / shelved / finished being a flag on the row
                rather than three sections (docs/states.md). The count is of
                what's SHOWING, so it agrees with the list under a filter. */}
            <div
              className={cls('heading-with-controls', styles.headingRow)}
              data-testid="heading-controls"
            >
              <h3>Your games ({visibleGames.length})</h3>
              <GametypeFilter
                value={selectedGametype}
                options={gametypeOptions}
                onChange={setGametypeFilter}
              />
            </div>
            {/* Fixed-size frame with internal scroll. The frame has
                flex: 1 inside the column, which has its own flex: 1
                inside the body, which is bounded by the shared
                `.pageHeaderAndMainArea`'s calc(100svh - body padding)
                height. Each step of the flex chain needs min-height: 0
                so overflow-y: auto actually kicks in. */}
            {/* The page's other KEYBOARD tab stop — same contract as the start
                list: focus the container, arrows move, Enter opens.

                No "nothing matches that filter" case here: the dropdown only
                offers families that ARE in the list, so a selection can't empty
                it (and a selection that goes stale falls back to 'all' — see
                selectedGametype). */}
            <SelectionList
              ref={gamesListRef}
              items={visibleGames}
              rowKey={(g) => g.gameId}
              label="Your games"
              frozen={kbDialogUp}
              fills
              density="packed"
              onActivate={(g) => navigate(gamePath(g.manifest.gametype, g.gameId))}
              empty={gamesFailed ? 'Could not load this club’s games.' : 'No games yet.'}
              renderRow={(g) => (
                <ClubGameRow
                  manifest={g.manifest}
                  title={g.title}
                  statusLabel={g.statusLabel}
                  lastActiveAt={g.lastActiveAt}
                  // The current game is a row like any other here — only its
                  // orange flag (from state='current') sets it apart.
                  state={gameState(g)}
                  soloClub={soloClub}
                  // Deleting the CURRENT game has to move its viewers out
                  // first, so the flag that drives that is per-row.
                  onDelete={() => handleDelete(g.gameId, g.gameId === currentGameId)}
                />
              )}
            />
          </section>
        </div>
      </main>

      {/* The chat-bubble toggle lives in the header (<ChatButton>
          above); Chat renders the panel itself, and nothing
          at all while closed. It holds the club's chat subscription, so it
          also pops a new message from another member in the global slot —
          `members` is the full roster, so every sender is named. */}
      <Chat
        clubHandle={club.handle}
        members={members}
        selfId={selfId}
        globalFeedbackSlot={globalFeedbackSlot}
      />

      {/* The club Help companion — opened from the menu's "Help" item (or `?`,
          which opens the menu). Parity with each game's Help on GamePage. */}
      {helpOpen && <ClubHelpCompanion onClose={() => setHelpOpen(false)} />}

      {activeSetup && (
        <SetupGameModal
          manifest={activeSetup}
          members={members}
          selfId={selfId}
          clubHandle={club.handle}
          soloClub={soloClub}
          savedDefault={savedDefaults.get(activeSetup.gametype)}
          onStarted={(id) => {
            // Capture gametype before closing — the state setter is
            // asynchronous but our reference to activeSetup inside this
            // closure is the one from this render, so reading .gametype
            // here is safe regardless of ordering.
            const gametype = activeSetup.gametype
            closeSetup()
            navigate(gamePath(gametype, id))
          }}
          onCancel={closeSetup}
        />
      )}

      {editing && (
        <EditClubModal
          clubHandle={club.handle}
          clubName={club.name}
          allowedGametypes={allowedGametypes}
          onSaved={(next) => {
            // Reflect the new enrolled set immediately, so the start list
            // updates without a refetch. A removed gametype's saved default
            // stays in `savedDefaults` and is harmless: it draws no start row
            // to open a dialog from.
            setAllowedGametypes(next)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}
