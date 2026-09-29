# DO NOT READ — one shaped copy for the game page (ideas only)

**DO NOT READ THIS FILE unless Joel names it.** It records an exploration, not
a plan: nothing here is approved, decided or scheduled. No session builds from
it, folds it into an area or a plan, or cites it as precedent. Joel, while
writing it down: *"i'm not suggesting this for now; just playing with the
idea."* Every leaning below is marked as whose it is.

Opened 2026-09-28, during common-tables step 5 (psychicnum's front end), from
the question of which facts the page needs that the statuses do not already
carry.

## The idea

Each game's status builder (`<game>._write_statuses`) writes one copy of
**everything the game page shows** onto `common.games`, shaped for the page.
The front end reads that copy and nothing else from the game's own tables;
the RPCs keep working on the real tables. Joel: *"a kind of insulate FE from
the 'real' data; package up what's needed; reduce the number of loads. of
course, the RPCs would still have access to the 'real' info."*

It is where the statuses and `clubpage_info` already point, taken to the whole
page: today they are a copy shaped for the info column, the strip and the club
line.

## The reads, for psychicnum

Today the game page makes seven reads:

| read | what for |
|---|---|
| `common.games` | the game row |
| `common.game_players` | each player's ending, ranking, `player_status`, turn seat |
| `common.timers` | the timer's kind and countdown length |
| `common.profiles` | each player's username, color, bot flag |
| `psychicnum.games_state` (view) | the board's words, and the secrets once ended |
| `psychicnum.players` | each player's guesses used and secrets found |
| `psychicnum.events` | the event log and the board's colors |

What the copy would need to take each one over:

- `psychicnum.players`: nothing more. `player_status` already carries
  `guesses_used` and `found_secrets_count`.
- `psychicnum.games_state`: `words` and `secrets` in `game_status`
  (`max_guesses` is there already). Joel: the current stance is that hiding
  the secrets does not matter, so no view is needed for them.
- `common.game_players`: every player's columns folded into one jsonb on
  `common.games`.
- `common.timers`: its two values copied onto `common.games` (Joel: *"it
  would be easy"*).
- `common.profiles`: the username, color and bot flag copied too. Joel, on the
  "no username in a status" ruling: *"i suspect i wrote that concern back when
  i worried about that being stale — but the most stale it could be would
  before the very first thing that trigger the builder-functions."*

That leaves two reads, `common.games` and the game's events table, which stays
its own read. A profile color change reaches an open game only at the next
move; Joel: not a blocker, and a `common.profiles` subscription would fix it
at three reads.

## What it wins (Joel's list)

- **Fewer loads**, and so simpler loading and reloading: `PlayAreaLoader`'s
  gates and each `useGame`'s load mostly go for the games that fit.
- **Nothing sent twice.** The page throws away the subscription's row today
  and re-reads it.
- **Possibly a smaller load**, and if bulk ever mattered the copy's keys are
  free to be short, since they need not match any column name.
- **One place for each thing the page asks.** Joel: *"we can't ever fall into
  'the FE reads some things from here, and other things from here, even
  though it's the same thing it's asking for' — now there would be one
  thing."* It enforces the FE-shows-shaped-data, database-has-the-logic split.
- **Simpler security rules.** Lock down every table but `common.games`; what
  is secret is answered by reading one view.

## Costs, and Joel's answers

- **Everything the page shows goes through the builder.** Joel is 50-50 on
  whether that is a cost: a fact the builder misses is noticed at once, and it
  pushes the logic further into the database.
- **A shape change needs a rebuild of every past game**, or the front end
  breaks on old copies. Joel: most changes to what a page shows need a schema
  migration already, and the builders are cheap and easy to run.
- **A write that skips the builder leaves the copy stale** (crosswords' cells,
  bananagrams' board saves). Joel: those two will always need special care, a
  tweaked approach or tables of their own.
- **The builder becomes each game's whole front-end API.** Small for
  psychicnum. codenamesduet would not get much bigger: one aggregate over its
  25 `words` rows, and its seats, both key cards and turn copied from its
  games row (both key cards are readable by both players today). The hard
  cases are scrabble, crosswords and perhaps bananagrams (whose board is
  already mostly opaque to the backend).
- **Size of the change message.** Realtime sends the changed row to every
  subscriber, the club page included, which only uses it as a signal to
  re-read its list. Nothing for psychicnum; a real cost for re-sending
  crosswords' grid. Supabase caps a change message's size; the cap, and what
  happens to a row over it, are unchecked.
- **Two patterns in the codebase**: the games that fit read the copy, the hard
  ones read their own tables, named per game.

## Privacy, if it matters again

A security rule decides per row, so it cannot hide a key inside a plain jsonb
column. A view can shape the answer per caller (the whole copy once the game
has ended; another racer's private keys left out during play, on
`auth.uid()`). The private part lives in a column clients are not granted,
since a Realtime message carries the row, not the view's answer; a change on
a table with an ungranted column still reaches the subscriber, without that
column (tested on the local stack, 2026-09-27).

Joel's extension: if a view is there anyway, grant clients almost none of
`common.games`' columns and read everything through the view, so every change
message is a bare nudge. Unchecked: whether a subscription's filter column
(`id` on the game page, `club_handle` on the club page) must be granted. The
club page's list would read through a view as well.

## The subscription as a nudge

A Postgres Changes subscription has no setting that trims its columns; it
sends the whole row minus ungranted columns, with `old` whole only under
`REPLICA IDENTITY FULL` (which `common.games` is). The page could apply `new`
directly, but it still needs a full read on mount and after every reconnect,
since a change during a disconnect or the deaf window never arrives. Three
ways to a bare "something changed":

1. A tiny table the builder touches, `(game_id, changed_at)`, subscribed to
   in place of `common.games`: the same kind of subscription the app uses
   everywhere, for one extra small write per move.
2. Broadcast from the database (`realtime.send` from a trigger, any payload):
   the exact nudge, but it needs private channels and a rule on who may
   listen, which the app has not set up. Unchecked against Supabase's docs.
3. Ungranted columns and a view (above).

## Shaping the builder

Joel: break a builder into named pieces even with one caller —
`_make_json_board`, `_make_json_words` and the like. Each piece can be tested
alone in pgTAP, and a plain `language sql` function returning `jsonb` reads as
the one query it is.

## If it is ever tried

psychicnum is the natural first game: it is where shared shapes are settled
first, and it has none of the hard cases.
