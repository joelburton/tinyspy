import { useCallback, useEffect, useRef } from 'react'
import type { FeedbackApi, MenuApi } from '../lib/games'

/**
 * Registers the "End game" item in a PlayArea's per-game menu section
 * and wires its confirm → RPC → error-pill flow.
 *
 * Every game offers the friends an explicit "we're done" affordance —
 * `common.end_game` writes a neutral terminal (`play_state='ended'`,
 * everyone `{won:false}`) so a group can abandon an in-progress game
 * without it counting as a win or loss. See docs/common.md → "Manual
 * end". The PlayArea-side scaffolding around that RPC was duplicated
 * verbatim across six games (a confirm dialog, the error→feedback pill,
 * and the menu-sync effect that registers the item and clears it on
 * unmount); this hook pins that contract in one place so future games
 * drop into the same shape.
 *
 * The caller supplies `endGame` as a thunk rather than passing its `db`
 * handle, because each game's `db` is typed to its own schema — keeping
 * the `.rpc('end_game', …)` call at the call site keeps it fully typed
 * while the hook stays schema-agnostic:
 *
 *     useEndGameMenu({
 *       isTerminal,
 *       menu,
 *       feedback,
 *       endGame: () => db.rpc('end_game', { target_game: gameId }),
 *     })
 *
 * Must be called unconditionally (it runs hooks), so place it above any
 * of the PlayArea's early returns.
 *
 * Two games deliberately do NOT use this hook and own their menu wiring
 * directly:
 *   - `wordknit` — its menu carries a second, game-specific "Hint" item
 *     and gates on elimination state.
 *   - `freebee` — it routes the end-game error to its own in-body
 *     feedback surface (the word-result `<Feedback>`), not the common
 *     header pill this hook uses.
 */
export function useEndGameMenu({
  isTerminal,
  menu,
  feedback,
  endGame,
  confirmMessage = "End the game now? You can't undo this.",
}: {
  isTerminal: boolean
  menu: MenuApi
  feedback: FeedbackApi
  /** Fires the game's `end_game` RPC. Returns the PostgREST-style
   *  result so the hook can surface `error.message` if it fails.
   *  `PromiseLike` (not `Promise`) so a `db.rpc(...)` builder can be
   *  passed straight through without an `async` wrapper. */
  endGame: () => PromiseLike<{ error: { message: string } | null }>
  /** Override the confirm-dialog copy; defaults to the standard line. */
  confirmMessage?: string
}): void {
  // Mirror the latest props into a ref so the menu's onClick handler can
  // stay referentially stable. Call sites pass a fresh `endGame` thunk
  // each render; without this the click handler would change every render
  // and re-run the menu-sync effect (re-replacing the items) needlessly.
  // The ref is synced in an effect (not during render) so the handler
  // always reads up-to-date values when it actually fires on click.
  const latest = useRef({ isTerminal, feedback, endGame, confirmMessage })
  useEffect(() => {
    latest.current = { isTerminal, feedback, endGame, confirmMessage }
  })

  const handleEndGame = useCallback(async () => {
    const { isTerminal, feedback, endGame, confirmMessage } = latest.current
    if (isTerminal) return
    if (!window.confirm(confirmMessage)) return
    const { error } = await endGame()
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'closeable' } })
    }
  }, [])

  // The effect re-runs only when `isTerminal` flips (so the item's
  // `disabled` state tracks it) or `menu` identity changes — not every
  // render, thanks to the stable handler above.
  useEffect(
    function syncMenuItems() {
      menu.setGameItems([
        {
          id: 'end-game',
          label: 'End game',
          onClick: () => void handleEndGame(),
          disabled: isTerminal,
        },
      ])
      return () => menu.setGameItems([])
    },
    [handleEndGame, isTerminal, menu],
  )
}
