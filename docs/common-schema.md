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
| `clubs_gametypes` | which gametypes a club can start, and `default_setup`, the club's last-used setup for each — written by `common._create_game` on every start |
| `games` | the shared header of every game: its club, gametype, `mode`, `title`, `setup`, `is_current_view`, `created_by`, `current_turn_user_id`, `restart_count`; `started_at`, and the ending — `ended_at`, the reason pair (`game_ended_reason`, `game_ended_reason_detail`), `game_ended_outcome`, `game_ended_by_user_id`; the copies the status builder writes (`game_status`, `clubpage_info`); and the two dates, `status_changed_at` and `updated_at` ([Title, statuses and the two dates](#title-statuses-and-the-two-dates)). A game's own detail row shares its id |
| `game_players` | who plays each game, frozen at creation: `turn_seat`, `joined_at`; the player's ending while the game goes on (`player_ended_at` and its reason pair); `solved_at`; `outcome`, written when the player ends and again at the game's end; `final_ranking`, written at the game's end; and `player_status`, the builder's copy |
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

### View state and the ending

Two independent facts on `common.games` ([states.md](states.md) has the full
picture). **Whether the game has ended** is `ended_at`: null while it is
played; once set, the reason pair says why and `game_ended_outcome` how it
came out ([Ending a game](#ending-a-game)). **View state** is whether it is
the club's **current** game: a partial unique index on `(club_handle) where
is_current_view` allows one per club, across every gametype.

The pointer moves with presence: the first viewer to arrive calls
`common.set_current_view`, the last to leave `common.unset_current_view`, and
`common._create_game` moves it to the new game. It never pulls anyone into a
game, and ending a game does not clear it — a finished game stays current
while someone is reviewing it. Pause is computed by the clients.

| on the club page | derived from |
|---|---|
| **current** | `is_current_view` |
| **shelved** | not current, `ended_at` null |
| **finished** | not current, `ended_at` set |

### The game clock

`common.timers (game_id, ticks, last_tick, kind, countdown_seconds_at_setup)`,
its own table so the tick doesn't churn the games stream. `kind` (`none`,
`countup`, `countdown`) and the countdown's length are copied from
`setup.timer` at create, and are what the game reads from then on. `ticks`
counts whole seconds of **active play**: every
playing client calls `common.tick_timer` once a second, and it advances by at
most one per real second, which removes duplicates across players and makes a
pause cost one second rather than its length. Pause and "nobody here" need no
bookkeeping — they are seconds when nobody ticks. The frontend half is
[`common/timer`](../src/common/timer/doc.md).

### Title, statuses and the two dates

- **`title`** is built by each game's `create_game` (and rewritten by its moves
  where the game says so); the rules every title follows are
  [game-status-labels.md](game-status-labels.md).
- **The statuses** — `games.game_status`, each `game_players.player_status`,
  and `games.clubpage_info` for the club page — are copies of the game's own
  tables, written by one status builder per game, which assigns the whole
  object and never merges. The game calls it at create, at Restart and at the
  end of every move. They are club-readable, so they carry only what every
  player already sees.
- **`status_changed_at`** is when the game's status last changed, and the club
  list sorts and dates games by it. Only the builder writes it, and only when
  its caller passes `p_update_status_changed_at` true — a create, a Restart, a
  move — so rebuilding a status by hand or over every game leaves the dates
  alone, and opening or leaving a game never moves it.
- **`updated_at`** is when the row was last written, by anything: a trigger
  stamps it on every update and nothing else writes it.

## Starting a game

A game's own `<game>.create_game` validates its setup (the shared checks are
helpers — `_require_valid_timer`, `_require_valid_mode`,
`_require_player_count_max`), then calls **`common._create_game`** for the
header, passing the mode it checked: it checks the caller and every player
are in the club (AI accounts exempt), moves the current-game pointer to the
new game, inserts the `common.games` row, the clock (its kind and length
copied from `setup.timer`) and one `game_players` row per player, and saves
the club's `default_setup`. The game then inserts its own detail rows under
the returned id, runs its status builder, and answers `{ result: 'created',
id }`. psychicnum's is the model to copy (`supabase/sql/psychicnum.sql`).

## Ending a game

### `common._end_game` — the one way a game ends

A game calls **`common._end_game`** once, when its own rule says the game is
over. It passes the reason pair (one of `reached_goal`, `resource_exhausted`,
`all_passed`, `fatal_move`, `conceded`, `timeout`, `stopped`, and the game's
own word for the act), the player whose act ended it (null only for a timeout
nobody's turn covers), whether its rule makes this a no-result, and each
player's `final_ranking` as `{"<user id>": 1, …}` — a player left out is
unranked. `_end_game` decides only the two outcomes
([win-lose.md](win-lose.md)):

- **the game's**: `won` if anyone ranked 1; otherwise `neutral` for a Stop or
  a no-result, and `lost` for the rest.
- **each player's**: 1 is `won`, lower is `near`; an unranked player is `lost`
  if they conceded or the ending has a result, `neutral` otherwise.

`solved_at` is not its business: the game writes it at the solve.
`is_current_view` is not cleared, since a finished game stays current while
someone is reviewing it. The game then runs its status builder, whose write to
`common.games` is what every page learns the ending from.

### Stop — every gametype's `stop_game`

Every gametype has a player-callable Stop — the friends agree they've played
enough — and it is **neutral**: reason `stopped`, nobody ranked, so the game
and every player come out `neutral`. It is the co-op stop; a race's is
[Concede](#concede--per-player-drop-out). Three endings stay distinct:
**timeout**, fired by the clients when a countdown reaches zero; **stop**; and
**leaving the page**, which ends nothing.

The shape every game's `stop_game` follows:

1. Lock the game's own row `for update`, the row its moves lock; a missing row
   answers the shared deleted-game race (`common._raise_game_deleted`). The
   lock is what makes a Stop racing the winning move wait for it and then read
   the game as over. `common` can't take it, since it can't name a game's
   table. `src/guards/endLock.test.ts` holds it for every `stop_game` and
   `submit_timeout`.
2. **`common._stop`**: checks the caller is a player
   (`common._require_game_player`), answers a game already over with the shared
   race (`common._raise_game_over`), so a double click or a click racing a
   timeout is harmless, and calls `_end_game` with reason `stopped`, the caller
   as who ended it, and nobody ranked. It returns the caller's id.
3. Any step of the game's own (scrabble coop's leftover-tiles penalty, a
   title), then its status builder.
4. Answer `{ result: 'ended' }` through the envelope handler, and grant to
   `authenticated`.

`submit_timeout` answers the same way; it fires from every connected client at
once, so all but the first find the game already over.

### Concede — per-player drop-out

**Concede is the compete counterpart to Stop**: "I quit; the others play on." It
is a real loss for the conceder and never a mutual stop — the last player to
concede ends the game as a collective loss. A concession is a player's ending
with reason `conceded`, which is what lets a verdict say "Conceded" rather than
"Lost". Every compete game has one; co-op never does.

The front end always calls the game's own `<game>.concede`, and every one has
the same shape:

1. `common._require_compete` where the game has a co-op sibling, then lock the
   game's own row, as Stop does. It matters in a game whose "is anyone still
   racing?" check reads its own rows as well as `game_players`: a final move
   and a concession both ask it, and without the move's lock each could read
   a snapshot from before the other's write, both see someone still racing,
   and the game would wedge with nobody left. `src/guards/concedeLock.test.ts`
   holds it. The other games take it too, so every `concede` has one shape.
2. **`common._concede`**: the guards — a player of this game, the game not
   over, not already conceded ("Already conceded"), not ended some other way
   ("Already out": a loss is already a loss, and a finisher would only throw
   away a win they may hold) — then the concession, and, once **every** player
   has conceded, `_end_game` as a `conceded` collective loss. That holds in
   every game: if everyone conceded, nobody solved, won or finished.
3. **A game where a player can end some other way** (solved, out of guesses,
   eliminated) runs its own "is anyone still racing?" check next, skipping a
   game `_concede` already ended; a conceder never wins.
4. Its status builder, and the answer `{ result: 'conceded' }`. Whether the
   concession also ended the game is not in the answer; every client, the
   conceder's included, learns that from the builder's write.

Anyone may still Stop the game for all. `_concede` is not granted to
`authenticated`: a direct call would end a game without its builder.

### Not playing any more — `player_ended_at`

**A racer can stop playing while the game goes on** — out of guesses,
eliminated, solved in a race that plays on to rank everyone, or conceded — and
the presence-pause must not wait for them. `game_players.player_ended_at`
records it, with the player's reason pair (`reached_goal`,
`resource_exhausted`, `fatal_move`, `conceded`, `timeout`, and the game's own
word). The game RPC that detects it calls `common._set_player_ended`, which
keeps a player's first ending, with the outcome the RPC judges
([win-lose.md → `outcome-at-player-end`](win-lose.md#the-player));
`common._concede` writes a concession itself, and its `lost`;
`common._reset_game` clears it on Restart. A player who ended without
conceding may be the WINNER. The pause watches the players who haven't ended,
and `common._advance_turn` skips a seat that has. The terms are defined in
[win-lose.md → Where a player
stands](win-lose.md#where-a-player-stands--the-terms-as-formulas).

## Turn-order — opt-in turn-by-turn for coop games

Co-op is free-for-all by default: anyone may act at any time. A game whose moves
are discrete can offer **turn-by-turn** instead, with the same rules and board
and only *who may act now* changing. The mechanism is all common:

- **`games.current_turn_user_id`** — whose turn it is; null in a free-for-all
  game. **`game_players.turn_seat`** — each player's place in the rotation.
  Whether a game has turns at all is `turn_seat` being set (the frontend's
  `isTurnBased`), never read off a null pointer.
- **`common._assign_turn_order`**, once, from `create_game` when
  `setup.coop_style = 'turns'`: seat 0 is the chosen first player, the rest
  shuffled.
- **`common._require_turn`**, in the move RPC right after the row lock and the
  caller check: refuses a move out of turn (a race — the pointer moved). Inert
  when the pointer is null.
- **`common._advance_turn`**, after an **accepted, non-terminal** move only: a
  refused word must not cost the turn, and a move that ends the game has no one
  to hand it to. It skips any player who has ended.
- **`common._reset_game`**, on Restart, rewinds a set pointer to seat 0; a null
  one stays null. A game that opens elsewhere points the turn itself after the
  call.

Two setup keys carry the choice, both written by the shared
`SetupCoopStyleSection`: `coop_style` (`'turns' | 'free-for-all'`) and
`first_turn_user_id`. Only the first survives into the club's `default_setup`.
The rule is general: a style or mode preference is worth remembering, a pick of
a specific person is not. Each game's `create_game` does the strip itself
(`setup - 'first_turn_user_id'`), since it chooses what to pass
`common._create_game` as the saved default; codenamesduet drops
`first_clue_giver_user_id` the same way. The pointer is not the record of whose
go it was — the event log's `took_turn` is
([supabase.md](supabase.md#every-games-log-is-gameevents)). **A bot can take a
seat only where something pokes it to move**, since a bot has no client.

**A game whose turn does not simply rotate** seats its players the same way
but writes the pointer itself, from its own state, instead of calling
`_advance_turn`. codenamesduet does: its clue-giver can stay put when a
partner's agents are all found, so `codenamesduet._point_turn` names whoever
must act now — the clue-giver, then the guesser, then in sudden death the one
player with words left, or nobody when either may guess.

**A game that always takes turns** seats them in `create_game` whatever the
setup says. scrabble compete does, with its own seating: `scrabble._seat_turn_order`
sets each player's `turn_seat` to their scrabble seat (humans, then bots), so
the turn walks the opponent strip, and points the turn at a random seat — on a
restart too, after `_reset_game` has rewound it. It advances, gates and skips conceders with the common three.

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
| `delete_game` | remove a game and everything under it; any club member may |
| `set_scratchpad` | write a scratchpad |
| `anagrams`, `update_word`, `delete_word`, `add_word` | [word-list.md](word-list.md) |

The rest are **helpers**, revoked from `authenticated` and called only from
other security-definer functions: the gates (`_require_club_member`,
`_require_game_player`, `_require_valid_timer`, `_require_valid_mode`,
`_require_compete`, `_require_player_count_max`), the shared races
(`_raise_game_deleted`, `_raise_game_over`), and the halves every game calls
(`_create_game`, `_end_game`, `_reset_game`, `_concede`, `_stop`,
`_set_player_ended`, and the turn-order three). Tests for the helpers are
`supabase/tests/common/helpers_test.sql`.

## Revealing the solution

Whether a player is looking at the answer is a local display choice in the
frontend ([`common/reveal`](../src/common/reveal/doc.md)) — nothing is written.
**What the server owes is the shield**: each game's column grant and its
`_x_for()` helper hand the solution over once `ended_at` is set, over for EVERYONE.
That is the part that bites in compete: a player who conceded or finished early
is done while the others race on, and must not be able to read the answer out,
so the gate never keys on per-player doneness.

## Row-level security

RLS is on for every `common` table and there are no insert, update or delete
policies: every write is an RPC. Reads:

- **Club membership** gates most tables (`_is_club_member`), and `game_players`
  and `timers` through their game.
- **Profiles are readable by anyone signed in**, because creating a club means
  finding a friend by username before you share a club with them.
- **`gametypes`** is readable by all; a scratchpad row by the game's players
  (and a private pad by its owner).

### Only a player opens a game, and only a player acts

A game's players are a subset of the club, frozen at creation, and the creator
is one of them: `create_game` refuses a `p_player_user_ids` that leaves the
caller out. **Only a player opens the game's page** — the game page sends a
member who is not seated back to the club — and **only a player may act**:
every move RPC gates on `_require_game_player`. The read policies stay
club-gated, since a member reading rows for a page they cannot open does no
harm; `set_current_view`, `unset_current_view` and `tick_timer` take a club
member for the same reason. There is no spectating
([plans/seat-view.md](../plans/seat-view.md)).

### Realtime publication

`clubs_members`, `messages`, `games`, `game_players` and `game_scratchpads` are
in `supabase_realtime`; `supabase/tests/common/realtime_publication_test.sql`
pins the list. `profiles` is not — usernames don't change during a session.
