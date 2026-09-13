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
- **The lost-event failure mode** — how it was measured, what the console trail
  looks like when it happens, and which kinds of test can see it — is
  [docs/realtime-lost-events.md](../../../docs/realtime-lost-events.md).
- **The tests keep four channel doubles, deliberately.** `channel.fake.ts` is
  the shared one, for a test that drives a hook through subscribe, presence and
  teardown; the three narrower ones live in the tests that need less than that,
  and one of them needs a channel this folder has *not* instrumented, because
  the instrumentation is what it is testing.
