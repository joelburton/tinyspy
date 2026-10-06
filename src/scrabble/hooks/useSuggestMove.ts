// cs-unmet

import { useCallback, useRef, useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { GGameData, GPlacement, GRankedMove, GSuggestState } from '../types'

/** What `scrabble-suggest-move` puts in `data`. Two `ok`s because the panel
 *  says two different things — a ranked list, or "No legal moves — swap
 *  tiles?", which is advice and only right when the generator actually
 *  searched. `version` rides on both: the staleness rule applies either way. */
type Suggested =
  | { result: 'suggested'; moves: GRankedMove[]; version: number }
  | { result: 'no-legal-moves'; version: number }
  | null

/**
 * Coop's suggest-a-move: the Suggest action, the panel's state, and the way a
 * picked suggestion reaches the rack. The info column draws the panel and
 * places the action; the board column registers the applier that stages a
 * suggestion's tiles, since staging is its job.
 *
 * Hidden in a race, where a suggested play would be a win button and would
 * read a rack that is not the team's.
 */
export function useSuggestMove(gd: GGameData): {
  // The panel's state, as the info column draws it.
  view: GSuggestState
  actSuggestMove: Action
  // Stage a picked suggestion's tiles on the board.
  apply: (move: GRankedMove) => void
  // The board column hands over how it stages tiles; null on unmount.
  registerApplier: (fn: ((placements: GPlacement[]) => void) | null) => void
} {
  const [suggest, setSuggest] = useState<GSuggestState>({ status: 'idle' })
  const applierRef = useRef<((placements: GPlacement[]) => void) | null>(null)
  const registerApplier = useCallback((fn: ((placements: GPlacement[]) => void) | null) => {
    applierRef.current = fn
  }, [])

  async function askForSuggestions() {
    setSuggest({ status: 'loading' })
    const res = await runEdgeFn<Suggested>('scrabble-suggest-move', { game_id: gd.id })

    if (res.type === 'not-ok' && res.severity === 'fault') {
      // The panel resets to idle. `runEdgeFn` has raised the modal, and a fault
      // leaves nothing to put on the panel's line (docs/ui.md → Faults).
      setSuggest({ status: 'idle' })
    } else if (res.type === 'not-ok') {
      // `get_suggest_context`'s own refusals, relayed in their own words.
      setSuggest({ status: 'error', message: res.message })
    } else if (res.type === 'ok' && res.data?.result === 'no-legal-moves') {
      setSuggest({ status: 'ready', moves: [], version: res.data.version })
    } else if (res.type === 'ok' && res.data?.result === 'suggested') {
      // Kept even when its version is ahead of the blob's: the answer is the
      // database's fresh board, which the blob is about to catch up to. The
      // stale rule below is the one judge.
      setSuggest({ status: 'ready', moves: res.data.moves, version: res.data.version })
    } else {
      reportUnhandled('scrabble-suggest-move', res)
      setSuggest({ status: 'idle' })
    }
  }

  // Gray while a request is out, so a second press can't stack two.
  const actSuggestMove = useBindAction('act-suggest-move', {
    describe: () => {
      if (gd.compete) return 'hidden'
      return { state: gd.ended || suggest.status === 'loading' ? 'disabled' : 'active', label: 'Suggest' }
    },
    run: askForSuggestions,
  })

  // A ready list clears the moment the board moves past it — most often
  // because the player just played the suggested move — and once the game is
  // over, since a Stop does not move the version. Worked out each render, so
  // nothing has to clear it.
  const isStale = suggest.status === 'ready' && (gd.ended || suggest.version !== gd.version)

  return {
    view: isStale ? { status: 'idle' } : suggest,
    actSuggestMove,
    apply: (move) => applierRef.current?.(move.placements),
    registerApplier,
  }
}
