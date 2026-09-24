# Project priors

Context for AI assistants and contributors working on this repo: the
project-level priors that shape every decision. The docs listed below build on
top of them.

**Spelling is American.** `color`, `gray`, `behavior`, `center`, `canceled` —
`-or` over `-our`, `-er` over `-re`, `-ize` over `-ise`, and one `l` where
British doubles it. It holds everywhere — identifiers, CSS tokens, comments,
docs, commit messages, and UI copy alike.

`src/guards/americanSpelling.test.ts` enforces it, and its list is absolute: the
common British forms appear NOWHERE in the repo. Word DATA is exempt (a
dictionary legitimately contains `LITER`), and if prose ever needs to show a
British spelling as an example, reach for a rarity the guard does not list —
`gaol`, `connexion` — so no exemption has to be carved for it.

## A question is a question

When Joel asks a question, answer the question. Do not assume that because he
asked something, it's confusing, or should change, or that you should commit to
phrasing it differently in the future. A question is just that: a question.
Answer it and don't change things.

## Committing — only when Joel says so, every single time

**`git commit` runs ONLY when Joel has just explicitly asked for it.** Nothing
else authorizes a commit. Not a plan that says "commit after each step", not a
sequence he approved, not a rhythm the session has settled into, not how
obviously finished the work is.

**The permission reaches BACKWARD only.** "Commit" covers the work that exists
at the moment he says it, and nothing the same sentence goes on to ask for.
These all mean *commit what is there now, then do the next thing and STOP*:

- "commit, then continue"
- "commit and move on to the next step"
- "commit, then do X"

**A later instruction never inherits it.** "Do the next step" means do the next
step. It does not mean commit, however many times he said "commit" earlier.

**The check, at the moment of typing `git commit`:** is the LAST thing the
current user message asked for the commit itself? If not — if the message asked
for a commit *and then* something else, or asked only for work — do not commit.
The second commit in a turn is wrong by construction.

**When the work is done, leave it in the working tree, say what's there, and
say it's ready.** The un-committed diff is how Joel reviews. **When in doubt,
STOP AND ASK.** If a commit has already happened by mistake, offer
`git reset --soft HEAD~1` and wait.

## Educational priority — clarity over brevity

The primary author is an engineer learning AI-assisted development who also
genuinely enjoys reading code and writing TypeScript and React. **The codebase
itself is part of the artifact.** Don't write archaeology: "how it used to work"
is not useful, in a comment or a doc.

This **overrides** the general agent default of "no comments unless strictly
necessary" — for **docstrings**, which carry the explanation of a thing and are
read by everyone who calls it.

**A comment is not there to teach.** It explains something non-obvious about the
code in front of the reader, so they can read that code. It is not a lesson, not
a rationale, and not a second copy of an explanation that already lives
somewhere. Where a shared mechanism is involved, the comment is one short
sentence and a pointer — "Guards non-idempotent requests from firing twice; see
`useSingleFlight`" — because the shared thing's own docstring is the copy that
stays right.

See [docs/code-conventions.md → Code clarity &
docstrings](docs/code-conventions.md#code-clarity--docstrings) for the concrete
rules this implies.

## Where knowledge lives

- **A folder's own `doc.md` and `todo.md`.** Every folder in `src/common/` and
  `src/shared/`, and a game folder once its area has been audited, carries a
  `doc.md` (what the folder is and the non-obvious rules it keeps; shape
  enforced by `src/guards/folderDocs.test.ts`) and a `todo.md` (what is owed to
  it). A fact about one folder goes there, not in `docs/`.
- **`docs/`** describes what IS, across folders — the tables below.
- **`plans/`** describes work in flight; see
  [Plans](#plans--plans-describes-work-in-flight).
- **The guards** in `src/guards/` hold repo-wide invariants (spelling, links,
  vocabularies, call-site shapes, stamps) and run with `npx vitest run
  src/guards`. [docs/testing.md](docs/testing.md) lists them.
- **The first-line `cs-` stamp** on every file is the audit's record of how far
  it has been read ([plans/app-audit.md → The
  stamp](plans/app-audit.md#the-stamp)). **`cs-blessed-*` means Joel read the
  file himself, and only Joel sets it.** A new file needs a stamp or
  `csStamps.test.ts` fails.
- **`gmake` targets that touch a database require `ENV=local` or `ENV=prod`**;
  there is no default. [docs/cheatsheet.md](docs/cheatsheet.md) has the rest.

### Reference docs — `docs/` describes what IS

| file | what's there |
|---|---|
| [docs/code-conventions.md](docs/code-conventions.md) | **Read before writing code** — the house rules the surrounding code won't teach |
| [docs/ui.md](docs/ui.md) | **Read before frontend work** — the principles the UI is built on |
| [docs/naming.md](docs/naming.md) | The glossary: gametype, game, board, club, member, persona |
| [docs/common.md](docs/common.md) | The map of everything that isn't a game |
| [docs/common-folders.md](docs/common-folders.md) | How `src/common/` and `src/shared/` are organized, and where a new file goes |
| [docs/common-schema.md](docs/common-schema.md) | The `common` schema and the contracts every game mirrors (end, concede, turn order) |
| [docs/word-list.md](docs/word-list.md) | `common.words` and the rule for which words a game may use |
| [docs/supabase.md](docs/supabase.md) | How the app uses Supabase: schema vs code, the `events` table, reads, RPC/RLS conventions |
| [docs/envelopes.md](docs/envelopes.md) | The one shape every RPC, read and edge function answers in |
| [docs/outcomes.md](docs/outcomes.md) | The outcome vocabulary: won · lost · near · warning · neutral · noted |
| [docs/states.md](docs/states.md) | View state and play state; suspend, current, pause |
| [docs/win-lose.md](docs/win-lose.md) | The ideas every game's winning and losing is built from |
| [docs/game-status-labels.md](docs/game-status-labels.md) | A game's title and club-page status line |
| [docs/playarea.md](docs/playarea.md) | The play surface: the two columns, board sizing, the shape of `PlayArea.tsx` |
| [docs/tokens.md](docs/tokens.md) | How CSS values are named and picked: themes, colors, the vocabularies |
| [docs/buttons.html](docs/buttons.html) | The button tone grid, rendered (open off disk) |
| [docs/mobile.md](docs/mobile.md) | How the app works on a phone and a tablet |
| [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) | Where the app's keys are listed and how they're declared |
| [src/common/pdf/doc.md](src/common/pdf/doc.md) | Printing a board to PDF |
| [docs/testing.md](docs/testing.md) | Where a test goes, the pgTAP and Vitest patterns, the guards, the gallery |
| [docs/features.md](docs/features.md) | Every game, categorized by feature |
| [todo.md](todo.md) | App-wide todos only; a todo almost always belongs in its folder's `todo.md` |
| [docs/deferred.md](docs/deferred.md) | Retired: takes no new items; indexes the game docs' old registers until they drain |
| [docs/cheatsheet.md](docs/cheatsheet.md) | One-screen command and file lookup |
| [README.md](README.md) | The project narrative, setup and deploy |

Each game doc carries that game's rules, schema, RPCs, FE shape, and tests. A
game's doc moves from `docs/games/` into its own folder as `doc.md` when its
area is audited. The rows below name only what's distinctive about each:

| file | what's distinctive |
|---|---|
| [src/codenamesduet/doc.md](src/codenamesduet/doc.md) | **TinySpy**: the server decides every guess; the AI clue suggester |
| [src/psychicnum/doc.md](src/psychicnum/doc.md) | The minimal toy game where each shared shape is settled first |
| [src/connections/doc.md](src/connections/doc.md) | **WordKnit**: the FE-knows decision; peer selection over Broadcast |
| [src/spellingbee/doc.md](src/spellingbee/doc.md) | **FreeBee**: required + bonus words, the rank ladder, the board built in an edge function |
| [src/wordle/doc.md](src/wordle/doc.md) | **WordNerd**: hidden-target colors, mode-aware per-guess RLS |
| [docs/games/bananagrams.md](docs/games/bananagrams.md) | **MonkeyGrams**: FE-owned board, server-owned tiles; desktop-only |
| [docs/games/waffle.md](docs/games/waffle.md) | **SyrupSwap**: hidden-solution colors, boards built on demand |
| [docs/games/stackdown.md](docs/games/stackdown.md) | **StackDown**: the no-trap board invariant, the pre-generated library |
| [docs/games/scrabble.md](docs/games/scrabble.md) | **RackAttack**: trusting-commit moves, the shared bag, the AI suggester and opponent |
| [docs/games/boggle.md](docs/games/boggle.md) | **MothCubes**: required vs bonus words, the pure-TS solver |
| [docs/games/crosswords.md](docs/games/crosswords.md) | **CrossPlay**: server-only solution, per-cell realtime; keyboard-required |
| [src/wordwheel/doc.md](src/wordwheel/doc.md) | **MooseWheel**: a spellingbee fork whose wheel is a multiset |
| [docs/games/wordiply.md](docs/games/wordiply.md) | **WordWire**: extend a base; length-only feedback during play |
| [docs/games/setgame.md](docs/games/setgame.md) | **HareTrigger**: base-3 cards, a contended board, in-place refills |
| [docs/games/letterboxed.md](docs/games/letterboxed.md) | **SnakeBox**: chained words covering twelve letters; the seed-pair pool |
| [docs/games/strands.md](docs/games/strands.md) | **PaulPath**: theme words tile the board; matched by path, not string |

### Plans — `plans/` describes work in flight

A plan is a working document: the agreed design, the evidence, and what's left.
When a plan and a reference doc disagree, the doc describes today and the plan
describes the target. When a plan's work ships, its durable knowledge moves into
`docs/` or the owning folder and the plan is deleted.

**app-audit is the live sprint, and the only one.** It is an area-by-area walk
through the whole app's React, SQL and CSS together. Its per-area records are
`plans/areas/<area>.md`. Two plans are design targets read per area rather than
sprints of their own: tile-feedback (the board's feedback) and
playarea-readability (the shape of `PlayArea.tsx`). When app-audit opens a
game's area, consult both.

| file | the work |
|---|---|
| [plans/app-audit.md](plans/app-audit.md) | **The live sprint.** Start a session here: "Where to start" says what's next |
| [plans/cross-game-consistency.md](plans/cross-game-consistency.md) | The six closed games checked against each other; worked before the ten remaining games open |
| [plans/tile-feedback.md](plans/tile-feedback.md) | The design target for board feedback; read it per game area |
| [plans/playarea-readability.md](plans/playarea-readability.md) | The target shape for each game's `PlayArea.tsx`; read it per game area |
| [plans/spectating.md](plans/spectating.md) | Proposed, nothing decided: what a watching club member sees |
| [plans/dark-mode.md](plans/dark-mode.md) | Not scheduled: what a dark theme would still cost |

## Audience — friends, not strangers

This is a venue for groups of friends to play games together. It is **not** a
public matchmaking platform.

The metaphor that anchors design decisions: this app **replaces a group of
friends on a Zoom call playing one game together**. Use it as a forcing function
when a UX or schema question is ambiguous — "what would the Zoom-call answer
be?"

- **Spectators are friends too.** A club member can open a game they are not
  seated in and watch it — what they see and may do is not yet designed (see
  [plans/spectating.md](plans/spectating.md)). Presence-pause counts the game's
  ROSTER: it fires the moment a player isn't connected, because someone-missing
  means the call has stalled, and a watcher's coming and going changes nothing.
- **One game at a time.** The whole group is on the same thing; structurally
  enforced by the `is_current_view` partial unique index on `common.games`.
- **No "find an open game" listings, no public lobby, no random pairings, no
  leaderboards-among-strangers.** Watching is for club members only.

The social primitive is the **club**: a named, persistent group of friends who
play games together. The club IS the Zoom call — a venue that exists between
sessions, where chat threads across every game the friends play. See
[docs/common.md](docs/common.md) for the model. Clubs invite friends to join;
games happen inside clubs. Chat, presence, "people you've played with," and game
invitations are organized by club, not by individual game. This shapes UX
decisions: e.g., a game's "share" affordance is "play with a club," not "post to
a public list."

## Screen readers are out of scope

**Screen-reader support is not a goal of this project. Don't propose it.** No
`aria-label`s for board tiles, no live regions for turn announcements, no
"a screen-reader user would hear X" findings in reviews, and no accessibility
items in any `todo.md`. This follows from the audience
prior above: the user population is known and none of them use one.

These games are also intensely visual — a grid of colored tiles, a crossword,
a rack of letters you drag. Making them work non-visually isn't an
`aria-label` pass, it's a different app. Half-doing it produces markup that
claims an experience the app can't deliver.

What this **doesn't** mean:

- **Keep the ARIA that's already there.** `aria-hidden` on decorative glyphs,
  `role="dialog"` + `aria-modal` on sheets, `aria-label` on icon-only buttons —
  these ship today, some of them load-bearing for tests. Don't strip them; just
  don't extend the set.
- **Keyboard support is a separate thing, and it matters.** Crosswords is
  keyboard-first by design, wordle/wordiply take physical keys, and the clue
  form traps Tab on purpose. That's for sighted keyboard users and stays.
- **Contrast and legibility still matter** — the member-color palette, the tile
  ramp, and the two-vocabularies rule in [docs/tokens.md](docs/tokens.md) are
  about people *seeing* the board clearly.

## Production software — preserve the data, migrate forward

Prod carries real accounts, real games and real chat history, and **that data is
not expendable.** Advice anywhere that leans on "the friends will understand"
predates this and is wrong. Two rules follow, and they are the whole of it:

- **Preserve production data.** A change that would drop rows, invalidate
  accounts or orphan a game needs a migration path, not a Discord message. If
  the honest answer is "this cannot be done without losing X", say so and ask
  before doing it.
- **Write a NEW migration; never edit an applied one.** `supabase db push`
  skips any migration the remote has already recorded, so an in-place edit
  simply never reaches prod — while `supabase/sql/` (re-applied in full every
  deploy) *does*. The two halves then disagree and the deploy fails partway
  through the affected game's SQL file. A shape change is a new timestamped file
  in `supabase/migrations/`, every time. (An applied migration's comments may be
  corrected; its SQL never.)

**Where a SQL change goes** ([docs/supabase.md → Schema vs
code](docs/supabase.md#schema-vs-code)). Each game's SQL is two files:
`supabase/migrations/<ts>_<game>.sql` is **shape** (tables, constraints,
indexes, the Realtime publication, seeds) and is applied once;
`supabase/sql/<game>.sql` is **behavior** (functions, views, policies,
triggers, grants) and is re-applied in full on every deploy. So a
function/policy/grant change is an in-place edit to `supabase/sql/` **forever**
— it never becomes a migration. Only shape accumulates, and only shape needs a
new file.

What the rule is not:

- **Not about the dev loop.** `supabase db reset` locally still wipes
  everything, and that is fine — it is a local database seeded by
  `seed.dev.sql`.
- **Not compat apparatus.** No redirect shims for URL shapes we never shipped,
  no dual-running code paths for a rename that touches no stored data. The rule
  is about *data*: a change that only moves code is still just a change.
- **Always confirm before destructive operations** (dropping databases,
  force-pushes, wiping prod).

**If prod ever is reset anyway**, two operational notes that have bitten before:

- **Clear the stamps.** `gmake db-schema ENV=local` deletes
  `.make/<env>/*.stamp` precisely because a reset makes them lie. Resetting prod
  with the Supabase CLI directly does NOT, so the next `gmake db-data ENV=prod`
  skips the word import and leaves `common.words` empty — every word game
  silently broken. `rm -f .make/prod/*.stamp` first.
- **`db-data` is not part of `deploy`.** The deploy target ships structure +
  functions + FE only; a reset database also needs `gmake db-data ENV=prod`.

## Trust model — server-authoritative for cleanliness, not anti-cheat

Players are friends who trust each other. We lean server-authoritative as a
matter of good architecture (single source of truth, validated state
transitions, race-condition safety), **not** as a defense against cheating:

- **Game state lives in Postgres; mutations go through RPCs.** This is
  non-negotiable because it's how we get atomicity and consistent rules.
- **The client never decides what constitutes a valid move.** Always check on
  the server.
- **If a server-authoritative implementation would meaningfully complicate the
  code or harm UX to defeat cheating that wouldn't happen, prefer the simpler
  path.** Don't contort the code to prevent someone from lying about their
  display name or peeking at their partner's screen through the FE devtools.

Examples of where this lands:

| feature | server-authoritative? | why |
|---|---|---|
| Turn validation, move legality | yes, always | core to the game working at all |
| Random seed for board generation | yes | reproducibility and fairness without trust |
| Chat content length limit (1–1000 chars) | yes | constraint, not anti-abuse |
| Chat spam / rate-limiting | no | friends won't spam each other |
| Display-name validation | minimal | if a friend wants to call themselves "Lord Buttsworth," that's between friends |
| AI clue suggestion (codenamesduet) | server-side, but for the API key — not for cheat prevention | the clue-giver could ask Claude themselves in another tab; we're not the gatekeeper of that |

## Stack and roster

React 19 + TypeScript + Vite on the frontend; Supabase (Postgres with RLS,
PostgREST, Realtime, Auth via magic links, Edge Functions in Deno) on the
backend; Netlify for FE hosting; Anthropic Claude via Edge Functions for AI
features (codenamesduet's clue suggester and crosswords' clue explainer;
scrabble's move suggester and AI opponent are a local trie search, not an LLM).
See [README.md](README.md) for the longer narrative.

Sixteen games are live (codenamesduet, connections, psychicnum, spellingbee,
bananagrams, waffle, wordle, stackdown, scrabble, boggle, crosswords, wordwheel,
wordiply, strands, letterboxed, setgame). psychicnum is a deliberately minimal
toy whose job is to exercise the multi-game architecture with the smallest
possible game-logic surface, which is why it is where a shared shape gets
settled first.
