import { useCallback, useEffect, useRef } from 'react'
import type { GenericFeedbackApi, MenuApi } from '../../lib/games'

/**
 * Registers an "End game" item in a PlayArea's per-game HEADER menu and
 * wires its confirm → RPC → error-pill flow.
 *
 * ⚠️ **Currently unused — kept as reference scaffolding.** The v3 layout
 * moved the "we're done" affordance out of the header menu and into each
 * game's InfoCol as a plain `<EndGameButton>` (`common/components/buttons/
 * EndGameButton.tsx`), which all ten games now render directly. So this
 * hook has **zero consumers** today. It's retained (not deleted) as the
 * documented pattern for the menu-based approach, should a future game
 * want its End-game in the header menu rather than the info column — the
 * confirm-dialog + error-pill + menu-sync contract is non-obvious enough
 * to be worth keeping written down. Delete it if that never materializes.
 *
 * What it does when wired: `common.end_game` writes a neutral terminal
 * (`play_state='ended'`, everyone `{won:false}`) so a group can abandon
 * an in-progress game without it counting as a win or loss (see
 * docs/common.md → "Manual end").
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
  feedback: GenericFeedbackApi
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
