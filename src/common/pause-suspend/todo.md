# pause-suspend — todo

## Bugs

## Soon

- **The overlay has had no mobile pass.** No `*-mobile.e2e.ts` covers the
  pause banner below the breakpoint. Its stylesheet caps the banner at 32rem and lets the action
  row wrap, but nobody has measured it on a phone — three buttons, a roster,
  and both source sentences at once is the case to look at. Check it there and
  record it in that doc.

## Someday

## Maybe

- **A player whose connection drops sees no pause; everyone else does.** Pause
  is computed from `presentUserIds`, which only the server's presence sync
  updates, so when your own socket dies your set stays frozen with everyone in
  it and `computePause` says false: your peers see the overlay naming you, and
  you see a board that has quietly stopped. `useCommonGame` reacts to
  `SUBSCRIBED` only, never to `CLOSED` / `CHANNEL_ERROR` / `TIMED_OUT`. Several
  `tick_timer` failures in a row could say "I can't reach the server", but the
  tick stops while paused and never runs in an untimed game. Which signal
  should decide?
- **`common.games.paused` is never read or written.** Pause is computed on the
  client from presence and the manual-pause broadcast; the column was reserved
  for a pause that outlives every tab closing. Either build that, or drop the
  column in a forward migration.

## Won't do
