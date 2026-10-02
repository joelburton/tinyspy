# States: view, ending, and the suspend/current/pause vocabulary

Canonical reference for how view state and a game's ending are split on
`common.games`, and how the suspend / pause / current concepts compose. Don't
conflate "the game the club is currently focused on" with "the game hasn't
ended" — those are orthogonal axes and naming has to keep them separate: never
call either one "active".

The split that drives everything below: **view state and the ending are
orthogonal.** A current game might already be won. A finished game might have
nobody viewing it. The two axes don't constrain each other.

## View states

These describe where a game sits in the club's "what are we looking at right
now" picture. They're club-wide, not per-member.

### current

A game is **current** iff at least one club member is viewing its GamePage right
now. ("In" a game means viewing — there's no other sense. A member who was
`common.game_players`-seated in a non-current game is no longer "in" it; they're
a previous player.)

**Invariant: at most one current game per club.** Enforced by a partial unique
index on `(club_handle) where is_current_view = true`.

**Why we mark this:** the club page can show a "Currently being viewed: <game>"
affordance so a member typing the club URL can jump straight back to where the
group is. And it enforces the one-game-at-a-time invariant structurally.

**Concurrency:** if two members on the club page simultaneously open different
non-current games, the partial unique index serializes the two writes.
Last-click wins: the second to commit clears the first's flag and sets its own.
Each member is in the game they opened; the club's current-game *pointer* just
ends up on the winner's, and the games list reflects that on the next realtime
refresh (nobody is auto-snapped anywhere — auto-nav is gone). The race is
vanishingly rare in practice (clubs coordinate over chat: "wanna pick up
crossword A or B?"), and the resolution is harmless.

### paused

A game is **paused** when its presence-pause OR manual-pause is in effect. Only
the current game can be paused — pause is meaningless for a game nobody's
viewing.

The two sources stay as today:
- **Presence-pause**: someone in `common.game_players` isn't currently connected
  to the channel.
- **Manual-pause**: someone clicked Pause; broadcast to peers.

**Getting out of a pause.** Presence-pause clears itself the moment the missing
player reconnects — and to make that reliable after a laptop sleep,
`useRealtimeReconnect` (mounted in `App.tsx`) forces
`supabase.realtime.connect()` on tab focus / `visibilitychange`→visible /
network `online` when the socket is down. Without it, Supabase's own ~25s
heartbeat is slow to notice a socket that died during OS sleep, so a game can
sit **wedged** in the pause overlay until a manual refresh (two players who both
walk away — "unofficially paused for dinner" — are the classic case). As a
manual backstop when a pause won't clear, `<PauseOverlay>` offers two escapes:
**Back to club** (the same `act-back-to-club` every other surface places — it
asks first when there are peers, then shelves the game and sends everyone back)
and **Stop game** (the gametype's `manifest.stopGame`, which every gametype
supplies — the overlay's escape would otherwise be missing from exactly the
games that most need one). Both go through PostgREST, whose token auto-refreshes
independently of the Realtime socket, so they work **even when Realtime is
wedged** (which is why a refresh — re-initializing Realtime — was the only way
out before).

**The overlay.** When a game is paused (either source), `PauseBoundary` —
mounted by `<GamePage>` around every PlayArea — **unmounts the PlayArea
entirely** and renders `<PauseOverlay>` in its place. So PlayArea-local state
(form input, transient tile selections) clears on pause and rebuilds clean on
resume — the "should this survive a pause?" rule ([common.md](common.md)). The
overlay's text adapts to the source: presence-only reads "Waiting for everyone
to connect…" over the WHOLE roster — a filled disc for each player already here,
a hollow gray ring for whoever is not, so a waiting player sees who is with them
as well as who is missing — and it has no Resume button, since it clears when
the missing player rejoins; manual reads "Bea paused the game" with a Resume
button **any** player can click (no privileged "original pauser" — we're
friends); both sources stack both messages, and clearing the manual one leaves
presence-pause still active. Manual-pause survives mid-game peer reconnects
because any client observing a manual pause re-broadcasts it on every Presence
change (idempotent receivers make "everyone rebroadcasts on every presence
change" the simplest robust shape).

**Inherited by every gametype.** Pause is common machinery: `computePause` +
`PauseOverlay` + `PauseBoundary` run under every gametype that mounts
`<GamePage>` + `useCommonGame`, with no per-game wiring. Pause and
[suspend](#suspended-vs-terminal--not-a-special-case) never coexist on one game
— a suspended game isn't being looked at by anyone, so there's no Presence
channel to pause it.

## How a game ends

Whether a game has ended is independent of view state: a current game may be
over, and an unfinished one may have nobody viewing it.

`common.games.ended_at` is null while the game is played. Once it is set, the
reason pair (`game_ended_reason`, one of seven categories, and
`game_ended_reason_detail`, the game's own word for the act) says why,
`game_ended_by_user_id` says whose act it was, and `game_ended_outcome` —
`won`, `lost`, `near` or `neutral` — says how it came out. Each player's own
ending, while the game plays on, is `common.game_players.player_ended_at` and
its reason pair; their result is `final_ranking` and `outcome`, written when
the game ends. [common-schema.md → Ending a
game](common-schema.md#ending-a-game) has the columns and who writes them;
[win-lose.md](win-lose.md) has the terms every game's endings are described
in, including what a timeout does (`timeout-result`).

There is no stored game state beside these: a game that hasn't ended is being
played, and codenamesduet's sudden death is worked out from its turn count.

## Where the two tables sit

The schema split: `common.games` is the cross-cutting metadata;
`<gametype>.games` is the gametype-specific machinery. (`<gametype>.games` is
referred to as `foo.games` below for brevity.)

### `common.games` carries

- `is_current_view` (boolean) — the view state above
- `mode` (`coop` or `compete`)
- the ending: `ended_at`, the reason pair, `game_ended_by_user_id`,
  `game_ended_outcome`
- the statuses: `game_status` for the play page and `clubpage_info` for the
  summary, beside each player's `common.game_players.player_status` —
  copies of the game's own tables, written whole by the game's status builder
  ([common-schema.md → Title, statuses and the two
  dates](common-schema.md#title-statuses-and-the-two-dates))
- The game clock lives in a **separate table, `common.timers (game_id, ticks,
  last_tick, kind, countdown_seconds_at_setup)`** — NOT on the games row, so the
  once-per-second tick UPDATE doesn't churn the games realtime stream. `ticks`
  is an **additive** count of whole seconds of *active play*: every
  actively-playing client calls `common.tick_timer` once a second, which
  advances `ticks` by at most 1 per real second (its `now() - last_tick >= 1s`
  conditional dedupes across players and makes a pause/idle gap cost +1, not
  the gap). Pauses and "nobody viewing" need **no tracking** — they're just
  seconds where nobody calls tick_timer, so the clock stops.
  `set_current_view`/`unset_current_view` are pure pointer-flips with no timer
  work.
- plus the cross-cutting fields: `id`, `club_handle`, `gametype`, `title`,
  `setup`, `current_turn_user_id`, `restart_count`, `started_at`,
  `status_changed_at`, etc.

### `foo.games` carries

Only gametype-specific gameplay state — things that drive the in-game render and
the gametype's own RPCs. Examples:
- **connections**: `board jsonb`, `mistake_count`
- **codenamesduet**: `key_card_a`, `key_card_b`, `current_clue_giver`,
  `turn_number`, …

Nothing about cross-cutting state: no mode, no club, no ending. Its security
rules join `common.games` for those.

### Listing implication

The club page lists games entirely from `common.games`: the title, the ending
columns and `clubpage_info`. No `foo.games` is touched.

## Suspended vs terminal — not a special case

A "suspended" game is just a description for **a non-current game that
hasn't ended** — a crossword not yet filled, a connections where categories remain.
Suspended games are likely candidates for the club to pick up again.

Finished games are non-current and have `ended_at` set. Clubs can still view
these (to look at the solved grid, reminisce, etc.).

There's no special "suspended" category in the schema or the listing. The club
page's "Your games" is a single list of every game, the current one included; a
corner flag marks the ones still open (orange for the current game, yellow for a
suspended one), and a finished game has none.

## Lifecycle: when `is_current_view` flips

### A game becomes current

The first member to open its GamePage. The mount fires a write that:
1. Clears `is_current_view = false` on any other game in this club (the index
   would reject the new `true` otherwise).
2. Sets `is_current_view = true` on this game.

### A game stops being current

Two mechanisms, a fast path and a safety net:

1. **Last-viewer-leave write (fast path).** When a viewer's `useCommonGame`
   unmounts and its latest presence snapshot says it's the only viewer, it fires
   a conditional update (`set is_current_view = false where ... and
   is_current_view = true`). Idempotent — concurrent "I'm the last one!" writes
   are safe; the first wins, the rest no-op.

2. **Club-presence heal (safety net).** The fast path has a race: when *all*
   viewers leave near-simultaneously — notably a **suspend**, which broadcasts
   and navigates everyone at once — each leaving tab still sees the others in
   presence, so *nobody* fires the unset and the flag gets stuck `true`.
   (Visiting the club page does NOT call `set_current_view`, so there's no
   automatic recovery from that path — the old assumption that it did was
   wrong.) The fix: a **club-level presence channel** (`club:<handle>`,
   `useClubPresence`) that every member of the club orbit joins, announcing
   whether they're on the club page or viewing a game. The club page reconciles
   the DB flag against it: if a game is flagged current but **nobody present is
   viewing it** (after a short grace for presence to sync), the club page fires
   `unset_current_view`. Presence can't get stuck the way a missed write can, so
   loading the club page always heals an abandoned pointer.

The same `club:<handle>` presence channel also drives the member-strip "who's in
the club" dots — see `useClubPresence`.

### Solo vs multi-player at the "viewer leaves" moment

Both cases use the same machinery (last-viewer-leaves write); the difference is
in what UI gates the leaving action.

**Solo (1-player club, e.g. a personal puzzle).** The lone player leaving = last
viewer = the game stops being current. No "but Bea is still in here"
complication.

**Multi-player.** If one player leaves while others are still viewing, the game
stays current (presence-sync shows >0). The leaving player sees the game in the
club page's "currently being viewed" slot — easy to rejoin. For the remaining
players, the disconnect triggers presence-pause (we don't play with a missing
partner). When the absent player returns, pause clears automatically.

### Leaving the game page — terminal vs non-terminal

The UI bar for "leaving" depends on whether the game has ended — three shapes (`usePageActions`'s
Back to club):

- **Terminal**. Trivial to leave. Members are reviewing the endgame (the matched
  bands, the revealed key cards, the post-game summary); the Back-to-club is
  just a single click. No confirm, no broadcast — other reviewers stay put. When
  the last reviewer leaves, the game stops being current.

- **Non-terminal, SOLO**. Also no confirm — Back-to-club suspends immediately.
  Suspending isn't dangerous by itself (the game shelves into the club list,
  resumable); the confirm exists to warn about dragging PEERS off the game, and
  a solo game has none to surprise.

- **Non-terminal, MULTIPLAYER**. The suspend question, asked through
  `askConfirmation` like every other question and drawn as a real modal
  (scrim-blocked board, dialog-owned keyboard). Its words are
  `suspendConfirm(title)` in `src/common/pause-suspend/`, a function rather than
  a constant because they name the game. On accept, ALL viewing members (not
  just the leaver) move to the club page and the game stops being current.

The asymmetry: the confirm is about the *social* surprise, not the act.
Suspending loses nothing; what needs a beat of consideration is yanking the rest
of the group off the puzzle mid-flight.

Contrast **stopping** a game (the Stop button / menu item / pause-overlay escape
hatch), which IS destructive — terminal for the whole group, irreversible — and
therefore always asks through the shared `ConfirmationBlockingModal` ("Stop this
game?"), even in a solo or coop game.

## Exiting a club page (separate concern)

This is *not* permanently leaving a club. When a member is on a club page,
they're "in the club's space" — chat is visible, currently-viewed game is
reachable. Leaving the club page (back to the homepage to pick a different club)
deserves a confirm: *"Leave <Club Foo>?"* Light UI bar; just enough to prevent
accidental clicks.

No schema implication. Pure UX layer.
