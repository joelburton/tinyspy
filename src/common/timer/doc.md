# timer

The game clock — one integer counting the seconds somebody was actually playing
— and the words a configured timer is described in.

## Intro to area

A clock in this app is shared. Several people on several devices watch the same
countdown, and between them they pause the game, wander off, close a tab and
come back an hour later. The obvious implementation is to write down when the
game started and subtract: minus the pauses, minus the idle windows, minus
whatever a player was doing while nobody was looking. That is an accumulator,
and an accumulator is only as good as the last write nobody missed — a crashed
tab never gets to record the gap it opened, so the clock quietly counts an hour
of nothing as an hour of play.

So the clock does not measure elapsed time at all. It counts ticks. The whole
of it is `common.timers.ticks`, a single integer, and `common.tick_timer`, which
advances that integer by at most one per real second no matter how many people
ask. Every client with the game live in front of it asks once a second; the
server's own `now()` decides whether the count moves, so a client with a skewed
clock or a throttled background tab can only *trigger* the attempt, never move
the number. The count that comes back is what everyone shows.

What falls out is that there is nothing to maintain. A paused game, an idle
game and a killed tab all stop the same way — nobody asks, so nothing counts —
and there is no accumulator to fold, no cleanup that has to fire, no gap to
remember on the way back. A second with no tick is, by construction, a second
that did not count. The price is about a second of slack around a pause, which
is the right trade for friendly word games.

Everything on screen is then derived from that one integer. Countup shows the
count, countdown shows what is left of the configured seconds, an untimed game
shows nothing, and the whole display is a pure function of a number the server
owns. `useCommonGame` runs the hook for every game; `GamePage` prints the number
in the header and is the one that fires the timeout-loss RPC when a countdown
runs out. The other half of the folder never touches the clock at all: the setup
dialog and the setup recap have to say which timer a game was configured with,
and `timerLabel` is the sentence they both print.

## Details

**`expired` is a level, not an edge**, and the distinction matters to the
caller that fires the timeout. It is true for as long as a countdown sits at 0,
which is what the games want — "did the clock end this?" is a fact about a
terminal game, and it survives a reload. What it is not is a trigger: `GamePage`
wants the moment, builds the edge with a ref it mutates inside an effect, and
gates it on `paused` so a timeout that comes due as a pause engages resolves on
resume. The edge stays there because a hook cannot hand one back safely.
Computed during render, StrictMode's second pass finds the ref already set and
returns false, and the second pass is the one React keeps — the timeout would
never fire in development. An effect runs once per commit, which is why
`GamePage`'s ref works where the hook's would not.

**Local ticks merge forward-only — except against a big drop.** Several players
poll the same clock, so responses land out of order and differ by a tick or
two; those are floored with `Math.max` so the display never rewinds. A drop
bigger than that is not reordering, it is `common.reset_game` zeroing the clock
on a replay, and the display has to follow it back down to a fresh countdown.
`mergeTicks` splits the two by size, and a stale high response landing just
after a reset is re-detected by the next round-trip a second later.

**The poll decides what to do per answer, rather than presenting faults.** It
runs once a second, so anything automatic is a modal a second. Nothing reached
the server is silent — a tick that did not happen is what the clock does anyway
when nobody is watching, and the next call that lands returns the authoritative
count. A signed-out or no-longer-a-member answer is shown, because the page is
being unmounted underneath it. A deleted game is moot. Anything else is a
scream. The seed read matches the driver deliberately: the two fail together,
on the same network in the same second, so presenting one while the other
stayed silent would put a modal on the mount and nothing on the next forty
attempts.

**The SQL half is one table and one conditional.** `common.timers (game_id,
ticks, last_tick)` is its own table rather than a column on `common.games`, so
the per-second UPDATE does not churn the games realtime stream. `tick_timer`'s
`now() - last_tick >= 1 second` is the whole of dedup, pause and idle in one
line. `common.reset_game` zeroes the row on a replay, the view-state RPCs are
pointer flips that do no timer work, and `common.require_valid_timer` validates
the setup shape at create time — its five raises are all faults (PN035–PN039),
because the timer control cannot produce any of them. The conditional is pinned
by `supabase/tests/common/tick_timer_test.sql`, which rewinds `last_tick` by
hand instead of sleeping: one advance per real second however many players
ask, a minute's gap costing one, and a deleted game answering moot.

**M:SS is written once**, in `timerLabel.ts`, which is the file that owns the
timer's words: `formatTimerSeconds` for the header and the countdown input,
`timerLabel` for the setup recap's "none · count-up · 2:30 countdown". The hook
file is the clock and nothing else, so a component that only wants to print a
number does not pull in the poller to get it.
