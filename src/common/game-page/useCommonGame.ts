// cs-blessed-game-page

/*
 * What this hook returns.
 *
 * useCommonGame(gameId, auth):
 *   cg                                    # the shell, plus me; null while loading, after a failed read, or when the game is gone
 *   playarea                              # the game's playarea blob, opaque here; null until the game's builder has written it
 *   pause: {paused, presentUserIds, stillPlayingHumanPlayers, manuallyPausedBy, sendManualPause, sendManualUnpause}
 *   timer:
 *     mode: {kind, seconds}               # seconds only for a countdown
 *     displaySeconds
 *     expired
 *   sendSuspend
 *   resubscribeCount
 *   loading
 *   failure                               # null unless a read failed
 *
 * cg:
 *   id
 *   gametype
 *   club: {handle}
 *   title
 *   restartCount
 *   ended
 *   players: [player, …]                  # seat order
 *   me                                    # same object as my entry in players
 *
 * player:
 *   id
 *   username
 *   color
 *   ai
 *   stillPlaying
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { db as commonDb } from '../supabase/db'
import { navigate } from '../routing/router'
import { clubPath } from '../routing/routes'
import { supabase } from '../supabase/supabase'
import { channelLeaving, releaseChannel } from '../realtime/channelTeardown'
import { onPostgresAttached } from '../realtime/postgresAttached'
import { readRows, runRpc } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import { rtLog } from '../realtime/realtimeDiag'
import { computeGamePause, type GamePause } from '../pause-suspend/pause'
import { useManualPause, type ManualPauseEvent } from '../pause-suspend/useManualPause'
import type { SuspendEvent } from '../pause-suspend/sendSuspendBeforeDelete'
import type { TimerMode } from '../manifest/gameManifest'
import { useGameTimer } from '../timer/useGameTimer'
import { reportUnhandled } from '../supabase/dbEnvelope'
import { noShellEnvelope, type CommonGame, type Shell } from './shell'

/**
 * Everything a game page needs that isn't the game: the shell (`cg`), the
 * game's own page blob to hand down, the shared room every peer meets on,
 * presence, pause, suspend and the clock. Call it once per page, at the top.
 *
 * The page is written, not assembled (plans/seat-view.md → The page is written,
 * not assembled): one read of `common.games` brings the `shell` and `playarea`
 * blobs each game's status builder wrote, and the hook reads no other column
 * of that table. The shell is what the page shows; the playarea is the game's,
 * handed down opaque. A game's `useGame` is a pure function of it.
 *
 * The room is a Realtime channel named `game:${gameId}` — stable, because
 * presence and broadcast only reach peers sharing a channel NAME, and because
 * the last peer to leave it is who clears the club's current-view pointer.
 * doc.md argues why that name can never take a per-tab suffix.
 *
 * `auth` is the signed-in user, whose player is `cg.me`.
 *
 * Every field of the returned object is documented on the return type below.
 * Nothing here half-runs: the hook joins the channel and asserts
 * `set_current_view` as soon as it is called, so the caller must already know
 * the game exists and that the user is seated in it.
 */
export function useCommonGame(
  gameId: string,
  auth: Session,
): {
  // The shell, plus me; null while loading, when a read failed, or when the
  // game is gone.
  cg: CommonGame | null
  // The game's playarea blob, as its builder wrote it. Opaque to the page;
  // null until the game's builder has written one.
  playarea: unknown
  // Whether the game is paused, who it waits for, and the controls.
  pause: GamePause
  // The game clock: its kind (and a countdown's length), the seconds to show,
  // and whether a countdown has run out.
  timer: { mode: TimerMode; displaySeconds: number; expired: boolean }
  // Shelve the game and send every peer, this tab included, to the club page.
  sendSuspend: () => void
  // Counts the channel's joins and attach confirmations; see
  // `PlayAreaLoaderProps.resubscribeCount`.
  resubscribeCount: number
  // True until the first read settles, however it settles.
  loading: boolean
  // A read that failed — not the same as the game being gone.
  failure: NotOkEnvelope | null
} {
  // What the newest read found; null until the first one answers.
  const [lastRead, setLastRead] = useState<CommonGameRead | null>(null)
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [resubscribeCount, setResubscribeCount] = useState(0)
  // The room's channel, in state so the senders re-render with it. Set from
  // the join effect on purpose: the channel IS the external system.
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  // The same channel for the cleanup, which can't read state: the join may
  // happen after the effect body returns, waiting out a previous teardown.
  const channelRef = useRef<RealtimeChannel | null>(null)
  // The latest presence, for the cleanup's last-viewer check.
  const presentUserIdsRef = useRef<Set<string>>(new Set())
  // The club handle, for the suspend handler, which is attached before the
  // row loads.
  const clubHandleRef = useRef<string>('')

  const { manuallyPausedById, applyManualPause, sendManualPause, sendManualUnpause } =
    useManualPause({ channel, myId: auth.user.id, presentUserIds })

  // Join the game's room: read the game, attach the handlers, subscribe and
  // claim the club's current view. Leaving releases it if I am the last viewer.
  useEffect(function joinGameRoom() {
    let mounted = true
    // Loads overlap (the first, on join, and one per change) and can land out
    // of order; only the newest may commit, so a slow one can't roll the game
    // back. Same fix as useRealtimeRefetch's.
    let generation = 0

    async function load() {
      // Already dead on arrival: the cleanup releases the channel without
      // awaiting it, so an event can still call this just after unmount.
      if (!mounted) return
      const myGen = ++generation
      const read = await readCommonGame(gameId)
      if (!mounted || myGen !== generation) return

      if (read.kind === 'loaded') {
        // What this load saw — the moment a lost event shows up as "the last
        // refetch saw a game still in progress".
        rtLog(
          `game:${gameId}`,
          `load #${myGen}: ended=${read.shell.ended} players=${read.shell.players.length}`,
        )
        clubHandleRef.current = read.shell.club.handle
      }
      setLastRead(read)
    }

    // One name for every peer, so presence and broadcasts reach them all — which
    // means a quick remount must wait out the previous mount's leave
    // (channelTeardown.ts).
    const room = `game:${gameId}`
    let canceled = false

    function joinRoom() {
      // The effect may have torn down while the join waited.
      if (canceled) return
      const ch = supabase.channel(room)

      // Every move rewrites the row's blobs, so this is how the page — and the
      // game, through the playarea it is handed — hears of every move and the
      // end.
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

      // A peer's manual pause; see `useManualPause`.
      ch.on('broadcast', { event: 'manualPause' }, ({ payload }) =>
        applyManualPause(payload as ManualPauseEvent),
      )

      // A peer shelved the game: go back to the club too.
      ch.on('broadcast', { event: 'suspend' }, function navigateToTheClub() {
        const handle = clubHandleRef.current
        if (!handle) return
        navigate(clubPath(handle))
      })

      // Re-read once the change feed is really attached: a write landing
      // between the join and the attach is otherwise lost (postgresAttached.ts).
      onPostgresAttached(ch, function reloadOnAttach() {
        void load()
        setResubscribeCount((n) => n + 1)
      })

      // Presence: who is connected. Mirrored to a ref for the cleanup, which
      // reads it at unmount to decide whether I am the last viewer.
      ch.on('presence', { event: 'sync' }, function mirrorPresence() {
        const ids = readPresentUserIds(ch)
        presentUserIdsRef.current = ids
        setPresentUserIds(ids)
        rtLog(room, `presence sync: [${[...ids].join(', ')}]`)
      })

      ch.subscribe(function loadAndAssertCurrentView(status) {
        if (status === 'SUBSCRIBED') {
          load()
          setResubscribeCount((n) => n + 1)
          ch.track({ user_id: auth.user.id })
          // On every join, reconnects included: a member who reconnects
          // re-asserts they're viewing.
          assertCurrentView(gameId)
        }
      })
      setChannel(ch)
      channelRef.current = ch
    }

    const pending = channelLeaving(room)
    if (pending) {
      rtLog(room, 'join deferred: waiting for previous teardown')
      void pending.then(joinRoom)
    } else joinRoom()

    load()

    return function leaveGameRoom() {
      mounted = false
      canceled = true

      // The last viewer out clears the club's pointer. "Last" is the latest
      // presence snapshot holding only me, or nothing yet (a StrictMode
      // mount-unmount before presence synced; a stale clear is harmless). Two
      // peers leaving at once can both skip it: an accepted gap, since the next
      // set_current_view vacates a straggler.
      const ids = presentUserIdsRef.current
      const iAmLastOrUnknown =
        ids.size === 0 || (ids.size === 1 && ids.has(auth.user.id))
      rtLog(room, `leaving (lastViewer=${iAmLastOrUnknown})`)
      if (iAmLastOrUnknown) releaseCurrentView(gameId)

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
  }, [applyManualPause, gameId, auth.user.id])

  // Tell the peers, then go: a broadcast doesn't echo to its sender, so this
  // tab navigates itself.
  const sendSuspend = useCallback(() => {
    if (!channel) return
    const event: SuspendEvent = { type: 'suspend' }
    channel.send({ type: 'broadcast', event: 'suspend', payload: event })
    const handle = clubHandleRef.current
    if (handle) navigate(clubPath(handle))
  }, [channel])

  // The newest read, taken apart. A failed or gone read leaves the game null.
  const loaded = lastRead?.kind === 'loaded' ? lastRead : null
  const shell = loaded?.shell ?? null
  const ended = shell?.ended ?? false

  const pauseState = computeGamePause({
    players: shell?.players ?? [],
    presentUserIds,
    manuallyPausedById,
    ended,
  })

  // Idle until the game loads, and stopped once it ends.
  const timer = useGameTimer({
    gameId,
    paused: pauseState.paused,
    mode: loaded?.timerMode ?? { kind: 'none' },
    running: shell !== null && !ended,
  })

  const cg: CommonGame | null = shell === null
    ? null
    : {
        ...shell,
        // The gate has checked that I am seated, so this cannot miss.
        me: shell.players.find((p) => p.id === auth.user.id)!,
      }

  return {
    cg,
    playarea: loaded?.playarea ?? null,
    pause: { ...pauseState, presentUserIds, sendManualPause, sendManualUnpause },
    timer: { mode: loaded?.timerMode ?? { kind: 'none' }, ...timer },
    sendSuspend,
    resubscribeCount,
    loading: lastRead === null,
    failure: lastRead?.kind === 'failed' ? lastRead.failure : null,
  }
}

/**
 * Read who is connected to the room: the user ids in its presence. Presence
 * keeps one record per connection, so a player with two tabs is counted once.
 */
function readPresentUserIds(ch: RealtimeChannel): Set<string> {
  const presence = ch.presenceState() as Record<string, Array<{ user_id?: string }>>
  const ids = new Set<string>()
  for (const tabs of Object.values(presence)) {
    for (const tab of tabs) {
      if (tab.user_id) ids.add(tab.user_id)
    }
  }
  return ids
}

/** What `common.unset_current_view` puts in `data` when it cleared the
 *  pointer. Nullable because its other `ok` — PA001, the game is gone —
 *  arrives through a raise, and `common._raised_envelope` builds `data: null`.
 *  ClubPage's heal declares the same shape for the same RPC. */
type UnsetAnswer = { result: 'cleared' } | null

/** What `common.set_current_view` puts in `data` when it flipped the pointer.
 *  Nullable for the same reason as its twin above: its other `ok` — PA003, the
 *  game is gone — arrives through a raise, and `common._raised_envelope` builds
 *  `data: null`. */
type SetAnswer = { result: 'set' } | null

/**
 * Make this game the club's current view, vacating any other (docs/states.md →
 * Lifecycle: when is_current_view flips). Idempotent: re-asserting a current
 * game is a no-op.
 *
 * Nobody asked for this write — it rides on the join — so no surface is owed
 * an answer. A console line is the whole response, which is enough because a
 * fault is the only not-ok it can give (PN011 / PN012, from
 * `_require_club_member`) and `runRpc` has already raised its modal; a
 * transient failure heals at the next reconnect.
 */
function assertCurrentView(gameId: string): void {
  void runRpc<SetAnswer>(
    commonDb.rpc('set_current_view', { target_game: gameId }),
  ).then(function logHowSetCurrentViewLanded(res) {
    if (res.type === 'not-ok' && res.severity === 'fault') {
      console.error('set_current_view failed', res.message)
    } else if (res.type === 'ok' && res.dbcode === 'PA003') {
      // The game was deleted out from under us — on a reconnect, since this
      // fires on every join. Not this call's to say: the load finds zero rows
      // and `GamePageLoader` says it properly.
    } else if (res.type === 'ok' && res.data?.result === 'set') {
      // Flipped, or already true.
    } else {
      reportUnhandled('set_current_view', res)
    }
  })
}

/**
 * Clear the club's current-view pointer from this game, as the last viewer
 * leaves. Idempotent, and a game deleted out from under us comes back `ok`.
 *
 * Unasked-for like `assertCurrentView`, and answered the same way: a fault is
 * the only not-ok and `runRpc` has raised its modal; this tab is on its way out
 * with no surface left to speak on. A persistent failure leaves the pointer on
 * a stale game until the next set_current_view clears it. ClubPage's heal is
 * the other caller of this RPC.
 */
function releaseCurrentView(gameId: string): void {
  void runRpc<UnsetAnswer>(
    commonDb.rpc('unset_current_view', { target_game: gameId }),
  ).then(function logHowUnsetCurrentViewLanded(res) {
    if (res.type === 'not-ok' && res.severity === 'fault') {
      console.error('unset_current_view failed', res.message)
    } else if (res.type === 'ok' && res.dbcode === 'PA001') {
      // The game was deleted: it has no pointer to leave behind.
    } else if (res.type === 'ok' && res.data?.result === 'cleared') {
      // Cleared, or already false — a peer got there first.
    } else {
      reportUnhandled('unset_current_view', res)
    }
  })
}

/** What one read of the game found. */
type CommonGameRead =
  | {
      kind: 'loaded'
      shell: Shell
      playarea: unknown
      timerMode: TimerMode
    }
  // Zero rows. Only a read that WORKED can say this, which is why
  // `GamePageLoader` may read it as the game being gone.
  | { kind: 'gone' }
  // A read failed. `readRows` only fails as a fault, and has already logged it
  // and raised the modal; the envelope names which read died.
  | { kind: 'failed'; failure: NotOkEnvelope }

/**
 * Read the game: its two page blobs off `common.games`, and its timer. A game
 * whose builder has not written a shell yet fails the read, saying so.
 */
async function readCommonGame(gameId: string): Promise<CommonGameRead> {
  const [gameRes, timerRes] = await Promise.all([
    // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK, so
    // this is 0 or 1 of them.
    readRows(commonDb.from('games').select('shell, playarea').eq('id', gameId)),
    readRows(
      commonDb
        .from('timers')
        .select('kind, countdown_seconds_at_setup')
        .eq('game_id', gameId),
    ),
  ])
  // One check each rather than one combined test: WHICH read failed is the one
  // thing the player's sentence cannot say, and the envelope can.
  if (gameRes.type === 'not-ok') return { kind: 'failed', failure: gameRes }
  if (timerRes.type === 'not-ok') return { kind: 'failed', failure: timerRes }

  const gameData = gameRes.data[0]
  if (!gameData) return { kind: 'gone' }
  if (gameData.shell === null) return { kind: 'failed', failure: noShellEnvelope(gameId) }

  return {
    kind: 'loaded',
    shell: gameData.shell as Shell,
    playarea: gameData.playarea,
    timerMode: timerModeOf(timerRes.data[0]),
  }
}

/**
 * A game's timer off its `common.timers` row: the kind, and a countdown's
 * length. A missing row reads as no timer.
 */
function timerModeOf(
  row: { kind: string; countdown_seconds_at_setup: number | null } | undefined,
): TimerMode {
  if (row?.kind === 'countdown') {
    return { kind: 'countdown', seconds: row.countdown_seconds_at_setup ?? 0 }
  }
  if (row?.kind === 'countup') return { kind: 'countup' }
  return { kind: 'none' }
}
