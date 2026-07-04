import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../../db'
import { supabase } from '../../lib/supabase/supabase'
import { Link } from '../../lib/routing/Link'
import { navigate } from '../../lib/routing/router'
import { channelDedupSuffix } from '../../lib/supabase/channelDedup'
import { useAppShortcuts } from '../../hooks/input/useAppShortcuts'
import { useClubPresence } from '../../hooks/realtime/useClubPresence'
import { useClubSetupPresence } from '../../hooks/realtime/useClubSetupPresence'
import { ChatBubble } from '../chat/ChatBubble'
import { FloatingChat } from '../chat/FloatingChat'
import { ClubGameCard } from './ClubGameCard'
import { ClubHelp } from './ClubHelp'
import { EditClubDialog } from './EditClubDialog'
import { Menu, type MenuHandle } from '../panels/Menu'
import { PuzpuzpuzLogo } from '../branding/PuzpuzpuzLogo'
import { SetupGameDialog } from '../setup/SetupGameDialog'
import { StartGameButtons } from './StartGameButtons'
import { StatusSlot } from '../game/StatusSlot'
import { showToast } from '../../lib/toast/toastStore'
import { games } from '../../../games'
import type {
  CommonGameListRow,
  GenericFeedbackMsg,
  GameManifest,
  MenuSection,
} from '../../lib/games'
import type { Database } from '../../../types/db'
import styles from './ClubPage.module.css'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to common.clubs requires
// explicitly listing it here AND in the select() below.
type ClubRow = Pick<
  Database['common']['Tables']['clubs']['Row'],
  'handle' | 'name'
>
import type { Member } from '../../lib/games'

/**
 * Display shape for one game in the club's games list. Built from
 * a common.games row plus the dispatched `labelFor` output. The
 * card component reads this verbatim; ClubPage's classify-into-
 * sections logic also reads `isTerminal` to assign the right
 * state for CSS treatment.
 */
type ListedGame = {
  gameId: string
  gametype: string
  title: string
  /** `common.games.last_active_at` — last status/progress write (or the
   *  end time). The card dates + the list orders by this, so a long-
   *  suspended game reads by when it was last played, not when it began. */
  lastActiveAt: string
  isTerminal: boolean
  statusLabel: string
}

type Props = {
  handle: string
  /** Signed-in session — its user id is this client's identity on the
   *  club presence channel (member dots + abandoned-game heal). */
  session: Session
}

/**
 * Club detail page — accessed via `/c/<handle>`.
 *
 * Shows: club name, member roster, games (active / suspended /
 * completed), per-gametype "Start" buttons, and chat.
 *
 * RLS gates everything: a non-member's `clubs.select` returns zero
 * rows, so visiting `/c/some-other-club` shows a "not found" rather
 * than a forbidden-style error. Same protection covers
 * `clubs_members`, `common.games` (gates on is_club_member(club_handle)),
 * each game's tables (via the gametype's own RLS), and `messages`
 * (covered transitively by useClubChat).
 *
 * Realtime: subscribed to common.games changes for this club. When
 * another tab (different member, or yourself in another
 * window) starts/ends a game, the current-view pointer changes
 * and we refetch — so the games section updates without a
 * manual refresh. Within-game updates (chat, board state, etc.)
 * belong to other subscriptions inside those views; ClubPage
 * only cares about the club's current-view pointer + the
 * games-list shape.
 */
export function ClubPage({ handle, session }: Props) {
  const selfId = session.user.id
  // Solo club = handle prefixed with '=' (one player). Suppresses the
  // "Co-op" mode pill on this page's cards/buttons — see ModePill.
  const soloClub = handle.startsWith('=')
  const [club, setClub] = useState<ClubRow | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allGames, setAllGames] = useState<ListedGame[]>([])
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Whether the club Help modal is mounted — toggled by the menu's "Help" item
  // (the club-page counterpart to each game's Help modal on GamePage).
  const [helpOpen, setHelpOpen] = useState(false)

  // Club presence: who's in the club orbit right now (this page, or
  // any game page of the club) and which game they're viewing. We
  // pass `null` for our own location — we're in the club room, not a
  // game. Drives the member-strip dots + the abandoned-game heal.
  const presence = useClubPresence(handle, null, selfId)

  // App-chrome keyboard shortcuts: "/" opens chat, "?" opens the club
  // menu, "~" opens the word-lookup dialog (the hook owns + returns that
  // dialog; we render it below). Same hook the GamePage uses. Declared
  // above the loading early returns so the hook order stays stable.
  const menuRef = useRef<MenuHandle>(null)
  // TEMPORARY (toast demo): a counter so each "Pop a test toast" click makes a
  // distinct, stacking announcement. Remove with the demo menu item below.
  const toastDemoRef = useRef(0)
  const lookupDialog = useAppShortcuts(useCallback(() => menuRef.current?.open(), []))

  const presentUserIds = useMemo(
    () => new Set(presence.map((e) => e.userId)),
    [presence],
  )

  // Heal an abandoned current-view pointer. `is_current_view` is a
  // synced DB flag that can get stuck `true` when the last viewer's
  // "I left" write is missed — the simultaneous-leave race in
  // useCommonGame (e.g. a suspend that navigates everyone at once).
  // Presence is the reliable truth for "is anyone actually viewing
  // this game?", and the club page is where the staleness shows — so
  // reconcile here: a game flagged current but with nobody present in
  // it gets its flag cleared.
  const healedRef = useRef<string | null>(null)
  useEffect(function healAbandonedCurrentGame() {
    if (!activeGameId) {
      healedRef.current = null
      return
    }
    // Someone present is viewing it — game pages announce their
    // gameId on this same channel — so it's genuinely current.
    if (presence.some((e) => e.gameId === activeGameId)) {
      healedRef.current = null
      return
    }
    // Don't re-fire while a prior unset propagates back through the
    // realtime refetch.
    if (healedRef.current === activeGameId) return
    // Grace period: a just-arriving viewer's presence may not have
    // synced yet (or we just mounted with an empty roster). If a
    // viewer appears within the window, `presence` changes, this
    // effect re-runs, the someone-viewing branch returns, and the
    // cleanup cancels this timer — so we only unset a genuinely
    // unattended game.
    const timer = setTimeout(() => {
      healedRef.current = activeGameId
      void commonDb
        .rpc('unset_current_view', { target_game: activeGameId })
        .then((res) => {
          if (res.error) {
            console.error('heal unset_current_view failed', res.error)
          }
          // No manual refetch — the is_current_view UPDATE flows back
          // through the club-games postgres-changes subscription,
          // which re-runs loadGames and clears activeGameId.
        })
    }, 2500)
    return () => clearTimeout(timer)
  }, [activeGameId, presence])
  // Shared error channel for club-page actions (delete-game today;
  // future surfaces land here too rather than competing for
  // screen space). Named for legacy reasons — once dominated by
  // the no-setup-form direct-start path that's now excised; today
  // it's a generic action error.
  const [startError, setStartError] = useState<string | null>(null)
  // The set of gametypes this club is allowed to play, read from
  // common.clubs_gametypes. Seeded at club-creation (every gametype
  // for friend clubs; the solo-playable subset for solo clubs) and
  // editable via the "Edit club" dialog (set_club_gametypes). We gate
  // the Start-button rendering on this set; the EditClubDialog hands
  // back the new set on save so the buttons update without a refetch.
  const [allowedGametypes, setAllowedGametypes] = useState<Set<string>>(new Set())
  // Saved setup defaults per gametype, also from clubs_gametypes.
  // NULL when the friends haven't started a game of that gametype
  // yet — the dialog falls through to the manifest's static
  // defaults in that case. Sourced from the same query that
  // populates allowedGametypes; passed to SetupGameDialog as
  // `savedDefault` so the form pre-fills with what the friends
  // played last time. See common.create_game's saved_default arg
  // for the write side and docs/code-conventions.md (TBD) for
  // the evolution-strategy story.
  const [savedDefaults, setSavedDefaults] = useState<
    Map<string, unknown>
  >(new Map())
  // The manifest currently being set up in the dialog, or null if
  // the dialog isn't open. Setting this opens the dialog (the
  // dialog component is mounted iff this is non-null); the dialog
  // calls back into us via onStarted / onCancel to close.
  const [pendingSetup, setPendingSetup] = useState<GameManifest | null>(null)

  // Announce "I'm setting up a game" to the club while MY setup dialog is open,
  // and toast when a PEER is — so two members don't both start the next game
  // unaware of each other. Driven straight off `pendingSetup` (non-null = my
  // dialog is open); cancel/start clears it → my announcement drops → peers'
  // toasts clear. Presence-based (auto-clears on disconnect, syncs to
  // late-joiners); see useClubSetupPresence.
  const selfUsername = members.find((m) => m.user_id === selfId)?.username ?? 'You'
  useClubSetupPresence({
    clubHandle: club?.handle ?? null,
    selfId,
    announce: pendingSetup
      ? { brand: pendingSetup.name, mode: pendingSetup.mode, username: selfUsername }
      : null,
  })

  // Whether the "Edit club" options dialog is open. Like the setup
  // dialog, the component is mounted iff this is true.
  const [editing, setEditing] = useState(false)
  // The currently-active feedback pill shown in the header's
  // <StatusSlot>, or null when the slot should show the default
  // <PlayersStrip>. Local-only — ClubPage doesn't expose a
  // ctx.globalFeedback API the way GamePage does, because there's no
  // render-prop child here. Concrete uses today: the
  // "<title> deleted" toast in handleDelete, and the "coming soon"
  // toasts on the placeholder menu items.
  const [globalFeedback, setGlobalFeedback] = useState<GenericFeedbackMsg | null>(null)

  // Auto-clear `timed`-dismiss feedback after the configured
  // duration. Mirrors GamePage's autoClearTimedFeedback — same
  // shape; the duplication is borderline (5 lines twice), worth
  // extracting into a hook if a third consumer arrives.
  useEffect(function autoClearTimedFeedback() {
    if (!globalFeedback) return
    if (globalFeedback.dismiss.kind !== 'timed') return
    const ms = globalFeedback.dismiss.ms ?? 2200
    const t = setTimeout(() => setGlobalFeedback(null), ms)
    return () => clearTimeout(t)
  }, [globalFeedback])

  // Stable identity for the StatusSlot's onCloseGlobalFeedback prop
  // so passing it into props doesn't restage downstream effects.
  const clearGlobalFeedback = useCallback(() => setGlobalFeedback(null), [])

  /**
   * Delete a game from this club. Same RPC for current vs
   * non-current games; the FE-side difference is that the
   * current-view game has peers on the GamePage who need to be
   * moved out BEFORE the row vanishes. We broadcast a `suspend`
   * event on the game's channel — exactly what the suspend-
   * confirm modal does — and useCommonGame's handler navigates
   * each peer back to the club page. Once they've cleared, the
   * DELETE cascades and the postgres-changes subscription on
   * ClubPage refetches the games list.
   *
   * For non-current games no peers are viewing them by
   * definition (is_current_view=false ⟹ nobody on the GamePage),
   * so we skip the broadcast and call the RPC directly.
   *
   * The card itself owns the confirm-flow state (idle → confirming
   * → deleting) and the auto-revert timeout; this function is
   * called only when the user has already confirmed. We surface
   * errors through `startError` since it's the existing
   * club-page error channel and a separate `deleteError` slot
   * would compete for the same screen real estate.
   */
  async function handleDelete(gameId: string, isCurrent: boolean) {
    if (!club) return
    setStartError(null)

    if (isCurrent) {
      // Open a temp channel matching the game's stable name and
      // broadcast the suspend event so any peer on the GamePage
      // navigates back to the club page. The handler in
      // useCommonGame is already wired for this. We close the
      // channel as soon as the send completes — we're not
      // listening for anything on it.
      const ch = supabase.channel(`game:${gameId}`)
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
        })
      })
      await ch.send({
        type: 'broadcast',
        event: 'suspend',
        payload: { type: 'suspend' },
      })
      supabase.removeChannel(ch)
      // Brief beat so peers have time to receive + navigate
      // before the row disappears. They handle a missing game
      // gracefully (load returns null → "Game not found"), so
      // this is friendliness, not correctness.
      await new Promise((r) => setTimeout(r, 150))
    }

    const { error } = await commonDb.rpc('delete_game', { target_game: gameId })
    if (error) {
      setStartError(`Couldn't delete game: ${error.message}`)
      throw error  // bubble to the card so it returns from 'deleting' to 'idle'
    }
    // Surface a transient toast in the header's status slot so
    // the user sees an explicit "yes, that worked" beat. Look up
    // the title BEFORE the postgres-changes refetch sweeps the
    // row out of allGames; the value is captured by the closure
    // and survives the rerender.
    const deleted = allGames.find((g) => g.gameId === gameId)
    setGlobalFeedback({
      tone: 'neutral',
      text: `${deleted?.title ?? 'Game'} deleted`,
      dismiss: { kind: 'timed' },
    })
    // No explicit list refresh — the postgres-changes
    // subscription below fires DELETE on common.games and our
    // loadGames() re-runs.
  }

  /**
   * Click handler for the per-gametype "Start X" buttons. Opens
   * the setup dialog — does NOT actually create the game; that
   * happens when the user clicks Start inside the dialog and
   * SetupGameDialog calls `manifest.startGameInClub`.
   *
   * Two distinct phases that both got called "start" before the
   * rename: this is `startSetup` (the first one); the dialog's
   * is `startGame`.
   */
  function handleStartSetup(gametype: string) {
    const game = games.find((g) => g.gametype === gametype)
    if (!club || !game) return
    setPendingSetup(game)
  }

  // Step 1: look up the club + roster. These don't change during
  // v1 (membership is fixed at creation), so we only fetch once.
  useEffect(function loadClubAndRoster() {
    let mounted = true

    async function load() {
      const { data: clubData, error: clubError } = await commonDb
        .from('clubs')
        .select('handle, name')
        .eq('handle', handle)
        .maybeSingle()
      if (!mounted) return
      if (clubError) {
        setError(clubError.message)
        setLoading(false)
        return
      }
      if (!clubData) {
        setError('Club not found, or you are not a member.')
        setLoading(false)
        return
      }
      setClub(clubData)

      const { data: membersData, error: membersError } = await commonDb
        .from('clubs_members')
        .select('user_id')
        .eq('club_handle', clubData.handle)
      if (!mounted) return
      if (membersError) {
        setError(membersError.message)
        setLoading(false)
        return
      }
      const userIds = (membersData ?? []).map((m) => m.user_id)

      if (userIds.length > 0) {
        const { data: profilesData } = await commonDb
          .from('profiles')
          .select('user_id, username, color')
          .in('user_id', userIds)
        if (!mounted) return
        setMembers((profilesData ?? []) as Member[])
      } else {
        setMembers([])
      }

      // Fetch the m2m rows for this club — drives which Start
      // buttons render AND seeds the SetupGameDialog with the
      // friends' last-played setup per gametype. The intersection
      // with the FE registry (computed at render time) naturally
      // hides gametypes the DB knows about but this FE bundle
      // doesn't.
      const { data: kindsData } = await commonDb
        .from('clubs_gametypes')
        .select('gametype, default_setup')
        .eq('club_handle', clubData.handle)
      if (!mounted) return
      const rows = kindsData ?? []
      setAllowedGametypes(new Set(rows.map((k) => k.gametype)))
      setSavedDefaults(
        new Map(
          rows
            .filter((k) => k.default_setup !== null)
            .map((k) => [k.gametype, k.default_setup as unknown]),
        ),
      )

      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [handle])

  // Step 2: load games for this club + the current-view game id.
  // Re-runs whenever realtime tells us a games row for this club
  // changed (new game inserted, end_game wrote a terminal
  // play_state, set_current_view / unset_current_view flipped the
  // is_current_view pointer, etc.). Also fires on initial mount.
  useEffect(function subscribeToClubGames() {
    if (!club) return
    const clubHandle = club.handle
    let mounted = true

    async function loadGames() {
      // One read into common.games — the labelFor refactor moved
      // all the listing data here, so per-gametype fan-out is
      // gone. Each row's label comes from the matching manifest's
      // pure `labelFor`. Games whose gametype isn't in this FE's
      // registry are silently skipped (the same forward-compat
      // posture used for Start buttons).
      const { data } = await commonDb
        .from('games')
        .select(
          'id, gametype, title, play_state, is_terminal, status, last_active_at, is_current_view',
        )
        .eq('club_handle', clubHandle)
        .order('last_active_at', { ascending: false })
      if (!mounted) return

      const rows = data ?? []
      let currentId: string | null = null
      const listed: ListedGame[] = []
      for (const r of rows) {
        if (r.is_current_view) currentId = r.id
        const manifest = games.find((g) => g.gametype === r.gametype)
        if (!manifest) continue
        const listRow: CommonGameListRow = {
          id: r.id,
          gametype: r.gametype,
          play_state: r.play_state,
          is_terminal: r.is_terminal,
          status: r.status as Record<string, unknown> | null,
        }
        listed.push({
          gameId: r.id,
          gametype: r.gametype,
          title: r.title,
          lastActiveAt: r.last_active_at,
          isTerminal: r.is_terminal,
          statusLabel: manifest.labelFor(listRow),
        })
      }
      setActiveGameId(currentId)
      setAllGames(listed)
    }

    loadGames()

    // Subscribe to common.games changes for this club purely to keep the
    // games list fresh: a new-game start, a set/unset_current_view pointer
    // flip, create_game's auto-vacate of the prior current game, an
    // end_game terminal — all surface here and trigger a list reload.
    //
    // We DON'T auto-navigate anyone into a newly-started game anymore.
    // Being added to a game pops a join invitation *globally* (see
    // `useGameInvitations` mounted in App.tsx), so a player joins on their
    // own terms wherever they are — no more being yanked off the club
    // page (or out of whatever they were doing) the instant a game starts.
    // A member here just sees the new game appear in the Current section
    // and gets the invite popup; the game waits (paused) until they join.
    const channel = supabase
      .channel(`club-games:${clubHandle}:${channelDedupSuffix()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'common',
          table: 'games',
          filter: `club_handle=eq.${clubHandle}`,
        },
        () => loadGames(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadGames()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [club])

  if (loading) return <div className="card">Loading club…</div>
  if (error || !club) {
    return (
      <div className="card">
        <h1>Couldn't load club</h1>
        <p className="error">{error ?? 'Unknown error.'}</p>
        <p>
          <Link to="/" className="link-button">
            ← Back home
          </Link>
        </p>
      </div>
    )
  }

  // Classify games. The current game is the one whose id matches
  // the is_current_view=true row from common.games — that one
  // gets its own prominent section. Everything else collapses
  // into a single "other games" list, with terminal vs non-
  // terminal distinguished by CSS (per docs/states.md → "no
  // special 'suspended' category in the schema or the listing").
  const activeGame = activeGameId
    ? allGames.find((g) => g.gameId === activeGameId) ?? null
    : null
  const otherGames = allGames.filter((g) => g.gameId !== activeGameId)

  // Menu sections for the club logo's dropdown. Mirrors the
  // GamePage menu shape (a single common section, no per-game
  // dynamic section because there's no PlayArea here to push
  // items in). Help opens the club Help modal (parity with the
  // GamePage menu; also what `?` reaches); rename + delete are
  // placeholders today — they fire a "coming soon" toast so a
  // click still has visible feedback. See docs/ui.md → "ClubPage
  // header" for the spec.
  const menuSections: MenuSection[] = [
    {
      items: [
        {
          id: 'help',
          label: 'Help',
          onClick: () => setHelpOpen(true),
        },
        // TEMPORARY (toast demo): pop a placeholder announcement so we can
        // feel the toasts — repeat clicks stack them, and the variants cycle
        // through tones + with/without an action button. Remove once the look
        // is settled.
        {
          id: 'demo-toast',
          label: 'Pop a test toast',
          onClick: () => {
            const n = (toastDemoRef.current += 1)
            const tone = (['info', 'success', 'error'] as const)[n % 3]
            showToast({
              tone,
              message: (
                <>
                  Test announcement <strong>#{n}</strong> — a placeholder toast
                  to feel the {tone} look and how several stack.
                </>
              ),
              // Every other one carries an action button.
              action: n % 2 === 0 ? { label: 'Do the thing', onClick: () => {} } : undefined,
            })
          },
        },
        {
          id: 'home',
          label: 'Back to home',
          onClick: () => navigate('/'),
        },
        {
          id: 'edit',
          label: 'Edit club',
          onClick: () => setEditing(true),
        },
        {
          id: 'rename',
          label: 'Rename club',
          onClick: () => setGlobalFeedback({
            tone: 'info',
            text: 'Rename club: coming soon',
            dismiss: { kind: 'timed' },
          }),
        },
        {
          id: 'delete',
          label: 'Delete club',
          onClick: () => setGlobalFeedback({
            tone: 'info',
            text: 'Delete club: coming soon',
            dismiss: { kind: 'timed' },
          }),
        },
      ],
    },
  ]

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <Menu
          ref={menuRef}
          trigger={<PuzpuzpuzLogo />}
          sections={menuSections}
          triggerLabel="Club menu"
        />
        <ChatBubble />
        {/* StatusSlot's `players` prop is a Member[] under the
            hood; here we feed it the club's member roster (the
            naming.md rule keeps the variable named `members` in
            club context even though the component prop reads
            `players`). PlayersStrip renders the same colored-dot
            + colored-name shape either way. */}
        <StatusSlot
          players={members}
          globalFeedback={globalFeedback}
          onCloseGlobalFeedback={clearGlobalFeedback}
          presentUserIds={presentUserIds}
        />
      </header>

      {/* Two-column body that takes the rest of the viewport height
          (per docs/ui.md → "Page-height fits the viewport"). Left
          column holds the active game card + start-game buttons;
          right column is the "Other games" list as a fixed-size
          frame with internal overflow-y: auto. */}
      <main className={styles.body}>
        <section className={styles.left}>
          <header className={styles.titleBlock}>
            <h1 className={styles.title}>{club.name}</h1>
          </header>

          {activeGame && (
            <div>
              <h3>Join the active game</h3>
              <ClubGameCard
                gameId={activeGame.gameId}
                gametype={activeGame.gametype}
                title={activeGame.title}
                statusLabel={activeGame.statusLabel}
                lastActiveAt={activeGame.lastActiveAt}
                state="active"
                soloClub={soloClub}
                onDelete={() => handleDelete(activeGame.gameId, true)}
              />
            </div>
          )}

          <div>
            <h3>Start a new game</h3>
            {/* Filter the registry by the club's allowed-gametype m2m
                (one button per gametype this club may play) and let
                StartGameButtons handle the rendering, in-flight state,
                and disabled-for-doesn't-fit tooltip. ClubPage stays
                game-agnostic; the RPC call lives inside the manifest.
                Add boggle later and (assuming the m2m is populated for
                this club) a button appears here automatically. */}
            <StartGameButtons
              games={games.filter((g) => allowedGametypes.has(g.gametype))}
              memberCount={members.length}
              onStartSetup={handleStartSetup}
              soloClub={soloClub}
            />
            {activeGame && (
              <p className="muted">
                Starting a new game will suspend the currently active
                one (you can resume it later from this page).
              </p>
            )}
            {startError && <p className="error">{startError}</p>}
          </div>
        </section>

        <section className={styles.right}>
          <h3>Completed/shelved games ({otherGames.length})</h3>
          {/* Fixed-size frame with internal scroll. The frame has
              flex: 1 inside the column, which has its own flex: 1
              inside the body, which is bounded by the .frame's
              calc(100vh - body padding) height. Each step of the
              flex chain needs min-height: 0 so overflow-y: auto
              actually kicks in. */}
          <div className={styles.gamesList}>
            {otherGames.length === 0 ? (
              <p className="muted">No other games yet.</p>
            ) : (
              otherGames.map((g) => (
                <ClubGameCard
                  key={g.gameId}
                  gameId={g.gameId}
                  gametype={g.gametype}
                  title={g.title}
                  statusLabel={g.statusLabel}
                  lastActiveAt={g.lastActiveAt}
                  state={g.isTerminal ? 'completed' : 'suspended'}
                  soloClub={soloClub}
                  onDelete={() => handleDelete(g.gameId, false)}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {/* hideClosedButton: the chat-bubble toggle lives in the
          header (<ChatBubble> above); FloatingChat only renders
          the panel itself, not a duplicate bottom-right button. */}
      <FloatingChat
        clubHandle={club.handle}
        members={members}
        selfId={selfId}
        hideClosedButton
      />

      {/* The "~" word-lookup dialog (owned by useAppShortcuts). Null
          when closed; a FloatingPanel when open. */}
      {lookupDialog}

      {/* The club Help modal — opened from the menu's "Help" item (or `?`,
          which opens the menu). Parity with each game's Help on GamePage. */}
      {helpOpen && <ClubHelp onClose={() => setHelpOpen(false)} />}

      {pendingSetup && (
        <SetupGameDialog
          manifest={pendingSetup}
          members={members}
          selfId={selfId}
          clubHandle={club.handle}
          savedDefault={savedDefaults.get(pendingSetup.gametype)}
          onStarted={(id) => {
            // Capture gametype before clearing pendingSetup —
            // the state setter is asynchronous but our reference
            // to pendingSetup inside this closure is the one
            // from this render, so reading .gametype here is
            // safe regardless of ordering.
            const gametype = pendingSetup.gametype
            setPendingSetup(null)
            navigate(`/g/${gametype}/${id}`)
          }}
          onCancel={() => setPendingSetup(null)}
        />
      )}

      {editing && (
        <EditClubDialog
          clubHandle={club.handle}
          clubName={club.name}
          allowedGametypes={allowedGametypes}
          onSaved={(next) => {
            // Reflect the new enrolled set immediately so the Start
            // buttons update without a refetch. (default_setup for
            // any removed gametype is gone server-side, but those
            // gametypes no longer render a Start button anyway, so
            // the stale savedDefaults entries are harmless.)
            setAllowedGametypes(next)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}
