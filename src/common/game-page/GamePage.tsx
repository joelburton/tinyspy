// cs-audited-game-page

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFeedbackSlot } from '../feedback/useFeedbackSlot'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { MenuApi } from '../menu/menuModel'
import { useAccountMenuSection } from '../account/useAccountMenuSection'
import { useAppAction, useBoundAction } from '../actions/useBoundAction'
import { useIsMobile } from '../mobile/useIsMobile'
import { setInfoSheetOpen, useInfoSheetOpen } from '../info-sheet/infoSheetStore'
import { useClubPresence } from '../realtime/useClubPresence'
import { useClubSetupPresence } from '../realtime/useClubSetupPresence'
import type { CommonGame } from './useCommonGame'
import type { GameShellProps } from './GamePageGate'
import type { GamePlayer, Member } from '../members/member'
import { formatTimerSeconds } from '../timer/useGameTimer'
import { useClubRoster } from '../club/useClubRoster'
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
import { PageHeader } from '../page-header/PageHeader'
import { GameHeaderMenu } from './GameHeaderMenu'
import { setGameMenuSections } from '../menu/gameMenuStore'
import { PageHeaderStatusSlot } from '../page-header/PageHeaderStatusSlot'
import { SuspendConfirmationBlockingModal } from '../pause-suspend/SuspendConfirmationBlockingModal'
import { PlayAreaSlotLog } from './PlayAreaSlotLog'
import { PlayAreaErrorBoundary } from './PlayAreaErrorBoundary'
import { Loading } from '../loading/Loading'
import styles from './GamePage.module.css'
import { reportUnhandled } from '../supabase/dbEnvelope'

/**
 * What the gate resolved (`GameShellProps`) plus the state the loader waited for.
 *
 * Every member of the second half comes from one `useCommonGame` call in the
 * loader. They are listed one by one rather than passed as a single `game`
 * object so this block IS the page's contract: what it draws from, in the open.
 */
type Props = GameShellProps & {
  // The game's row. A row, not a maybe-row — the loader does not render this
  // page until it has one, which is most of why the loader exists.
  commonGame: CommonGame
  // Everyone in the game.
  players: GamePlayer[]
  // The presence-pause roster: `players` minus anyone who conceded. What
  // PauseBoundary watches and the overlay lists.
  activePlayers: GamePlayer[]
  // Somebody in `activePlayers` is off the channel, or somebody clicked Pause.
  // Forced false once the game has ended.
  paused: boolean
  // User ids currently on the game's realtime channel — paired with
  // `activePlayers` to tell present from absent in the pause overlay.
  presentUserIds: Set<string>
  // Who clicked Pause, null when the pause is presence-only.
  manuallyPausedBy: Member | null
  // Broadcast the manual pause / its release to every peer, this tab included.
  sendManualPause: () => void
  sendManualUnpause: () => void
  // Shelve the game and leave: broadcasts to every peer, then navigates self.
  sendSuspend: () => void
  // The game clock — seconds to show, and whether a countdown has run out.
  timer: { displaySeconds: number; expired: boolean }
  // True when the local player may act right now under turn-order; always true
  // for free-for-all and solo games.
  isMyTurn: boolean
}

/**
 * The shell every game page wears: the header, the pause boundary with the play
 * surface inside it, and the panels that outlive a pause — chat, the scratchpad,
 * help, the suspend confirm.
 *
 * The last of the game route's three components — `GamePageGate` asked whether
 * the game exists, `GamePageLoader` joined its room and waited for its state,
 * and this draws it. So every prop is a value, never a maybe-value, and this
 * file never waits for anything.
 *
 * The hole in the middle is the manifest's `PlayArea`, rendered with a
 * `GamePageCtx` while the game is unpaused; `PauseBoundary` unmounts it to show
 * the overlay, which is why anything that must survive a pause lives out here
 * or in the DB.
 *
 * doc.md holds the rest: the tree, what the shell owns, the three ways out, and
 * why the menu's sections live in a store.
 */
export function GamePage({
  gameId,
  session,
  manifest,
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
}: Props) {
  // ─── What this page is about ────────────────────────────────────────────
  const gametype = manifest.gametype
  // The club this game belongs to. Every club-shaped URL and both presence
  // announcements come off it, and it is always a real handle — the loader
  // waited for the row.
  const clubHandle = commonGame.club_handle
  const gameOver = commonGame.ended_at !== null
  const HelpComponent = manifest.help
  const PlayArea = manifest.PlayArea

  // ─── The club, and being seen in it ─────────────────────────────────────
  // Announce on the club's presence channel that this player is
  // viewing THIS game, so the club page's member dots +
  // abandoned-game heal can see them. We don't read the roster here —
  // GamePage only announces.
  useClubPresence(clubHandle, gameId, session.user.id)

  // Receive-only: while you're IN a game of this club (active OR paused), still
  // surface a peer's "setting up a new game" toast — e.g. someone abandons a
  // stuck paused game to start the next one. `announce: null` because you can't
  // open a setup dialog from a game page (ClubPage owns the announcing side).
  useClubSetupPresence({
    clubHandle,
    selfId: session.user.id,
    announce: null,
  })

  // The FULL club roster (not just this game's players) — chat is club-wide, so
  // naming a sender (chat window + the feedback pill) needs every member.
  const { members: clubMembers } = useClubRoster(clubHandle)

  // ─── The shell's own state ──────────────────────────────────────────────
  // Whether the per-game Help companion is mounted. Opened by `act-help`,
  // closed by its own ✕.
  const [helpOpen, setHelpOpen] = useState(false)
  // Open/closed state for the suspend-confirm modal — `act-back-to-club`'s
  // third shape (below): mid-game, with peers to warn.
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  // The GLOBAL feedback slot — the header's status slot draws its top
  // message in place of the players strip. One instance for the life of the
  // page; a PlayArea reaches it as `ctx.globalFeedbackSlot`.
  const globalFeedbackSlot = useFeedbackSlot('global')
  // A game's menu sections (pushed via `ctx.menu.setGameSections`) live in
  // `gameMenuStore`, not here: only the menu reads them, so a push must not
  // re-render the page and the board with it. Cleared on unmount, so a menu
  // cannot outlive the game that pushed it.
  useEffect(() => () => setGameMenuSections([]), [])
  const accountSection = useAccountMenuSection()

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

  // ─── The actions the page binds ─────────────────────────────────────────
  // Help for THIS game — the manifest's rules component. Bound here rather than
  // in each PlayArea because the page is what mounts it, and handed down on the
  // menu API for the game to place.
  const actHelp = useBoundAction('act-help', {
    describe: () => 'active',
    run: () => setHelpOpen(true),
  })
  // Open chat, bound at the app root; the page passes it along so a game's menu
  // can show the row. Null on a page with no chat panel — never here in
  // practice, since GamePage mounts one, but the type says what it is.
  const actChat = useAppAction('act-open-chat')
  // Jump to another game's page — for a PlayArea that just started a
  // follow-up game (waffle's "New game"). On ctx so per-game code never
  // touches the router; going back to the CLUB is `actBackToClub` below,
  // which is the same act from every surface.
  const goToGame = useCallback((gametype: string, gameId: string) => {
    navigate(gamePath(gametype, gameId))
  }, [])
  // "Back to club", from every surface that places it — the menu row and its
  // `<` key, the info column's action row, the pause overlay, the device-block
  // card. Three shapes:
  //   - TERMINAL: direct navigation, no dialog, no broadcast — the game is
  //     over, leaving affects nobody else.
  //   - SOLO mid-game: suspend immediately, no dialog — the confirm exists
  //     to warn that peers get dragged back to the club, and a solo game
  //     has no peers to surprise. (sendSuspend's broadcast lands on nobody;
  //     it shelves the game + navigates self.)
  //   - MULTIPLAYER mid-game: the suspend-confirm modal.
  const requestBackToClub = useCallback(() => {
    if (gameOver) navigate(clubPath(clubHandle))
    else if (players.length <= 1) sendSuspend()
    else setConfirmingSuspend(true)
  }, [clubHandle, gameOver, players.length, sendSuspend])
  // `<` → Back to club. The menu's row is this same binding, which is what makes
  // the key discoverable: the row shows it.
  const actBackToClub = useBoundAction('act-back-to-club', {
    describe: () => 'active',
    run: requestBackToClub,
  })

  const menuApi = useMemo<MenuApi>(
    () => ({ setGameSections: setGameMenuSections, actHelp, actChat, actBackToClub }),
    [actHelp, actChat, actBackToClub],
  )

  // ⌥+ → New game FROM SETUP: the same fresh game, but stopping at the setup
  // dialog so you can change the options first (the plain `+`, which each game
  // binds, reuses this game's setup verbatim). Deliberately not a menu row —
  // it is the power-user variant of one that is, which is why it is bound here
  // and placed nowhere. The dialog lives on ClubPage, so this hands off with
  // `?new=<gametype>`; canceling it just leaves you on the club page, which is
  // a fine place to be. The registry asks NEW_GAME_CONFIRM first, mid-game.
  useBoundAction('act-new-game-from-setup', {
    terminal: gameOver,
    describe: () => 'active',
    run: () => {
      navigate(`${clubPath(clubHandle)}?new=${gametype}`)
    },
  })

  // End game, FOR THE PAUSE OVERLAY — the reliable way out of a wedged
  // presence-pause (both players walked away and presence timed out). It goes
  // through PostgREST, so it works when Realtime is stuck.
  //
  // Bound HERE rather than in the overlay, because the overlay is not a place a
  // binding can live: it exists only while paused, and `<PauseBoundary>` — which
  // this page renders — unmounts the PlayArea to show it, taking the game's own
  // `act-end-game` off the stack with it. GamePage is above the boundary and
  // stays mounted either way.
  //
  // **Hidden unless paused**, which is what keeps the two bindings from ever
  // being live together: while a game is playing its PlayArea owns `⌥⌫`, and
  // this one is not there at all. Paused is the whole of the condition —
  // `manifest.endGame` is required, so there is no game this hatch is missing
  // from.
  const endTheGameFromTheOverlay = async () => {
    const res = await manifest.endGame(gameId)
    if (res.type === 'not-ok') {
      // A lost End race shows PN486's "Game over" in its own words and its
      // own tone — the same sentence the in-game End action shows, because it
      // is the same raise.
      globalFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data?.result === 'ended') {
      // Nothing here: the terminal arrives by subscription and the overlay
      // unmounts with the pause.
    } else {
      reportUnhandled('end_game', res)
    }
  }
  const actEndGame = useBoundAction('act-end-game', {
    terminal: gameOver,
    describe: () => (paused ? 'active' : 'hidden'),
    run: endTheGameFromTheOverlay,
  })

  // ─── The clock ──────────────────────────────────────────────────────────
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

  // Fire the timeout-loss when the countdown hits 0 — on the expired
  // TRANSITION (false → true), not the level. Replay-board un-terminals a
  // timed-out game while `expired` is still momentarily true (the tick-merge
  // rewinds a beat later), and neither simpler trigger survives that: a level
  // one re-ends the fresh game from any tab that hasn't fired yet, and a
  // one-way "already submitted" latch blocks the replayed game's own genuine
  // timeout. An edge (prevExpiredRef) handles both — the stale-true carries no
  // edge, and once the clock rewinds the trigger is re-armed. The RPC is
  // server-side idempotent for the multi-peer race case.
  const prevExpiredRef = useRef(false)
  useEffect(function fireTimeoutOnExpiry() {
    // No moves while paused — including this one. Returning BEFORE the edge
    // is recorded keeps the defer contract: a timeout that comes due exactly
    // as a pause engages resolves on resume (the edge is still unconsumed).
    if (paused) return
    const wasExpired = prevExpiredRef.current
    prevExpiredRef.current = timer.expired
    if (!timer.expired || wasExpired) return
    if (commonGame.ended_at !== null) return // a peer already ended it
    void manifest.submitTimeout(gameId).then(function logHowTheTimeoutLanded(res) {
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

  return (
    <div className={styles.pageHeaderAndPlaySurface}>
      {/* ── The header, which on MOBILE is split across the two pages ──
          One `<header>` whose contents swap, not two headers: the switch button
          then can't move between pages (it's pinned to the right edge in both),
          so one control both opens and closes the info page from one spot.

          The split exists because a phone header can't hold everything at once.
          What each page keeps is chosen by what you need WHILE looking at it:

            board page — chat + feedback (a peer's move is news you need mid-play),
                         and no timer/pause;
            info page  — the timer + pause (readouts belong with readouts), and no
                         chat/feedback.

          Joel's call, against my argument for keeping a countdown visible while
          playing: this roster isn't race-style, and seeing chat matters more.

          Desktop never splits — `infoOpen` is always false there (useInfoSheet
          resets it above the breakpoint), so every branch below falls the same
          way and the whole header renders at once. */}
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
                the switch would be a control with no destination. A render
                decision rather than a `display: none` in the button's own
                stylesheet, since `isMobile` is already in hand here. */}
            {isMobile && <InfoSwitchButton open={infoOpen} />}
          </>
        }
      >
        {/* The sections are the current PlayArea's, out of `gameMenuStore`. The
            account submenu is the shell's and is passed in here, so every game
            gets it and no game can forget it. */}
        <GameHeaderMenu logo={<GameLogo manifest={manifest} />} accountSection={accountSection} />
        {/* The menu rides BOTH pages — it's how you leave the game, so
            stranding it on one of them would strand the way out. */}
        {!infoOpen && (
          <>
            <div className={styles.panelToggles}>
              <ChatButton />
              {manifest.scratchpad?.enabled && <ScratchpadButton />}
            </div>
            <PageHeaderStatusSlot players={players} globalFeedbackSlot={globalFeedbackSlot} />
          </>
        )}
      </PageHeader>

      <PauseBoundary
        paused={paused}
        expected={activePlayers}
        presentUserIds={presentUserIds}
        manuallyPausedBy={manuallyPausedBy}
        onResume={sendManualUnpause}
        // One escape hatch from a wedged presence-pause: shelve the game and
        // go. The SAME action every other surface places, so leaving from the
        // overlay is the same act it is anywhere else — a game with peers asks
        // first, and the question is what explains that everyone gets sent
        // back. It goes through PostgREST, so it works when Realtime is stuck.
        actBackToClub={actBackToClub}
        // End game — bound above, and hidden unless paused, so the overlay is
        // the only place it is ever drawn.
        actEndGame={actEndGame}
      >
        {/* The play surface, assembled here rather than by the route: the
            wrappers are identical for every game and none of them needs
            anything the route knows. The mount log is outermost so its line
            lands before a broken game can throw; the boundary is inside the log
            and outside the Suspense, so a game whose chunk fails to load gets
            the card rather than the blank page. */}
        <PlayAreaSlotLog
          gametype={gametype}
          gameId={gameId}
          playState={commonGame.play_state}
          isTerminal={commonGame.is_terminal}
        >
          <PlayAreaErrorBoundary>
            <Suspense fallback={<Loading />}>
              <PlayArea
                session={session}
                gameId={gameId}
                brand={manifest.name}
                title={commonGame.title}
                players={players}
                playState={commonGame.play_state}
                isTerminal={commonGame.is_terminal}
                timer={timer}
                isMyTurn={isMyTurn}
                currentTurnUserId={commonGame.current_turn_user_id}
                setup={commonGame.setup}
                status={commonGame.status}
                clubHandle={commonGame.club_handle}
                goToGame={goToGame}
                globalFeedbackSlot={globalFeedbackSlot}
                menu={menuApi}
              />
            </Suspense>
          </PlayAreaErrorBoundary>
        </PlayAreaSlotLog>
      </PauseBoundary>

      {/* Chat is club-context vocabulary ("anyone in the club may send a
          message"), so it gets the FULL club roster (`clubMembers` via
          useClubRoster), not just this game's `players` — so a message from a
          club member who ISN'T in this game still resolves to their handle +
          color instead of a '?'. (`players` remains the right data for the
          PageHeaderPlayersStrip / peer-game feedback, which are about THIS game.)

          The closed-state toggle is the header's <ChatButton> (above);
          Chat renders the panel itself, and nothing at all while
          closed. It holds the club's chat subscription, so it also pops a new
          message from another member in the header's global slot. */}
      <Chat
        clubHandle={commonGame.club_handle}
        members={clubMembers}
        selfId={session.user.id}
        globalFeedbackSlot={globalFeedbackSlot}
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
          members={clubMembers}
        />
      )}

      {/* The Help companion — lazy-loaded from the manifest. Suspense
          fallback is null because a brief blank moment during chunk
          fetch is acceptable for a help panel (the user just
          clicked Help; they expect it to appear within a beat). */}
      {helpOpen && (
        <Suspense fallback={null}>
          <HelpComponent onClose={() => setHelpOpen(false)} brand={manifest.name} />
        </Suspense>
      )}

      {confirmingSuspend && (
        <SuspendConfirmationBlockingModal
          title={commonGame.title}
          onCancel={() => setConfirmingSuspend(false)}
          // sendSuspend broadcasts + navigates self. Peers navigate themselves
          // on receipt; the last leaver clears is_current_view via cleanup.
          onSuspend={sendSuspend}
        />
      )}
    </div>
  )
}
