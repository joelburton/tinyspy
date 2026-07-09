# Common

Everything in the codebase that isn't a specific game. The cross-cutting layer that every game sits on: profiles, clubs, chat, routing, the game registry, theme tokens, the shell. Read this before touching anything that's used by more than one gametype.

For per-gametype reference docs, see `docs/games/` — one file per gametype (indexed in the top-level [`CLAUDE.md`](../CLAUDE.md) table). Testing conventions live in [`testing.md`](testing.md).

## What "common" means here

Common is **the layer beneath the games, never beside them**. The structural rule the codebase enforces, both by convention and by ESLint, is:

- `common/` may not import from any `<game>/`.
- `<game>/` may not import from another `<game>/`.
- Only legal cross-feature direction: `<game>/` → `common/`.
- `src/games.ts` is the one exception — it imports every game's manifest by definition.

The payoff is the **removability invariant**:

> Any game must be removable in three actions: delete its folder, delete its line from `src/games.ts`, drop its schema.

If removing a game requires editing anything in `common/`, the shell, or another game, **the boundary has leaked**. If common ever depended on a specific game, removing that game would break common — which would mean it wasn't really common. Every rule in this doc supports this invariant; the supporting code-side conventions (multi-schema design, import-direction rules, the games registry, per-game RLS helpers) live in [`code-conventions.md`](code-conventions.md).

This applies on the database side too: the `common` schema must not reference any game schema. Game schemas reference common (`codenamesduet.games.club_handle → common.clubs.id`), never the reverse.

## Solo and multiplayer play — both live in clubs

The architecture treats solo and multi-player uniformly: **every game has a club, and "solo" just means a club with one member.** There is no separate solo-game code path, no nullable-`club_handle` sentinel, no `solo_games` table — solo is a club-size case of the same flow.

Concretely:

- Every game's `games` table has `club_handle NOT NULL`. The FK is to `common.clubs`; there is no "solo" alternative.
- Each user gets a **solo club** (handle `=<username>`) materialized at first sign-in by the `common.claim_username` RPC (see [Username claim flow](#username-claim-flow) below). The solo club is the venue for that user's solo play — when a future gametype plays naturally as 1-player (a single-player boggle puzzle, a daily crossword), the user enters their solo club and starts it there. Same shell, same routing, same `create_game` RPC.
- Game-internal logic (score reports, replay history, board generation) is the same regardless of club size.
- A gametype's supported player-count range is declared on its manifest (`numberOfPlayers: [min, max]`). The shell decides whether to surface "Start X" in a given club by checking the range against the club's member count. A fixed-seat range like codenamesduet's `[2, 2]` never appears in a solo club; open-N ranges like `[1, 6]` appear in solo clubs and in clubs up to the cap; a future game with `[3, 5]` would only appear in clubs sized 3-5. ClubPage hides the button entirely when there's no `clubs_gametypes` row, and disables it with a tooltip when the row exists but the count is out of range — see `playerCountFits` / `playerCountLabel` in `src/common/lib/games.ts`.
- Mode-specific UX (coop vs compete) does NOT live in the setup form — see [The sibling-manifest pattern](#the-sibling-manifest-pattern) below. Each variant is its own registered gametype with its own Start button; setup choices stay shape-uniform across siblings.

The "every game has a club" invariant earns its keep on the **stats** axis: per-club aggregates (history, win-rate, recent activity) join cleanly on `club_handle` without a solo-records sidecar. Your solo club's stats *are* your solo stats by virtue of you being its only member. The orthogonality lives in the data shape, not in a forked solo-vs-club code path.

codenamesduet's `club_handle NOT NULL` and 2-member requirement aren't an exception to this rule — they're just where its `[2, 2]` player-count range lands. Same shape as any other gametype.

## The sibling-manifest pattern

One game family can declare multiple variants — coop vs compete is today's canonical example; "super-tough boggle" with a different player range or rule tweak is a possible future shape. Each variant gets:

- its own row in `common.gametypes` (`psychicnum_coop`, `psychicnum_compete`)
- its own manifest entry in `src/games.ts` (`psychicnumCoopGame`, `psychicnumCompeteGame`)
- its own URL prefix (`/g/psychicnum_coop/<id>`, `/g/psychicnum_compete/<id>`)
- its own Start button on the ClubPage

Variants share **everything else**:

- One folder under `src/<baseGametype>/` — `PlayArea`, `SetupForm`, `Help`, `useGame`, `theme.css`, `logo.svg` all serve every sibling. Components branch on `manifest.mode` (or, at runtime, on the gametype string / the denormalized `mode` column) where rendering differs.
- One schema under `<baseGametype>.*` — the same tables back every variant. A `mode text` column on the game-row table is denormalized from the gametype string at create-time, expressly so RLS policies can branch without joining to `common.games` for every visibility check.
- One create_game RPC — takes a `mode text` parameter that:
  - selects which gametype string lands on `common.games.gametype` (`'<baseGametype>_' || mode`),
  - is stored on the per-game row's `mode` column,
  - drives any per-mode validation (e.g., compete requires ≥2 players).
- One doc — `docs/games/<baseGametype>.md` covers every variant in the family.

Each manifest declares two fields connecting these pieces:

| field          | purpose                                                                     |
|----------------|-----------------------------------------------------------------------------|
| `baseGametype` | The family key. Equals `gametype` for single-mode games. Used to group siblings (today informally; later structurally — ClubPage may render siblings as a single visual group). |
| `mode`         | The interaction axis: `'coop'` or `'compete'`. Used by the FE for component branching and as the per-mode constant passed into shared RPCs. |

**Why per-gametype-per-variant** rather than a setup-form radio:

- **Discoverability** — both modes are visible as separate Start buttons; the choice is the first click, not a buried radio.
- **Saved defaults** — `common.clubs_gametypes.default_setup` is per `(club, gametype)`. Variants get independent defaults (coop remembers 7 guesses, compete remembers 5) for free.
- **labelFor / Help copy** — coop "we won together" vs compete "you won the race" gets distinct copy per-manifest without `if (mode === 'coop')` inside the function bodies.
- **Per-club opt-out** — `clubs_gametypes` is per (club, gametype); a club could disable compete without disabling coop.

**Solo-club handling.** A compete manifest declares `numberOfPlayers: [2, max]`, so the Start button hides in 1-player solo clubs (`playerCountFits` filter on the ClubPage). The corresponding create_game RPC also enforces the floor server-side — `compete mode requires at least 2 players` is raised P0001 if anyone bypasses the FE gate. A coop manifest's `[1, max]` allows solo play, with the countdown timer (if set) doing the "lose if time runs out" job a compete opponent would otherwise do.

**Removing a family.** Drop the folder, drop **all** the manifest's lines in `src/games.ts`, drop the schema. The removability invariant still holds — siblings are removed together.

psychicnum is the canonical reference today — see [`docs/games/psychicnum.md`](games/psychicnum.md). When connections and spellingbee pick up their compete-mode variants, they'll follow the same shape.

## Library-puzzle games: provenance, not dependency

Some games source their board from a **curated library** instead of random generation: connections (`connections.puzzles`, the NYT archive), stackdown (`stackdown.boards`), and any future dated-puzzle game (crosswords). The rule for how a per-game `games` row relates to its library:

**Copy everything the game needs onto the `games` row at create time; keep the library link as a *soft* FK (`on delete set null`, nullable).** The library is *provenance* — "which puzzle this came from" — never a runtime dependency. A game must stay fully playable **and** self-describing if its source puzzle is later deleted or re-imported.

Concretely, freeze onto the game row at create time:

- the **gameplay data** — connections copies the puzzle's `categories` into `games.board`; stackdown copies `tiles`/`solution`/`wordlist`. Gameplay code reads these frozen copies, never the library table.
- the **identifying provenance** — connections copies the puzzle's `nyt_date` into `games.puzzle_date` (the bit a player reads to know *which* puzzle it is).

**stackdown is the template** — its `board_id` is `on delete set null` with the board data copied (see its schema comment). **connections was the cautionary case**: it hard-FK'd the puzzle (`on delete restrict`) and left the date un-frozen, so it couldn't retire a puzzle and had to *join* `puzzles` just to show the date — since fixed to match this rule. The payoff: puzzles can be cleaned up / re-imported freely, and in-flight games never break.

## The shared scratchpad (opt-in common feature)

A per-game **scratchpad** — a free-text notepad for working out answers — that any gametype opts into via a manifest field. Built as a genuinely common feature (crosswords is the first consumer; the removability invariant holds — there are zero game-specific references under `src/common/`). The moving parts:

- **`common.game_scratchpads`** (table) + **`common.set_scratchpad(target_game, p_owner, p_body)`** (RPC) — one row per pad, a per-row `version` bumped on write. `owner_id null` = the **shared** coop pad; a user id = a **private** per-player compete pad. RLS gates a row to game members (and, for a private pad, its owner).
- **`useScratchpad`** (`hooks/scratchpad/`) — the body syncs via CDC "newer wins" (per-row `version`) with an optimistic local echo + a debounced full-text flush, exactly like `useCells` but for one text blob. The shared coop pad also carries a **Realtime-Broadcast takeover lock**: the current editor re-asserts a claim while typing and auto-releases when idle; others are read-only until they take over. While you hold the lock, incoming CDC bodies are ignored so a write racing your flush can't revert your keystrokes (mirrors crossplay's `ScratchpadPanel`).
- **`GameScratchpad` / `ScratchpadBubble`** (`components/panels/`) — the panel rides on `FloatingPanel` + `useDraggablePanel` (persisted per-game rect), and `scratchpadOpenStore` (`lib/scratchpad/`) mirrors `chatOpenStore`. `<GamePage>` gates the whole thing purely off the manifest `scratchpad` field (`{ enabled; perPlayerInCompete? }`).

Trust model: the lock is FE-only arbitration (friends, not adversaries) — `set_scratchpad` itself has no lock check. Two self-healing lock races (simultaneous claims; a late joiner with no lock snapshot) are documented in [`deferred.md`](deferred.md) → crosswords.

## Schema: `common.*`

### Tables

| table | purpose |
|---|---|
| `profiles` | One row per auth user. Holds `username` (unique, CHECK-validated against the canonical regex `^[a-z][a-z0-9-]{2,29}$`) + `color` (from the 8-entry palette CHECK). Materialized by the `common.claim_username` RPC the user calls themselves on first sign-in (no trigger; see [Username claim flow](#username-claim-flow)). `username` is immutable in v1; `color` is editable via the caller-scoped `common.update_profile_color` RPC (the "Edit profile" dialog). No UPDATE policy — both writes go through RPCs. Cascades from `auth.users`. |
| `clubs` | A fixed-membership room formed by one creator. `handle` (unique, URL-safe) drives `/c/<handle>` routes. Solo clubs use the reserved handle `=<username>` so user-typed names can't collide. |
| `clubs_members` | M2M between clubs and profiles. Membership is fixed at creation in v1 — no add/remove RPCs. The relational shape exists because (a) it's the right model and (b) future member-listing UI wants it. |
| `gametypes` | The registered-gametype list (`gametype text PK`, `min_players smallint`). Authoritative SQL-side mirror of `src/games.ts`. Each gametype's baseline migration registers itself with an `INSERT ... ON CONFLICT DO NOTHING`, declaring its `min_players` (the lower bound of the manifest's `numberOfPlayers` — coop/solo games register 1, two-player games 2). Sibling families register one row per variant — psychicnum's baseline inserts both `psychicnum_coop` and `psychicnum_compete`. `min_players` is the one fact the server needs from the player-count range: `common.default_gametypes_for_club` uses it to keep solo clubs out of two-player games. Permissive SELECT — gametype identifiers aren't sensitive. |
| `games` | The universal game-record header. One row per game-playing across all gametypes. Holds `club_handle`, `gametype`, `title`, the **view-state pair** (`is_current_view`, `paused`), the **play-state pair** (`play_state` text + `is_terminal` boolean), `status` jsonb (the gametype-specific listing-label payload), `started_at`, `ended_at`, and `last_active_at` (stamped by a BEFORE UPDATE trigger on **every** write to the row — moves, the `is_current_view` shelve/resume flip, pauses, the terminal write — so the club games list orders + dates by when a game was last *touched*, not when it started; see [last_active_at](#last_active_at)). (The game clock lives in its own table, `common.timers` — see below.) Per-gametype detail (board, secret, current turn) lives on `<gametype>.games`, which shares an id with this row via FK. The `title` is a short human-readable label built by each gametype's `create_game` at insert time (see [Title formulas](#title-formulas)) — the FE renders it beside the gametype's logo in club game lists (`ClubGameCard`). The two state pairs and their orthogonality are written up in [`states.md`](states.md). |
| `game_players` | M2M between games and profiles, recording who played each game. Frozen at game-create time — distinct from `clubs_members`, which is current membership of the club. The `result jsonb` column carries each player's outcome (won/lost flag, score, etc.), populated by `common.end_game` at terminal transition. `conceded` / `conceded_at` are the per-player drop-out flag (see [Concede](#concede--per-player-drop-out)) — the one bit of per-player terminal state that exists *before* `end_game`, because peers must see who bowed out and the flag distinguishes "Quit" from "Lost" at game-over. |
| `clubs_gametypes` | M2M between clubs and gametypes. Row existence answers "is this club allowed to play this gametype?" — the FE filter for which Start buttons to surface in a club. Seeded at club-creation via `common.default_gametypes_for_club` (friend clubs via `create_club` get every registered gametype; solo clubs via `claim_username` get only the `min_players <= 1` subset, since their lone member can't field a two-player game). Members edit the set afterward through the "Edit club" dialog (`common.set_club_gametypes`). Sibling-variant pairs get one row per gametype string (`psychicnum_coop` AND `psychicnum_compete` both land here when the club is created). A `default_setup jsonb` column on each row carries the friends' last-used setup choices for that (club, gametype) — auto-written by `common.create_game` on every successful start, read by the FE on dialog-open and merged under the manifest's static defaults. Sibling variants get independent defaults (coop's last `setup.guesses` choice doesn't affect compete's). Each gametype decides what fields of its setup are per-club preferences vs per-game decisions (e.g., codenamesduet strips `firstClueGiverUserId` before saving since the seat picker is per-game); the per-game `create_game` RPC controls what gets passed as the `saved_setup` argument. See `deferred.md` for the setup-shape evolution policy. |
| `messages` | Per-club chat. Single persistent thread per club, spans games and gametypes within the club's lifetime. 1–1000 character constraint on `content`. **Important-prefix:** a message starting with `!` is treated as important — `<FloatingChat>` force-opens the chat popover for every other player when one arrives (the panel stays open until they dismiss it), and `<ChatBody>` styles the message text differently. Useful for "Hey everyone — I'm back!" or "Pause please." Implemented in `FloatingChat.tsx` (`startsWith('!')` check on the latest message) + `ChatBody.tsx` (display strip the `!` + apply `.importantContent` class). |

### The view-state pair on common.games

`common.games.is_current_view` carries the **one current-view game per club, across all gametypes** invariant. View-state and play-state are orthogonal axes here — see [`states.md`](states.md) for the full picture of how the two columns compose.

Two things to keep in mind:

1. **A partial unique index on `(club_handle) where is_current_view = true`** is what enforces the invariant. The index only contains the current rows; multiple `is_current_view=false` rows per club are fine (the index doesn't index them). A second `is_current_view=true` row for the same club would raise `unique_violation` — which would be a `common.create_game` (or `common.set_current_view`) bug, since both RPCs explicitly flip the prior current row off before flipping the new one on.

2. **The view-state flip is presence-driven.** First-viewer-mounts fires `common.set_current_view(target_game)` from `useCommonGame`'s `SUBSCRIBED` handler; last-viewer-leaves fires `common.unset_current_view(target_game)` from cleanup-on-unmount when the local tab's last-known presence was just-me. `common.create_game` ALSO sets `is_current_view=true` on the new row + clears whichever row currently holds the slot (mid-game create-from-club-page would otherwise race against the FE's mount-time write). The replaced row's `is_current_view` flips to false; its `play_state` / `is_terminal` stay as they were. "Suspended" is the club-level state derived from `is_current_view = false AND is_terminal = false`.

The flip is the club's durable "current game" pointer: it drives the ClubPage's current-game card (and the abandoned-pointer heal). It does NOT pull anyone into the game — being added to a game pops a join invitation instead (see [Joining a game — the invitation popup](#joining-a-game--the-invitation-popup)).

`paused` is the second view-state column. Today it's not used directly (the pause overlay is computed client-side from `useCommonGame`'s presence-pause and manual-pause broadcasts); the column exists for future presence-pause durability. Only meaningful when `is_current_view = true` — pause has no semantics for a game nobody's viewing.

### Idle accounting (timer-state preservation)

The game clock is **`common.timers (game_id, ticks, last_tick)`** — its own table (not a column on `common.games`, so the per-second tick UPDATE doesn't churn the games realtime stream). `ticks` is an **additive** count of whole seconds of *active play*. Every actively-playing client calls **`common.tick_timer`** once a second; its conditional (`now() - last_tick >= 1 second`) advances `ticks` by at most 1 per real second — which dedupes across players (concurrent same-second calls no-op) and makes a pause/idle gap cost **+1 on resume, not the gap**. The FE (`useGameTimer`) derives the display from `ticks`: countdown shows `max(0, duration - ticks)`, countup shows `ticks`. Pause and "nobody viewing" need no bookkeeping at all — they're just seconds where nobody calls tick_timer, so the clock stops. (This replaced a subtractive `idle_since`/`total_idle_seconds` accumulator that had to fold idle windows on every view transition.)

The known leak: tab-kill / browser-crash / network-loss don't fire the FE cleanup, so `unset_current_view` doesn't run and that gap is counted as wall-clock time. See `docs/deferred.md` → "Timer-state preservation" for the mitigation options (sendBeacon on beforeunload, mount-time heuristic).

### Title formulas

`common.games.title` is `not null` and `length(trim(title)) > 0`-checked. Each gametype's `create_game` builds the value at insert time and passes it as the `title` argument to `common.create_game`. Choosing a formula is a per-gametype call — there's no universal-good answer ("just list the players" fails inside a single club where every game has the same 2-3 players). The actual formulas live in each gametype's per-feature doc under `### Title formula`.

The title is usually **fixed at insert**, but nothing stops a gametype's own RPCs from rewriting it mid-game — it's just a column on `common.games`. stackdown's coop mode does this: `submit_word` rewrites the title to the words cleared so far ("APPLE-BERRY-COMPY…"), so the club list reads a game's progress at a glance. (Compete deliberately doesn't — that would leak its hidden solution to the trailing racer; see [stackdown.md → Title formula](games/stackdown.md#title-formula).)

The "no gametype in the title" rule: titles never embed `"connections"` / `"codenamesduet"` etc. because `ClubGameCard` already shows the gametype's **logo** beside the title. A title that named the game would just echo the logo.

### last_active_at

`common.games.last_active_at` (timestamptz, defaults to `now()` at insert) dates a game by **when it was last touched**. The club games list orders by it (the `club_handle, last_active_at desc` index) and `ClubGameCard` renders it — so a long-suspended game sorts and reads by its last activity, not its `started_at` (which, for a game shelved weeks ago, is unhelpful).

It's maintained by a **BEFORE UPDATE trigger** (`games_touch_last_active` → `common.touch_games_last_active`) that stamps `now()` on every update to the row. No RPC sets it by hand. This is deliberate: an earlier imperative version (`set last_active_at = now()` inside `update_state` / `end_game`) was forget-prone, and we *did* forget it — a stackdown move path wrote its own schema and the games-row title without an explicit bump. The trigger makes it unmissable: if a game event writes `common.games` at all, the timestamp moves.

Because every meaningful event writes this row — a move (`update_state`), shelving / resuming (the `is_current_view` flip in `create_game` / `set_current_view`), a pause, the terminal write (`end_game`) — "last touched" lands on the shelved/ended/last-played reading the list wants. The one thing the trigger can't see is a per-gametype move that writes ONLY the gametype schema and never the games row (early stackdown compete). That's a non-issue for the *date*: while such a game is mid-play it's the club's **current** game (shown as active regardless of date), and the moments that actually surface a date — shelving and ending — both write the games row and stamp correctly.

### Club-level game lifecycle

Game instances within a club fall into one of two display buckets on the club page, derived from the view-state + play-state pair:

| club-level state | derivation |
|---|---|
| **current** | `is_current_view = true` |
| **other** | everything else, split by CSS treatment into terminal vs non-terminal (per [`states.md`](states.md)) |

The transitions that move a row between buckets:
- `common.create_game` — vacates the prior current-view row (set false), inserts new row with `is_current_view = true`, `play_state = 'playing'`, `is_terminal = false`, and seeds the game's `common.timers` row at `ticks = 0`.
- `common.set_current_view(target_game)` — same vacate-others + set-target. Pure pointer flip, no timer work.
- `common.unset_current_view(target_game)` — clears the target (set false). Pure pointer flip.
- `common.end_game` — sets `ended_at = now()`, writes `play_state` (terminal value), `is_terminal = true`, and the listing-label `status` jsonb (`last_active_at` follows via the trigger, so a finished game dates by its end time). **Does NOT touch `is_current_view`** — a terminal game stays in the current slot until the last viewer leaves (review-the-final-state is a legitimate use case for the current view).
- `common.update_state(target_game, play_state, status)` — mid-game state writes (non-terminal). Each gametype's submit_* RPC calls this on every state-affecting move so the listing label rendered by `manifest.labelFor` is always current. (`last_active_at` rides along via the trigger — see [last_active_at](#last_active_at).)

### Manual end — every gametype's `end_game(target_game)`

**Every gametype exposes a player-callable "stop the game" RPC** — almost always `<schema>.end_game(target_game uuid)`. It's the "we've played as much as we want — stop the game now" action: in spellingbee you've found the words you care about; in connections/Waffle the group agrees to call it. It is a first-class part of the game lifecycle, **not** a per-game extra, so the behaviour is uniform across the roster. [`spellingbee.end_game`](../supabase/migrations/20260617000000_spellingbee.sql) is the reference implementation.

**`end_game` is the COOP / solo stop. Compete games use [Concede](#concede--per-player-drop-out) instead** — a race doesn't want a mutual "we all stop, nobody loses". So a compete game's player-callable-stop slot is filled by `<schema>.concede`, not `end_game`: it drops just the caller out as a real loss while the others keep racing (and if the whole group wants out, each clicks Concede). `end_game` still exists on every gametype and is what coop shows; compete shows Concede.

Three terminal transitions, deliberately distinct — don't conflate them:

| transition | who fires it | outcome |
|---|---|---|
| `submit_timeout` | the FE timer-expiry effect, only on a `countdown` clock hitting 0 | a **loss** (`play_state` = `lost`/`lost_timeout`/…) |
| `end_game` | any player, any time, from the GamePage menu | **neutral** — nobody won, nobody lost |
| suspend (leave-the-page) | last viewer leaving a non-terminal game | not terminal at all — game stays `playing`, just drops out of the current slot |

The uniform `end_game` contract (mirror this when adding a gametype):

1. `select … from <schema>.games where id = target_game for update;` (P0002 if missing).
2. `perform common.require_game_player(target_game);` — playership gates the action.
3. Guard non-terminal: if `common.games.play_state` isn't the game's active state(s) → raise `P0001 'game is not in progress'`. This makes a double-click (or a click racing a timeout) idempotent.
4. Build `player_results` = **every** player `{"won": false}` (no winner — friends agreed to stop, it's not a punishment).
5. `perform common.end_game(target_game, 'ended', jsonb_build_object('outcome', 'manual', …), player_results);` — the **uniform terminal `play_state` is `'ended'`** and the **status carries `outcome: 'manual'`**, across all gametypes.
6. **Realtime touch.** `common.end_game` writes only `common.games`. A game whose FE `useGame` subscribes to `<schema>.*` tables (most of them) won't see that write, so `end_game` must also do a no-op self-write on a subscribed `<schema>` row (e.g. `update <schema>.games set club_handle = club_handle where id = target_game;`) to produce a WAL entry the subscription wakes on. The terminal *modal* itself rides `useCommonGame`'s `common.games` subscription regardless, but board/progress refetches (and post-terminal reveals like Waffle's solution) need the touch.
7. `revoke execute … from public; grant execute … to authenticated;`

**FE side.** End game is a player action the PlayArea wires up: `window.confirm` then `db.rpc('end_game', { target_game: gameId })`. It's surfaced in **two** places, both driven by the same handler: an **info-column action-row button** (the shared [`<EndGameButton>`](../src/common/components/buttons/EndGameButton.tsx), disabled at terminal; see [ui.md → Info-column readouts](../ui.md#info-column-readouts)) AND a **header-menu item** (`{ id: 'end-game', … }`, shortcut ⌥⌫) — every game's menu carries it via the [`buildGameMenu`](../src/common/lib/game/gameMenu.ts) helper (compete shows `Concede game` / id `concede` instead). See [ui.md → GamePage menu](../ui.md#gamepage-menu). Either way the terminal rendering (`buildOver` + `manifest.labelFor`) must treat `play_state === 'ended'` / `status.outcome === 'manual'` as a **neutral** result — green "Game ended" copy via `GameOverModal`'s `outcome: 'won'` styling, never the red "you lost" branch. (GameOverModal only has won/lost coloring today; manual end reuses the green one with neutral copy.)

### Concede — per-player drop-out

**Concede is the compete-mode counterpart to `end_game`:** "I quit, but the game continues for the others." It is a real per-player loss, never a mutual stop — if a whole group wants to abandon a stale race, each player clicks Concede and the *last* one to do so ends the game as a collective loss. Every compete game has it (coop never does — a team has no one to keep racing).

**The state lives in `common`, once.** `common.game_players.conceded` (+ `conceded_at`) is the flag; it's surfaced to every game's FE on `ctx.players` (typed [`GamePlayer`](../src/common/lib/games.ts) = `Member` + `conceded`/`result`) via `useCommonGame`, which refetches the roster on a `common.game_players` realtime listener (a mid-game concede touches *only* that table, so the `common.games` listener wouldn't fire). It's the one bit of per-player terminal state that exists **before** `end_game`, and it's what lets a terminal distinguish the two "no longer active" reasons: `playerOutcome(p)` returns `won` / `quit` (conceded) / `lost` (beaten or eliminated), which games render as "Quit at Amazing" vs "Lost at Amazing".

**Two SQL shapes** (both gate to compete + reject coop):

- **`common.concede(target_game)` — the generic one, for NON-elimination games** (spellingbee, boggle, stackdown, bananagrams). Where the only way a non-conceded player stops racing is by *winning* (which already ends the game), the active set is exactly "not conceded", so this marks the caller out and ends the game as a collective loss iff no non-conceded player remains. Those games' `<schema>.concede` is a one-line wrapper over it.
- **`common._set_conceded(target_game)` + the game's own terminal check — for ELIMINATION games** (wordle, waffle, connections, psychicnum) and **turn-based scrabble**. Here a player can be "done" without the table ending (out of guesses / swaps / mistakes; or it's simply not their turn), so a drop-out can't be resolved by a generic active-count. These extract a `<schema>._maybe_finish_compete` (shared by the move RPC *and* `concede`) that treats a conceder as done and **excludes them from winning** — a drop-out forfeits, even a tying score. scrabble additionally skips conceders in `_advance_turn` and hands off the turn.

**FE side** mirrors `end_game`: `window.confirm` then `db.rpc('concede', { target_game })` (every game has an own-schema `concede`, so the call is uniform). The info-column action row shows **Concede** in compete (`<ConcedeGameButton>`) and **End** in coop (`<EndGameButton>`); the OpponentStrip marks a conceder "out"; and the conceder gets a "You conceded" locally-terminal look (the same "I'm done, others race" branch elimination games already had) with their input disabled. bananagrams is the origin of the pattern; its per-player `concede` was promoted here in the 2026-07 sweep.

### Solo clubs

Every user gets a solo club at first sign-in, materialized by the `common.claim_username` RPC the user calls themselves on the ClaimHandleScreen (see [Username claim flow](#username-claim-flow) below). The solo club's `handle` is `=<username>` — the `=` prefix lives in a slug-space user-typed names can't reach, because `slugify_club_name` strips `=` along with other non-alphanumerics.

Solo clubs are the anchor for solo-game-mode play (boggle, crosswords) and per-user stats. The HomePage lists each user's solo club alongside their regular clubs, visually distinguished (star icon, accent background tint, "Solo" badge) and always sorted to the top — once the user knows where their solo space is, "Start connections alone" is a normal flow inside that club rather than a separate UI shape. Most game logic doesn't distinguish solo clubs from regular ones; the `club_handle` is just non-null in both cases.

Coop gametype variants (those declaring `mode: 'coop'`) with `min === 1` render their Start buttons normally inside a solo club's ClubPage. Compete variants declare `min === 2` so they never appear in solo clubs — a 1-player race against no opponent is degenerate; the FE just hides the button. Coop with a countdown timer is the right "race against a clock" UX for a solo player. Fixed-seat gametypes like codenamesduet's `[2, 2]` stay multi-member-only — their Start button is hidden in a 1-member solo club.

### Username claim flow

There is no `handle_new_user` trigger anymore. The flow is now user-driven:

1. User signs in via magic link → `auth.users` row materializes; `useSession` detects the new session.
2. `useSession` queries `common.profiles` for the row; missing row → returns `needsClaim: true`.
3. `App.tsx` gates on `needsClaim` and renders `<ClaimHandleScreen>` instead of HomePage.
4. User picks a handle that matches the regex `^[a-z][a-z0-9-]{2,29}$` and a **player color** (pre-selected from a deterministic FE hash of the username via `defaultColorFor`, but changeable). Submit calls `common.claim_username(desired text, chosen_color text)`.
5. The RPC atomically inserts the profile row (with the chosen color — it's **required**, validated against the palette; the DB doesn't derive a default), creates the `=<username>` solo club, adds the membership row, and seeds `clubs_gametypes` for the solo club with every **solo-playable** gametype (`min_players <= 1` — a one-member club is never enrolled in a two-player game; see `common.default_gametypes_for_club`).
6. `useSession` re-probes; `needsClaim` flips to false; HomePage mounts.

Reject reasons:

| condition                                | SQLSTATE |
|------------------------------------------|----------|
| not authenticated                        | `42501`  |
| handle fails the regex                   | `P0001`  |
| profile already claimed (this user)      | `P0001`  |
| color not in the 8-entry palette         | `P0001`  |
| handle collision with another profile    | `23505`  |
| auth.users row vanished (stale-JWT case) | `23503`  |

The 23503 case surfaces when a stale JWT from a previous Supabase project sits in localStorage but its `auth.uid()` no longer exists. `ClaimHandleScreen` catches that error and calls `supabase.auth.signOut()` to reset back to LoginScreen.

## RPCs

All RPCs in `common` are `security definer` and granted only to the `authenticated` role.

### `common.claim_username(desired text, chosen_color text) → text`

Atomically creates this caller's profile (with the chosen player color — required, palette-validated; no server-side default), solo club (`=<username>`), solo-club membership, and clubs_gametypes seeds. Called once per user on first sign-in via `<ClaimHandleScreen>`. Returns the claimed username. Reject reasons in [Username claim flow](#username-claim-flow) above.

### `common.create_club(club_name text, member_usernames text[]) → text`

Atomically creates a club plus all member rows plus its clubs_gametypes seeds. Returns the new club's `handle` (also its PK). Reject reasons:

| condition | SQLSTATE |
|---|---|
| not authenticated | `42501` |
| name slugifies to an empty handle (`"!!!"` etc.) | `P0001` |
| name slugifies to a handle not starting with a letter (`"123 club"`) | `P0001` |
| one or more usernames don't exist | `P0002` |
| resulting membership < 2 | `P0001` |
| handle collision with an existing club | `23505` (`unique_violation`) |

The caller is auto-added if not in `member_usernames` — a UI that lets the creator type only their friends doesn't have to remember to also include themselves.

### `common.set_club_gametypes(target_club text, gametypes text[])`

Replaces a club's `clubs_gametypes` set with exactly the passed list — the write side of the "Edit club" dialog. Any club member may call it (friends, not an admin hierarchy); reject reasons: not authenticated / not a member (`42501`), unknown gametype in the list (`23503`, FK). Deletes by difference rather than truncate-and-refill, so an unchanged row keeps its `default_setup`; an empty (or NULL) list clears every enrollment. Applies **no** solo-club `min_players` filter — that only shapes the default enrollment at creation; a member may list a two-player game in a solo club, it just won't be startable.

### `common.send_message(target_club text, content text)`

Posts to a club's chat. `target_club` is the club's handle (PK). Reject reasons: not authenticated, not a member, empty/whitespace-only, over 1000 chars.

Writes go through this RPC only; the table itself has no insert grant on `authenticated`.

### Helpers (not callable from the client)

| function | role |
|---|---|
| `common.is_club_member(target_club text) → boolean` | Security-definer RLS helper. Used by every `common.*` table's SELECT policy. Marked `stable` so Postgres can cache it within a SELECT — the RLS layer calls it once per row otherwise. |
| `common.slugify_club_name(name text) → text` | Lowercase → non-alnum to `-` → trim → cap at 40 chars. Strips `=` along the way, which is what keeps user-typed names from producing solo-club handles. |

### Game-RPC helpers (called by per-game RPCs)

These exist so per-game `create_game` / `submit_*` RPCs stay focused on game-specific mechanics and don't independently re-implement the cross-cutting gates. Most are security-definer and revoked from public (no grant to `authenticated`) — they're callable only from within other security-definer RPCs in the same database, where SECURITY DEFINER chains let the call succeed without an explicit grant to the session user. They're still visible in the generated `Database` types because PostgREST inspects the catalog, but FE invocation gets `permission denied`. (The exception is `common.concede`, which IS granted to `authenticated` — the non-elimination games' `<schema>.concede` wrappers call it directly as the player.)

| function | role |
|---|---|
| `common.require_club_member(target_club text) → uuid` | Combined auth + membership gate. Raises `42501 'must be authenticated'` if `auth.uid()` is null, or `42501 'not a member of this club'` if the caller isn't in `clubs_members`. Returns the caller's `user_id` — most RPCs need it for downstream inserts. Use at the top of every `create_game` and in mid-game RPCs (after the row lookup for the case where the club_handle comes off the game row, e.g. `submit_guess`). |
| `common.validate_timer(timer_obj jsonb) → void` | Canonical timer-shape validation. Argument is the timer *subobject* (typically `setup->'timer'`), not the full setup blob, so the helper doesn't assume a specific nesting. Raises `P0001` with `setup.timer.*`-prefixed messages: `is required` (null), `kind is required` (missing kind), `kind must be none, countup, or countdown (got X)`, `seconds is required for countdown`, `seconds must be 1..3600 (got X)`. Use in every gametype's `create_game` that exposes a timer setup option. |
| `common.create_game(target_club text, gametype text, player_user_ids uuid[], title text, setup jsonb) → uuid` | The common (header) half of starting a new game. Auth + caller club-membership check, validates every uid in `player_user_ids` is in `clubs_members`, vacates the prior current-view game for this club (UPDATE is_current_view=false), inserts the new `common.games` row with `is_current_view = true`, `play_state = 'playing'`, `is_terminal = false`, `created_by = auth.uid()` (the starter — drives the join-invite attribution), the passed `title` and `setup`, seeds the game's `common.timers` row at `ticks = 0`, and inserts one `common.game_players` row per uid. Returns the new game id. Each gametype's `<gametype>.create_game` builds its title per the formulas above, calls this, then inserts its detail row using the returned id. |
| `common.require_game_player(target_game uuid) → uuid` | Auth + game-player gate. Raises `42501 'must be authenticated'` if `auth.uid()` is null, or `42501 'not playing this game'` if the caller isn't in `common.game_players` for the target game. Returns the caller's `user_id`. Use in mid-game RPCs (submit_guess, submit_clue, etc.) where the question is "is this caller actually playing this game" — finer than just club-membership. |
| `common.update_state(target_game uuid, play_state text, status jsonb) → void` | Mid-game state-write helper for the duplicate-write discipline. Each gametype's submit_* RPC calls this on every state-affecting move (after writing its own per-gametype counters) so `common.games.play_state` + `status` stay current for the club-page listing label. (`last_active_at` is stamped by the games trigger, not here.) `is_terminal` is forced to false; use `common.end_game` for terminal transitions. |
| `common.end_game(target_game uuid, play_state text, status jsonb, player_results jsonb) → void` | The terminal-transition counterpart. Sets `ended_at = coalesce(ended_at, now())`, writes the terminal `play_state` + `is_terminal = true` + `status` jsonb on `common.games` (`last_active_at` follows via the games trigger), and writes each player's `result` jsonb from `player_results` (keyed by user_id). Use at the moment a gametype's RPC decides the game is over (4 mistakes in connections, assassin in codenamesduet, etc.). Does NOT clear `is_current_view` — see the view-state section above. |
| `common._set_conceded(target_game uuid) → uuid` | Internal (revoked). The guarded first half of a concede: locks the game row, gates on playership + not-already-terminal + not-already-conceded, then flips `common.game_players.conceded = true, conceded_at = now()` for the caller and returns their `user_id`. Split out so elimination games can reuse the exact flag-flip before running their own terminal check. See [Concede](#concede--per-player-drop-out). |
| `common.concede(target_game uuid) → void` | **Player-callable (granted to authenticated).** The generic concede for NON-elimination compete games: calls `_set_conceded`, then ends the game as a collective loss (`play_state 'lost'`, `status.outcome 'conceded'`, every `{"won": false}`) iff no non-conceded player remains — otherwise the game continues for those still racing. Elimination / turn-based games use `_set_conceded` + their own `_maybe_finish_compete` instead. See [Concede](#concede--per-player-drop-out). |
| `common.set_current_view(target_game uuid) → void` | Mount-time view-state write fired by `useCommonGame` on `SUBSCRIBED`. Vacates the club's prior current-view game and flips the target's `is_current_view = true` — pure pointer flip, no timer work. Idempotent: re-mount of an already-current game is a no-op. |
| `common.unset_current_view(target_game uuid) → void` | Last-viewer-leaves view-state write fired by `useCommonGame`'s cleanup-on-unmount when the local presence snapshot was just-me (or empty). Clears `is_current_view`. Idempotent on the `where is_current_view = true` guard. (An abandoned pointer the leave-race misses is healed from the club page — see `useClubPresence`.) |
| `common.tick_timer(target_game uuid) → int` | The game clock's one writer. Every actively-playing client calls it once a second; advances `common.timers.ticks` by at most 1 per real second (the `now() - last_tick >= 1s` conditional dedupes across players and makes pause/idle gaps cost +1, not the gap) and returns the current count. See [Idle accounting](#idle-accounting-timer-state-preservation) above. |

Canonical pattern for a new gametype's `create_game`:

```sql
create function <gametype>.create_game(target_club text, setup jsonb)
returns table(id uuid)
language plpgsql security definer
set search_path = <gametype>, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
begin
  caller_id := common.require_club_member(target_club);

  -- gametype-specific setup validation (e.g. setup.foo + setup.bar)
  perform common.validate_timer(setup->'timer');  -- when this gametype has a timer

  -- gametype-specific board generation + game-row insert
  insert into <gametype>.games (...) values (...) returning id into new_id;

  -- Optional: prime common.games.status with initial label
  -- payload (mistake_count = 0, guesses_remaining = N, etc.).
  -- common.update_state writes play_state='playing' + status; see
  -- the per-gametype baseline migrations for examples.
  perform common.update_state(new_id, 'playing', jsonb_build_object(...));

  return query select new_id;
end;
$$;
```

Tests for the helpers live in [`supabase/tests/common/helpers_test.sql`](../supabase/tests/common/helpers_test.sql).

## Row-level security

Every `common.*` table has RLS enabled with a single SELECT policy gated by `is_club_member`. Profiles is the only exception:

```sql
-- profiles_select_authenticated: any signed-in user can see any profile
using (true)
```

Profile visibility has to be permissive for club-creation lookup — when you type "leah" into the new-club form, the FE has to resolve `leah → user_id` *before* you share a club with her. The right hardening axis, if it ever matters, is column-restriction via a view (`common.profiles_public`) that exposes only the safe columns. Tightening to "rows for users I share a club with" would break the lookup.

See the comment block above the policy in [`supabase/migrations/20260615000000_common.sql`](../supabase/migrations/20260615000000_common.sql) for the longer reasoning.

There are no INSERT / UPDATE / DELETE policies anywhere in `common`. All writes go through the security-definer RPCs above.

### Membership gates viewing; playership gates acting

A game's players are a **subset** of the club, picked at create time (the `SetupGameDialog` player checklist, defaulting to all members; the creator's own checkbox is locked on — you can't start a game you're not in) and frozen into `common.game_players`. The authz model splits cleanly along that line:

- **Viewing is club-gated.** Read-RLS on every game table uses `is_club_member`, so *any* club member can watch any of the club's games — including one they're not playing in.
- **Acting is player-gated.** Every game **move** RPC (`submit_clue` / `submit_guess` / `submit_word` / `submit_timeout`, per-game `end_game`) gates on `require_game_player` — a club member who isn't a player of *this* game is rejected with `42501 'not playing this game'`.

This is what makes **spectators a free future affordance**: a member can already view a game they're not in; they just can't act in it. No schema or auth change is needed to add spectator UI later — only the absence of a `game_players` seat. (Pinned by [`tests/spellingbee/player_subset_test.sql`](../supabase/tests/spellingbee/player_subset_test.sql).)

The deliberate exceptions — `set_current_view` / `unset_current_view` / `tick_timer` use `require_club_member`, not `require_game_player` — are *viewing*-adjacent, not moves: a member watching a game should be able to drive its current-view pointer and its clock even if they're not seated.

### Realtime publication

Four club tables are in `supabase_realtime`:

- `clubs` — new club, rename
- `clubs_members` — roster changes (deferred to v2, but free)
- `games` — new games + `is_current_view` flips (set/unset_current_view, the suspend-broadcast cascade) keep the ClubPage games list fresh; `status` jsonb writes from each gametype's `common.update_state` refresh the list labels. (This drove the old auto-nav; that's gone — joining is now via the invitation popup, and `game_players` INSERTs are what the global `useGameInvitations` watches.)
- `messages` — chat

Profiles is deliberately NOT in the publication — usernames don't change during a session and the realtime traffic isn't worth it.

## Frontend

### Folder layout

```
src/
  App.tsx              Top-level shell — auth gate + URL routing (/c/…, /g/<gametype>/<id>, /).
  main.tsx             Mounts <App>; imports common/theme.css globally.
  games.ts             THE registry — the only file allowed to import every game's manifest.
  types/db.ts          Generated by `npm run types:gen` — the DB schema as TypeScript.
  <gametype>/          One folder per game — its PlayArea / BoardCol / InfoCol / useGame /
                       lib / manifest. See docs/games/<gametype>.md.
  common/              The shared shell every game builds on.
    db.ts              export const db = supabase.schema('common').
    theme.css          Global design tokens (:root) + utility classes.
    components/  hooks/  lib/  pdf/
```

The `common/{components,hooks,lib}` internals — the feature-folder taxonomy + the PURPOSE of
each subfolder (and a "where does a new file go?" guide) — live in
**[common-layout.md](common-layout.md)** (the single source of truth; this file no longer
inlines a per-file tree, which went stale on the first reorg).

### URL routing

Path-based; no hash. The hand-rolled router in [`router.ts`](../src/common/lib/routing/router.ts) is ~40 lines: a `usePath()` hook that subscribes to `popstate`, a `navigate(to, replace?)` function that calls `pushState`/`replaceState` and dispatches a synthetic `popstate`, and a `<Link>` component that intercepts left-click and falls through for cmd/ctrl-click.

Routes the shell knows about:

| URL | what mounts |
|---|---|
| `/` | `HomePage` — clubs list + create-club link |
| `/c/new` | `CreateClubPage` |
| `/c/<handle>` | `ClubPage` |
| `/g/<gametype>/<gameId>` | `<GamePage>` with the manifest's `PlayArea` (lazy-loaded chunk) as its render-prop child |
| anything else | `HomePage` (forgiving fallback, not a 404) |

The `/g/<gametype>/<gameId>` shape is what makes multi-game routing work: App.tsx mounts `<GamePage>` directly with the manifest's lazy `PlayArea` as its render-prop child, keyed by `gameId` so navigation between games remounts cleanly (fresh state, no leaked subscriptions).

`<GamePage>` is the route-level shell — it owns the cross-cutting chrome (header / timer / Pause / Back-to-club, `<PauseBoundary>`, `<FloatingChat>`, `<SuspendConfirmDialog>`) and calls `useCommonGame` for the cross-cutting state. The per-game `PlayArea` receives `{ session, gameId, members, playState, isTerminal, timer }` (the `GamePageCtx` type exported from `src/common/lib/games.ts`) as props through the render prop. `playState` mirrors `common.games.play_state` (gametype-specific string); `isTerminal` mirrors `common.games.is_terminal`. The per-game `useGame` is just the postgres-changes subscription for that gametype's own tables — `play_state` lives on `common.games` and arrives via ctx, not on the per-gametype row.

**"Should this survive a pause?" is the rule that decides where state lives.** Because `PauseBoundary` unmounts its children on pause, anything inside the per-game `PlayArea` (component state, `useGame`-local state, form input) resets every time the game pauses. That's deliberate UX — clean slate on resume. State that *must* survive a pause goes either in the DB or in `useCommonGame` above the boundary (members, presence, the timer's pause-accumulator). State that's specifically transient (connections's shared-tile selections, an in-flight submit form) lives in PlayArea and clears naturally on unmount.

Why hand-rolled instead of react-router: the app has five routes, flat structure, no need for loaders or nested layouts. react-router adds 30–50 KB and a learning curve for what we'd write in ~40 lines.

### The game registry

The shell never imports a specific game. It iterates a registry:

```ts
// src/games.ts — the ONE file that lists games
import { codenamesduetGame } from './codenamesduet/manifest'
import { psychicnumGame } from './psychicnum/manifest'
import { connectionsGame } from './connections/manifest'

export const games: GameManifest[] = [
  codenamesduetGame, psychicnumGame, connectionsGame, spellingbeeGame,
]
```

Each gametype's manifest implements [`GameManifest`](../src/common/lib/games.ts):

| field | role |
|---|---|
| `gametype` | URL-safe identifier; matches the Postgres schema name by convention. The `<gametype>` segment in `/g/<gametype>/<id>` looks this up. |
| `schema` | Postgres schema where the game's tables and RPCs live. Same as `gametype` today, but kept as a separate field in case they ever diverge. |
| `name`, `shortDescription` | Human-readable. `name` is shown in pickers and titles; `shortDescription` is the subtle second line on each Start button. |
| `numberOfPlayers` | `[min, max \| null]` — the supported player-count range. ClubPage uses this to decide between hidden / disabled / enabled for each game's Start button. `null` upper bound means "no maximum." |
| `PlayArea` | Lazy-loaded React component, `ComponentType<GamePageCtx>`. App.tsx mounts `<GamePage>` for `/g/<gametype>/<id>` URLs and renders this as the render-prop child. Per-game `theme.css` is imported from the game's `PlayArea.tsx` so it ships in that game's chunk. |
| `setupForm` | `{ Component, defaults } \| null` — the per-game setup-form *definition*: the lazy-loaded body component + the initial setup value. `null` for games whose start needs no choices; the dialog is then bypassed entirely. (The *output* of the form lands on `<gametype>.games.setup`; same root word, different role — see [docs/naming.md](naming.md).) |
| `timerMode` | Optional `TimerMode` declaration: `{ kind: 'none' \| 'countup' } \| { kind: 'countdown', seconds: number }`. Consumed by `useGameTimer` (via `useCommonGame`) — for **fixed per-gametype** timers (e.g., a hypothetical Boggle with a 3-minute round). No game uses this field today; the gametypes that have a timer put it on per-game setup instead (stored on `common.games.setup.timer`, picked in the setup dialog via the shared `<TimerField>` component in `src/common/components/fields/`). The field is preserved for the per-gametype-constant case. |
| `submitTimeout(gameId)` | Async. Called by `<GamePage>` on countdown expiry. Each gametype dispatches to its own per-game `submit_timeout` RPC. Gametypes without a setup-side timer (codenamesduet today) can no-op this. Returns `{ error? }`. |
| `startGameInClub(clubId, setup)` | Async. Called by the SetupGameDialog (or directly by ClubPage when `setupForm: null`). Receives the dialog's collected setup payload. Returns `{id}` on success or `{error}` on failure. |
| `labelFor(commonGamesRow)` | **Pure and synchronous.** Given a `common.games` row (`{ id, gametype, play_state, is_terminal, status }`), returns the display string for the club page's games list. No I/O — every piece comes off the row. State-transition RPCs keep `common.games.status` populated with whatever shape the manifest's `labelFor` needs (the per-gametype shape is documented in each per-game doc). ClubPage queries `common.games` once for the club and dispatches each row to the matching manifest's `labelFor`. |

Adding a game is one line in `src/games.ts` plus the new folder. Removing a game is one line removed plus `rm -rf` the folder plus dropping the schema. Nothing else in the codebase names a specific game.

ESLint enforces the import-direction rules; see [`eslint.config.js`](../eslint.config.js) for the `no-restricted-imports` configuration. `GAMETYPES` in that file is the source of truth for which folders count as games.

### Joining a game — the invitation popup

Games seat every player at creation (a `common.game_players` row each), but nobody is dragged into the game. Being added to a game instead pops a **join invitation** — "*Moth* added you to a new *spellingbee* game" + a Join button — wherever the player is in the app. The logic is one global hook, [`useGameInvitations`](../src/common/hooks/game/useGameInvitations.ts), mounted once in `App.tsx` *after* the claim-handle gate (so it's on every real page, never the login/claim screens); [`<GameInvitations>`](../src/common/components/game/GameInvitations.tsx) renders the popups.

It watches `common.game_players` for INSERTs of the caller's own rows (instant popup while online) and **re-scans on (re)connect** for non-terminal games the caller is a player in — recovering invites sent while they were offline (rare, but the realtime INSERT alone would miss them). A localStorage **"seen" set** keeps one invite from re-popping; a dismissed invite is recovered via the club page, which still lists the game as the current game. The game the player is currently viewing is filtered out (you're never invited to the game you're in).

**The game waits for invitees.** Presence-pause counts every `game_players` row as an expected player (`computePause`), so a freshly-created game is *paused* — "Waiting for Bea…" — until each invited player joins. That's the point: the old auto-nav could "start" a game for someone who wasn't even at their computer; now the game genuinely waits for everyone to be present. Friends always join eventually, so there's no decline path. Attribution comes from `common.games.created_by` (the player who clicked Start), recorded by `common.create_game`.

This **replaces the previous ClubPage auto-nav** (a club-games subscription that navigated every member into any non-terminal `is_current_view` game). ClubPage's subscription now only refreshes its games list; `is_current_view` stays the club's durable "current game" pointer (the card + the abandoned-pointer heal) — it just no longer yanks anyone in. Joining a game while mid-play in another simply leaves the first (which pauses for the others).

### App-level keyboard shortcuts

One hook — [`useAppShortcuts`](../src/common/hooks/input/useAppShortcuts.tsx) — owns the shortcuts available on every "real" page (any ClubPage / GamePage, as opposed to the login / claim-handle screens). Both pages call it; the keys behave identically everywhere:

| key | does | how |
|---|---|---|
| `/` | open chat + focus its input | flips the `chatOpenStore`, then rAF-focuses `[data-chat-input]` |
| `?` | open the logo menu | calls the `openMenu` callback the page wires to its `<Menu ref>` |
| `~` | open the free-form **word-lookup** dialog | the hook owns the open/closed state and **returns** the `WordLookupDialog` node for the page to render |

The first two delegate to the caller (chat is a global store; the menu differs per page). The `~` lookup dialog is identical on every page, so the hook owns it outright — it holds the state and returns the dialog node, and each page just renders `{lookupDialog}` in its tree. That's why word-lookup is available almost everywhere with zero per-game wiring (see [Word definitions](#word-definitions-click-to-define--lookup)).

All three fire when nothing is focused (the mid-game common case, where word games read keys off `window`) **and** when a *game* input is focused (codenamesduet's clue field, psychicnum's guess field — opted in with `data-game-input`), but **not** when a non-game field has focus (a setup form, the chat box itself) — there the keys type literally. The gate is `isNonGameField`, shared with the same hook. Escape is deliberately not handled here; it stays "close the topmost open modal," owned by the dialogs.

## Theme & styling

Conventions live in [`code-conventions.md`](code-conventions.md); the short version:

- **CSS Modules**, one `*.module.css` per component, co-located with the `.tsx`.
- **Design tokens at `:root`** in [`src/common/theme.css`](../src/common/theme.css) — colors, spacing, font stack, radii. All other CSS references these via `var(--token-name)`.
- **Per-game themes are optional.** Each game may have its own `theme.css` that overrides tokens for that gametype's palette. codenamesduet has one (greens, reds, neutrals). Psychic-num doesn't (deliberately styling-free).
- **Utility classes** in `common/theme.css` for the things every screen needs: `.card`, `.muted`, `.error`, `.actions`, `.link-button`. No CSS framework.

`cls()` (in [`src/common/lib/util/cls.ts`](../src/common/lib/util/cls.ts)) is a tiny hand-rolled `clsx` equivalent for combining conditional class names. ~10 lines; no dependency.

## Auth & magic links

Auth is email-based magic links via `supabase.auth.signInWithOtp`. Custom SMTP (Resend) for the actual delivery, because Supabase's free-tier mail is rate-limited.

The sign-in email contains **both** a clickable magic link AND a 6-digit code. Two verification paths land at the same session:

- Click the link — Supabase's redirect URL exchanges it for a session and lands back at `window.location.origin`.
- Enter the 6-digit code in the LoginScreen's "I have a code" form — calls `verifyOtp({type: 'email'})` to exchange the code on the current device.

The code path is what makes cross-device sign-in work: open the email on your phone, type the code on your laptop. Either path emits `SIGNED_IN`, which `useSession` is subscribed to.

On first sign-in, the user lands on `<ClaimHandleScreen>` and picks a username themselves. The `common.claim_username` RPC materializes their profile + solo club (see [Username claim flow](#username-claim-flow) above). Username collision raises 23505, surfaced as an inline "that username is taken" error — the user retries with a different name.

[`useSession`](../src/common/hooks/session/useSession.ts) subscribes to `supabase.auth.onAuthStateChange` and returns `{session, needsClaim, loading, refresh}`. It probes `common.profiles` to distinguish the three resolved states (signed out, signed in but unclaimed, signed in and claimed). The probe also catches the stale-JWT edge case — when the JWT is signature-valid but its `auth.uid()` no longer exists in `auth.users`, the claim RPC eventually raises 23503 at submit-time and `<ClaimHandleScreen>` signs the user out.

## The word list (`common.words`)

The master playable-word list, shared by every word game (spellingbee today; Boggle, bananagrams board-validation, crosswords later). One row per playable word — a single categorized source each game filters to its own taste, instead of vendoring a per-game list. ~283k rows.

**Why `common`, not per-game.** Most upcoming games are word games, and the removability invariant forbids one game owning data another reads. A shared list in `common` is the natural home — `spellingbee` reads it, nothing in `common` reads back.

**The categorization columns are the filtering knobs:**
- `difficulty` (**1–6 recognizability band**: 1 universal, 2 common, 3 familiar, 4 uncommon, 5 obscure, 6 expert/SOWPODS-only) — "would a player *know* this word," not how often it appears in text (so `igloo`/`snuck` are easy, `ordure` hard). Lower = more recognizable; a single threshold controls how hard the playable set is. This backs the per-game difficulty choice (e.g. waffle's tier picker, spellingbee's required/legal bands). **Codebase convention: validation always allows the full 1–6 range; which bands a game *offers* is a FE/UI choice.**
- `american` / `british` / `canadian` / `australian` — dialect validity. Mostly a *spelling* filter (`colour`/`color`); a word like `lorry` is `american=true` too. Default play is `american OR british`.
- `crude` / `slur` — **smallint levels** (0 none, 1 mild, 2 strong): `crude` is profanity (`damn` → 1, `shit` → 2), `slur` is identity-slurs (`fatty` → 1, strong → 2). The **"clean" filter** most games want is `crude = 0 AND slur = 0` — what required / board / answer words draw from. They're still legal words (enterable), just kept off the must-find / answer set. (Per-game: spellingbee required + waffle board + stackdown words are clean; spellingbee legal and wordle answers allow any level.)
- `slang` — chiefly slang (`dude`, `aggro`). Lets a game offer a "no slang" filter; **orthogonal to difficulty** (slang can be band 1 or band 6).
- `wordle` — in the fixed NYT Wordle answer/guess list. A future Wordle game pulls exactly `WHERE wordle`.
- `len` — char length, so per-game length floors (spellingbee ≥4, Boggle ≥3, bananagrams ≥2) filter cheaply.
- `root_word` — lemma of an inflected form (`cats`→`cat`), for "see also" grouping.
- `definition` / `definition_source` — the click-to-define payload (see [Word definitions](#word-definitions-click-to-define--lookup) below).
- `hint` — a guessing-game clue that **hides** the word (the inverse of `definition`): a category / near-synonym nudge ("A hooded snake" → cobra). Present for the **hint set** (`len = 5 AND (wordle OR difficulty = 1)`), NULL elsewhere — the upstream build guarantees completeness for that set. Drives stackdown's "Reveal hint" (`reveal_next_hint`).
- `letter_mask` — a **generated** column: the 26-bit set of distinct letters in the word (bit 0 = `a`), via `common.word_letter_mask`. Powers the "find every word whose letters fit this puzzle" subset query (`letter_mask & ~puzzle_mask = 0`) that spellingbee's board builder runs.

**How a game uses it.** spellingbee defines its slice in `spellingbee.candidate_words`: legal = `difficulty ≤ 5`, required = `difficulty ≤ 3 AND american AND NOT slang AND slur = 0 AND crude = 0`, `len ≥ 4`. waffle picks a pre-generated puzzle whose hardest word is exactly the chosen band. Bands a game uses (or offers) are a per-game choice; the list itself holds every band.

**Seed + import.** Public reference data — `grant select` to `authenticated`, no RLS. Seeded from the word-list project's working copy `~/src/gamelist/words.tsv` (~283k rows) — read **live** by `npm run words:import`, never vendored into this repo, so it can't silently drift from the source the two projects are developed against in tandem (override the path with the `WORDS_TSV` env var). Loads via psql `COPY` (TRUNCATE + insert; `letter_mask` fills itself as a generated column). Same direct-Postgres load the other reference tables use (fast + reliable for the hosted load; see [spellingbee.md → Pangram seed import](games/spellingbee.md#pangram-seed-import-npm-run-spellingbeeimport) for why `COPY` beats batched HTTP upserts).

## Word definitions (click-to-define + lookup)

A shared definition lookup, available to every word game (spellingbee, stackdown, scrabble today; boggle/crosswords later). Two affordances: **click a word** in a list to get a popover (spellingbee's `WordList`, stackdown's `GameTurnLog` rows, scrabble's move log), and an app-global **shortcut key** (`~`) that opens a free-form "look up any word" dialog — the escape hatch for chasing a "see X" cross-reference or any word that isn't on screen. The `~` shortcut works on every "real" page (any ClubPage / GamePage, not just word games), the same as `?` for the menu and `/` for chat — see [App-level keyboard shortcuts](#app-level-keyboard-shortcuts).

Below the definition, `DefinitionView` also shows a small muted line of the word's **categorization** from `common.words` — difficulty `band N`, the dialects it's valid in (`US/CA/UK/AU`), any `slur-N` / `crude-N` level, and `wordle`-list membership — for any in-list word (even one with no definition text).

**Where the data lives.** Definitions are columns on [`common.words`](#the-word-list-commonwords) — `definition` + `definition_source` — not a separate table. The word list is already the shared, game-agnostic universe of words, so it's the natural home: we only ever define words that are *in* the list (a lookup of anything else returns "Unknown word" and is never stored).

- **`definition`** — the def text, or NULL if none yet. **`definition_source`** — one-char provenance: `s` (real gloss) / `e` (auto gloss, "plural of X") / `w` (live Wiktionary) / `m` (manual), or NULL = never looked up. The `s`/`e`/`m` glosses use a compact custom symbology (see the definition-format notes in [spellingbee.md](games/spellingbee.md)); `w` is plain prose. A `w` source with a NULL `definition` is the *negative-cache tombstone* — "looked up, Wiktionary had nothing" — so repeat lookups don't re-hit the API.
- **`common.cache_definition(word, def, source)`** — SECURITY DEFINER, service_role-only write path. An UPDATE guarded by `where definition is null`, so a seeded gloss is **never** clobbered by a later API write, and a word not in the list is a no-op (we never invent rows).

**Seed + growth.** The seeded glosses ship in the word list itself (`~/src/gamelist/words.tsv`, loaded by `npm run words:import` — see [The word list](#the-word-list-commonwords)). It then grows lazily: the **`common-define` Edge Function** is a read-through cache — reads `common.words` as the caller, and for an in-list word with no definition yet (source NULL) fetches **Wiktionary** (`freedictionaryapi.com`, CC BY-SA) and writes it back via `cache_definition`. Wiktionary won the bake-off over `api.dictionaryapi.dev` (~93% vs ~30% coverage on obscure bonus words, and no aggressive rate-limiting); a transient API failure surfaces an error *without* writing a tombstone, so only definitive empty answers are negatively cached.

**Frontend.** All in `common/`, so a game wires it in a few lines (spellingbee was the first consumer; stackdown + scrabble followed — each just renders `DefinitionPopover` from clickable word rows):
- `hooks/definitions/useDefinition(word)` — declarative lookup over `supabase.functions.invoke('common-define')`; cancels in-flight results so fast cross-ref chasing never flashes stale text.
- `lib/definitions/parseDefinition` — turns a raw def into renderable parts. The stored def text is authoritative and shown **in full**; the parser only *adds* markup — the custom format's `<word=pos>` / `{word=pos}` cross-refs become clickable `ref` parts (for seeded `s`/`e`/`m` defs). Live Wiktionary text (`source === 'w'`) is plain prose, returned verbatim. Everything else (`[…]` inflection tags like `[n SUPPRESSIONS]`, `/` sense separators, `(YEAR)`) passes through verbatim, so an inflection-only stub still displays its text rather than rendering blank.
- `components/definitions/DefinitionView` — the shared body (heading + parsed def + clickable refs + CC BY-SA attribution when `source === 'w'`); shows "Unknown word." for a word not in the list, "No definition found." for an in-list word Wiktionary had nothing for. A ref click calls `onNavigate` to re-point the lookup in place.
- `components/definitions/DefinitionPopover` (anchored card, click-to-define) and `components/definitions/WordLookupDialog` (FloatingPanel + text box, the shortcut) both embed `DefinitionView` — they differ only in *how the first word is chosen*.

**Click-to-define wiring (per-game).** `WordList` rows (spellingbee), `GameTurnLog` rows (stackdown), and the move log (scrabble) are click/keyboard-activatable → `DefinitionPopover`. This stays per-game because *which* words are clickable is game-specific.

**The `~` lookup shortcut (app-global).** The free-form lookup dialog is **not** per-game — it's wired once in `common/hooks/input/useAppShortcuts` alongside `/` (chat) and `?` (menu), so it works on any real page (see [App-level keyboard shortcuts](#app-level-keyboard-shortcuts)). The hook itself owns the dialog's open/closed state and *returns* the `WordLookupDialog` node, which ClubPage / GamePage render in their tree; there's nothing per-game to wire up. (It started life re-implemented in spellingbee + scrabble `PlayArea`s; promoting it to the app shell removed those copies and made it available everywhere.)

## Common testing

See [`testing.md`](testing.md) for the full theory. Common-layer specifics:

- **`supabase/tests/common/clubs_test.sql`** — exercises slugify, `create_club`'s reject paths, solo-club auto-creation, and the RLS hide-from-non-member check. Touches everything in this layer.
- **`supabase/tests/common/chat_test.sql`** — exercises `send_message` and the messages RLS, standalone (no game). Validates that the chat plumbing works regardless of which game is being played.

There are no FE tests covering routing as a whole (no E2E in this project), but the router's own contract is unit-tested in [`src/common/lib/routing/router.test.ts`](../src/common/lib/routing/router.test.ts) — `usePath` reacts to `navigate()` and to native back/forward; `navigate(to)` pushes; `navigate(to, true)` replaces.

## Deferred / open

See also [`deferred.md`](deferred.md) for the aggregated cross-feature register.

- **Per-club stats.** Solo clubs are the planned anchor for per-user stats. Schema not built; no UI surface yet.
- **Auto-propagating a new gametype to existing clubs.** Club enrollment in `common.clubs_gametypes` is seeded at creation (`common.default_gametypes_for_club`) and editable afterward via the "Edit club" dialog (`common.set_club_gametypes`). Still open: a gametype registered *after* a club exists doesn't auto-add to that club — a per-game backfill migration (bananagrams does this) or the editor covers it, and under the alpha prior neither is load-bearing. See `deferred.md`.
