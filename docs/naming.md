# Naming & terminology

The short, conceptual glossary for this repo. Reads in a sitting; serves as the orientation layer before you dive into a specific file.

For code-style and convention details (table naming, RPC patterns, CSS, imports, etc.) see [`code-conventions.md`](code-conventions.md). For the architectural layer (clubs, registry, removability) see [`common.md`](common.md).

## The big idea

> A name describes a **role**, not an **implementation**. If two games each have a thing that plays role X, both are called X, and the game qualifier lives in the folder structure — never in the name.

Game-name prefixes (`BoggleScoreReport`, `codenamesduet_words`) are the smell. The folder or schema already carries that information; repeating it in the name is noise.

The practical effect: when you swap from working on codenamesduet to working on a hypothetical boggle, the names you reach for don't change. The `Board` is still `Board`, the `useGame` is still `useGame` — just in a different folder.

## Terminology lexicon

The load-bearing words and what they each mean. Internalize these; mixing them up is a source of confusion that surfaces hours later in code review.

### gametype

The *registered entry* representing a game (or game variant) in the registry. One row in `common.gametypes`, one TS manifest in `src/games.ts`, one URL prefix. Treated as one word (like `username`), not `game_type` or `gameKind`. In code: `gametype text` columns, `gametype: string` TS fields.

Examples: `codenamesduet`, `psychicnum_coop`, `psychicnum_compete`, `connections_coop`, `connections_compete`, `spellingbee_coop`, `spellingbee_compete`, `bananagrams`, `waffle_coop`, `waffle_compete`, `wordle_coop`, `wordle_compete`, `stackdown_coop`, `stackdown_compete`, `scrabble_coop`, `scrabble_compete`.

The gametype string is the second segment of `/g/<gametype>/<gameId>` URLs and the key the FE uses to dispatch manifest behavior (rendering, RPC routing). It is NOT always identical to the folder/schema name — sibling gametypes share a single folder and a single schema. See [`baseGametype`](#basegametype) below.

### baseGametype

The *family root* shared by one or more sibling gametypes. Same string as the folder name under `src/`, same as the Postgres schema name. For a single-variant game, `baseGametype === gametype` (e.g., codenamesduet's baseGametype is `codenamesduet`). For a family with coop/compete variants, both manifests share the baseGametype (`psychicnum_coop` and `psychicnum_compete` both declare `baseGametype: 'psychicnum'`).

This is the field downstream code reads to ask "what family does this gametype belong to?" — for:

- **Docs** — `docs/games/<baseGametype>.md`. One per family, regardless of variant count.
- **Logo / theme** — siblings share `logo.svg` and `theme.css`.
- **Future ClubPage rendering** — siblings could render as a single grouped block ("psychicnum: coop / compete") rather than two unconnected buttons.
- **Schema** — one set of tables under `<baseGametype>.*` serves all siblings.

See [`common.md` → The sibling-manifest pattern](common.md#the-sibling-manifest-pattern) for the wider write-up.

### codename vs brand name

Every game has two names:

- The **codename** — the lowercase word used *everywhere in code*: the Postgres schema, the `src/<codename>/` folder, the `<codename>_coop` / `<codename>_compete` gametype strings, table/column/variable/component names, and the test files. Codenames are the **recognizable** name of the game they descend from, so the source stays legible to a newcomer: `connections`, `spellingbee`, `bananagrams`, `codenamesduet`, `wordle`, `scrabble`, `waffle`, `stackdown`, `psychicnum`.
- The **brand** — the custom, user-facing display name, the only thing players ever see. It lives in **exactly one place**: a `const BRAND` at the top of each game's `manifest.ts`, which `name` and any user-facing string (e.g. the start-game error) read. A fork rebrands a game by editing that one line.

| codename | brand | | codename | brand |
|---|---|---|---|---|
| `codenamesduet` | TinySpy | | `waffle` | SyrupSwap |
| `connections` | WordKnit | | `wordle` | WordNerd |
| `spellingbee` | FreeBee | | `scrabble` | RackAttack |
| `bananagrams` | MonkeyGrams | | `stackdown` | StackDown |
| `psychicnum` | PsychicNum | | | |

The brand and codename coincide as a word only for `stackdown`/StackDown and `psychicnum`/PsychicNum (and even there the codename is lowercase, the brand is the display-cased token).

**Rules that follow from this:**

- **Code uses the codename, never the brand.** The brand appears nowhere in the codebase except the manifest `BRAND` const (+ this doc, which explains the idea). Comments referring to a game use the lowercase codename.
- **No mid-caps in code identifiers.** A codename is one token, so its PascalCase is a single leading capital: `SpellingbeeSetup`, `CodenamesduetSetup`, `Psychicnum…` — never `SpellingBee`, `CodenamesDuet`, `PsychicNum`. (The *brand* may be mid-capped; it's a display string, not an identifier.)
- **Real-game references stay capitalized.** When prose names the actual game a codename descends from — "NYT Connections", "Bananagrams", "Codenames Duet", "Spelling Bee", "Wordle", "Scrabble" — that's a proper noun for the real product, distinct from both our codename and our brand. Mind the collisions: `connections`/`bananagrams`/`scrabble`/`wordle`/`waffle` are real game names too, so the lowercase codename and the capitalized real-game reference can sit a paragraph apart.

### mode

The *interaction axis* a gametype declares — `'coop'` (cooperative; players share an outcome) or `'compete'` (competitive; players race for individual outcomes). Locked at the gametype level, NOT a per-game setup choice. Read off `manifest.mode` and (where the SQL needs it) off `<baseGametype>.games.mode` denormalized from the gametype string.

A timer that runs out and ends a game is NOT what makes something compete — compete needs an opposing PLAYER. Solo clubs see only coop variants because compete manifests declare `numberOfPlayers: [2, max]`. Coop can still carry a countdown timer (where the clock running out is the team's loss).

### game

A *specific playing*. "Ada and Bea's codenamesduet match on June 14." Matches everyday English ("good game," "game over"). One row in `<gametype>.games`. Identified by a UUID.

### board

The *static starting state* of a game — the inert configuration that could be saved and replayed. For boggle, that's the dice arrangement. For crosswords, the puzzle grid. For games where the starting state is trivial (psychicnum's "a number from 1–10," codenamesduet's "25 random words + a key card"), the board co-locates onto the game row instead of warranting its own table.

The distinguishing test: would two different games on the same setup be a meaningful concept for this gametype? If yes, that setup is a board. If no, the concept is too thin to bother extracting.

### puzzle

A *prewritten, replayable game source* — distinct from `board` (the per-game-instance copy of the puzzle's content, with any per-game state like a shuffled tileOrder). A puzzle exists ahead of time; players pick it from a list and `create_game` copies it into a fresh `board`.

The split lets the source stay pristine across multiple plays (a club can replay yesterday's puzzle without contaminating it) and gives us a place to attach puzzle-source metadata (NYT puzzle number + date for connections; future Sunday-NYT-crossword constructor names).

Two kinds of gametype shake out from this:

- **Generated-board games** (spellingbee, codenamesduet, psychicnum, future boggle): each game gets a fresh board synthesized by `create_game` from random draws of a word pool / random number. No puzzles, no `<game>.puzzles` table. The setup form has no puzzle picker.
- **Puzzle-based games** (connections, future crosswords): puzzles exist as prewritten rows in `<game>.puzzles`, imported from external archives. `create_game` accepts a `puzzleId` and copies the chosen puzzle's content into the new board. The setup form has a picker.

Per-gametype `puzzles` tables stay narrow (different shapes for Connections vs. crosswords) rather than collapsing into a common `puzzle` table with a generic `content jsonb`. Cross-cutting "which puzzles a club has played" lives on the per-game `<game>.games.puzzle_id` FK.

### club

A fixed-membership room formed by one creator. The cross-game social primitive: a club might play codenamesduet on Monday and a hypothetical boggle on Friday, and the same friendship/conversation persists across both.

Clubs live in `common.clubs`. They span gametypes; gametypes reference clubs (`<schema>.games.club_handle → common.clubs.id`), never the reverse.

Solo clubs (handle `=<username>`) are single-member auto-created clubs that anchor solo play and per-user stats. They're structurally separate from regular (multi-member) clubs,

See [`common.md`](common.md) for the full club model — invariants, lifecycle, three-state (active/paused/completed) semantics.

### member

A user who's joined a club. In `common.clubs_members`. Membership is fixed at club creation in v1; no add/remove RPCs.

**Bare `member` is reserved for the club-member case** — that's the dominant referent in this codebase and stealing it would cost every reader a moment of disambiguation. If we ever introduce a "member" concept for some other domain object (a permission group, a household, a mailing list, …), it must carry a differentiating prefix: `permissionGroupMember`, `householdMember`. Bare `member` stays the club member.

**`member` vs `user` as a context signal.** Once you've decided to talk about a person, the choice between the two words is itself meaningful:

- `member` reads as "of the club / game / clearly-implied group we're currently discussing." "Any member can start a game" is unambiguous — *which* members? The current club's. The scope rides along with the word.
- `user` reads as "of the site." Saying "any user can start a game" is actively weaker and confusing — it raises the question *which* users, in a way `member` doesn't.

The practical effect: most game-side code shouldn't reach for `user` at all, because games happen inside clubs and the relevant person is always a member of that club. `user` is right when the context genuinely is "a person who isn't tied to a specific club we're discussing" — e.g., the club-creation flow's "list of users we might pick to add to a new club," or the auth-side `auth.users` references. When in doubt: if a club is implied by the surrounding code, write `member`.

For the database row specifically (regardless of context), `profile` is the name — that's the `common.profiles` row.

**`member` vs `player` inside a game.** Once code is in a game context (inside a `<PlayArea>`, inside `useCommonGame`, inside a per-game hook), the person is more precisely a **player** — someone in `common.game_players` for this game, which is a strict subset of the club's members. See [`player`](#player) below. Right now, we don't support spectators; if we did in the future, anyone in the club could view the currently-active game, but they'd just be members (of the club), not players (in the game).

### player

A member who's in a specific game — i.e. someone in `common.game_players` for that game id. Always a club member; not always *every* club member, because the `SetupGameDialog` player picker lets a subset of the club start a game. (The creator is locked in — they can't deselect their own checkbox, since whoever starts a game must play it.)

**Same shape as a member, different vocabulary.** In TypeScript this lands as one canonical `Member` type in `src/common/lib/games.ts` plus a per-game `Player` alias in each game's hook file:

- connections, spellingbee, psychicnum: `type Player = Member` (pure re-export — no per-game enrichment today).
- codenamesduet: `type Player = Member & { seat: 'A' | 'B' }` (the seat is a real per-game enrichment — codenamesduet is intrinsically 2-seat).

Every game declares the alias even when it's a pure re-export, because cross-game vocabulary consistency makes per-game folders pattern-match cleanly (a reader switching from codenamesduet to connections sees the same `Player` parallel and doesn't trip on a name change).

**Variable naming follows context, not type:**

- Inside club-context code (ClubPage's roster, ChatBody's name resolution, SetupGameDialog's pickers): variable name is `members`, type is `Member[]`.
- Inside game-context code (useCommonGame's return, GamePageCtx, PlayArea props, per-game GuessHistory props): variable name is `players`, type is `Player[]`.

So `useCommonGame` returns `players: Member[]` — the type is `Member` (the identity layer is shared) but the variable says `players` because we're in a game context. See [`code-conventions.md` → Member vs Player](code-conventions.md#member-vs-player--one-type-context-driven-variable-names) for the implementation rules.

### peer

**Another player in this game, from my perspective.** Same shape as a `Player`, minus the viewer. Where `member` and `player` are absolute (you're either in the club / in the game or you aren't), `peer` is perspective-relative — every viewer has a different peer set, because none of us is our own peer.

Wherever code needs to discriminate "is this me or someone else in this game?" — pick the `peer` half of the binary instead of generic words like `other`. Concretely:

- `isMine` / `isPeer` for per-tile attribution in `connections/components/TileGrid.tsx`.
- "Peer selection," "peer-colored frame," "a peer disconnected" — phrasings that name the relationship rather than describing it as "the other player."
- codenamesduet's `peerKey` (the partner's key card, fetched only post-game) and `revealPeer` flag — the seat I'm not in is my peer.
- The pause-on-disconnect pattern phrases the trigger as "a peer is missing" because the predicate is viewer-relative: if Ada disconnects, Bea sees a missing peer; Ada sees Bea still there.

**Where peer does NOT belong:**

- Identity-color helpers (`src/common/lib/memberColor.ts`, `--color-member-*` CSS tokens) — those resolve a color for ANY person (including the viewer, e.g. coloring your own chat-message label). That's member-level, not peer-level. The visual concept *applied* to a peer's tile is still "peer-colored," but the helper that resolves the color is `memberColor` because the helper is identity-keyed, not perspective-keyed.
- Cross-game lobby / roster contexts — `members` and `players` are still the right words there. "Peer" only makes sense from a viewer's POV inside an active play surface.

### start (startSetup vs startGame)

"Start a game" is a two-phase flow in this codebase: the user picks options first, *then* the game is created. The same word would describe both phases in casual speech, so identifier naming splits them:

- **`startSetup`** — click the "Start connections" button on ClubPage. Opens the setup dialog. The game does not yet exist; nothing is written to the DB.
- **`startGame`** — click "Start connections" inside the dialog after picking options. Fires `manifest.startGameInClub`, which calls `create_game` and writes the new `common.games` row.

Concretely:

| identifier | phase | what it does |
|---|---|---|
| `<StartGameButtons onStartSetup={...} />` | startSetup | The row of buttons on ClubPage. Click → open dialog. |
| `ClubPage.handleStartSetup` | startSetup | Sets `pendingSetup` so the dialog mounts. |
| `SetupGameDialog.handleStartGame` | startGame | Click-handler for the dialog's commit button. |
| `manifest.startGameInClub` | startGame | The RPC-firing function. Always actually creates a game. |
| `SetupGameDialog.onStarted(gameId)` | startGame done | Past tense; fires after `startGameInClub` returns success. |

UI labels stay "Start X" everywhere — users intuitively understand the two-click pattern as "open the form, confirm the form." The distinction lives in the code, where ambiguity costs reader cycles.

### persona

A test fixture user with a stable role across the pgTAP suite — `ada`, `bea`, `cade`, `dee`, `eda`. Each has a documented role (in-club player, in-club non-player, outsider) and a UUID that embeds the name (`ada11111-1111-…`) for self-evident error messages. Defined in [`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql). See [`testing.md`](testing.md) for the conventions.

## Per-game vocabulary

The cross-cutting terms above apply everywhere. Each game also has its own small lexicon for domain-specific things — connections's `category` / `tile` / `matched`, spellingbee's `pangram` / `bonus word` / `letter mask` / `outcome`, etc. Those lexicons live in the per-game doc's `## Vocabulary` section so the words sit next to the code that uses them:

- [`connections.md → Vocabulary`](games/connections.md#vocabulary)
- [`spellingbee.md → Vocabulary`](games/spellingbee.md#vocabulary)

codenamesduet and psychicnum use the cross-cutting lexicon plus their domain-obvious words (`clue`, `target`) and don't have separate vocabulary sections.

When two games use the same word for genuinely different concepts (connections's `rank` = per-category difficulty 0..3; spellingbee's `rank` = per-player progress 0..6), the per-game `## Vocabulary` entry should call that collision out so a cross-game reader doesn't get confused.

## Naming principles

These are the rules-of-thumb behind the choices above. They apply to SQL column / table / function names, TS types / fields / exports, and CSS tokens — anywhere a name will be read outside its immediate point of definition.

### Be specific at long visibility; generic is OK only when scope is obvious

Avoid general terms — `group`, `set`, `data`, `item`, `entry`, `record`, `list`, `value`, `content`, `state` (as a noun for "the data") — for anything that travels far from its definition: column names, top-level TS types, hook return keys, module exports.

Generic locals inside a small function are fine. A 5-line PL/pgSQL function with a `group_obj jsonb` variable reads correctly because you can see the whole function at once. The rule is about visibility scope — the bigger the visibility, the more specific the name needs to be.

Watch list of generic words to push back on in wide-visibility names is at the bottom of this file.

### Bare `member` = club member; prefix everything else

See the lexicon entry. If you need "member" for a non-club concept, it gets a differentiating prefix (`permissionGroupMember`, etc.) — the bare form stays reserved.

### Plural ≠ count. If a count could share its name with a list, add `_count`.

`connections.games.mistake_count` is named that way (not `mistakes`) because:

1. It's a number, not a list. A plural-looking name reads as a list.
2. A list of the actual mistakes will eventually live somewhere on the FE (the `guesses` rows with `result <> 'correct'`). Calling the column `mistakes` would collide with that list.

Apply this preemptively: when adding a count column, ask "could a list-of-these also exist later?" If yes — and that's usually yes for anything countable — use `_count` / `Count` now. The cost of being explicit upfront is small; the cost of renaming later is real.

Doesn't apply to scalars that have no plausible list shape — `score`, `total_seconds_paused`, `version`. The rule is about *count*-vs-*list*-collision, not "every number ends in `_count`."

### A name with multiple plausible meanings is usually wrong

If you reach for `group` or `set` or `level` and find yourself thinking "well, it could mean…" — that's the signal to pick a more specific word. `member` is the pragmatic exception, and its carve-out (prefix when not a club member) is precisely what controls the ambiguity.

### Consistency across gametypes for the same concept is non-negotiable

When two games have a concept that *is the same thing*, they MUST use the same name. The common types and hooks force this for everything they touch (`SetupMember`, `useGameTimer`, `PauseBoundary`); the discipline lives at the boundary where a new game starts to introduce its own surface.

When a third game adopts a term that's standard in two others, that term graduates to the "cross-game canonical names" list below. That's also the moment to verify the pre-existing two are already using it the same way (often the catalyst for a small rename).

### Qualify when the name will be read in isolation; stay bare when the scope owner is right there

Inside `board.categories[].rank`, bare `rank` is unambiguous — the surrounding object IS a category. As a column on `connections.guesses`, the same idea needs `matched_category_rank` because at the column level the name is read globally (PostgREST, generated TS types, the FE's `Database` type) with no surrounding context.

The principle: the wider the visibility, the more the name has to carry its own scope.

## Cross-game canonical names

Names that recur across gametypes and MUST be identical when the underlying concept is the same. A future game that names one of these differently is wrong.

| name | what it is |
|---|---|
| `gametype` | The registered-entry string (`codenamesduet` / `psychicnum_coop` / `psychicnum_compete` / `connections_coop` / `connections_compete` / `spellingbee_coop` / `spellingbee_compete` / `bananagrams` / `waffle_coop` / `waffle_compete` / `wordle_coop` / `wordle_compete` / `stackdown_coop` / `stackdown_compete` / `scrabble_coop` / `scrabble_compete`). Column on `common.games` + `common.gametypes`; second URL segment. NOT always identical to folder / schema name — see `baseGametype` below. |
| `baseGametype` | The shared family root for sibling gametypes. Folder under `src/`; Postgres schema name. For single-mode games, equals `gametype`. For coop/compete pairs, both manifests share the baseGametype (`psychicnum_coop` and `psychicnum_compete` both → `psychicnum`). See [naming → baseGametype](#basegametype). |
| `mode` | The interaction-axis declaration on a manifest (`'coop'` \| `'compete'`). Also denormalized as a column on per-game `games` tables (e.g. `psychicnum.games.mode`) so RLS can branch without joining to `common.games`. |
| `play_state` | The `text` column on `common.games` carrying each gametype's mid-game/terminal enum. The column NAME is always `play_state`; values differ per gametype. Common coop terminal values: `'won'` / `'lost'`. Common compete terminal values: `'won_compete'` / `'lost_compete'`. **No gametype uses `'active'` as a value** — "active" overloads view-state and play-state, so reusing it would relitigate the confusion the vocabulary exists to prevent. Companion column `is_terminal boolean` is materialized in the same RPCs that write `play_state`. See [`states.md`](states.md). |
| `is_current_view` | The boolean column on `common.games` carrying the **one current-view game per club** invariant (partial unique index on `(club_handle) where is_current_view = true`). See [`states.md`](states.md) for view-state vs play-state. |
| `created_at` | The `timestamptz` column on every game-row table (and most child tables — guesses, words, etc.). |
| `club_handle` | The FK to `common.clubs(handle)` on every `<gametype>.games` table. |
| `target_game` | The conventional name for the game-UUID parameter on every gametype's mutating RPCs (`submit_guess(target_game uuid, …)`). `target_<noun>` is the broader pattern for RPC params pointing at row IDs. |
| `submit_guess` | The mid-game-action RPC on a gametype that records a player's guess. The guess *shape* differs (a clue + count for codenamesduet, a number for psychicnum, a 4-tile set + verdict for connections), but the RPC name is the same. |
| `<table>_select` | The SELECT RLS policy naming pattern — `games_select`, `guesses_select`. Other policy directions follow the same pattern (`<table>_insert` etc.) if/when we ever add them. |
| `SetupMember` | The TS type for a club member in a setup-flow context. From `src/common/lib/games.ts`. |
| `useGameTimer`, `PauseBoundary`, `PauseOverlay`, `computePause`, `ClubChatPanel` | Common hooks / components / helpers. Every game that uses one consumes it under this exact import — there is no per-game variant. |

## Watch list of generic words

These show up as smells when they leak into wide-visibility names (columns, top-level types, hook return keys, exports). Each has at least one preferred specific alternative in this codebase. If you see one here in a wide-visibility name, raise it.

| generic | preferred specifics |
|---|---|
| `group` / `groups` | `category` (connections), `club` (the social primitive), or a more specific domain noun |
| `set` | the named collection (`tiles`, `guesses`, `categories`) |
| `member` | bare is reserved for club member; for any other domain, prefix (`<thing>Member`) |
| `level` | `rank` (connections), `tier`, or a fully-qualified `<domain>_level` if it really is a level |
| `data` / `info` / `content` | the actual subject (`board`, `setup`, `guesses`) |
| `state` (as a noun for "the data") | the specific state-machine value if it's an enum; the concrete field if it's a payload |
| `item` / `entry` / `record` / `row` | the singular form of the actual collection (`guess`, `tile`, `category`) |
| `list` | the named collection |
| `value` | the actual semantic (`score`, `rank`, `count`) |
| `thing` / `stuff` / `obj` | never (in wide visibility); fine as a 3-line-function local |

## What's in the rest of `docs/`

| file | what's there |
|---|---|
| [`common.md`](common.md) | The architectural layer: clubs, profiles, registry, routing, removability invariant, the FE shell |
| [`states.md`](states.md) | The view-state / play-state vocabulary and how the suspend / current / pause concepts compose |
| [`codenamesduet.md`](games/codenamesduet.md) | Codenames Duet rules + codenamesduet schema, RPCs, FE, Edge Function, tests |
| [`psychicnum.md`](games/psychicnum.md) | psychicnum rules + schema, the hidden-target pattern, FE, tests |
| [`connections.md`](games/connections.md) | connections (Connections-style) rules + schema, the FE-knows decision, the pause + timer patterns |
| [`spellingbee.md`](games/spellingbee.md) | spellingbee (Spelling-Bee-style) rules + schema, hidden-wordlist reveal, edge-function board builder, rank ladder |
| [`testing.md`](testing.md) | Test theory, persona conventions, pgTAP + Vitest patterns |
| [`code-conventions.md`](code-conventions.md) | How we write code: DB conventions, FE conventions, naming rules, known gotchas |
| [`deferred.md`](deferred.md) | Things explicitly deferred from code reviews and conversations |
| [`cheatsheet.md`](cheatsheet.md) | One-screen command + file lookup |
