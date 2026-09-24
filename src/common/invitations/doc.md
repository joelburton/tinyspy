# invitations

Being added to a game by a friend, and how you hear about it: a watcher that
notices, the small pure pieces that decide whether a game is news to you, and a
headless component that turns the answer into toasts. [docs/common.md → Joining
a game](../../../docs/common.md) owns the rule this folder serves.

## Intro to area

When someone in your club starts a game, they choose who plays, and the game
seats everyone at that moment. But nobody is pulled onto the game's page. You
are told, wherever you happen to be in the app, and you go when you choose; the
game waits for you, paused, until everyone it seated has arrived. This folder
is the telling: the announcement that "Moth added you to a new spellingbee game",
with a Join button beside it.

The app finds out you were seated by two paths. While you are online, the
database reports the row that seated you the instant it is written, and the
invitation appears at once. But a live subscription only reports what happens
while it is listening, so on every connect and reconnect the hook also asks the
database directly for the recent, unfinished games you are seated in, to catch
an invitation sent while your tab was closed or your connection was down. Both
paths feed one scan, and the scan decides what is actually news.

Not every game you are seated in is an invitation. Games you created are yours
already. Games whose invitation you have already been shown are recorded, on
this device, in a small seen set, so a reload or a reconnect does not nag twice
about one thing. Showing an invitation is what marks it seen, which means a
dismissed one and a joined one are equally seen, and the way back to a game
you ignored is the club page, which still lists it. And games older than an
hour are not asked for at all. That last bound exists because an abandoned game
never finishes, so it never stops being "unfinished": without an age cap the
pool of candidates would be every game you ever walked away from, and all of
it would arrive at once the first time you signed in from a device whose seen
set was empty. The seen set and the age cap answer different questions, and
for a while each hid the other's absence.

An invitation is a nudge, not the only route in, and entering the game by any
route at all counts as answering it: the toast's own Join, the club's game
card, a shared link, the back button. The invitation is dropped from the list
on the very render the URL first points at that game, so it cannot flash for
the game you are already looking at and does not come back when you leave. The
visible list is then mirrored into the toast store by a component that renders
nothing of its own, one toast per game, so an invitation lands in the same
corner as every other announcement and an open chat panel never covers it.

## Details

- **Mounted at the root, after the claim-handle gate.** An invitation can
  appear on any real page and never over the sign-in or claim screens.
- **The scan is one inner-join query, and the age bound rides on it,** so stale
  rows never leave the database. The "new to you" filter is pure and tested
  apart from the hook, because it is the only part with arithmetic to test.
- **`INVITE_MAX_AGE_MS` is an hour, judged by the client clock.** Its docstring
  says why an hour and what a skewed clock would cost.
- **The seen set lives in `localStorage` and is capped** to its most recent
  ids (`SEEN_CAP`). An empty set, on a new device or after clearing storage, is
  the normal case rather than an error; the worst that follows is one
  invitation shown a second time.
- **The reconnect rescan also fires when the postgres_changes attach is
  confirmed,** not only on the join ack, because an insert committed between
  the two is otherwise lost (`common/realtime/postgresAttached.ts`).
- **The ✕ fires the toast's `onClose`; Join does not.** Joining removes the
  invitation from the list, which retires the toast through the mirror, and
  marking it dismissed would record something nobody did.
- **The prune on entering a game is a render-time state adjust, not an
  effect.** There is no extra commit, and it cannot lag a frame behind the
  navigation. The render-time filter beneath it is what prevents a one-frame
  flash.
- **A failed name lookup keeps the invitation.** "Someone added you to a new
  game" is worth more than no invitation. A failed scan drops only this round,
  since the next insert or reconnect scans again.
- **Unmounting dismisses its own toasts,** so a sign-out leaves none lingering
  over the sign-in screen.
