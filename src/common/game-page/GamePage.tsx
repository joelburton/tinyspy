// cs-unmet

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type { GamePageCtx } from './gamePageCtx'
import type { GenericFeedbackApi, GenericFeedbackMsg } from '../feedback/genericFeedback'
import type { MenuApi, MenuSection } from '../menu/menuModel'
import { END_OR_CONCEDE_IDS, NEW_GAME_ID } from '../menu/gameMenu'
import { getNotOkFeedback } from '../feedback/genericPills'
import { useAppShortcuts } from '../keyboard/useAppShortcuts'
import { useAccountMenuSection } from '../account/useAccountMenuSection'
import { useIsMobile } from '../mobile/useIsMobile'
import { setInfoSheetOpen, useInfoSheetOpen } from '../info-sheet/infoSheetStore'
import { useClubPresence } from '../realtime/useClubPresence'
import { useClubSetupPresence } from '../realtime/useClubSetupPresence'
import { useCommonGame } from './useCommonGame'
import { useConfirmation, END_GAME_CONFIRM, NEW_GAME_CONFIRM } from '../floating-panels/useConfirmation'
import { formatTimerSeconds } from '../timer/useGameTimer'
import { useClubRoster } from '../club/useClubRoster'
import { useChatFeedback } from '../chat/useChatFeedback'
import { navigate } from '../routing/router'
import { clubPath, gamePath } from '../routing/routes'
import { ChatButton } from '../page-header/ChatButton'
import { Chat } from '../chat/Chat'
import { ScratchpadButton } from '../page-header/ScratchpadButton'
import { GameScratchpadCompanion } from '../scratchpad/GameScratchpadCompanion'
import { GameLogo } from '../branding/GameLogo'
import { PauseBoundary } from '../pause-suspend/PauseBoundary'
import { PauseButton } from '../buttons/PauseButton'
import { InfoSwitchButton } from '../info-sheet/InfoSwitchButton'
import { cls } from '../utils/cls'
import { Link } from '../routing/Link'
import { PageHeader } from '../page-header/PageHeader'
import { PageHeaderMenu } from '../page-header/PageHeaderMenu'
import { PageHeaderStatusSlot } from '../page-header/PageHeaderStatusSlot'
import { SuspendConfirmationBlockingModal } from '../pause-suspend/SuspendConfirmationBlockingModal'
import { Loading } from '../loading/Loading'
import { EnvelopeErrorPage } from '../error-page/ErrorPage'
import type { GameManifest } from '../manifest/gameManifest'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import styles from './GamePage.module.css'
import { reportUnhandled } from '../supabase/dbEnvelope'

type Props = {
  /** The game's id. Drives every common-side data read
   *  (common.games, common.game_players) and the channel name. */
  gameId: string
  /** Authenticated session, threaded into useCommonGame for
   *  presence tracking and re-exposed via ctx to PlayArea. */
  session: Session
  /**
   * The game's manifest, resolved by the ROUTER and handed down.
   *
   * Not the gametype string: App already looks the manifest up to decide
   * whether the URL names a real game at all, and a second lookup here could
   * only fail in a way the first one already ruled out (it did have one, and
   * the dead branch rendered "Unknown game type." where nobody could reach it).
   *
   * Used for the submitTimeout dispatcher when the timer expires, the right SVG
   * for `<GameLogo>`, and the per-game `help` component for the menu.
   */
  manifest: GameManifest
  /** Render-prop child. Receives `GamePageCtx` and returns the
   *  per-gametype play surface JSX. Called only when the game is
   *  loaded AND not paused — PauseBoundary conditional-renders
   *  the overlay otherwise (children unmount cleanly). */
  children: (ctx: GamePageCtx) => ReactNode
}

/**
 * The common game shell — owns the cross-cutting render of every
 * game page. Mounted at the route level by `App.tsx` for any
 * `/g/<gametype>/<gameId>` URL; the per-gametype PlayArea sits
 * inside as a render-prop child.
 *
 * Tree shape:
 *
 *     GamePage
 *     ├── Header  (Menu(logo) + chat-bubble + status-slot | pause + timer)
 *     ├── PauseBoundary
 *     │     ├── if !paused → children({players, timer, feedback, menu, ...})
 *     │     └── if  paused → <PauseOverlay/>
 *     ├── Help modal  (when menu's Help item is active)
 *     └── Chat  (z-index 10000, above everything else)
 *
 * Header layout is layout-static per docs/ui.md → Layout
 * stability — the four chrome elements + the timer slot don't
 * reflow as state changes. The middle `<PageHeaderStatusSlot>` swaps
 * between `<PageHeaderPlayersStrip>` (default) and `<GenericFeedbackPill>` (when
 * the per-gametype PlayArea has called `ctx.globalFeedback.show()`)
 * at fixed slot height so neighbors don't move.
 *
 * The logo is a menu trigger (see docs/ui.md → "GamePage menu"):
 * click opens a dropdown. Each game owns its WHOLE menu — the
 * PlayArea pushes every section via `ctx.menu.setGameSections([...])`
 * (usually via the `buildGameMenu` helper, which frames Help +
 * End/Concede + Back-to-club around the game's own items). The whole
 * menu disappears during pause because PlayArea unmounts and its
 * `setGameSections([])` cleanup clears it.
 *
 * Help is a per-game contract on the manifest. Every game declares
 * `help: ComponentType<{ onClose: () => void }>`; the menu's Help
 * item flips local state that mounts the component; `onClose`
 * unmounts it. Lazy-loaded with the game's chunk, wrapped in a
 * Suspense boundary here so a slow chunk fetch doesn't crash.
 *
 * Header stays visible during pause; the overlay only covers
 * the play surface. Feedback that's active when pause fires
 * stays readable in the header — callers who want a specific
 * feedback to drop on pause must `clear()` explicitly. The menu
 * stays openable during pause for the same reason.
 *
 * PlayArea unmounts on pause and remounts on resume — selections,
 * form state, and any per-gametype channels start fresh. State
 * that should *survive* a pause must live above the boundary
 * (useCommonGame, the feedback + menu state here) or in the DB.
 *
 * Chat is rendered OUTSIDE PauseBoundary so it stays
 * available mid-pause ("waiting for Bea, anyone want to chat?").
 *
 * Game-end auto-unpauses: `useCommonGame.paused` short-circuits
 * to false once `common.games.ended_at` is populated, so a game
 * that ends mid-pause (stale-tab edge case) cleanly transitions
 * to "PlayArea mounted, showing its terminal state."
 *
 * Back-to-club asymmetry (per docs/states.md → "Leaving the
 * game page"): the "Back to club" menu item navigates directly
 * for terminal games and opens the suspend-confirm modal for
 * non-terminal games; on confirm, `sendSuspend` broadcasts → every
 * peer navigates back to the club page; last-leaver clears
 * is_current_view.
 */
/** The shared peer-pill lifetime (ms) — see the auto-clear effect below. */
const PEER_PILL_MS = 3000

/** Could this string BE a game id? Not "does the game exist" — that is a
 *  question for the server, and one worth asking only about ids that could
 *  have an answer. Postgres rejects anything else as `22P02`, once per query,
 *  and every one of those becomes its own fault modal. */
const isGameId = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/**
 * **The one "no such game" page**, for both of the ways to have no game: an id
 * that cannot name one, and an id that names one which is not there.
 *
 * One function rather than two call sites writing the same card, because a
 * player cannot tell the two apart and should not be asked to.
 *
 * **Deliberately not an `<ErrorPage>`.** Nothing is broken here — a link points
 * at a game that is not there, which is a 404 — so it wears no red "Error" and
 * shows no `k=v` line. `detail` still says which of the two it was, but to the
 * CONSOLE: it is worth having when someone reports "it says there's no game",
 * and worth nothing to the person reading the page.
 */
function noSuchGamePage(detail: string) {
  console.debug(`[ui] no-such-game | ${detail}`)
  return (
    <div className={cls('card', 'pageMain', styles.notFound)}>
      <p className={styles.notFoundMessage}>
        There's no game here. It may have been deleted, or the link you followed
        might be wrong or out of date.
      </p>
      <Link to="/" className="link-button">
        ← Back home
      </Link>
    </div>
  )
}

/**
 * **Does this game exist? — asked once, before anything else runs.**
 *
 * One cheap `select id` and three answers, and NOTHING below mounts until it
 * says yes. That is the whole job of this component; `GamePageInner` holds the
 * shell as it always has, and `useCommonGame` is untouched.
 *
 * **Why a pre-flight query rather than reading the answer out of
 * `useCommonGame`,** which fetches the same row a moment later: because that
 * hook does far more than fetch. It joins the realtime channel, tracks
 * presence, and asserts `set_current_view` on the subscribe ack — for a game
 * that may not be there. Sequencing those internally means teaching a 600-line
 * hook to half-run, which is worse than one extra PK lookup on a path that is
 * about to make six more.
 *
 * **Why the id test appears twice.** In the effect it prevents the request: an
 * id that cannot be a uuid is a `22P02` per query and a fault modal per
 * `22P02`, and the answer is knowable without asking. In the render it picks
 * the page. Two different jobs — *don't ask*, and *say why*.
 *
 * The `'checking'` state and the `mounted` flag are React's tax and nothing
 * more: a render is synchronous so it cannot await, and a render that gets
 * discarded must not write state.
 */
export function GamePage(props: Props) {
  const { gameId, manifest } = props
  const [exists, setExists] = useState<'checking' | 'yes' | 'no' | NotOkEnvelope>('checking')

  useEffect(() => {
    if (!isGameId(gameId)) return
    let mounted = true
    void (async () => {
      const res = await readRows(commonDb.from('games').select('id').eq('id', gameId))
      if (!mounted) return
      // Three-way on purpose. Collapsing a FAILED read into "no" would tell a
      // player their game is gone because the network blinked — the confident
      // wrong answer this whole area exists to stop.
      setExists(res.type === 'not-ok' ? res : res.data.length > 0 ? 'yes' : 'no')
    })()
    return () => {
      mounted = false
    }
  }, [gameId])

  if (!isGameId(gameId)) return noSuchGamePage(`not a game id: ${gameId}`)
  if (exists === 'checking') return <Loading />
  if (exists === 'no') return noSuchGamePage(`rows=0 gametype=${manifest.gametype} game=${gameId}`)
  if (exists !== 'yes') return <EnvelopeErrorPage envelope={exists} />
  return <GamePageInner {...props} />
}

function GamePageInner({
  gameId,
  session,
  manifest,
  children,
}: Props) {
  const gametype = manifest.gametype
  const {
    commonGame,
    players,
    activePlayers,
    paused,
    presentUserIds,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    sendSuspend,
    timer,
    isMyTurn,
    loading,
    failure,
  } = useCommonGame(gameId, session)

  // Announce on the club's presence channel that this player is
  // viewing THIS game, so the club page's member dots +
  // abandoned-game heal can see them. We don't read the roster here —
  // GamePage only announces.
  useClubPresence(commonGame?.club_handle ?? null, gameId, session.user.id)

  // Receive-only: while you're IN a game of this club (active OR paused), still
  // surface a peer's "setting up a new game" toast — e.g. someone abandons a
  // stuck paused game to start the next one. `announce: null` because you can't
  // open a setup dialog from a game page (ClubPage owns the announcing side).
  useClubSetupPresence({
    clubHandle: commonGame?.club_handle ?? null,
    selfId: session.user.id,
    announce: null,
  })

  // The shared confirm modal (the pause overlay's End game asks through it;
  // per-game PlayAreas own their own instances for their End buttons).
  const { confirm: confirmAction, confirmationModal } = useConfirmation()

  // Open/closed state for the suspend-confirm modal (fired from
  // the menu's "Back to club" item for non-terminal games).
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  // Whether the per-game Help modal is mounted. Toggled by the
  // menu's "Help" item.
  const [helpOpen, setHelpOpen] = useState(false)
  // The currently-active feedback message, or null when the
  // PageHeaderStatusSlot should show its default (`<PageHeaderPlayersStrip>`).
  const [globalFeedback, setGlobalFeedback] = useState<GenericFeedbackMsg | null>(null)
  // The current PlayArea's ENTIRE header menu, pushed via
  // `ctx.menu.setGameSections`. Each game owns its whole menu (Help +
  // its own items + End/Concede + Back-to-club — usually assembled with
  // `buildGameMenu`); the shell no longer injects a common section. Reset
  // to [] on PlayArea unmount so a pause empties the menu.
  const [gameSections, setGameSections] = useState<MenuSection[]>([])
  // A ref mirror so the global ⌥⌫ shortcut listener (registered once) can
  // read the latest sections to find the end/concede item.
  const gameSectionsRef = useRef<MenuSection[]>([])
  useEffect(() => {
    gameSectionsRef.current = gameSections
  }, [gameSections])

  // Fire the timeout-loss when the countdown hits 0 — on the expired
  // TRANSITION (false → true), not the level. A true EDGE (prevExpiredRef)
  // rather than the old one-way "already submitted" latch, because
  // replay-board un-terminals a timed-out game while `expired` is still
  // momentarily true (the tick-merge rewinds a beat later): a level trigger
  // would instantly re-end the fresh game from any tab that hadn't fired
  // yet, and the old latch would ALSO have blocked a genuine second timeout
  // after the replay. Edge-triggering handles both: the stale-true carries
  // no edge, and once the clock rewinds the trigger is re-armed. The RPC is
  // server-side idempotent for the multi-peer race case.
  const prevExpiredRef = useRef(false)
  useEffect(function fireTimeoutOnExpiry() {
    // No moves while paused — including this one. Returning BEFORE the edge
    // is recorded keeps the defer contract: a timeout that comes due exactly
    // as a pause engages resolves on resume (the edge is still unconsumed).
    if (paused) return
    // Not loaded yet — don't consume an edge we can't act on.
    if (!commonGame) return
    const wasExpired = prevExpiredRef.current
    prevExpiredRef.current = timer.expired
    if (!timer.expired || wasExpired) return
    if (commonGame.ended_at !== null) return // a peer already ended it
    void manifest.submitTimeout(gameId).then((res) => {
      // THE RACE IS THE NORMAL CASE and it is not shown to anyone. Every
      // connected client fires this on the same countdown edge, so in a
      // four-player game three arrive to find the work done. Logged at info,
      // because "someone else ended it" is exactly what should have happened.
      if (res.type === 'not-ok' && res.severity === 'race') {
        console.log(`[db] submitTimeout: ${res.message} (${res.dbcode})`)
      } else if (res.type === 'not-ok') {
        // Everything else is real — a deleted game, an expired session. `[db]`
        // so it sits in the same filter as every other failed call; this one
        // reaches no player, which is exactly why it must be findable in a log.
        console.error(`[db] submitTimeout failed: ${res.message} (${res.dbcode})`)
      } else if (res.type === 'ok' && res.data?.result === 'ended') {
        // The terminal arrives at every client by subscription, this one
        // included — winning the race buys no extra work.
      } else {
        reportUnhandled('submit_timeout', res)
      }
    })
  }, [timer.expired, paused, commonGame, gameId, manifest])

  // App-chrome keyboard shortcuts: "/" opens chat, "?" opens this menu,
  // "~" opens the word-lookup dialog (the hook owns + returns that
  // dialog; we render it below).
  const lookupDialog = useAppShortcuts()
  const accountSection = useAccountMenuSection(session)

  // Which mobile page is showing (see infoSheetStore for why it's a store and
  // not state). Both are false-y on desktop, where the info column is inline.
  const isMobile = useIsMobile()
  const infoOpen = useInfoSheetOpen()

  // The store outlives any one game (module-level), so a game→game navigation
  // would otherwise land you on the info page because that's where you left the
  // last one. GamePage is keyed by gameId, so this mount-effect runs per game.
  useEffect(function startOnTheBoard() {
    setInfoSheetOpen(false)
  }, [gameId])

  // Auto-clear `timed`-dismiss feedback after the configured duration. The
  // default is the ONE peer-pill lifetime for the whole app (ClubPage matches):
  // five games used to pass `ms: 3000` explicitly and five took a 2200 default,
  // so the same class of message — a peer did something — read for different
  // lengths depending on which game you were in. The other modes are
  // explicit no-ops at this layer.
  useEffect(function autoClearTimedFeedback() {
    if (!globalFeedback) return
    if (globalFeedback.mode.kind !== 'timed') return
    const ms = globalFeedback.mode.ms ?? PEER_PILL_MS
    const t = setTimeout(() => setGlobalFeedback(null), ms)
    return () => clearTimeout(t)
  }, [globalFeedback])

  // Stable identities for the feedback API exposed to PlayArea. A fault never
  // reaches here to be sorted out — it raises its modal in `runRpc`, before any
  // call site has an answer to show (docs/ui.md → Faults).
  const globalFeedbackShow = useCallback((msg: GenericFeedbackMsg) => {
    setGlobalFeedback(msg)
  }, [])
  const globalFeedbackClear = useCallback(() => {
    setGlobalFeedback(null)
  }, [])
  const globalFeedbackApi = useMemo<GenericFeedbackApi>(
    () => ({ show: globalFeedbackShow, clear: globalFeedbackClear }),
    [globalFeedbackShow, globalFeedbackClear],
  )

  // Stable identity for the menu API exposed to PlayArea. The PlayArea
  // calls setGameSections in an effect; its cleanup return calls
  // setGameSections([]) so unmount empties the menu.
  const setGameSectionsApi = useCallback((sections: MenuSection[]) => {
    setGameSections(sections)
  }, [])
  const openHelp = useCallback(() => setHelpOpen(true), [])
  // Club handle + terminal flag drive both "Back to club" affordances. Derived
  // from `commonGame` here so the menu API can be assembled; the primitives
  // (not the `commonGame` object) are the callback deps, so identities only
  // change on the rare club-load / terminal flip — not on every realtime
  // `commonGame` update.
  const clubHandle = commonGame?.club_handle ?? ''
  const isGameOver = commonGame?.ended_at != null
  // Direct-nav to the club page — the terminal branch. Exposed via ctx so each
  // PlayArea's terminal action row can call it without re-deriving the URL.
  const goToClub = useCallback(() => {
    if (clubHandle) navigate(clubPath(clubHandle))
  }, [clubHandle])
  // Jump to another game's page — for a PlayArea that just started a
  // follow-up game (waffle's "New game"). Kept here beside goToClub so
  // per-game code never touches the router.
  const goToGame = useCallback((gametype: string, gameId: string) => {
    navigate(gamePath(gametype, gameId))
  }, [])
  // "Back to club" for the menu + ⇧< shortcut. Three shapes:
  //   - TERMINAL: direct navigation, no dialog, no broadcast — the game is
  //     over, leaving affects nobody else.
  //   - SOLO mid-game: suspend immediately, no dialog — the confirm exists
  //     to warn that peers get dragged back to the club, and a solo game
  //     has no peers to surprise. (sendSuspend's broadcast lands on nobody;
  //     it shelves the game + navigates self.)
  //   - MULTIPLAYER mid-game: the suspend-confirm modal.
  const requestBackToClub = useCallback(() => {
    if (!clubHandle) return
    if (isGameOver) navigate(clubPath(clubHandle))
    else if (players.length <= 1) sendSuspend()
    else setConfirmingSuspend(true)
  }, [clubHandle, isGameOver, players.length, sendSuspend])
  const menuApi = useMemo<MenuApi>(
    () => ({ setGameSections: setGameSectionsApi, openHelp, requestBackToClub }),
    [setGameSectionsApi, openHelp, requestBackToClub],
  )

  // Global game-menu shortcuts (work on any game, dispatching to the game's
  // own menu items): ⇧< → Back to club; + → New game; ⌥+ → New game FROM SETUP;
  // ⌥⌫ → End / Concede game. All bail inside any editable field (so ⌥Backspace
  // stays "delete word" while typing a clue). The menu itself stopPropagations
  // its keys, so an open menu won't reach here. See docs/ui.md → GamePage menu.
  useEffect(function globalMenuShortcuts() {
    function onKeyDown(e: KeyboardEvent) {
      // Auto-repeat is never wanted here. Every shortcut below is a discrete,
      // one-shot command — leave, start a game, end a game — and none is
      // meaningfully repeatable. Without this, HOLDING a key fires at the OS
      // repeat rate (~30/s): `+` at terminal has no confirm to slow it down, so
      // a leaning finger would start dozens of games, each one orphaning the
      // last in the club list and toasting every peer. One line, all four
      // shortcuts.
      if (e.repeat) return
      const t = e.target
      const editable =
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (editable) return
      if (e.metaKey || e.ctrlKey) return
      if (e.key === '<' && !e.altKey) {
        e.preventDefault()
        requestBackToClub()
      } else if (e.key === '+' && !e.altKey) {
        // New game. Dispatched through the MENU ITEM, like ⌥⌫ below, so it
        // works on every game that offers New game — including the ones whose
        // only affordance is the menu (no terminal button on screen) — with no
        // per-game wiring, and it inherits the item's disabled state.
        // Mid-game the game's own handler asks NEW_GAME_CONFIRM first, so a
        // stray `+` can't silently shelve a game in progress.
        e.preventDefault()
        // `onClick` is optional on the MenuItem union — a submenu parent has
        // none, because opening a submenu isn't a command a shortcut can fire.
        // So the guard is a real check, not appeasement: it's what makes a
        // shortcut silently no-op rather than crash if an id ever names one.
        const item = gameSectionsRef.current
          .flatMap((s) => s.items)
          .find((i) => i.id === NEW_GAME_ID)
        if (item && !item.disabled) item.onClick?.()
      } else if (e.altKey && e.code === 'Equal') {
        // ⌥+ → New game FROM SETUP: the same fresh game, but stopping at the
        // setup dialog so you can change the options first (the plain `+` reuses
        // this game's setup verbatim). Deliberately NOT a menu item — it's the
        // power-user variant of one that is.
        //
        // Matched on `code`, not `key`: Option changes the character a key
        // produces (⌥= is "≠" on a Mac), which is exactly why ⌥⌫ below matches
        // `code` too. Matching the physical key also accepts ⌥= and ⌥⇧= alike,
        // so it doesn't matter whether you reach for the shift.
        //
        // The dialog lives on ClubPage, so this hands off with `?new=<gametype>`
        // — the same route crosswords' own New game uses. Canceling it just
        // leaves you on the club page, which is a fine place to be.
        e.preventDefault()
        void (async () => {
          if (!isGameOver && !(await confirmAction(NEW_GAME_CONFIRM))) return
          if (clubHandle) navigate(`${clubPath(clubHandle)}?new=${gametype}`)
        })()
      } else if (e.altKey && e.code === 'Backspace') {
        e.preventDefault()
        const item = gameSectionsRef.current
          .flatMap((s) => s.items)
          .find((i) => END_OR_CONCEDE_IDS.includes(i.id as (typeof END_OR_CONCEDE_IDS)[number]))
        if (item && !item.disabled) item.onClick?.() // optional — see the `+` case above
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestBackToClub, confirmAction, isGameOver, clubHandle, gametype])

  // The FULL club roster (not just this game's players) — chat is club-wide, so
  // naming a sender (chat window + the feedback pill) needs every member. Empty
  // until the game row (and its club_handle) loads; `useClubRoster` no-ops on ''.
  const { members: clubMembers } = useClubRoster(clubHandle)

  // Club chat → the global feedback pill, same as ClubPage: a NEW message from
  // any OTHER member pops "● HANDLE: text" (sticky) in the header. Runs even
  // during the pre-load '' phase (useClubChat no-ops, so no historic replay).
  useChatFeedback({
    clubHandle,
    members: clubMembers,
    selfId: session.user.id,
    globalFeedback: globalFeedbackApi,
  })

  // `GamePage` proved the row existed before mounting this, so these are about
  // what happens AFTER: `useCommonGame` refetches on every realtime event, so a
  // game someone deletes mid-session arrives here as zero rows, and an outage
  // arrives as a failed read. The pre-flight answers the question once; this
  // keeps answering it.
  if (loading) return <Loading />
  // A failed read is NOT a missing game — both leave `commonGame` null, and
  // only one of them means the game is gone.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!commonGame) return noSuchGamePage(`rows=0 gametype=${gametype} game=${gameId}`)

  // The gametype's manual end-game dispatcher, if it has one (bananagrams has no
  // whole-table end — see the manifest). Used by the pause overlay's End-game
  // escape; undefined hides that button.
  const endGameFn = manifest.endGame

  const gameOver = commonGame.ended_at !== null
  // A COUNT-UP clock survives the end of the game and a COUNTDOWN does not, and
  // the difference is what each one is for. A countdown is a budget: once the
  // game is over it can only read 0:00, which says nothing anyone needs. A
  // count-up is the answer to "how long did that take?", which is exactly the
  // sort of thing you want to see once you are done — `useGameTimer` stops
  // ticking at `is_terminal`, so it freezes on the final figure.
  const timerKind = commonGame.setup.timer?.kind
  const showTimer =
    timerKind === 'countup' || (timerKind === 'countdown' && !gameOver)
  // The clock is STOPPED whenever it is not counting — paused, or the game is
  // over (`useGameTimer` keys `running` off `is_terminal`). Both go red: red
  // says "these digits are not moving", which is a fact about the clock rather
  // than a judgment about why.
  const timerStopped = paused || gameOver
  const HelpComponent = manifest.help

  // The whole menu is owned by the current PlayArea (via setGameSections /
  // buildGameMenu). Help + Back-to-club are wired through the menuApi actions
  // above; the shell no longer prepends a common section.
  // The account submenu is appended by the SHELL, not by `buildGameMenu` — so
  // all fourteen games get it without fourteen edits, and a game can't forget
  // it. It goes last: it's the least game-y thing in the menu.
  const sections: MenuSection[] = [...gameSections, accountSection]

  return (
    <div className={styles.frame}>
      {/* ── The header, which on MOBILE is split across the two pages ──
          One `<header>` whose contents swap, not two headers: the switch button
          then can't move between pages (it's pinned to the right edge in both),
          which is the muscle-memory win that motivated consolidating the old
          "Game info" menu item and the sheet's ✕ into one control.

          The split exists because a phone header can't hold everything at once.
          What each page keeps is chosen by what you need WHILE looking at it:

            board page — chat + feedback (a peer's move is news you need mid-play),
                         and no timer/pause;
            info page  — the timer + pause (readouts belong with readouts), and no
                         chat/feedback.

          Joel's call, against my argument for keeping a countdown visible while
          playing: this roster isn't race-style, and seeing chat matters more.

          Desktop is UNCHANGED — `infoOpen` is always false there (useInfoSheet
          resets it above the breakpoint) so this renders exactly the old header,
          and the switch button is `display: none`. */}
      <PageHeader
        right={
          <>
            {/* Pause + timer ride the INFO page on mobile (hence `infoOpen ||
                !isMobile`), and stay in place on desktop where there's room. */}
            {(!isMobile || infoOpen) && (
              <>
                {/* Gone once the game is over: `paused` is forced false at
                    `ended_at`, so a pause button there could only look live and
                    do nothing. */}
                {!gameOver && (
                  <PauseButton
                    paused={paused}
                    manual={manuallyPausedBy !== null}
                    onPause={sendManualPause}
                    onUnpause={sendManualUnpause}
                  />
                )}
                {showTimer && (
                  <span className={cls(styles.timer, timerStopped && styles.timerStopped)}>
                    {formatTimerSeconds(timer.displaySeconds)}
                  </span>
                )}
              </>
            )}
            {/* Mobile only: on desktop the info column is always on screen, so
                the switch would be a control with no destination. This used to
                be a `display: none` in the button's own stylesheet; it is a
                render decision, and `isMobile` is already in hand here. */}
            {isMobile && <InfoSwitchButton open={infoOpen} />}
          </>
        }
      >
        <PageHeaderMenu
          logo={<GameLogo gametype={gametype} />}
          sections={sections}
          label="Game menu"
          // The game menu sits over boards that read window keydowns for play
          // (crosswords' cursor). A focused trigger would swallow those keys /
          // reopen the menu, so let focus fall back to the board on close.
          returnFocusOnClose={false}
        />
        {/* The menu is the one thing on BOTH pages — it's how you leave the
            game, and stranding it on one page is what the old full-height
            sheet did (it covered the header outright). */}
        {!infoOpen && (
          <>
            <div className={styles.panelToggles}>
              <ChatButton />
              {manifest.scratchpad?.enabled && <ScratchpadButton />}
            </div>
            <PageHeaderStatusSlot
              players={players}
              globalFeedback={globalFeedback}
              onCloseGlobalFeedback={globalFeedbackClear}
            />
          </>
        )}
      </PageHeader>

      <PauseBoundary
        paused={paused}
        expected={activePlayers}
        presentUserIds={presentUserIds}
        manuallyPausedBy={manuallyPausedBy}
        onResume={sendManualUnpause}
        // Escape hatches for a wedged presence-pause (both players walked away,
        // presence timed out). Return-to-club shelves the game (sendSuspend,
        // which broadcasts + navigates); End game dispatches to the gametype's
        // own end_game via the manifest (the same RPC the in-game End button
        // uses). Both go through PostgREST, so they work even when Realtime is
        // stuck — see docs + the reconnect nudge in App.
        onReturnToClub={sendSuspend}
        // Optional on the manifest → the overlay hides its End-game button for
        // a game that omits it. Every gametype supplies it today, bananagrams
        // included: it needs End *and* per-player Concede, which are different
        // acts. Captured as a local so the guard narrows in the async closure.
        onEndGame={
          endGameFn
            ? async () => {
                // The shared end-game confirm modal (never window.confirm —
                // docs/ui.md → Modals). Same copy every game's own End uses.
                if (!(await confirmAction(END_GAME_CONFIRM))) return
                const res = await endGameFn(gameId)
                if (res.type === 'not-ok') {
                  // A lost End race shows PN486's "Game over" in its own words
                  // and its own tone — the same sentence the in-game End action
                  // shows, because it is the same raise.
                  globalFeedbackShow({ ...getNotOkFeedback(res), mode: { kind: 'sticky' } })
                } else if (res.type === 'ok' && res.data?.result === 'ended') {
                  // Nothing here: the terminal arrives by subscription and the
                  // overlay unmounts with the pause.
                } else {
                  reportUnhandled('end_game', res)
                }
              }
            : undefined
        }
      >
        {children({
          session,
          gameId,
          brand: manifest.name,
          title: commonGame.title,
          players,
          playState: commonGame.play_state,
          isTerminal: commonGame.is_terminal,
          timer,
          isMyTurn,
          currentTurnUserId: commonGame.current_turn_user_id,
          setup: commonGame.setup,
          status: commonGame.status,
          goToClub,
          clubHandle: commonGame.club_handle,
          goToGame,
          globalFeedback: globalFeedbackApi,
          menu: menuApi,
        })}
      </PauseBoundary>

      {/* Chat is club-context vocabulary ("anyone in the club may send a
          message"), so it gets the FULL club roster (`clubMembers` via
          useClubRoster), not just this game's `players` — so a message from a
          club member who ISN'T in this game still resolves to their handle +
          color instead of a '?'. (`players` remains the right data for the
          PageHeaderPlayersStrip / peer-game feedback, which are about THIS game.)

          The closed-state toggle is the header's <ChatButton> (above);
          Chat renders the panel itself, and nothing at all while
          closed. */}
      <Chat
        clubHandle={commonGame.club_handle}
        members={clubMembers}
        selfId={session.user.id}
      />

      {/* Per-game scratchpad — opt-in via the manifest. Outside PauseBoundary
          (survives pause + shows at terminal). Compete gets a private pad per
          player when perPlayerInCompete; coop shares one. */}
      {manifest.scratchpad?.enabled && (
        <GameScratchpadCompanion
          gameId={gameId}
          ownerId={
            manifest.scratchpad.perPlayerInCompete && manifest.mode === 'compete'
              ? session.user.id
              : null
          }
          myId={session.user.id}
          username={players.find((p) => p.user_id === session.user.id)?.username ?? 'You'}
          isTerminal={commonGame.is_terminal}
        />
      )}

      {/* Help modal — lazy-loaded from the manifest. Suspense
          fallback is null because a brief blank moment during chunk
          fetch is acceptable for a help modal (the user just
          clicked Help; they expect it to appear within a beat). */}
      {helpOpen && (
        <Suspense fallback={null}>
          <HelpComponent onClose={() => setHelpOpen(false)} brand={manifest.name} />
        </Suspense>
      )}

      {/* The "~" word-lookup dialog (owned by useAppShortcuts). Null
          when closed; a FloatingPanel when open. Sits at the page level
          so it stays available in any state, including the post-game
          reveal where chasing a "see X" definition is a prime use. */}
      {lookupDialog}

      {confirmingSuspend && (
        <SuspendConfirmationBlockingModal
          title={commonGame.title}
          onCancel={() => setConfirmingSuspend(false)}
          onSuspend={() => {
            // sendSuspend broadcasts + navigates self. Peers
            // navigate themselves on receipt; the last leaver
            // clears is_current_view via cleanup.
            sendSuspend()
          }}
        />
      )}

      {/* The pause overlay's End-game confirm (see onEndGame above). */}
      {confirmationModal}
    </div>
  )
}
