import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../common/lib/supabase/supabase'
import { channelDedupSuffix } from '../../common/lib/supabase/channelDedup'
import { db } from '../db'
import type { MarkSide, MarkType } from '../lib/types'

export type CellState = {
  fill: string | null
  pencil: boolean
  revealed: boolean
  wrong: boolean
  /** Cryptic edge marks (docs/crosswords-marks-plan.md) — display-only,
   *  synced on the cell row like the fill. */
  markRight: MarkType | null
  markBottom: MarkType | null
  version: number
}

/** Live cell state keyed `${row}:${col}`. */
export type CellsMap = Map<string, CellState>

export type SetCellResult = { solved: boolean } | { error: string }
export type SetMarkResult = { ok: true } | { error: string }

export const cellKey = (row: number, col: number) => `${row}:${col}`

/**
 * The live per-cell fills for the caller's grid, with optimistic typing.
 *
 * This is a documented deviation from `useRealtimeRefetch` (the repo's
 * default "refetch-the-whole-picture on any event" pattern): with several
 * people typing at once, refetch-per-keystroke is the wrong shape, so this
 * applies each CDC row payload DIRECTLY, guarded by a per-cell `version`
 * ("newer wins" — an event no newer than the local state is dropped,
 * which also absorbs the echo of our own optimistic write). A full refetch
 * runs only on SUBSCRIBED (initial load + reconnect catch-up).
 *
 * Because this repo's privacy comes from the RLS-filtered READ — NOT from
 * Realtime withholding rows — the CDC payload for an opponent's cell still
 * arrives in compete. We drop any row that isn't ours (`isMine`) before
 * touching state.
 *
 * `setCell` applies its own write optimistically and then ROLLS BACK if the
 * RPC fails — see the comment there for why a non-rolled-back failure is
 * unrepairable under the "newer wins" merge (the whole reason the rollback
 * exists rather than leaning on a refetch).
 *
 * @param ownerId  null for coop's shared grid; the caller's id for their
 *                 private compete grid.
 */
export function useCells(
  gameId: string,
  ownerId: string | null,
): {
  cells: CellsMap
  setCell: (row: number, col: number, fill: string | null, pencil: boolean) => Promise<SetCellResult>
  setMark: (row: number, col: number, side: MarkSide, next: MarkType | null) => Promise<SetMarkResult>
  loading: boolean
} {
  const [cells, setCells] = useState<CellsMap>(() => new Map())
  const [loading, setLoading] = useState(true)
  // Mirror for stale-closure reads inside async callbacks (updated in an
  // effect, not during render).
  const cellsRef = useRef(cells)
  useEffect(() => {
    cellsRef.current = cells
  })

  const isMine = useCallback(
    (rowOwner: string | null) => (ownerId === null ? rowOwner === null : rowOwner === ownerId),
    [ownerId],
  )

  // Merge one authoritative cell in, newer-wins.
  const applyRow = useCallback((row: number, col: number, next: CellState) => {
    setCells((prev) => {
      const key = cellKey(row, col)
      const cur = prev.get(key)
      if (cur && next.version <= cur.version) return prev
      const out = new Map(prev)
      out.set(key, next)
      return out
    })
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      const base = db
        .from('cells')
        .select('owner_id, row, col, fill, pencil, revealed, wrong, mark_right, mark_bottom, version')
        .eq('game_id', gameId)
      const { data } = await (ownerId === null
        ? base.is('owner_id', null)
        : base.eq('owner_id', ownerId))
      if (!active || !data) return
      setCells((prev) => {
        const out = new Map(prev)
        for (const r of data) {
          const key = cellKey(r.row, r.col)
          const cur = out.get(key)
          const next: CellState = {
            fill: r.fill,
            pencil: r.pencil,
            revealed: r.revealed,
            wrong: r.wrong,
            // The columns are `text` with a check constraint; the generated
            // type widens to `string | null`, so narrow back to MarkType.
            markRight: r.mark_right as MarkType | null,
            markBottom: r.mark_bottom as MarkType | null,
            version: r.version,
          }
          if (!cur || next.version > cur.version) out.set(key, next)
        }
        return out
      })
      setLoading(false)
    }

    // Postgres-changes-only (Pattern A) → a per-effect-run dedup suffix so a
    // StrictMode double-mount doesn't hit supabase-js's name cache and throw
    // on the second `.on(...)` after `.subscribe(...)`. (usePeerCursors, by
    // contrast, needs a STABLE Broadcast room, so it must NOT use this.)
    const ch = supabase.channel(`crosswords:cells:${gameId}:${channelDedupSuffix()}`)
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'crosswords', table: 'cells', filter: `game_id=eq.${gameId}` },
      (payload) => {
        const r = payload.new as {
          owner_id: string | null
          row: number
          col: number
          fill: string | null
          pencil: boolean
          revealed: boolean
          wrong: boolean
          mark_right: MarkType | null
          mark_bottom: MarkType | null
          version: number
        }
        if (!isMine(r.owner_id ?? null)) return
        applyRow(r.row, r.col, {
          fill: r.fill,
          pencil: r.pencil,
          revealed: r.revealed,
          wrong: r.wrong,
          markRight: r.mark_right,
          markBottom: r.mark_bottom,
          version: r.version,
        })
      },
    )
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void load()
    })

    return () => {
      active = false
      void supabase.removeChannel(ch)
    }
  }, [gameId, ownerId, isMine, applyRow])

  const setCell = useCallback(
    async (row: number, col: number, fill: string | null, pencil: boolean): Promise<SetCellResult> => {
      const key = cellKey(row, col)
      const pen = pencil && fill !== null
      // Snapshot the pre-optimistic cell so we can roll back on RPC failure.
      // This is load-bearing: the optimistic echo below keeps the cell's
      // CURRENT version (the RPC hands back the authoritative one), so a
      // failed write would otherwise strand a wrong letter at the very same
      // version the server holds. Because every merge path — CDC apply AND
      // the load() refetch — is strict "newer wins" (`>`), no refetch, not
      // even the SUBSCRIBED reconnect catch-up, could ever repair it: the
      // server's row carries that same version and is dropped. The cell would
      // diverge forever (indefinitely in compete, where nobody else writes
      // this grid). Rolling back closes that hole at the source.
      const prevCell = cellsRef.current.get(key)
      // Optimistic echo — show it immediately, keeping the current version
      // (the RPC hands back the authoritative one) and the revealed flag.
      setCells((prev) => {
        const cur = prev.get(key)
        if (!cur) return prev
        const out = new Map(prev)
        out.set(key, { ...cur, fill, pencil: pen, wrong: false })
        return out
      })
      const { data, error } = await db
        .rpc('set_cell', {
          target_game: gameId,
          p_row: row,
          p_col: col,
          // p_fill is a nullable `text` param (null clears the cell), but the
          // generated RPC arg type is non-null. PostgREST passes null through fine.
          p_fill: fill as string,
          p_pencil: pencil,
        })
        .single()
      if (error || !data) {
        // Roll the optimistic write back — but only if no newer authoritative
        // write (a higher version, e.g. a teammate's CDC event in coop) landed
        // during the RPC's round trip. Our optimistic echo left the version
        // unchanged, so an unchanged version means the cell is still our stale
        // guess and is safe to revert; a bumped version is a real newer state
        // that must win over the rollback.
        setCells((prev) => {
          const cur = prev.get(key)
          if (!cur || !prevCell || cur.version !== prevCell.version) return prev
          const out = new Map(prev)
          out.set(key, prevCell)
          return out
        })
        return { error: error?.message ?? 'set_cell failed' }
      }
      // Adopt the authoritative version so our own CDC echo is dropped.
      // Marks live on the same row and aren't touched by a fill, so carry
      // the current ones through.
      const held = cellsRef.current.get(key)
      applyRow(row, col, {
        fill,
        pencil: pen,
        revealed: held?.revealed ?? false,
        wrong: false,
        markRight: held?.markRight ?? null,
        markBottom: held?.markBottom ?? null,
        version: data.version,
      })
      return { solved: data.solved }
    },
    [gameId, applyRow],
  )

  // Set / clear a cryptic edge mark on the caller's grid cell. Same
  // optimistic + version-guarded-rollback shape as setCell, minus the solve
  // (marks are display-only). `next` is null to clear the edge.
  const setMark = useCallback(
    async (row: number, col: number, side: MarkSide, next: MarkType | null): Promise<SetMarkResult> => {
      const key = cellKey(row, col)
      const prevCell = cellsRef.current.get(key)
      const field = side === 'right' ? 'markRight' : 'markBottom'
      // Optimistic echo (keep the current version — the RPC returns the real one).
      setCells((prev) => {
        const cur = prev.get(key)
        if (!cur) return prev
        const out = new Map(prev)
        out.set(key, { ...cur, [field]: next })
        return out
      })
      const { data, error } = await db
        .rpc('set_mark', {
          target_game: gameId,
          p_row: row,
          p_col: col,
          p_side: side,
          p_mark: next as string, // nullable text param; PostgREST passes null fine
        })
        .single()
      if (error || !data) {
        // Roll back only if no newer authoritative write landed mid-RPC.
        setCells((prev) => {
          const cur = prev.get(key)
          if (!cur || !prevCell || cur.version !== prevCell.version) return prev
          const out = new Map(prev)
          out.set(key, prevCell)
          return out
        })
        return { error: error?.message ?? 'set_mark failed' }
      }
      // Adopt the authoritative version; the whole cell is otherwise unchanged.
      const held = cellsRef.current.get(key)
      if (held) applyRow(row, col, { ...held, [field]: next, version: data.version })
      return { ok: true }
    },
    [gameId, applyRow],
  )

  return { cells, setCell, setMark, loading }
}
