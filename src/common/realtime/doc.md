# realtime

How a change one friend makes reaches everyone else's screen, and what it takes
to trust that it did. Everything here rides on Supabase channels; what can go
wrong with them is silent by construction, so the same layer that opens a
channel also writes the console trail you read when a page has quietly stopped
updating.

## Intro to area

The whole game lives in Postgres, so a move is a write, and every other player
is a browser that has to find out about it. Supabase's answer is a channel: a
named connection over one websocket that can carry three different things —
changes to rows in a table, a roster of who else is currently on it, and
messages peers send each other directly. This folder owns how the app opens
those, keeps them alive, and notices when one has stopped working.

One question shapes almost everything: **is the channel's name private or is it
the room?** A channel that only watches a table is private. Every browser is
told about the table independently, so no two of them need the same name, and
the name can be anything at all — which turns out to matter, because
supabase-js caches channels by name and hands back a dying one if you reopen a
name it is still closing. Giving each of those a random suffix means the
collision cannot happen. But a channel carrying presence or peer messages is
the opposite: the name *is* the room, and every peer must pass the identical
one or they cannot see each other. Those cannot take a suffix, so they need the
other half of the fix — wait for the old channel to finish leaving before
joining the same name again. Both halves live here, and which one a new channel
needs is settled by that single question. A channel with any shared cargo is in
the second group even if it also carries table changes.

The default way a hook consumes table changes is to **reload its rows rather
than apply the event**. The data behind one game is small, a fresh read is
cheap, and merge-the-payload logic is where subtle bugs live; the same reload
also happens to be the right move after a reconnect, so one mechanism covers
both. Some hooks genuinely need something else — chat appends rather than
reloads, a crossword applies each cell so several people can type at once — and
each says so where it is written.

The hard-won part is that **a channel reporting `SUBSCRIBED` is not yet
watching your table.** That status is only the server accepting the topic;
attaching the subscription to the thing that reads the write-ahead log is a
second step that finishes later, and a row written in between is never
announced to anyone — not delayed, dropped. So a hook that read its rows on
`SUBSCRIBED` can be holding the last picture it will ever get, with nothing
left to prompt it. Every table-watching hook here therefore reads twice: once
on the join, and again when the server confirms the attach. That failure has no
error and no symptom other than a page that stops changing, which is also why
the console trail is always on for everyone rather than behind a debug flag —
when a friend hits it, the evidence is already in their console.

Presence in this folder is the **club orbit**: who is around, which game they
are looking at, and whether someone is in the middle of setting one up. It
answers questions the club page asks — light the members who are here, clear a
current-game pointer nobody is actually in, warn the others before two people
start the same game. The presence that pauses a game in progress is a different
roster on a different channel and belongs to the game page. What is shared is
the reason presence is used at all: it expires by itself when a tab closes or a
network drops, so unlike a flag written to a table there is no "I left" message
to miss.

Finally, the socket underneath all of this can die quietly — a laptop lid
closes, and what comes back is a connection that looks open and carries
nothing. Supabase notices eventually on its own heartbeat, which is far too
late for someone staring at a stalled board. One listener mounted once for the
whole app reopens the socket the moment the tab is looked at again or the
network returns; every channel rejoins behind it, which re-announces presence
and re-reads the rows.

## Details

- **Which channel is which** is not listed here. The channel-name registry in
  [docs/supabase.md](../../../docs/supabase.md) is every channel in the app in
  one place, including whether each one's name is shared.
- **The deaf window is multi-second, and the event in it is dropped, not
  late.** Measured on the local stack, `system ok` arrives about 2–3s after
  `SUBSCRIBED` on a warm tenant, and seconds more while the tenant is booting;
  every row committed before `system ok` was lost, and every one after it
  delivered. A refetch-on-event hook heals a mid-window loss at the next event
  that does arrive, so the damage is when the lost event is the LAST one — a
  coop win, a partner's final move. The width on hosted Realtime has not been
  measured; the mechanism is protocol-level, so it exists there too.
- **The local tenant stops itself when nobody is connected**, after roughly
  12–15 idle minutes, and boots again on the next connection — so the first run
  after a break meets the slow-boot window, not only a restarted container.
- **`e2e/realtime-deaf-window.e2e.ts` guards the attach refetch** in two
  layers: a deterministic check that the `(attached)` refetch line follows
  `system ok` on a plain page load, and a best-effort end-to-end test that
  lands a terminal write inside a real window (CPU-capped tenant, restarted)
  and asserts the verdict still arrives. The window's width depends on machine
  load, so when no attempt can land inside it that test SKIPS with the widths
  it measured rather than failing.

## Reading the `[rt …]` trail

`realtimeDiag.ts` writes these for every channel, always on:

| line | meaning |
|---|---|
| `<topic> — status SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED` | a subscribe-status transition; the failures are `console.warn` |
| `<topic> — system ok: Subscribed to PostgreSQL` | the server really carries this channel's table subscription — the all-clear |
| `<topic> — event UPDATE common.games` | a delivered row change, with the payload's `errors` when set |
| `<topic> — broadcast "manualPause"` | a delivered broadcast |
| `<topic> — refetch #3 (event)` | `useRealtimeRefetch` reloaded, and why: `mount` / `subscribed` / `attached` / `event` |
| `game:<id> — load #2: play_state=playing terminal=false players=2` | what `useCommonGame`'s load saw |
| `<topic> — unsubscribing` / `teardown ok` | a deliberate leave, so it is not mistaken for a channel gone quiet |
| `<topic> — teardown timed out` / `teardown FAILED` | a leave that did not complete; a timed-out one is what wedges a re-join of the same name |
| `socket — heartbeat timeout` / `disconnected` | the socket itself is in trouble (routine pulses are not logged) |

Healthy is `status SUBSCRIBED` then `system ok`. A channel with `SUBSCRIBED`
and never a `system ok` is fully deaf. A stale page whose last lines are a
`(subscribed)` or `(attached)` refetch, with no `(event)` refetch after a
partner's move, lost that move. The raw socket log, every push and receive, is
behind `localStorage.setItem('puzpuzpuz:rt:verbose', '1')` and a reload.

## A page that has stopped updating

1. **Lost or late?** Re-run with a much longer timeout. A late event arrives
   eventually; a lost one never does, and widening a timeout only makes the
   failure slower and hides it.
2. **Did the server do its half?** Read the row the page should have heard
   about, `common.games.play_state` for a game that should have ended. If it
   changed, the fault is delivery, not game logic.
3. **Is the table published?** A table missing from `supabase_realtime` kills
   the whole channel silently ([docs/supabase.md → The publication
   invariant](../../../docs/supabase.md#the-publication-invariant-load-bearing)).
   This is the cheap check when EVERY update is missing.
4. **Did the tenant restart?** Locally,
   `docker logs supabase_realtime_codenames 2>&1 | grep -E "Stop tenant|:channel, :joins"`;
   a stop/start pair just before the failure is the slow-boot window.
5. **Is it realtime at all?** A test that changes a player's frontend-owned
   state by RPC while that player's page is open will see the page write its
   own copy back over it, which looks exactly like a lost event.
- **The tests keep four channel doubles, deliberately.** `channel.fake.ts` is
  the shared one, for a test that drives a hook through subscribe, presence and
  teardown; the three narrower ones live in the tests that need less than that,
  and one of them needs a channel this folder has *not* instrumented, because
  the instrumentation is what it is testing.
