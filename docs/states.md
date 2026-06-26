# States: view, play, and the suspend/current/pause vocabulary

Canonical reference for how view-state and play-state are split on `common.games`, and how the suspend / pause / current concepts compose. Don't conflate "the game the club is currently focused on" with "the game's play state isn't terminal" — those are orthogonal axes and naming has to keep them separate (see the no-`'active'` convention below).

The split that drives everything below: **view states and play states are orthogonal.** A current game might already be won. A terminal game might have nobody viewing it. The two axes don't constrain each other.

## View states

These describe where a game sits in the club's "what are we looking at right now" picture. They're club-wide, not per-member.

### current

A game is **current** iff at least one club member is viewing its GamePage right now. ("In" a game means viewing — there's no other sense. A member who was `common.game_players`-seated in a non-current game is no longer "in" it; they're a previous player.)

**Invariant: at most one current game per club.** Enforced by a partial unique index on `(club_handle) where is_current_view = true`.

**Why we mark this:** the club page can show a "Currently being viewed: <game>" affordance so a member typing the club URL can jump straight back to where the group is. And it enforces the one-game-at-a-time invariant structurally.

**Concurrency:** if two members on the club page simultaneously open different non-current games, the partial unique index serializes the two writes. Last-click wins: the second to commit clears the first's flag and sets its own. Each member is in the game they opened; the club's current-game *pointer* just ends up on the winner's, and the games list reflects that on the next realtime refresh (nobody is auto-snapped anywhere — auto-nav is gone). The race is vanishingly rare in practice (clubs coordinate over chat: "wanna pick up crossword A or B?"), and the resolution is harmless.

### paused

A game is **paused** when its presence-pause OR manual-pause is in effect. Only the current game can be paused — pause is meaningless for a game nobody's viewing.

The two sources stay as today:
- **Presence-pause**: someone in `common.game_players` isn't currently connected to the channel.
- **Manual-pause**: someone clicked Pause; broadcast to peers.

## Play states

Play states describe the game's rules-side situation — totally independent of view state.

Each gametype defines its own `play_state` enum, with `playing` for the default mid-game state and one or more terminal values. The specific set varies by gametype's rules — see each per-game doc's `### Play-state enum` / `### Play states` section for the full list. The simplest is psychicnum coop (`playing` / `won` / `lost`); the broadest today is codenamesduet (multi-axis loss reasons: `lost_assassin` / `lost_clock` / `lost_timeout`). The set of terminal play_states varies per gametype.

**Convention: don't use `'active'` as a play_state value.** "Active" overloads view-state and play-state — using it for play_state invites the confusion this whole vocabulary exists to prevent. Every gametype uses `'playing'` as its standard mid-game play_state. Gametypes with additional non-terminal phases (codenamesduet's `'sudden_death'`) get their own names for those.

### Compete-variant convention: `_compete` suffix

Sibling-manifest pairs that include a compete variant (see [`common.md` → The sibling-manifest pattern](common.md#the-sibling-manifest-pattern)) follow this convention: the terminal play_state in compete mode is the coop name plus a `_compete` suffix. psychicnum is the canonical example:

| mode    | won-terminal   | lost-terminal    |
|---------|----------------|------------------|
| coop    | `won`          | `lost`           |
| compete | `won_compete`  | `lost_compete`   |

The distinct names matter because the per-player outcome differs: coop's `'won'` means "every player won together"; compete's `'won_compete'` means "one player won, the others lost." Per-player outcome detail goes on `common.game_players.result` jsonb (`{ "won": bool }` shape today); `play_state` carries the **game-level** terminal answer that the listing label needs to render without joining game_players.

spellingbee's eventual compete variant will follow the same suffix convention (the schema already declares `'won_compete'` as a planned play_state). connections's compete will use `'solved_compete'` (matching connections's coop terminal naming `'solved'`).

### `is_terminal` is materialized

Each gametype knows which of its play_states are terminal. The codebase shouldn't have to ask "is this play_state terminal for this gametype?" everywhere — we materialize `is_terminal boolean` on the row as a derived-but-stored field. Updated in the same transaction as `play_state`.

Net effect: code that just wants "did this game end?" reads `is_terminal`. Code that wants the specific outcome reads `play_state`.

## Where the two tables sit

The schema split: `common.games` is the cross-cutting metadata; `<gametype>.games` is the gametype-specific machinery. (`<gametype>.games` is referred to as `foo.games` below for brevity.)

### `common.games` carries

- `is_current_view` (boolean)
- `paused` (boolean — present for any game, but only meaningful when `is_current_view = true`)
- `play_state` (text — the gametype's enum value, e.g. `'solved'` for connections)
- `is_terminal` (boolean — materialized, in sync with play_state)
- `status` (jsonb — gametype-specific data needed for the club-page listing label; each gametype consumes its own shape via `manifest.labelFor`)
- The game clock lives in a **separate table, `common.timers (game_id, ticks, last_tick)`** — NOT on the games row, so the once-per-second tick UPDATE doesn't churn the games realtime stream. `ticks` is an **additive** count of whole seconds of *active play*: every actively-playing client calls `common.tick_timer` once a second, which advances `ticks` by at most 1 per real second (its `now() - last_tick >= 1s` conditional dedupes across players and makes a pause/idle gap cost +1, not the gap). Pauses and "nobody viewing" need **no tracking** — they're just seconds where nobody calls tick_timer, so the clock stops. This replaced the old subtractive `idle_since`/`total_idle_seconds` accumulator; `set_current_view`/`unset_current_view` are now pure pointer-flips with no timer work.
- plus the cross-cutting fields already there: `id`, `club_handle`, `gametype`, `title`, `setup`, `started_at`, `ended_at`, etc.

`status`'s semantic: *state for label rendering*, kept in sync on every state-transitioning RPC. Not just a terminal-time snapshot — every mid-game state-affecting move writes whatever the manifest's `labelFor` needs to render the current row.

### `foo.games` carries

Only gametype-specific gameplay state — things that drive the in-game render and the gametype's own RPCs. Examples:
- **connections**: `board jsonb`, `mistake_count`
- **codenamesduet**: `key_card_a`, `key_card_b`, `current_clue_giver`, `turns_remaining`, …

Nothing about cross-cutting state. Nothing that the listing reads. (If the listing wanted to show the
number of mistakes in a connections game, we would *also* put that in the common.games.status)

### Listing implication

The club page lists games entirely from `common.games`. The manifest's only listing responsibility is `labelFor(commonGamesRow) → string` — a pure function that reads the per-gametype `status` jsonb and returns a label. No I/O, no `foo.games` touched.

## Suspended vs terminal — not a special case

A "suspended" game is just a description for **a non-current, non-terminal game** — a crossword not yet filled, a connections where categories remain. Suspended games are likely candidates for the club to pick up again.

Terminal games are non-current and `is_terminal = true`. Clubs can still view these (to look at the solved grid, reminisce, etc.).

There's no special "suspended" category in the schema or the listing. The club page shows a single list of non-current games, marked with a color/CSS indicator for terminal vs non-terminal.

## Lifecycle: when `is_current_view` flips

### A game becomes current

The first member to open its GamePage. The mount fires a write that:
1. Clears `is_current_view = false` on any other game in this club (the index would reject the new `true` otherwise).
2. Sets `is_current_view = true` on this game.

### A game stops being current

Two mechanisms, a fast path and a safety net:

1. **Last-viewer-leave write (fast path).** When a viewer's `useCommonGame` unmounts and its latest presence snapshot says it's the only viewer, it fires a conditional update (`set is_current_view = false where ... and is_current_view = true`). Idempotent — concurrent "I'm the last one!" writes are safe; the first wins, the rest no-op.

2. **Club-presence heal (safety net).** The fast path has a race: when *all* viewers leave near-simultaneously — notably a **suspend**, which broadcasts and navigates everyone at once — each leaving tab still sees the others in presence, so *nobody* fires the unset and the flag gets stuck `true`. (Visiting the club page does NOT call `set_current_view`, so there's no automatic recovery from that path — the old assumption that it did was wrong.) The fix: a **club-level presence channel** (`club:<handle>`, `useClubPresence`) that every member of the club orbit joins, announcing whether they're on the club page or viewing a game. The club page reconciles the DB flag against it: if a game is flagged current but **nobody present is viewing it** (after a short grace for presence to sync), the club page fires `unset_current_view`. Presence can't get stuck the way a missed write can, so loading the club page always heals an abandoned pointer.

The same `club:<handle>` presence channel also drives the member-strip "who's in the club" dots — see `useClubPresence`.

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
