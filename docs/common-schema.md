# The `common` schema

The database half of the common layer: the tables every game shares, the
contracts each game's own SQL mirrors, and who may read and write what. The
shape is `supabase/migrations/20260615000000_common.sql` and the forward
migrations after it; the behavior is `supabase/sql/common.sql`, whose comments
carry each function's full contract and outcomes. How every RPC answers is
[envelopes.md](envelopes.md); the conventions for any schema are
[supabase.md](supabase.md); the dictionary tables are
[word-list.md](word-list.md).

## Tables

| table | what it holds |
|---|---|
| `profiles` | one row per auth user: `username` (immutable), `color` (from the eight-color palette), `sounds_enabled`, `ai_member` (scrabble's AI opponents, ordinary accounts in every other way), `can_edit_words`, and `theme`, reserved and unread. Written only by RPCs |
| `clubs` | a fixed-membership room: `handle` (the URL key and primary key), `name` (at most 20 characters), `created_by`, and `is_solo`, generated from the handle |
| `clubs_members` | who is in each club. Fixed at creation |
| `gametypes` | the registered gametypes, one row per sibling (`wordle_coop`, `wordle_compete`), each registered by its game's migration: `min_players` and `default_enroll` |
| `clubs_gametypes` | which gametypes a club can start, and `default_setup`, the club's last-used setup for each — written by `common.create_game` on every start |
| `games` | the shared header of every game: its club, gametype, `title`, `setup`, the view-state pair (`is_current_view`, `paused`), the play-state pair (`play_state`, `is_terminal`), `status` (the club-list readout), `created_by`, `current_turn_user_id`, `restarts`, and `started_at` / `ended_at` / `last_active_at`. A game's own detail row shares its id |
| `game_players` | who plays each game, frozen at creation: each player's `result` at the end, `conceded`, `locally_terminal`, `turn_seat`, `joined_at` |
| `timers` | the game clock, one row per game ([The game clock](#the-game-clock)) |
| `messages` | club chat: one thread per club across every game, 1–1000 characters; a message starting `!` is important and force-opens chat for the others |
| `game_scratchpads` | the opt-in scratchpad: one row per pad, shared (no owner) or a player's own |

### Deletion rules — the FK firewall

Users, clubs and gametypes are never deleted through the app, so the one way
one could go is a bug or a mistaken statement — and under an all-CASCADE design
deleting a user would silently take every club they made and every game in them.
So the edges at the top are **RESTRICT**, and such a delete fails loudly:
`profiles → auth.users`, `clubs.created_by → profiles`, both `clubs_members`
edges, and `games → clubs` and `games → gametypes` — a gametype with games
cannot be removed until its games are deleted on purpose. Below the firewall
the edges CASCADE (a few that merely point at a person, like `created_by`,
`SET NULL`), so a deliberate top-down teardown — `common.delete_game` —
removes a whole game in one statement. Both halves are pinned by
`supabase/tests/common/fk_delete_rules_test.sql`.

## The game row

### View state and play state

Two independent pairs on `common.games` ([states.md](states.md) has the full
picture). **Play state** is where the game stands — `play_state` in the game's
own vocabulary, and `is_terminal`. **View state** is whether it is the club's
**current** game: a partial unique index on `(club_handle) where
is_current_view` allows one per club, across every gametype.

The pointer moves with presence: the first viewer to arrive calls
`common.set_current_view`, the last to leave `common.unset_current_view`, and
`common.create_game` moves it to the new game. It never pulls anyone into a
game, and ending a game does not clear it — a finished game stays current
while someone is reviewing it. `paused` is reserved; pause is computed by the
clients today.

| on the club page | derived from |
|---|---|
| **current** | `is_current_view` |
| **shelved** | not current, not terminal |
| **finished** | not current, terminal |

### The game clock

`common.timers (game_id, ticks, last_tick)`, its own table so the tick doesn't
churn the games stream. `ticks` counts whole seconds of **active play**: every
playing client calls `common.tick_timer` once a second, and it advances by at
most one per real second, which removes duplicates across players and makes a
pause cost one second rather than its length. Pause and "nobody here" need no
bookkeeping — they are seconds when nobody ticks. The frontend half is
[`common/timer`](../src/common/timer/doc.md).

### Title, status and last activity

- **`title`** is built by each game's `create_game` (and rewritten by its moves
  where the game says so); the rules every title follows are
  [game-status-labels.md](game-status-labels.md).
- **`status` merges.** `common.update_state` (mid-game) and `common.end_game`
  (terminal) both write `status || new`, so a caller passes only the keys it
  changes and a terminal write adds to the mid-game readout. Every terminal
  write still states its own `reason`, since under a merge an omitted key
  inherits. `status` is club-readable, so it carries only what every player
  already sees.
- **`last_active_at`** is stamped by a trigger on every update to the row, so
  the club list orders games by when they were last touched and no RPC can
  forget to bump it.

## Starting a game

A game's own `<game>.create_game` validates its setup (the shared checks are
helpers — `require_valid_timer`, `require_valid_mode`,
`require_player_count_max`), then calls **`common.create_game`** for the
header: it checks the caller and every player are in the club (AI accounts
exempt), moves the current-game pointer to the new game, inserts the
`common.games` row, the clock and one `game_players` row per player, and saves
the club's `default_setup`. The game then inserts its own detail rows under the
returned id and answers `{ result: 'created', id }`. psychicnum's is the model
to copy (`supabase/sql/psychicnum.sql`).

## Ending a game

### Manual end — every gametype's `end_game(target_game)`

Every gametype has a player-callable stop — the friends agree they've played
enough — and it is **neutral**: `play_state = 'ended'`, `status.reason =
'manual'`, and every player's result `{ "won": false }`. It is the co-op stop;
a race's is [Concede](#concede--per-player-drop-out). Three endings stay
distinct: **timeout** is a loss, fired by the clients when a countdown reaches
zero; **end** is neutral; **leaving the page** isn't terminal at all.

The contract every game's `end_game` mirrors:

1. Lock the game's own row `for update`; a missing row answers the shared
   deleted-game race (`common._raise_game_deleted`) — asked BEFORE membership,
   because a deleted game has no players left to be one of.
2. `common.require_game_player` — playership gates acting.
3. A game already over answers the shared race (`common._raise_game_over`), so
   a double click or a click racing a timeout is harmless.
4. `common.end_game(target_game, 'ended', { reason: 'manual', … },
   every player won: false)`.
5. **Touch a row the game's frontend subscribes to** (a no-op self-update),
   because `common.end_game` writes only `common.games` and a game whose hooks
   watch its own tables would not otherwise wake to refetch its board.
6. Answer `{ result: 'ended' }` through the envelope handler, and grant to
   `authenticated`.

`submit_timeout` answers the same way; it fires from every connected client at
once, so all but the first find the game already over.

### Concede — per-player drop-out

**Concede is the compete counterpart to End**: "I quit; the others play on." It
is a real loss for the conceder and never a mutual stop — the last player to
concede ends the game as a collective loss. `game_players.conceded` is the flag,
the one per-player terminal state that exists before the game ends, which is
what lets a verdict say "Quit" rather than "Lost". Every compete game has one;
co-op never does.

Two shapes, by how a player can stop racing:

- **`common.concede`** — for a game where the only way to stop racing is to
  WIN, which already ends it. "Still racing" is then just "not conceded", so the
  helper marks the caller out and ends the game iff nobody is left. It names
  that ending in the game's own vocabulary (`lost_compete` for a sibling
  compete gametype, `lost` for a single-mode one). The game's `<game>.concede`
  wraps it, with `common.require_compete` where the game has a co-op sibling.
- **`common._set_conceded` + the game's own check** — for a game where a
  player can be done without the table ending: eliminated, out of budget, or
  simply not on turn. The game decides whether anyone is still racing in its
  `<game>._maybe_finish_compete`, shared by its move RPC and its concede, and a
  conceder never wins.

**A game whose "anyone still racing?" test reads its own tables must lock its
own games row before `common.games`.** That test reads two tables at once — the
game's progress rows and `game_players` — and a final move and a concede both
ask it. The move locks the game's row; if concede locked only `common.games`,
the two would never serialize: each reads a snapshot from before the other's
write, both see someone still racing, neither ends the game, and it wedges in
`playing` with nobody left. So such a concede opens by locking its own row, in
the move path's order. It can't be shared into `common`, which cannot lock
another schema's table without dynamic SQL; `src/guards/concedeLock.test.ts`
holds it for every game that calls `_set_conceded`.

Concede answers `{ result: 'conceded' }`. Whether it also ended the game is not
in the answer; every client, the conceder's included, learns that by
subscription.

### Done, but not out — `locally_terminal`

**A racer can stop racing without conceding** — out of guesses, or solved in a
race that plays on to rank everyone — and the presence-pause must not wait for
them. `game_players.locally_terminal` is that flag, set by
`common._set_locally_terminal` from inside the game RPC that detects it and
cleared on restart. It is not a second spelling of `conceded`: a locally
terminal player may be the WINNER. Compete only; the pause watches
`not conceded and not locally_terminal`.

## Turn-order — opt-in turn-by-turn for coop games

Co-op is free-for-all by default: anyone may act at any time. A game whose moves
are discrete can offer **turn-by-turn** instead, with the same rules and board
and only *who may act now* changing. The mechanism is all common:

- **`games.current_turn_user_id`** — whose turn it is; null means free-for-all.
  **`game_players.turn_seat`** — each player's place in the rotation.
- **`common._assign_turn_order`**, once, from `create_game` when
  `setup.coop_style = 'turns'`: seat 0 is the chosen first player, the rest
  shuffled.
- **`common._require_turn`**, in the move RPC right after the row lock and the
  caller check: refuses a move out of turn (a race — the pointer moved). Inert
  when the pointer is null.
- **`common._advance_turn`**, after an **accepted, non-terminal** move only: a
  refused word must not cost the turn, and a move that ends the game has no one
  to hand it to.
- **Restart rewinds the pointer** to seat 0.

Two setup keys carry the choice, both written by the shared
`SetupCoopStyleSection`: `coop_style` (`'turns' | 'free-for-all'`) and
`first_turn_user_id`. Only the first survives into the club's `default_setup`.
The rule is general: a style or mode preference is worth remembering, a pick of
a specific person is not. Each game's `create_game` does the strip itself
(`setup - 'first_turn_user_id'`), since it chooses what to pass
`common.create_game` as the saved default; codenamesduet drops
`first_clue_giver_user_id` the same way. The pointer is not the record of whose
go it was — the event log's `took_turn` is
([supabase.md](supabase.md#every-games-log-is-gameevents)). **A bot can take a
seat only where something pokes it to move**, since a bot has no client.
scrabble compete keeps its own seat pointer, a deliberate second mechanism.

## Players and clubs

### Solo clubs

Every player has a solo club, handle `=<username>` — a prefix no typed name can
produce, since the slug function strips `=`. `is_solo` is that prefix, stored
once. A solo club is enrolled only in gametypes a lone player can start
(`min_players = 1`), and it sorts first on the home page.

### Username claim flow

No trigger makes a profile. On first sign-in the session finds no profile and
the app shows the claim screen, where the player picks a username (3–15
characters, `^[a-z][a-z0-9-]{2,14}$`) and a color. **`common.claim_username`**
then creates, in one transaction, the profile, the solo club, its membership
and its enrollment. A username already taken names the field, so it lands
under the box; a token whose user no longer exists signs the player out.

**Provisioning ahead of a first sign-in.** `gmake db-add-user ENV=… EMAIL=…
HANDLE=… [COLOR=…] [AI=1] [DRY=1]` runs that flow for someone before they have
visited, so a friend can be put in a club while the invitation is still in
their inbox. It uses Supabase's admin API to create the auth user and mint a
one-time code, redeems it for a real session, and calls the real
`claim_username` as that user — so provisioning cannot drift from a real
sign-in. A failed run deletes what it made. `AI=1` marks the account
`ai_member`.

## RPCs

Every `common` function is `security definer`. What the client calls:

| RPC | what it does |
|---|---|
| `claim_username`, `update_profile` | make, then edit, your own profile |
| `create_club`, `set_club_gametypes` | make a club (the caller is added); set which gametypes it offers — any member may |
| `get_club_page` | everything the club page draws, in one read — and the one read that can tell "no such club" from "not yours" |
| `send_message` | post to a club's chat; the table itself has no insert grant |
| `set_current_view`, `unset_current_view`, `tick_timer` | the presence-driven pointer and the clock |
| `concede` | the shared concede ([above](#concede--per-player-drop-out)) |
| `delete_game` | remove a game and everything under it; any club member may |
| `set_scratchpad` | write a scratchpad |
| `anagrams`, `update_word`, `delete_word`, `add_word` | [word-list.md](word-list.md) |

The rest are **helpers**, revoked from `authenticated` and called only from
other security-definer functions: the gates (`require_club_member`,
`require_game_player`, `require_valid_timer`, `require_valid_mode`,
`require_compete`, `require_player_count_max`), the shared races
(`_raise_game_deleted`, `_raise_game_over`), and the halves every game calls
(`create_game`, `update_state`, `end_game`, `reset_game`, `_set_conceded`,
`_set_locally_terminal`, and the turn-order three). Tests for the helpers are
`supabase/tests/common/helpers_test.sql`.

## Revealing the solution

Whether a player is looking at the answer is a local display choice in the
frontend ([`common/reveal`](../src/common/reveal/doc.md)) — nothing is written.
**What the server owes is the shield**: each game's column grant and its
`_x_for()` helper hand the solution over at `is_terminal`, over for EVERYONE.
That is the part that bites in compete: a player who conceded or finished early
is done while the others race on, and must not be able to read the answer out,
so the gate never keys on per-player doneness.

## Row-level security

RLS is on for every `common` table and there are no insert, update or delete
policies: every write is an RPC. Reads:

- **Club membership** gates most tables (`is_club_member`), and `game_players`
  and `timers` through their game.
- **Profiles are readable by anyone signed in**, because creating a club means
  finding a friend by username before you share a club with them.
- **`gametypes`** is readable by all; a scratchpad row by the game's players
  (and a private pad by its owner).

### Membership gates viewing; playership gates acting

A game's players are a subset of the club, frozen at creation. **Any member may
watch** any of the club's games — the read policies are club-gated — while
**only a player may act**: every move RPC gates on `require_game_player`. The
exceptions are viewing-adjacent (`set_current_view`, `unset_current_view`,
`tick_timer` take a club member, since a watcher drives the pointer and the
clock too). What a watcher sees is
[plans/spectating.md](../plans/spectating.md).

### Realtime publication

`clubs_members`, `messages`, `games`, `game_players` and `game_scratchpads` are
in `supabase_realtime`; `supabase/tests/common/realtime_publication_test.sql`
pins the list. `profiles` is not — usernames don't change during a session.
