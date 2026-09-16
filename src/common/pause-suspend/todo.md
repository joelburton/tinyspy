# pause-suspend — todo

## Bugs

## Soon

- **Ask the suspend question through `askConfirmation`, like every other
  question.** `SuspendConfirmationBlockingModal` is the one place that renders
  `<ConfirmationBlockingModal>` by hand; docs/ui.md → Confirm modals says the
  service is the only way to ask, and this is its one exception. Handed from
  `floating-panels`, 2026-09-11. What the fix needs:
  - **Where it is today.** `GamePage.requestBackToClub` has three shapes:
    terminal → navigate; solo mid-game → `sendSuspend()` at once; multiplayer
    mid-game → `setConfirmingSuspend(true)`, and the page renders the wrapper
    while the flag is up. The flag has no other reader, and nothing else
    renders the wrapper. The wrapper holds the words (one of them the game's
    title) and two callbacks: clear the flag, or `sendSuspend()`.
  - **The fix.** The multiplayer branch becomes
    `if ((await askConfirmation(suspendConfirm(commonGame.title))) === 'confirm') sendSuspend()`
    — the shape scrabble's Pass already uses from inside a callback. The flag,
    the render and the wrapper file go.
  - **The one decision.** The words interpolate the title, so the question is
    a FUNCTION of it, not a constant like `END_GAME_CONFIRM`. Keep it in this
    folder (ui.md calls suspend "the page's own"), replacing the wrapper file,
    rather than beside the three canonical questions in `floating-panels`.
    `ConfirmOptions.message` is a `ReactNode`, so the `<strong>` title stays.
  - **Tests.** `GamePage.test.tsx` already mocks `askConfirmation` (answers
    `'confirm'` by default). The multiplayer case stops looking for the
    question's text and asserts the service was asked with the suspend words
    and `sendSuspend` ran after; add the answer-no case. The solo case asserts
    the service was NOT asked. `e2e/suspend-dialog.e2e.ts` drives this question
    end to end and must stay green UNCHANGED: it asserts "Suspend this game?"
    visible, hidden and absent, cancels with Esc, confirms with Enter, and reads
    "Keep playing" out of the dialog's Tab ring, solo and multiplayer.
    `askConfirmation` renders the same `ConfirmationBlockingModal`, so every one
    of those handles survives the move. No floating-panel behavior changes.

## Someday

## Maybe
