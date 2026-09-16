// cs-met-pause-suspend

import type { ConfirmOptions } from '../floating-panels/confirmations'

/**
 * The question asked when a member presses Back-to-club on a MULTIPLAYER game
 * that is still going — `GamePage` awaits it through `askConfirmation`, the way
 * every question in the app is asked.
 *
 * Pass the game's title: the words name what is being shelved, which is why
 * this is a function and not a constant like `END_GAME_CONFIRM`.
 *
 * Suspending is not dangerous by itself — the game shelves into the club list,
 * resumable — but it drags every viewing peer back to the club page, and that
 * surprise is what earns a confirm. A solo game has nobody to surprise and a
 * finished one has nothing to shelve, so neither is asked; docs/states.md →
 * "Leaving the game page — terminal vs non-terminal" holds that split.
 */
export function suspendConfirm(title: string): ConfirmOptions {
  return {
    title: 'Suspend this game?',
    message: (
      <>
        <strong>{title}</strong> will be moved out of the active slot.
        Everyone in this game will return to the club page; you can
        resume from there later.
      </>
    ),
    confirmLabel: 'Suspend',
    cancelLabel: 'Keep playing',
  }
}
