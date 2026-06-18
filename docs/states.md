# States: view, play, and the suspend/current/pause vocabulary

Canonical reference for how view-state and play-state are split on `common.games`, and how the suspend / pause / current concepts compose. Don't conflate "the game the club is currently focused on" with "the game's play state isn't terminal" — those are orthogonal axes and naming has to keep them separate (see the no-`'active'` convention below).

The split that drives everything below: **view states and play states are orthogonal.** A current game might already be won. A terminal game might have nobody viewing it. The two axes don't constrain each other.

## View states

These describe where a game sits in the club's "what are we looking at right now" picture. They're club-wide, not per-member.

### current

A game is **current** iff at least one club member is viewing its GamePage right now. ("In" a game means viewing — there's no other sense. A member who was `common.game_players`-seated in a non-current game is no longer "in" it; they're a previous player.)

**Invariant: at most one current game per club.** Enforced by a partial unique index on `(club_id) where is_current_view = true`.

**Why we mark this:** the club page can show a "Currently being viewed: <game>" affordance so a member typing the club URL can jump straight back to where the group is. And it enforces the one-game-at-a-time invariant structurally.

**Concurrency:** if two members on the club page simultaneously open different non-current games, the partial unique index serializes the two writes. Last-click wins: the second to commit clears the first's flag and sets its own. The losing member auto-snaps to the winning game via the existing realtime auto-nav. The race is vanishingly rare in practice (clubs coordinate over chat: "wanna pick up crossword A or B?"), and the resolution is harmless.

### paused

A game is **paused** when its presence-pause OR manual-pause is in effect. Only the current game can be paused — pause is meaningless for a game nobody's viewing.

The two sources stay as today:
- **Presence-pause**: someone in `common.game_players` isn't currently connected to the channel.
- **Manual-pause**: someone clicked Pause; broadcast to peers.

## Play states

Play states describe the game's rules-side situation — totally independent of view state.

Each gametype defines its own `play_state` enum. Some examples:
- **wordknit**: `playing`, `solved`, `lost`
- **psychic-num**: `playing`, `won`, `lost`
- **tinyspy**: `playing`, `sudden_death`, `won`, `lost_assassin`, `lost_clock`, `lost_timeout`
- **freebee**: `playing`, `ended`, `won_compete` — `ended` covers all three v1 outcomes (100%-found, countdown expiry, manual End-game menu item); the specific outcome lives in `status.outcome` ∈ `{'completed', 'timeout', 'manual'}`. `won_compete` is reserved from day one for compete-mode wins, even though v1 never emits it. See [`freebee.md` → Play states](freebee.md#play-states).
- **crosswords** (future): `playing`, `solved`, `lost_timer`, …

The set of terminal play_states varies per gametype.

**Convention: don't use `'active'` as a play_state value.** "Active" overloads view-state and play-state — using it for play_state invites the confusion this whole vocabulary exists to prevent. Every gametype uses `'playing'` as its standard mid-game play_state. Gametypes with additional non-terminal phases (tinyspy's `'sudden_death'`) get their own names for those.

### `is_terminal` is materialized

Each gametype knows which of its play_states are terminal. The codebase shouldn't have to ask "is this play_state terminal for this gametype?" everywhere — we materialize `is_terminal boolean` on the row as a derived-but-stored field. Updated in the same transaction as `play_state`.

Net effect: code that just wants "did this game end?" reads `is_terminal`. Code that wants the specific outcome reads `play_state`.

## Where the two tables sit

The schema split: `common.games` is the cross-cutting metadata; `<gametype>.games` is the gametype-specific machinery. (`<gametype>.games` is referred to as `foo.games` below for brevity.)

### `common.games` carries

- `is_current_view` (boolean)
- `paused` (boolean — present for any game, but only meaningful when `is_current_view = true`)
- `play_state` (text — the gametype's enum value, e.g. `'solved'` for wordknit)
- `is_terminal` (boolean — materialized, in sync with play_state)
- `status` (jsonb — gametype-specific data needed for the club-page listing label; each gametype consumes its own shape via `manifest.labelFor`)
- `idle_since` (timestamptz, nullable) + `total_idle_seconds` (int) — the timer-preservation accumulator. Invariant: `is_current_view = true ⟺ idle_since IS NULL`. Every vacate (create_game's "vacate prior," set_current_view's "vacate others," unset_current_view) stamps `idle_since = now()`; every set_current_view that flips a row to current folds `(now - idle_since)` into `total_idle_seconds` and clears the timestamp. The FE timer hook subtracts `total_idle_seconds * 1000` from elapsed-ms so countdowns don't tick when nobody's watching.
- plus the cross-cutting fields already there: `id`, `club_id`, `gametype`, `title`, `setup`, `started_at`, `ended_at`, etc.

`status`'s semantic: *state for label rendering*, kept in sync on every state-transitioning RPC. Not just a terminal-time snapshot — every mid-game state-affecting move writes whatever the manifest's `labelFor` needs to render the current row.

### `foo.games` carries

Only gametype-specific gameplay state — things that drive the in-game render and the gametype's own RPCs. Examples:
- **wordknit**: `board jsonb`, `mistake_count`
- **tinyspy**: `key_card_a`, `key_card_b`, `current_clue_giver`, `turns_remaining`, …

Nothing about cross-cutting state. Nothing that the listing reads. (If the listing wanted to show the
number of mistakes in a wordknit game, we would *also* put that in the common.games.status)

### Listing implication

The club page lists games entirely from `common.games`. The manifest's only listing responsibility is `labelFor(commonGamesRow) → string` — a pure function that reads the per-gametype `status` jsonb and returns a label. No I/O, no `foo.games` touched.

## Suspended vs terminal — not a special case

A "suspended" game is just a description for **a non-current, non-terminal game** — a crossword not yet filled, a wordknit where categories remain. Suspended games are likely candidates for the club to pick up again.

Terminal games are non-current and `is_terminal = true`. Clubs can still view these (to look at the solved grid, reminisce, etc.).

There's no special "suspended" category in the schema or the listing. The club page shows a single list of non-current games, marked with a color/CSS indicator for terminal vs non-terminal. The old separate "Suspended games" / "Completed games" sections collapse into one.

## Lifecycle: when `is_current_view` flips

### A game becomes current

The first member to open its GamePage. The mount fires a write that:
1. Clears `is_current_view = false` on any other game in this club (the index would reject the new `true` otherwise).
2. Sets `is_current_view = true` on this game.

### A game stops being current

When the last viewer leaves. Detection via presence-sync seeing zero connected members; the leaving tab fires a conditional update (`set is_current_view = false where ... and is_current_view = true`). Idempotent — concurrent "I'm the last one!" writes are safe; the first wins, the rest no-op.

### Solo vs multi-player at the "viewer leaves" moment

Both cases use the same machinery (last-viewer-leaves write); the difference is in what UI gates the leaving action.

**Solo (1-player club, e.g. a personal puzzle).** The lone player leaving = last viewer = the game stops being current. No "but Bea is still in here" complication.

**Multi-player.** If one player leaves while others are still viewing, the game stays current (presence-sync shows >0). The leaving player sees the game in the club page's "currently being viewed" slot — easy to rejoin. For the remaining players, the disconnect triggers presence-pause (we don't play with a missing partner). When the absent player returns, pause clears automatically.

### Leaving the game page — terminal vs non-terminal

The UI bar for "leaving" depends on play state:

- **Terminal**. Trivial to leave. Members are reviewing the endgame (the matched bands, the revealed key cards, the post-game summary); the Back-to-club is just a single click. No confirm. When the last reviewer leaves, the game stops being current.

- **Non-terminal**. Higher UI bar. A confirm dialog: *"Suspend this game to finish later?"* On accept, ALL viewing members (not just the leaver) move to the club page and the game stops being current.

The asymmetry: terminal games have no "lose progress" risk, so navigation is cheap. Non-terminal games are an in-flight effort that everyone should agree to suspend together (otherwise one player accidentally drags the whole club off the puzzle).

## Exiting a club page (separate concern)

This is *not* permanently leaving a club. When a member is on a club page, they're "in the club's space" — chat is visible, currently-viewed game is reachable. Leaving the club page (back to the homepage to pick a different club) deserves a confirm: *"Leave <Club Foo>?"* Light UI bar; just enough to prevent accidental clicks.

No schema implication. Pure UX layer.
