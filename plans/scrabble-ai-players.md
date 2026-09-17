# scrabble-ai-players — the three bots become real users

**Status: NOT STARTED.** Agreed with Joel 2026-09-17. The middle plan of three;
see [events.md](events.md) for the framing and the deploy rule (nothing ships
until all three are done).

> **Review notes at the end of this file (§10) — read them before starting any
> phase.** They are feedback from a second reader, not rulings. Two of them are
> regressions the phases below would ship as written.

## 1. Why

scrabble can seat up to three AI opponents in compete. They are not users, so
every surface that expects a player has a second shape for them:
`scrabble.players.user_id` is nullable with a `players_human_xor_ai` check,
the table's key is `(game_id, seat)` rather than `(game_id, user_id)`,
`scrabble.plays.user_id` is nullable, and the frontend mints a synthetic
`Member` per seat — `{ user_id: 'ai:2', username: 'AI 2', color: 'purple' }`.

Measured 2026-09-17: **81 AI mentions in `supabase/sql/scrabble.sql`, 53 lines
across 11 files in `src/scrabble/`, and zero in `src/common`.** So the concept
is fully contained today; the question is only where the special cases live.

Three reasons to move them:

- **It is what lets `events.user_id` be `not null`.** scrabble is the one game
  whose log rows can have no author, and the migration says why: *"AI PLAYER…
  which has no profile, so `user_id` is nullable."* Every other game's events
  table takes the skeleton in [events.md](events.md) §2 as written.
- **Named bots read better than numbered seats.** `ada-bot` instead of `AI 2`,
  with a real profile, a real dot color, and a turn log you can filter by them
  like anyone else.
- **It is the shape the future needs.** Joel: a bot sending a message to the
  game (*"I just made a great move: CHATTER"*), and later different
  personalities per bot. Both want a real identity to hang off.

## 2. The shape

- **`common.profiles` gains `ai_member boolean not null default false`** — the
  discriminator, so "is this a bot" is a column and not a name pattern.
- **Three profiles**, one per seat scrabble allows (`create_game` gates on
  `v_ai_count > 3`), named after computer scientists and passing the username
  constraint `^[a-z][a-z0-9-]{2,14}$`:

  | username | color |
  |---|---|
  | `ada-bot` | brown |
  | `bjarne-bot` | purple |
  | `claude-bot` | pink |

  Those three colors are already what the bots wear: `AI_DISC_COLORS = ['brown',
  'purple', 'pink']` in `src/scrabble/components/PlayArea.tsx`. That constant
  becomes the three profile rows.

  The `-bot` suffix is load-bearing: it is what tells a reader the dot is not a
  person. Color cannot say that, and nothing else needs to.

- **Bots ARE seated in `common.game_players`**, so they are players of the game
  everywhere participation is counted — the game header's roster, and
  `common.end_game`'s per-player results. Joel: *"a bot's win should definitely
  count."*
- **Bots are in no HUMAN club.** Provisioned through `db-add-user` they each get
  their own solo club (`=ada-bot` and friends) and a `clubs_members` row in it,
  because `common.claim_username` makes one for every profile — ruled acceptable
  2026-09-17 (§10.2). What matters for §3 is that no bot is a member of a club
  any human belongs to, which is what keeps them out of every roster and every
  picker.
- **`scrabble.players` keeps its per-bot row** (it holds the rack, the score and
  `ai_level`), with `user_id` now `not null`, the key `(game_id, user_id)`, and
  `players_human_xor_ai` retired.
- **`ai_level` stays where it is** — it is this game's strength setting for this
  game, not a property of the bot. Personality, if it ever lands, goes on the
  profile.

## 3. What it does NOT touch, and why — the `is_club_member` research

Joel asked (rightly) whether membership is used anywhere to validate a *third
party*. Researched 2026-09-17:

**`common.is_club_member(target_club text)` has one signature and reads
`auth.uid()`**, so it is structurally incapable of answering "is this *other*
user a member". Its 65 references are all either RLS policy `using (…)` clauses
or WHERE clauses inside SECURITY DEFINER helpers — in both cases about the
caller. **A bot never calls anything**: it has no session, and its move is
committed by a definer function that a human client pokes. So no branch and no
second function.

Third-party membership checks do exist, and they query `clubs_members` directly:

| site | about | bot impact |
|---|---|---|
| **`common.create_game`** | every listed `player_user_ids` — raises `'BUG: player not in this club: %'` | **the one gate to relax** |
| `common.require_club_member` → PN012 | the caller | none |
| `club_page_data` → PN495 | the caller | none |
| `club_page_data`'s roster query | a LISTING | the reason to stay out of the table |

So bots get **no** `clubs_members` rows, and the club page's roster — which
reads `clubs_members` joined to `profiles` — never shows them, with no filtering
anywhere. `create_game` grows one `or`: a listed uid may be a non-member if its
profile is an `ai_member`.

Also checked and found absent, which is what would have broken quietly:

- **Nothing joins `game_players` → `clubs_members`.** No read path assumes a
  seated player is a club member.
- **No edge function** references `is_club_member` or `clubs_members`.
- **`is_solo`** is a generated column off the `=` handle prefix, not a member
  count, so seating bots shifts nothing there.
- **The frontend** touches `clubs_members` only for the caller's own club list
  (`HomePage`'s subscription to its own rows).

**Chat**, for the future: `messages_select` is `using (is_club_member(…))` — the
caller. Writes go only through `common.send_message`, which does `caller_id :=
common.require_club_member(target_club)` and inserts `user_id = caller_id`, so a
bot can never post through the player path. When the bot-speaks feature lands it
is a definer path that names its author (checking `profiles.ai_member`), and it
still needs no membership. The chat panel can render the name and dot because
`profiles_select_authenticated` is `using (true)`.

## 4. Presence — the one shared behavior that changes

`computePause(presentUserIds, players)` is **one function, one line**:

```ts
return players.length > 0 && players.some((m) => !presentUserIds.has(m.user_id))
```

A bot never connects, so a bot game would pause forever. Either filter bots out
of `players` at the `useCommonGame` call site, or test the flag inside. One line
either way, plus a test — and a test is the point: "bots have no presence" should
be asserted, not assumed.

## 5. Setup, unchanged

The setup form keeps asking **how many bots**, as it does today. Joel: *"the
setup form code or rpc should then just assign that many, in alpha order. if we
give the bots 'personality' later, we'll change to pick-as-users."* So
`create_game` resolves `ai_count` → the first N bot profiles by username, and
seats them after the humans exactly as now.

**Only scrabble seats bots**, and they are not offered in any player picker, so
nobody can add them to another game. Joel: *"for now, only scrabble allows ais.
we just don't list them as 'players' in the list of players, so no one can add
them."*

## 6. What it unlocks: scrabble compete can drop its own turn pointer

scrabble runs **two** rotations today. Coop uses the common one
(`common.games.current_turn_user_id` + `game_players.turn_seat`); compete keeps
its own (`scrabble.games.current_seat` + `scrabble._advance_seat`, four call
sites). `common.sql` records that they *"coexist deliberately"* without saying
why — and the why is the bots:

- the compete gate is **by seat**, and says so: `if g.mode = 'compete' and
  p_seat is distinct from g.current_seat`, commented *"By SEAT (current_seat),
  so the same gate works whoever occupies it."*
- `_advance_seat` wraps over seats **including AI seats**;
- the common rotation walks `common.game_players.turn_seat`, and AI seats have
  no such row — *"AI is scrabble-local — it is NOT in common.game_players."*

So the rotation had to be seat-shaped because it had to include players that
were not users. **Once bots are users with `game_players` rows, that reason is
gone**, and the common pointer can carry compete.

Worth doing, because the shell is already mode-agnostic:

```ts
const isMyTurn =
  commonGame?.current_turn_user_id == null ||
  commonGame.current_turn_user_id === session.user.id
```

Nothing there assumes coop. So scrabble compete would **gain** the shared
`<TurnStatusLine>` ("Waiting for ● ada-bot…") and the not-your-turn board dim it
does not have today, and scrabble would shed `current_seat`, `_advance_seat`,
and the mode branch in three move RPCs.

Three things to settle first:

1. **Seating order.** `common._assign_turn_order` shuffles everyone after the
   chosen first player; scrabble deliberately seats AIs *after* the humans.
   Either keep scrabble's seating and adopt only the pointer, or teach the
   common seater an explicit order.
2. **The AI driver is seat-shaped.** `ai_move_context` asks "is the seat at
   `current_seat` an AI?" via `scrabble.players.ai_level`. It becomes "is the
   user at `current_turn_user_id` an `ai_member`?", or keeps reading `ai_level`,
   which survives either way.
3. **`seat` itself stays.** It owns the rack and the display order, and
   `(game_id, seat)` should stay unique. Only the POINTER is retired.

**This is visible in compete** — a turn line and a board dim that are not there
today — so it is a small UX change, not purely internal. It belongs in phase 4,
and it is optional: the bots work without it, and it is the tidying the bots
make possible.

## 7. The rule that has to be written down

**A gametype may seat a bot only where something pokes it to move.** The shared
rotation (`common._assign_turn_order` / `_advance_turn`) will happily hand a bot
the turn, and nothing would move until a client poked the edge function — the
table would just stall. Today this cannot happen, because scrabble's bots are
compete-only and scrabble compete rotates with its own
`scrabble._advance_seat`, deliberately coexisting with the common pointer.

That belongs in [docs/common.md](../docs/common.md) beside the rotation, not in
scrabble — it is a constraint on every gametype that might want a bot next.

## 8. Phases

**Phase 1 — the identities.** `profiles.ai_member` (migration), the three
profiles, and the `auth.users` rows they reference. Joel: **a script, not a
migration** — `auth` is Supabase-managed and a migration writing into it is what
breaks on a platform upgrade. So: a one-off Admin API script, run per
environment, plus `seed.dev.sql` locally. `db-data` is not part of `deploy`, so
prod's run is a documented manual step.

**Phase 2 — seating.** `create_game`'s one `or`; bots into `common.game_players`;
`scrabble.create_game` resolving `ai_count` → bot ids in alpha order.

**Phase 3 — presence.** §4, with its test.

**Phase 4 — scrabble sheds its second shape**, and optionally its second
rotation (§6). `scrabble.players.user_id` becomes
`not null`, the key becomes `(game_id, user_id)`, `players_human_xor_ai` goes,
`AI_DISC_COLORS` and `aiMemberOfSeat` go, and the log's `ai:<seat>` synthetic ids
become real user ids. This is where the 81 + 53 lines come down.

**Phase 5 — the closing proof.** `scrabble.events.user_id` becomes `not null`,
which [events.md](events.md) §10 left open for exactly this moment.

## 9. Open

1. **Which four of the eight palette colors**, if `brown` / `purple` / `pink`
   should change now that the bots have names (they are inherited from
   `AI_DISC_COLORS`, not chosen for these names).
2. **What a bot's `common.game_players` row says about presence** in the *data* —
   the roster row exists, so anything that reads "who is in this game" gets a bot
   and must not expect a heartbeat from it. §4 covers the pause; anything else
   reading presence needs a look during phase 3.

## 10. Review notes — 2026-09-17 (FEEDBACK, not rulings)

**What this section is.** A second reader (Claude Fable) checked this plan
against the code on 2026-09-17, before any phase started. The tags mean the
same as in [events.md](events.md) §14: **WRONG** is a false claim about the
code, verified at the file named, and the plan text should be corrected before
building; **ASK JOEL** is a question only he can answer, so ask and do not
pick; **TRAP** will bite even though the plan is right; **SUGGEST** is
optional. Line numbers are as of 2026-09-17 and will rot.

The two notes that matter most are 10.3 and 10.4: each is a regression that
the phases as ordered would ship.

### 10.1 WRONG — the Admin API script already exists

§8 phase 1 asks for *"a one-off Admin API script, run per environment."*
`supabase/scripts/add-user.ts`, wired as `gmake db-add-user ENV=… EMAIL=…
HANDLE=… COLOR=… DRY=1`, is that script: `createUser`, a magic link, `verifyOtp`,
then `common.claim_username` AS that user, with `deleteUser` as the rollback.
Its header argues against the seed.dev.sql approach in the same words the plan
uses. Use it rather than writing a second one. It validates a real email
address, so each bot needs a well-formed one. It also does what 10.2 describes.

### 10.2 ASK JOEL — `claim_username` puts every new profile in a club

§3's headline is *"Bots are NOT in `common.clubs_members`."* The only
profile-creation path in the repo is `common.claim_username`, and it
unconditionally creates the solo club `=<handle>` and a `clubs_members` row in
it (there is no trigger on `auth.users`; `claim_username_test.sql` pins that).
So a bot provisioned the normal way IS in `clubs_members`, in a club no human
belongs to.

Nothing a human sees changes either way: the player picker and the club roster
read ONE club's members, and no human is in `=ada-bot`. But §3 states the
absence as a fact and §5 leans on it, so it needs a ruling:

- **accept the solo clubs** — three `=…-bot` rows in `common.clubs` and
  `clubs_members`, exactly like every human's; `db-add-user` works unchanged;
- **skip them** — a bot-only provisioning path that inserts the profile
  without `claim_username`, so §3 stays literally true.

This reader leans to *accept*: it is one fewer path, and the picker argument in
§5 holds regardless.

**RULED 2026-09-17 — accept, on the grounds of whichever is easier.** Joel:
*"whichever is easier is fine; it's ok if they have clubs, it's ok if they
don't. i can always delete them later."* Easier is `db-add-user` unchanged, so
each bot gets its own `=<handle>-bot` solo club and a `clubs_members` row in it.
§2 says so now. Nothing a human sees changes: no human is a member of those
clubs, and the `create_game` gate in §3 is needed either way — a bot in
`=ada-bot` is still not in the club the game is being created in.

### 10.3 REGRESSION — an all-conceded compete game would never end

`scrabble._maybe_finish_compete` (`supabase/sql/scrabble.sql`, near line 1471)
counts non-conceded players with an INNER join from `scrabble.players` to
`common.game_players`. Today that join drops AI seats, so when every human has
conceded the count is 0 and the game ends. Once bots have `game_players` rows
they are counted, a bot never concedes, and the count never reaches 0: a table
of bots sits in `playing` forever. This belongs in phase 2 with a pgTAP case
(seat one human and one bot, concede the human, assert terminal).

`_advance_seat` and the winner queries near line 446 LEFT-join and are safe.
`scrabble._finish`'s `player_results` inner join is the good side of the same
change: it was written *"HUMANS ONLY"* and, once bots are seated, includes them
without a code change, which is how *"a bot's win should definitely count"*
falls out. Rewrite that comment when the phase lands.

### 10.4 REGRESSION — phase 2 cannot ship before phase 3

`useCommonGame` builds `players` from `game_players` joined to `profiles`, and
`computePause` runs over that list. The moment a bot's `game_players` row
exists, the pause fires and every bot game sits behind the overlay. Phase 3
(presence) is not separable from phase 2 (seating); do them as one phase, or
order presence first.

### 10.5 WRONG — the two options in §4 are not equivalent

§4 says *"Either filter bots out of `players` at the `useCommonGame` call site,
or test the flag inside. One line either way."* `PauseOverlay.tsx` carries a
second, independent version of the predicate (`players.some((m) => !presentUserIds.has(m.user_id))`)
and draws a hollow ring per absent player. Filtering `activePlayers` in
`useCommonGame` (the first option) fixes both, because `activePlayers` is what
reaches the overlay; changing `computePause` fixes only the flag. Take the
first option, and note that `Member` has no `ai_member` field today, so the
profiles select in `useCommonGame` gains a column.

Two more readers of that list to check in the same phase: `GamePage.tsx`'s
auto-suspend on `players.length <= 1`, and the header players strip, which
would draw a permanently hollow bot dot.

### 10.6 TRAP — the rematch would seat bots twice

`PlayArea.tsx` builds a new game's `player_user_ids` as `players.map((p) =>
p.user_id)`. With bots in `players`, a rematch passes the bot ids AND
`ai_count`, and `scrabble.create_game` seats them from both. Decide which
carries them; since §5 keeps "how many bots" as the setup input, the likely
answer is to strip `ai_member` profiles from `player_user_ids` and let
`ai_count` seat them, as it does today.

### 10.7 TRAP — the AI driver's predicate is seat-shaped in the frontend too

§6 point 2 names the SQL side. The frontend side is the effect in
`PlayArea.tsx` that decides to poke the edge function:
`isCompete && game.currentUserId == null && aiRoster.some((a) => a.seat ===
game.currentSeat)`. If phase 4 retires `current_seat`, that predicate has to be
rewritten against `current_turn_user_id` and the profile's `ai_member`, or the
bot never moves and the table stalls (§7's rule, from the other side). Keep
what the surrounding comments record: every connected client pokes, there is
no leader, and duplicates are harmless because the RPCs guard by seat and
version. The disarm path below it (a wedged poke ref *"wedges the game
permanently"*) must survive the rewrite.

Also, the RPC §6 calls `ai_move_context` is `scrabble.get_ai_context`.

### 10.8 TRAP — `profiles` has a column-order rule and a visibility rule

Two comments on `common.profiles` in the common migration apply to `ai_member`:

- `can_edit_words` is declared last on purpose, because prod received it as an
  `ADD COLUMN` and `db-drift` compares column order. `ai_member` arrives by a
  new migration (an `ADD COLUMN`, which appends), and the frozen baseline is
  not edited, so the order takes care of itself. Just do not "tidy" it into
  the baseline next to `color`.
- The block above `profiles_select_authenticated` says a column that is not
  public means doing the view first. `ai_member` is public in the same sense
  `color` is; say so in the migration comment, the way `theme`'s does.

There is no UPDATE policy on `profiles`, so `ai_member` is set only by the
migration, the seed, or a definer RPC.

### 10.9 SUGGEST — say where the "not one of us" signal moved

`AI_DISC_COLORS` carries a comment: the colors were kept off the palette's
usual first picks *"so a bot reads as 'not one of us'."* §2 moves that job to
the `-bot` suffix and says color cannot carry it. That is a deliberate
transfer; say so where the constant is deleted. It also answers §9's first open
question mechanically: `db-add-user` validates against `MEMBER_COLORS`, so any
of the eight names is legal, and the choice is taste.

### 10.10 SUGGEST — counts, names and a doc to update

- §1's *"53 lines across 11 files"*: twelve files match today, and the number
  will be different by the time anyone reads it. Drop the counts; "fully
  contained in scrabble" is the claim, and it holds (the two hits in
  `src/common` are comments).
- §6 quotes *"coexist deliberately"* as from `common.sql`. The phrase is in the
  common MIGRATION beside `current_turn_user_id`, and `docs/common.md` says
  unifying the two pointers is out of scope. If §6 lands, that doc sentence is
  what to rewrite.
- The bots' display name today is `AI ${i + 1}` by position among AI seats,
  while the synthetic id is `ai:${seat}` by absolute seat. The two differ when
  a human sits between bots. Both go in phase 4; noting it so the log's actor
  lookup is rewritten from the profile, not from either of them.
