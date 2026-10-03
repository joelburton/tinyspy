// cs-blessed-connections

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/common/supabase/supabase'
import { channelLeaving, releaseChannel } from '@/common/realtime/channelTeardown'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { eventToOutcome } from '../lib/answer'
import { applyPickEvent, eventForClick, unionTiles } from '../lib/picks'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GGameData, GGameDataRaw, GPicks, GPlayer, GPickEvent, GPickMap } from '../types'

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * guesses are their strategy — a peer's one-away guess plus the public puzzle
 * would hand you the answer — so their rows leave the log and their board is
 * null; the game's end opens everything. Coop withholds nothing: one board,
 * one team.
 */
function maySeeRival(raw: GGameDataRaw): boolean {
  return raw.coop || raw.ended
}

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  const seeRival = maySeeRival(raw)
  const isMine = (id: string) => id === myId

  const players: GPlayer[] = raw.players.map((p) => ({
    ...p,
    board: seeRival || isMine(p.id) ? p.board : null,
  }))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Links that cannot miss get a bare lookup; an ending's `by` may be null for
  // a timeout.
  const playerOf = (id: string | null) => (id === null ? null : playersById[id]!)

  // THE INBOUND SEAM: the wire word is read through `lib/answer.ts` here and
  // never travels further; `matched` is derived here too, so no downstream
  // rule has to ask a color whether a category was matched. Every guess is a
  // seated player's: a player's rows go with their profile (`on delete
  // cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, ...row }) => ({
      ...row,
      by: playersById[userId]!,
      outcome: eventToOutcome(row),
      matched: row.result === 'correct',
    }))

  // The gate has checked that I am seated, and my own board is never withheld.
  const me = playersById[myId] as GGameData['me']
  // What the state line shows: the team's counts where the game has one, else
  // my own (plans/team-facts.md).
  const teamOrMe = raw.team ?? me

  const { turns, ending, ...rest } = raw
  return {
    ...rest,
    setupRows: makeSetupRows(raw.setup, raw.mode, players, raw.puzzle.date),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: ending === null
      ? null
      : {
        reason: ending.reason,
        detail: ending.detail,
        by: playerOf(ending.by),
        winner: playerOf(ending.winner),
      },
    events,
    players,
    playersById,
    me,
    stateLineData: {
      nMatchedCats: teamOrMe.nMatchedCats,
      nMistakes: teamOrMe.nMistakes,
      maxMistakes: me.maxMistakes,
    },
  }
}

/**
 * Per-gametype data hook for connections (both modes share it): `gd`, built
 * from the `game_data` blob the page was handed and who I am, and the picks
 * beside it. `gd` has no reads and no subscription: the page re-reads the
 * blob on every move, and `makeGameData` is a pure function of it
 * (plans/seat-view.md → The page is written, not assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The picks are the one thing this hook keeps a channel for. Coop's are
 * shared, so every peer joins the stable room `connections:${gameId}` and each
 * change travels as a `GPickEvent` on the `pick` Broadcast; what an event means
 * is `lib/picks.ts`'s. Compete's picks are private: no room is joined, and the
 * senders apply locally. The room is keyed on the game alone, so a token
 * refresh does not rebuild it and a new game does.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData; picks: GPicks } {
  const raw = ctx.gameData as GGameDataRaw | null
  if (raw === null) {
    throw new Error(`connections: game ${ctx.cg.id} has no game_data; run connections._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])

  const gameId = raw.id
  const isCompete = raw.compete
  const [picks, setPicks] = useState<GPickMap>(() => new Map())
  // The picks room, once coop has joined it; `broadcast` below sends on it.
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  // Fold a pick event into the picks; the rules (and why an echo of our own
  // broadcast is safe) are `lib/picks.ts`'s.
  const applyPick = useCallback((event: GPickEvent) => {
    setPicks((prev) => applyPickEvent(prev, event))
  }, [])

  // Coop joins the picks room; see channelTeardown.ts for the join-after-leave
  // shape a stable-named room needs.
  useEffect(function joinPicksRoom() {
    if (isCompete) return
    const room = `connections:${gameId}`
    let canceled = false
    // Assigned by `join`, which may run after this effect body returns (the
    // join waits on any in-flight teardown of this room), so the cleanup reads
    // it from here.
    let ch: RealtimeChannel | null = null

    function join() {
      // Guards the deferred path only — the effect can tear down again while
      // the previous channel is still leaving.
      if (canceled) return
      ch = supabase.channel(room)
      ch.on('broadcast', { event: 'pick' }, ({ payload }) =>
        applyPick(payload as GPickEvent),
      )
      ch.subscribe()
      // The channel IS the external system being synced into state.
      setChannel(ch)
    }

    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      canceled = true
      setChannel(null)
      if (ch) void releaseChannel(ch) // null if we tore down before joining
    }
  }, [applyPick, gameId, isCompete])

  // Apply a pick event here, then put it on the wire in coop. The local apply
  // is what makes the click land at once; the echo of our own broadcast is a
  // no-op (`applyPickEvent` is idempotent). Compete has no room and sends
  // nothing. The channel is null before a deferred join lands.
  const broadcast = useCallback(
    (event: GPickEvent) => {
      applyPick(event)
      if (isCompete || channel === null) return
      void channel.send({ type: 'broadcast', event: 'pick', payload: event })
    },
    [applyPick, isCompete, channel],
  )

  // What a click does is `eventForClick`'s (doc.md → Coop); `null` is the
  // refused click on a full guess, which sends nothing.
  const toggleTile = useCallback(
    (tile: string) => {
      const event = eventForClick(picks, tile, myId)
      if (event) broadcast(event)
    },
    [broadcast, picks, myId],
  )

  const sendClear = useCallback(() => {
    broadcast({ type: 'clear' })
  }, [broadcast])

  const ownerByTile = new Map<string, string>()
  for (const [userId, tiles] of picks) {
    for (const tile of tiles) ownerByTile.set(tile, userId)
  }

  return {
    gd,
    picks: { byUser: picks, union: unionTiles(picks), ownerByTile, toggleTile, sendClear },
  }
}
