// cs-blessed-game-page

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../supabase/db'
import { navigate } from '../routing/router'
import { clubPath } from '../routing/routes'
import { supabase } from '../supabase/supabase'
import { channelLeaving, releaseChannel } from '../realtime/channelTeardown'
import { onPostgresAttached } from '../realtime/postgresAttached'
import { readRows, runRpc } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import { rtLog } from '../realtime/realtimeDiag'
import { computePause } from '../pause-suspend/pause'
import type { TimerMode } from '../manifest/gameManifest'
import type { GamePlayer, Member } from '../members/member'
import { useGameTimer } from '../timer/useGameTimer'
import { reportUnhandled } from '../supabase/dbEnvelope'

/**
 * The subset of common.games a game page sees. Mirrors the row shape, so the
 * shell and the manifests can read setup-derived chrome without dipping into
 * per-gametype row state.
 */
export type CommonGame = {
  id: string
  // The owning club's handle — the column on common.games, not a key to look a
  // club up by, so every club-shaped URL on the page is buildable off the row
  // with no deferred fetch.
  club_handle: string
  gametype: string
  title: string
  setup: { timer?: TimerMode } & Record<string, unknown>
  // True when this game is the club's current view (the one whose URL members
  // auto-route into). At most one per club — guarded by a partial unique index.
  // Orthogonal to play_state: a current-view game can be terminal (a club still
  // reviewing the end-state); a non-current game can be non-terminal (a
  // suspended game waiting to be resumed). See docs/states.md.
  is_current_view: boolean
  // Gametype-specific play state. `'playing'` is the standard non-terminal
  // value; some gametypes have additional non-terminal states. Gate on
  // `is_terminal` below — it's the materialized "any terminal play_state".
  play_state: string
  // Materialized "is any terminal play_state" — `common.end_game` flips this to
  // true alongside writing the terminal play_state, so consumers can gate on a
  // uniform boolean without knowing each gametype's vocabulary.
  is_terminal: boolean
  // Which RUN of this board we are on — 0 until the first restart, then +1 per
  // restart. The page keys the play surface on it, so a restart takes every
  // piece of a game's local state with it rather than each game hunting its own
  // leftovers. Nothing reads the VALUE; only that it changed.
  restarts: number
  // Free-form per-gametype outcome detail. Each gametype writes its own shape;
  // the matching manifest's `labelFor` reads it back to render the club-page
  // listing row. Kept current by every state-transitioning RPC via
  // common.update_state / common.end_game — not just a terminal-time snapshot.
  status: Record<string, unknown> | null
  started_at: string
  ended_at: string | null
  // The turn pointer, for the opt-in turn-by-turn coop mode (setup
  // coop_style='turns'), rotated server-side by common._advance_turn. The hook
  // hands it on as `turnHolderId`; whether a game has turns at all is
  // `isTurnBased`, never a null here. Scrabble compete does NOT use this — it
  // keeps its own seat pointer.
  current_turn_user_id: string | null
}


/**
 * Broadcast event shape for the manual-pause feature. Pauser's
 * user_id rides along so peers can render "Bea paused the game"
 * overlay line; the receiver looks up the member by id (no need
 * to ship usernames over the wire).
 *
 * Any-player-resume: there's no privileged "original pauser"
 * check. Any connected player can fire `manualUnpause`.
 */
type ManualPauseEvent =
  | { type: 'manualPause'; userId: string }
  | { type: 'manualUnpause' }

/**
 * Broadcast payload sent when a peer shelves the game. Every OTHER peer
 * navigates back to the club page on receipt; the sender navigates itself,
 * because a broadcast does not echo (see `sendSuspend`). No userId field —
 * the action is uniform, and the disappearance into the club page is itself
 * the signal. The club's pointer is cleared by the last tab out, in the join
 * effect's cleanup below.
 */
type SuspendEvent = { type: 'suspend' }

/** What `common.unset_current_view` puts in `data` when it cleared the
 *  pointer. Nullable because its other `ok` — PA001, the game is gone —
 *  arrives through a raise, and `common.raised_envelope` builds `data: null`.
 *  ClubPage's heal declares the same shape for the same RPC. */
type UnsetAnswer = { result: 'cleared' } | null

/** What `common.set_current_view` puts in `data` when it flipped the pointer.
 *  Nullable for the same reason as its twin above: its other `ok` — PA003, the
 *  game is gone — arrives through a raise, and `common.raised_envelope` builds
 *  `data: null`. */
type SetAnswer = { result: 'set' } | null

/**
 * Everything a game page needs that isn't the game: the common.games row and
 * its roster, the shared room every peer meets on, presence, pause, suspend and
 * the clock. Call it once per page, at the top; a game's own `useGame` hook
 * handles the per-gametype rows on a channel of its own.
 *
 * The room is a Realtime channel named `game:${gameId}` — stable, because
 * presence and broadcast only reach peers sharing a channel NAME, and because
 * the last peer to leave it is who clears the club's current-view pointer.
 * doc.md argues why that name can never take a per-tab suffix.
 *
 * It also says where the viewing player stands — the standing terms
 * (docs/win-lose.md → Where a player stands), each computed once here so no
 * game recomputes them. `draftsOffTurn` is the manifest's, and only `isBoardInteractive` reads
 * it.
 *
 * Every field of the returned object is documented on the return type below.
 * Nothing here half-runs: the hook joins the channel and asserts
 * `set_current_view` as soon as it is called, so the caller must already know
 * the game exists.
 */
export function useCommonGame(
  gameId: string,
  session: Session,
  draftsOffTurn: boolean,
): {
  // The common.games row, or null while loading — and also when the read failed
  // or the game is gone, which `failure` below tells apart.
  commonGame: CommonGame | null
  // common.game_players ⨯ their profiles: everyone in the game.
  players: GamePlayer[]
  // The presence-pause roster: `players` minus everyone the game is no longer
  // waiting for. This is the exact set the pause machinery watches — a player
  // who is locally terminal (conceded, eliminated, out of budget, or finished
  // while the others play out) is excluded, because their absence must not
  // wedge the game for the people still playing.
  // The pause overlay lists these members (present ones filled, absent ones a
  // hollow ring).
  activePlayers: GamePlayer[]
  // The union of the two pauses: somebody in `activePlayers` is off the
  // channel, or somebody clicked Pause. Forced false once the game has ended.
  paused: boolean
  // User ids currently on the game's realtime channel. Paired with
  // `activePlayers` to tell present (filled dot) from absent (hollow gray ring)
  // in the pause overlay — same present/away split the club-page
  // `PageHeaderPlayersStrip` draws.
  presentUserIds: Set<string>
  // Who clicked Pause, null when the pause is presence-only. A club member
  // watching without having joined resolves to a nameless stand-in rather than
  // nothing, so their click still takes effect.
  manuallyPausedBy: Member | null
  // Broadcast the manual pause / its release to every peer, this tab included.
  sendManualPause: () => void
  sendManualUnpause: () => void
  // Shelve the game and leave: broadcasts to every peer, then navigates self to
  // the club page. What `act-back-to-club` does mid-game, from whichever
  // surface placed it — after a confirm when there are peers to surprise,
  // straight away for a solo game.
  sendSuspend: () => void
  // The game clock — seconds to show, and whether a countdown has run out.
  timer: { displaySeconds: number; expired: boolean }
  // Where the viewing player stands. Each means exactly what its formula says
  // (docs/win-lose.md → Where a player stands), and nothing else. Before the
  // row loads, nobody is a player and every flag is false.
  isPlayer: boolean
  isConceded: boolean
  isLocallyTerminal: boolean
  isStillPlaying: boolean
  isTurnBased: boolean
  turnHolderId: string | null
  isMyTurn: boolean
  isBoardInteractive: boolean
  // False once the initial fetch has settled, however it settled.
  loading: boolean
  // Set when a read FAILED, which is not the same as the game being absent.
  // `GamePageLoader` renders this instead of "There's no game here."
  failure: NotOkEnvelope | null
} {
  const [commonGame, setCommonGame] = useState<CommonGame | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  // Whether the players were seated in a turn order (any `turn_seat` set) —
  // fixed when the game is created. Read off the roster with the players.
  const [isTurnBased, setIsTurnBased] = useState(false)
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(
    () => new Set(),
  )
  // user_id of whoever clicked the most recent un-resolved manual
  // pause. null when no manual pause is in effect.
  const [manuallyPausedById, setManuallyPausedById] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)
  // Held in state so a new effect run (StrictMode double-mount,
  // gameId change) gets a fresh channel and re-renders consumers.
  // The setChannel-in-effect below is intentional — the realtime
  // channel IS the external system being synced into React state.
  const [channel, setChannel] = useState<
    ReturnType<typeof supabase.channel> | null
  >(null)
  // The same channel, reachable synchronously from the effect's cleanup.
  // The state above is for consumers (it must re-render them); the cleanup
  // can't read it, because the channel may be created AFTER the effect body
  // returns — the join waits on any in-flight teardown of the same room name.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Mirror of presentUserIds the cleanup callback can read at
  // unmount time without being a stale closure capture. Written
  // alongside setPresentUserIds inside the presence-sync handler
  // (not during render); the hook fires unset_current_view IFF
  // this ref says I'm the only viewer at the moment of unmount
  // — see the effect's cleanup below for the full story.
  const presentUserIdsRef = useRef<Set<string>>(new Set())

  // Mirror of commonGame.club_handle that the suspend-broadcast
  // handler can read at receive time. The handler is registered
  // once on subscribe (before commonGame loads); a ref decouples
  // it from the load-time setState. Written by `load()` below
  // alongside setCommonGame.
  const clubHandleRef = useRef<string>('')

  // Idempotent apply for manual-pause events. The senders below call this
  // directly (optimistic local apply) AND broadcast; with realtime-js's
  // `broadcast: { self: false }` default there's no echo to the sender, so
  // this runs once locally and once per peer. Idempotent regardless — a
  // repeat lands on the same value and React's referential-equality setState
  // bail-out drops it — which is what makes the rebroadcast-on-peer-join
  // effect below safe.
  const applyManualPause = useCallback((event: ManualPauseEvent) => {
    if (event.type === 'manualPause') {
      setManuallyPausedById(event.userId)
    } else {
      setManuallyPausedById(null)
    }
  }, [])

  // Join this game's shared Realtime room: load the row + roster,
  // attach the postgres-changes / broadcast / presence handlers,
  // subscribe, and assert current-view on connect. The matching
  // cleanup leaves the room (unset_current_view if last viewer,
  // untrack, removeChannel). See the hook docstring above for the
  // "shared room" framing this name echoes.
  useEffect(function joinGameRoom() {
    let mounted = true
    // Monotonic generation for out-of-order protection: this effect fires
    // overlapping loads (initial + on-SUBSCRIBED + one per postgres-changes
    // event), which can resolve out of order. Each `load()` stamps a
    // generation and commits only if it's still the newest — so a slow initial
    // load landing after a fast event-load can't regress play_state / is_terminal
    // / the roster. Same fix as useRealtimeRefetch's factory.
    let generation = 0

    async function load() {
      // Already dead on arrival. Not the same question as the guard after the
      // await, which asks whether the world changed WHILE we waited — this one
      // catches a `load()` that should never have started: the cleanup below
      // does `void releaseChannel(ch)` without awaiting it, so the channel can
      // still deliver an event, or `onPostgresAttached` still fire, for a
      // moment after this hook unmounted. Three reads, certain to be discarded.
      if (!mounted) return
      const myGen = ++generation
      // Common-side row + player roster + profile usernames.
      // Two queries instead of an embed: game_players → profiles
      // is on user_id, easy enough to read directly with explicit
      // column control.
      //
      // No embed of clubs(handle) either: common.games.club_handle IS the
      // club's handle, so the club-page URL comes off this row directly.
      const [gameRes, playersRes] = await Promise.all([
        // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
        // so this is 0 or 1 of them.
        readRows(
          commonDb
            .from('games')
            .select(
              'id, club_handle, gametype, title, setup, is_current_view, play_state, is_terminal, restarts, status, started_at, ended_at, current_turn_user_id',
            )
            .eq('id', gameId),
        ),
        readRows(
          commonDb
            .from('game_players')
            .select('user_id, conceded, conceded_at, locally_terminal, result, turn_seat')
            .eq('game_id', gameId),
        ),
      ])
      if (!mounted || myGen !== generation) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the envelope BEHIND it, which already names which read died.
      //
      // One branch each rather than one combined test, because WHICH read failed
      // is the only thing the player's sentence cannot say.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      if (playersRes.type === 'not-ok') {
        setFailure(playersRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the shell behind a stale explanation.
      setFailure(null)

      // ZERO ROWS is the caller's to read, and `GamePageLoader` reads it as the
      // game being gone — which is only true because the read WORKED.
      const gameData = gameRes.data[0]
      const playerRows = playersRes.data
      if (!gameData) {
        setCommonGame(null)
        setPlayers([])
        setIsTurnBased(false)
        setLoading(false)
        return
      }

      let playerList: GamePlayer[] = []
      const userIds = (playerRows ?? []).map((r) => r.user_id)
      if (userIds.length > 0) {
        const profilesRes = await readRows(
          commonDb
            .from('profiles')
            .select('user_id, username, color, ai_member')
            .in('user_id', userIds),
        )
        if (!mounted || myGen !== generation) return
        if (profilesRes.type === 'not-ok') {
          setFailure(profilesRes)
          setLoading(false)
          return
        }
        const profileData = profilesRes.data
        // Merge the profile (username/color) with the per-player
        // game_players bits (conceded/locally_terminal/result) into one
        // GamePlayer.
        const byId = new Map(
          (playerRows ?? []).map((r) => [r.user_id, r]),
        )
        playerList = (profileData ?? []).map(function mergeGamePlayerBits(prof) {
          const gp = byId.get(prof.user_id)
          const { ai_member, ...member } = prof
          return {
            ...(member as Member),
            conceded: gp?.conceded ?? false,
            conceded_at: gp?.conceded_at ?? null,
            locally_terminal: gp?.locally_terminal ?? false,
            result: (gp?.result as GamePlayer['result']) ?? null,
            ai_member,
          }
        })
      }

      // Diagnostics: what this load actually saw. The lost-event failure
      // mode ends with "the last refetch saw a game still in progress" —
      // this line is that moment, timestamped, in a real browser's console.
      rtLog(
        `game:${gameId}`,
        `load #${myGen}: play_state=${gameData.play_state}` +
          ` terminal=${gameData.is_terminal} players=${playerList.length}`,
      )

      clubHandleRef.current = gameData.club_handle
      setCommonGame({
        ...gameData,
        setup: gameData.setup as CommonGame['setup'],
        status: gameData.status as CommonGame['status'],
      })
      setPlayers(playerList)
      setIsTurnBased((playerRows ?? []).some((r) => r.turn_seat !== null))
      setLoading(false)
    }

    // A stable ROOM name: every connected peer for this game joins the SAME
    // Realtime topic — required for presence to see everyone and broadcasts to
    // reach all peers, so it can't take a dedup suffix the way the per-client
    // data channels do. That exposes it to the teardown race: a remount inside
    // the previous mount's leave round-trip (StrictMode's double-mount;
    // club↔game navigation) would be handed the dying channel back, whose
    // .subscribe() never reaches SUBSCRIBED. `channelLeaving` waits it out;
    // nothing pending is the fast path, so a first mount joins on the spot.
    // Full mechanism: channelTeardown.ts.
    const room = `game:${gameId}`
    let canceled = false

    function joinRoom() {
      // Guards the deferred path only — this effect can tear down again while
      // the previous channel is still leaving.
      if (canceled) return
      const ch = supabase.channel(room)

      // Postgres-changes on common.games for this gameId. Drives
      // refetch on is_current_view flip, ended_at set, status jsonb
      // populate — the cross-cutting transitions every consumer
      // cares about.
      ch.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'common',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        load,
      )

      // Postgres-changes on common.game_players for this game. A
      // mid-game concede (common.concede) flips a player's `conceded`
      // WITHOUT touching common.games, so the games listener above
      // wouldn't fire — but every peer's OpponentStrip needs to see
      // the drop-out. This makes any per-player change (concede now,
      // end-of-game `result` writes too) refetch the roster.
      ch.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'common',
          table: 'game_players',
          filter: `game_id=eq.${gameId}`,
        },
        load,
      )

      // Manual-pause Broadcast, from a peer — our own sends do not echo (the
      // senders below apply locally first). Idempotent apply, because the
      // rebroadcast-on-peer-join effect below repeats the same event.
      ch.on('broadcast', { event: 'manualPause' }, ({ payload }) =>
        applyManualPause(payload as ManualPauseEvent),
      )

      // Suspend Broadcast. When one peer shelves the game, every OTHER
      // connected peer navigates back to the club page here; the sender does
      // not receive its own broadcast and navigates itself in `sendSuspend`.
      // The resulting cascade of unmounts feeds last-viewer-leaves into
      // unset_current_view; whichever cleanup runs last clears the flag. The
      // clubHandleRef indirection is so the handler resolves the current
      // handle at receive-time rather than at register-time (load() runs
      // later).
      ch.on('broadcast', { event: 'suspend' }, function navigateToTheClub() {
        const handle = clubHandleRef.current
        if (!handle) return
        navigate(clubPath(handle))
      })

      // The deaf-window closer: SUBSCRIBED below is only the join ack, and a
      // common.games/game_players write landing before the WAL poller really
      // carries this channel's subscription is dropped — for THIS channel
      // that's a game ending invisibly (the exact bug the pinned repro spec
      // demonstrates). Re-read once the attach is confirmed. See
      // postgresAttached.ts.
      onPostgresAttached(ch, () => void load())

      // Presence: dedupe to user_ids so multiple tabs of the same
      // user don't double-count. We also mirror to a ref so the
      // unmount cleanup can read the latest snapshot — see the
      // cleanup return below.
      ch.on('presence', { event: 'sync' }, function mirrorPresence() {
        const state = ch.presenceState() as Record<
          string,
          Array<{ user_id?: string }>
        >
        const ids = new Set<string>()
        for (const list of Object.values(state)) {
          for (const entry of list) {
            if (entry.user_id) ids.add(entry.user_id)
          }
        }
        presentUserIdsRef.current = ids
        setPresentUserIds(ids)
        rtLog(room, `presence sync: [${[...ids].join(', ')}]`)
      })

      ch.subscribe(function loadAndAssertCurrentView(status) {
        if (status === 'SUBSCRIBED') {
          load()
          ch.track({ user_id: session.user.id })
          // First-viewer-mount write: flip this game to the
          // club's current view (and vacate any prior one).
          // Idempotent server-side — re-mounting an already-
          // current game is a no-op. Fires on every SUBSCRIBED
          // (including reconnects), which is what we want: a
          // member who reconnects re-asserts they're viewing.
          // See docs/states.md → "Lifecycle: when is_current_view
          // flips" and the matching common.set_current_view RPC.
          //
          // A console line is the whole response, and the severity below is
          // what buys that: a fault is the only not-ok this RPC can give
          // (PN011 / PN012, from require_club_member) and `runRpc` has already
          // raised its modal. Nobody asked for this write — it rides on the
          // subscribe ack — so there is no surface owed an answer, and the RPC
          // is idempotent, so a transient failure self-heals at the next
          // reconnect. Same shape as `unset_current_view` below.
          void runRpc<SetAnswer>(
            commonDb.rpc('set_current_view', { target_game: gameId }),
          ).then(function logHowSetCurrentViewLanded(res) {
            if (res.type === 'not-ok' && res.severity === 'fault') {
              console.error('set_current_view failed', res.message)
            } else if (res.type === 'ok' && res.dbcode === 'PA003') {
              // The game was deleted out from under us — the reconnect case,
              // not a race: this ack fires again on every resubscribe. Nothing
              // to make current, and this is the wrong messenger anyway;
              // `load()` finds zero rows and `GamePageLoader` says it properly.
            } else if (res.type === 'ok' && res.data?.result === 'set') {
              // Flipped, or already true — the RPC's own `is_current_view =
              // false` guard absorbing a re-assert.
            } else {
              reportUnhandled('set_current_view', res)
            }
          })
        }
      })
      setChannel(ch)
      channelRef.current = ch
    }

    const pending = channelLeaving(room)
    if (pending) {
      // The previous mount of this room is still mid-leave (StrictMode
      // double-mount; club↔game navigation). Log both ends so a join that
      // never happened is traceable to a teardown that never resolved.
      rtLog(room, 'join deferred: waiting for previous teardown')
      void pending.then(joinRoom)
    } else joinRoom()

    load()

    return function leaveGameRoom() {
      mounted = false
      canceled = true

      // Last-viewer-leave write. Fire unset_current_view IFF
      // the latest presence snapshot says I'm the only viewer
      // — `{me}` or the not-yet-synced empty set (which covers
      // the StrictMode quick-mount-unmount cycle where presence
      // never propagated; the RPC's `is_current_view = true`
      // guard makes a stale-fire harmless). A presence set with
      // other user_ids means someone else is still viewing —
      // they'll fire unset themselves when they become last.
      //
      // The two-peers-leave-simultaneously race (both see
      // {me, you}, both skip the unset) is a known acceptable
      // gap: the next club-page visit re-establishes the
      // pointer via set_current_view's vacate-others step.
      const ids = presentUserIdsRef.current
      const iAmLastOrUnknown =
        ids.size === 0 || (ids.size === 1 && ids.has(session.user.id))
      rtLog(room, `leaving (lastViewer=${iAmLastOrUnknown})`)
      if (iAmLastOrUnknown) {
        // Same shape as set_current_view above, and unasked-for in the same
        // way: nobody clicked it, so nothing is owed an answer beyond the
        // modal `runRpc` raises. The RPC is idempotent (its `is_current_view =
        // true` guard absorbs no-ops), and a game deleted out from under us
        // comes back `ok`, so a transient failure leaves nothing behind. A
        // persistent one leaves the club's pointer stuck on a stale game until
        // the next set_current_view clears it as a straggler.
        void runRpc<UnsetAnswer>(
          commonDb.rpc('unset_current_view', { target_game: gameId }),
        ).then(function logHowUnsetCurrentViewLanded(res) {
          if (res.type === 'not-ok' && res.severity === 'fault') {
            // The severity is asserted, not assumed, and it is the reason a
            // console line is enough: a fault is the only not-ok this RPC can
            // give (PN011 / PN012, from require_club_member) and `runRpc` has
            // already put its modal up. This tab is on its way out and has no
            // surface left to say anything on, so a race or a service-error
            // would have nowhere to go — better the scream below than a quiet
            // log line. Same reasoning as ClubPage's heal, the other caller.
            console.error('unset_current_view failed', res.message)
          } else if (res.type === 'ok' && res.dbcode === 'PA001') {
            // The game was deleted out from under us. Not a failure: a deleted
            // game has no pointer to leave behind, which is the job done.
          } else if (res.type === 'ok' && res.data?.result === 'cleared') {
            // Cleared, or already false — the RPC's own `is_current_view =
            // true` guard absorbing a peer who got there first.
          } else {
            reportUnhandled('unset_current_view', res)
          }
        })
      }

      const ch = channelRef.current
      channelRef.current = null
      setChannel(null)
      if (!ch) return // torn down before our turn to join came round
      try {
        ch.untrack()
      } catch {
        // ignore — channel may already be closed
      }
      void releaseChannel(ch)
    }
  }, [applyManualPause, gameId, session.user.id])

  // Re-broadcast active manual-pause whenever the set of connected
  // peers changes, so a peer joining mid-pause (or reconnecting
  // after the original pauser closed their tab) lands in the same
  // paused state instead of seeing a phantom-resumed board.
  useEffect(function rebroadcastManualPause() {
    if (!channel || manuallyPausedById === null) return
    channel.send({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: manuallyPausedById },
    })
  }, [channel, manuallyPausedById, presentUserIds])

  // Manual-pause broadcasters. Optimistic local apply + broadcast.
  const sendManualPause = useCallback(() => {
    if (!channel) return
    const event: ManualPauseEvent = {
      type: 'manualPause',
      userId: session.user.id,
    }
    applyManualPause(event)
    channel.send({ type: 'broadcast', event: 'manualPause', payload: event })
  }, [applyManualPause, channel, session.user.id])

  const sendManualUnpause = useCallback(() => {
    if (!channel) return
    const event: ManualPauseEvent = { type: 'manualUnpause' }
    applyManualPause(event)
    channel.send({ type: 'broadcast', event: 'manualPause', payload: event })
  }, [applyManualPause, channel])

  // Suspend-now broadcaster. Fires the broadcast first so peers start
  // navigating, then navigates self.
  //
  // The self-navigate is REQUIRED, not belt-and-braces: realtime-js defaults to
  // `broadcast: { self: false }` and we don't override it, so the handler above
  // never runs on the sender's own channel.
  const sendSuspend = useCallback(() => {
    if (!channel) return
    const event: SuspendEvent = { type: 'suspend' }
    channel.send({ type: 'broadcast', event: 'suspend', payload: event })
    const handle = clubHandleRef.current
    if (handle) navigate(clubPath(handle))
  }, [channel])

  // Presence-pause + manual-pause unify into a single `paused`
  // flag. The two sources can coexist; the union truthy-ness is
  // what consumers care about.
  //
  // Short-circuit on game-end: once `ended_at` is populated,
  // pause is moot — the game is over. Forcing paused=false in
  // this case lets PauseBoundary remount PlayArea so it renders
  // the terminal result (the verdict pill + per-game review state).
  // Without this, a terminal-during-pause edge case (stale-tab
  // peer fires submit_timeout, etc.) would leave the overlay
  // stuck up over a game that's already done.
  // Locally terminal players are dropped from the presence-pause roster: a
  // player who conceded or is otherwise done must NOT wedge everyone else
  // behind a "Waiting for <name>…" overlay when they close the tab.
  // Invited-but-not-yet-joined players stay counted — that presence-pause IS
  // deliberate.
  // …and minus the bots. A bot holds a seat and can win, but it never opens a
  // tab, so counting it here would park every game with one behind the pause
  // overlay forever. Filtered HERE rather than inside computePause because
  // `activePlayers` is also what the overlay draws its present/absent dots
  // from — patching the flag alone would leave a permanently hollow bot ring.
  const activePlayers = players.filter(
    (p) => !p.locally_terminal && !p.ai_member,
  )
  const presencePaused = computePause(presentUserIds, activePlayers)
  const manuallyPausedBy: Member | null = manuallyPausedById
    ? players.find((m) => m.user_id === manuallyPausedById) ??
      // The pauser can be a club member spectating (on the game page without
      // having joined as a player), so they're not in `players`. Resolve to a
      // labeled pseudo-member so the pause still TAKES EFFECT (and the overlay
      // reads "Someone paused") instead of silently no-opping — clicking Pause
      // was otherwise a dead control for a non-player. Unknown color falls
      // through to body-text in colorVarFor.
      { user_id: manuallyPausedById, username: 'Someone', color: '' }
    : null
  const paused =
    (presencePaused || manuallyPausedBy !== null)
    && commonGame?.ended_at == null

  // Timer. The additive tick clock (common.timers) — mode from
  // setup; `running` gates the per-second driver so the count only
  // advances during live, unpaused play. Pre-load (commonGame null)
  // → running=false, so the hook stays callable but idle until the
  // game loads.
  const timer = useGameTimer({
    gameId,
    paused,
    mode: commonGame?.setup.timer ?? { kind: 'none' },
    running: commonGame != null && !commonGame.is_terminal,
  })

  // ─── Where I stand ─── formula for formula (docs/win-lose.md → Where a
  // player stands).
  const me = players.find((p) => p.user_id === session.user.id)
  const isTerminal = commonGame?.is_terminal ?? false
  const isPlayer = me !== undefined
  const isConceded = me?.conceded ?? false
  const isLocallyTerminal = me?.locally_terminal ?? false
  const isStillPlaying = isPlayer && !isTerminal && !isLocallyTerminal
  const turnHolderId = commonGame?.current_turn_user_id ?? null
  const isMyTurn = isStillPlaying && (!isTurnBased || turnHolderId === session.user.id)
  const isBoardInteractive = draftsOffTurn ? isStillPlaying : isMyTurn

  return {
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
    isPlayer,
    isConceded,
    isLocallyTerminal,
    isStillPlaying,
    isTurnBased,
    turnHolderId,
    isMyTurn,
    isBoardInteractive,
    loading,
    failure,
  }
}
