# Project priors

**Spelling is American.** `color`, `gray`, `behavior`, `center`, `canceled` —
`-or` over `-our`, `-er` over `-re`, `-ize` over `-ise`, and one `l` where
British doubles it. This is an American app written by an American, and it holds
everywhere — identifiers, CSS tokens, comments, docs, commit messages, and UI
copy alike.

`src/guards/americanSpelling.test.ts` enforces it, and its list is absolute: the
common British forms appear NOWHERE in the repo, including in the sentence above
that used to illustrate the rule by spelling them out. Word DATA is exempt (a
dictionary legitimately contains `LITER`), and if prose ever needs to show a
British spelling as an example, reach for a rarity the guard does not list —
`gaol`, `connexion` — so no exemption has to be carved for it.

Context for AI assistants and contributors working on this repo. These are project-level priors that should shape every decision; the specific docs build on top:

### Reference docs — `docs/` describes what IS

| file | what's there |
|---|---|
| [docs/naming.md](docs/naming.md) | Terminology glossary (gametype, game, board, club, member, persona) |
| [docs/code-conventions.md](docs/code-conventions.md) | How we write code: DB conventions, FE conventions, code clarity, known gotchas |
| [docs/common-folders.md](docs/common-folders.md) | How `src/common/` is organized; where a new shared file goes |
| [docs/common.md](docs/common.md) | The architecture layer: clubs/profiles/games schema, the game RPCs, RLS, routing + the FE shell/registry, the word list + dictionary curation |
| [docs/supabase.md](docs/supabase.md) | How the app talks to Supabase: the client, schema exposure, query + Realtime conventions, RPC/RLS/edge-function conventions, the divergence register |
| [docs/envelopes.md](docs/envelopes.md) | **The one shape every RPC and edge function answers in** — ok / not-ok, severity, who writes the player's sentence, how SQL and Deno build one. Canonical; outranks supabase.md and error-system.md where they disagree |
| [docs/outcomes.md](docs/outcomes.md) | The outcome vocabulary — won · lost · near · warning · neutral · noted (+ `error`, which is never an outcome); what each means and everywhere it's shown |
| [docs/realtime-lost-events.md](docs/realtime-lost-events.md) | The lost-event failure mode (the deaf window), its fix, and the realtime diagnosis kit |
| [docs/states.md](docs/states.md) | View-state / play-state vocabulary; suspend / current / pause |
| [docs/testing.md](docs/testing.md) | Test theory, persona conventions, pgTAP + Vitest patterns, the repo-wide invariant guards, the screenshot gallery |
| [docs/ui.md](docs/ui.md) | The FE visual language: layout stability, theme tokens, the color system, the feedback pill, page chrome, dialogs/toasts, tiles, the button taxonomy |
| [docs/buttons.html](docs/buttons.html) | The button tone grid as a rendered page (open off disk, it doesn't ship); the twin of `theme.css` → CHROME — the stylesheet wins if they disagree |
| [docs/mobile.md](docs/mobile.md) | The mobile-appearance pass: the single desktop→mobile breakpoint, what's mobile-ready so far, recorded TODOs |
| [docs/playarea.md](docs/playarea.md) | The play surface: PlayArea's two columns, info-column readouts, text entry, the turn log + history viewer, board sizing |
| [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) | Every key the app listens for: dispatch routing, the global shell shortcuts, per-game board keys |
| [docs/pdf.md](docs/pdf.md) | Printing boards to PDF: the printable design language + the shared `common/pdf/` helpers |
| [docs/features.md](docs/features.md) | Games categorized by feature: dimensions (every game has exactly one value) vs tags |
| [docs/win-lose.md](docs/win-lose.md) | The finish/defeat taxonomy: finish lines, race vs best, timeout adjudications, clock fairness, the priced-help rule |
| [docs/game-status-labels.md](docs/game-status-labels.md) | Every game's title + club-page status line, per play state |
| [docs/deferred.md](docs/deferred.md) | Cross-cutting deferred work + the index of per-game registers (see its "Where an item goes") |
| [docs/cheatsheet.md](docs/cheatsheet.md) | One-screen command + file lookup |
| [README.md](README.md) | Narrative + stack |

Each game doc carries that game's rules, schema, RPCs, FE shape, and tests; the rows below name only what's distinctive about each:

| file | what's distinctive |
|---|---|
| [docs/games/codenamesduet.md](docs/games/codenamesduet.md) | Codenames Duet: the AI clue-suggester edge function |
| [docs/games/psychicnum.md](docs/games/psychicnum.md) | The deliberately minimal toy game; the hidden-secrets pattern |
| [docs/games/connections.md](docs/games/connections.md) | The FE-knows decision, pause-on-disconnect, peer selection via Broadcast |
| [docs/games/spellingbee.md](docs/games/spellingbee.md) | Required + bonus word lists, trusting-commit local scoring, the rank ladder |
| [docs/games/bananagrams.md](docs/games/bananagrams.md) | The FE-owned board / server-owned tiles split, per-player concede, the desktop-only layout exception |
| [docs/games/waffle.md](docs/games/waffle.md) | Hidden-solution color feedback, on-demand board generation, difficulty bands |
| [docs/games/wordle.md](docs/games/wordle.md) | Hidden-target color feedback, mode-aware per-guess RLS, the on-screen keyboard |
| [docs/games/stackdown.md](docs/games/stackdown.md) | Clear a tile stack by spelling words: the no-trap board invariant, the pre-generated board library |
| [docs/games/scrabble.md](docs/games/scrabble.md) | Trusting-commit moves, the shared 100-tile bag, the AI move suggester + autonomous opponent |
| [docs/games/boggle.md](docs/games/boggle.md) | Brand **MothCubes**: the required-vs-bonus split, the pure-TS solver, all 8 dice sets |
| [docs/games/crosswords.md](docs/games/crosswords.md) | Brand **CrossPlay**: server-only solution, per-cell realtime (`useCells`), the keyboard-required layout exception |
| [docs/games/wordwheel.md](docs/games/wordwheel.md) | Brand **MooseWheel**: a spellingbee fork where the wheel is a **multiset**; the pangram bonus |
| [docs/games/wordiply.md](docs/games/wordiply.md) | Brand **WordWire**: the base extender — length-only feedback during play, a comparator winner |
| [docs/games/setgame.md](docs/games/setgame.md) | Brand **HareTrigger**: base-3 card packing, the roster's first contended board, in-place refills |
| [docs/games/letterboxed.md](docs/games/letterboxed.md) | Brand **SnakeBox**: chained words covering twelve letters; par is structurally 2; the seed-pair pool |
| [docs/games/strands.md](docs/games/strands.md) | Brand **PaulPath**: theme words tile the board exactly, match by path not string, the earned hint economy |

### Plans — `plans/` describes work in flight

A plan is a working document for a sprint: the agreed design, the evidence, and what's left. When a plan and a reference doc disagree, the doc describes today and the plan describes the target. When a plan's work ships, its durable knowledge moves into `docs/` and the plan is deleted.

| file | the work |
|---|---|
| [plans/css-system-2.md](plans/css-system-2.md) | **PAUSED 2026-08-26 behind error-system.md** — the CSS sprint, and the ONLY spec for it — one palette in one place, a theme-ready structure, named patterns, and the vocabularies. Start a session there (§13 holds the next step; §7 → "The areas, in order" holds the sequence, resequenced 2026-08-24). Runs BEFORE tile-feedback; each game takes its CSS pass and its tf pass back to back |
| [plans/tile-feedback.md](plans/tile-feedback.md) | **The design target for tile/board feedback** — one channel per meaning, with a per-game conversion roster tracked by **tf level** (tf0 untouched · tf1 done in round 1, pre color+buttons · tf2 done against the current framework, on top of that game's CSS pass; every game ends at tf2). **PAUSED behind css-system-2.md.** Folds into ui.md once the games conform |
| [plans/selection-lists.md](plans/selection-lists.md) | **The SelectionList spec** — the keyboard-navigable pick-one list as a React component, its five sites, and what it deletes. Answers F38 in the homepage area; four of five sites built, scrabble's open |
| [plans/tab-rings.md](plans/tab-rings.md) | **Our version of tabbing** — Tab moves within a ring of stops a surface declared and never reaches the URL bar. Eight behaviors today, five of them one idea; crosswords is the only genuine exception. **The mechanism is built** (`useTabRing`); surfaces convert per area |
| [plans/dark-mode.md](plans/dark-mode.md) | **Not scheduled** — what the midnight spike proved: the CSS system CAN carry a dark theme, what it would still cost, and the one thing not solved (depth on a dark page). Reachable today behind `?theme=midnight` |
| [plans/keyboard-nav-plan.md](plans/keyboard-nav-plan.md) | Arrow-key navigation of board pieces for the five games where clicking pieces IS the move; two prerequisites land first |
| [plans/error-system.md](plans/error-system.md) | **THE ACTIVE SPRINT (2026-08-26)** — the results/rejections/faults redesign. The SHAPE now lives in [docs/envelopes.md](docs/envelopes.md), which outranks this file; what the plan owns is §4 (still open), §6 (process) and §7 (the roster of 146 call sites). `ERROR_COPY` shrinks to environmental failures only. The CSS sprint is paused behind it. §5 is a worked psychicnum example |
| [plans/fault-presentation.md](plans/fault-presentation.md) | **Agreed, not built** — move fault PRESENTATION from `dbFetch` (which knows only the URL) to the three wrappers (which hold the answer), plus a `presentFaults` opt-out for sites with their own logic. §2 is the measured research: what each layer can actually see. §5 is the checklist |
| [plans/deno-callers.md](plans/deno-callers.md) | **Agreed, not built** — the error sprint's FOURTH quadrant: the browser has three wrappers for talking to the server and an edge function calling an RPC has none, so thirteen functions hand-write the inbound boundary in four spellings with eight PN codes for two sentences. One Deno `runRpc`; the row-returning board-builder calls are deliberately left alone (§3). Build it BEFORE the two RPCs whose conversion breaks the function above them |
| [plans/css-philosophy.md](plans/css-philosophy.md) | **The reasoning archive** behind css-system-2.md: what CSS we share and why we haven't. Kept in full — the plan cites it rather than restating it |
| [plans/db-work-2.md](plans/db-work-2.md) | The queue of DB-touching deferred items (whole-docs sweep); delete it when it empties |
| plans/css-system-outdated-dont-read.md | **DO NOT READ.** The superseded first draft of the CSS sprint, much of whose model failed. Listed here only so its presence in `plans/` isn't mistaken for an oversight. Open it if — and only if — Joel says to |


## Educational priority — clarity over brevity

The primary author is an engineer learning AI-assisted development who also genuinely enjoys reading code and writing TypeScript and React. **The codebase itself is part of the artifact.** Optimize for the author reading it later understanding *why* things are the way they are. However, do not make purely archaeological comments or docs; "how it used to work" is not useful.

This **overrides** the general agent default of "no comments unless strictly necessary." Comments that teach are part of the value of this codebase.

See [docs/code-conventions.md → Code clarity & docstrings](docs/code-conventions.md#code-clarity--docstrings) for the concrete rules this implies — what to document, what doesn't belong, and the model examples.

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

## Audience — friends, not strangers

This is a venue for groups of friends to play games together. It is **not** a public matchmaking platform.

The metaphor that anchors design decisions: this app **replaces a group of friends on a Zoom call playing one game together**. Use it as a forcing function when a UX or schema question is ambiguous — "what would the Zoom-call answer be?"

- **No spectators.** The only people viewing a game will be players in that game. Presence-pause fires the moment a player in a game isn't connected, because someone-missing means the call has stalled.
- **One game at a time.** The whole group is on the same thing; structurally enforced by the `is_current_view` partial unique index on `common.games`.
- **No "find an open game" listings, no public lobby, no random pairings, no leaderboards-among-strangers.**

The social primitive is the **club**: a named, persistent group of friends who play games together. The club IS the Zoom call — a venue that exists between sessions, where chat threads across every game the friends play. See [docs/common.md](docs/common.md) for the model. Clubs invite friends to join; games happen inside clubs. Chat, presence, "people you've played with," and game invitations are organized by club, not by individual game. This shapes UX decisions: e.g., a game's "share" affordance is "play with a club," not "post to a public list." 

## Screen readers are out of scope

**Screen-reader support is not a goal of this project. Don't propose it.** No
`aria-label`s for board tiles, no live regions for turn announcements, no
"a screen-reader user would hear X" findings in reviews, and no accessibility
items in [docs/deferred.md](docs/deferred.md). This follows from the audience
prior above: the user population is known and none of them use one.

These games are also intensely visual — a grid of colored tiles, a crossword,
a rack of letters you drag. Making them work non-visually isn't an
`aria-label` pass, it's a different app. Half-doing it produces markup that
claims an experience the app can't deliver.

What this **doesn't** mean:

- **Keep the ARIA that's already there.** `aria-hidden` on decorative glyphs,
  `role="dialog"` + `aria-modal` on sheets, `aria-label` on icon-only buttons —
  these ship today, some of them load-bearing for tests. Don't strip them (see
  the "don't remove unprompted" prior in spirit); just don't extend the set.
- **Keyboard support is a separate thing, and it matters.** Crosswords is
  keyboard-first by design, wordle/wordiply take physical keys, and the clue
  form traps Tab on purpose. That's for sighted keyboard users and stays.
- **Contrast and legibility still matter** — the member-color palette, the
  tile ramp, and the two-vocabularies rule in [docs/ui.md](docs/ui.md) are
  about people *seeing* the board clearly.

## Production software — preserve the data, migrate forward

**This project is no longer alpha** (Joel, 2026-08-29, describing a switch made
weeks earlier — the forward migrations start at `20260813000001`). Prod carries
real accounts, real games and real chat history, and **that data is not
expendable.** Earlier revisions of this file said the opposite at length; if you
find advice anywhere that leans on "the friends will understand", it predates
this and is wrong.

Two rules follow, and they are the whole of it:

- **Preserve production data.** A change that would drop rows, invalidate
  accounts or orphan a game needs a migration path, not a Discord message. If
  the honest answer is "this cannot be done without losing X", say so and ask
  before doing it.
- **Write a NEW migration; never edit an applied one.** `supabase db push`
  skips any migration the remote has already recorded, so an in-place edit
  simply never reaches prod — while `supabase/sql/` (re-applied in full every
  deploy) *does*. The two halves then disagree and the deploy fails partway
  through the affected game's SQL file. A shape change is a new timestamped file
  in `supabase/migrations/`, every time.

### What has NOT changed

- **Where a SQL change goes** ([docs/supabase.md → Schema vs
  code](docs/supabase.md#schema-vs-code)). Each game's SQL is two files:
  `supabase/migrations/<ts>_<game>.sql` is **shape** (tables, constraints,
  indexes, the Realtime publication, seeds) and is applied once;
  `supabase/sql/<game>.sql` is **behavior** (functions, views, policies,
  triggers, grants) and is re-applied in full on every deploy. So a
  function/policy/grant change is an in-place edit to `supabase/sql/` **forever**
  — it never becomes a migration, and nothing here changes that. Only shape
  accumulates, and only shape needs a new file.
- **`supabase db reset` locally still wipes everything**, and that is fine — it
  is a local operation on a database seeded by `seed.dev.sql`. Nothing in this
  section is about the dev loop.
- **We still don't build compat apparatus nobody needs.** No redirect shims for
  URL shapes we never shipped, no dual-running code paths for a rename that
  touches no stored data. The rule is about *data*, not about keeping every
  past decision alive: a change that only moves code is still just a change.
- **Always confirm before destructive operations** (dropping databases,
  force-pushes, wiping prod). This was true under the old regime too, and it
  matters more now.

### The incident this rule came out of

On 2026-08-04, `strands.guesses` → `strands.events` was edited into the
already-applied strands migration. The only non-destructive fix would have been
a forward migration; the alternative chosen was to reset prod, which preserved
the file convention at the cost of every account and game on it. That trade is
no longer available — prod's data wins, and the forward migration is the fix.

**If prod ever is reset anyway**, two operational notes that have bitten before:

- **Clear the stamps.** `gmake db-schema ENV=local` deletes `.make/<env>/*.stamp`
  precisely because a reset makes them lie. Resetting prod with the Supabase CLI
  directly does NOT, so the next `gmake db-data ENV=prod` skips the word import
  and leaves `common.words` empty — every word game silently broken. `rm -f
  .make/prod/*.stamp` first.
- **`db-data` is not part of `deploy`.** The deploy target ships structure +
  functions + FE only; a reset database also needs `gmake db-data ENV=prod`.

## Trust model — server-authoritative for cleanliness, not anti-cheat

Players are friends who trust each other. We lean server-authoritative as a matter of good architecture (single source of truth, validated state transitions, race-condition safety), **not** as a defense against cheating:

- **Game state lives in Postgres; mutations go through RPCs.** This is non-negotiable because it's how we get atomicity and consistent rules.
- **The client never decides what constitutes a valid move.** Always check on the server.
- **If a server-authoritative implementation would meaningfully complicate the code or harm UX to defeat cheating that wouldn't happen, prefer the simpler path.** Don't contort the code to prevent someone from lying about their display name or peeking at their partner's screen through the FE devtools.

Examples of where this lands:

| feature | server-authoritative? | why |
|---|---|---|
| Turn validation, move legality | yes, always | core to the game working at all |
| Random seed for board generation | yes | reproducibility and fairness without trust |
| Chat content length limit (1–1000 chars) | yes | constraint, not anti-abuse |
| Chat spam / rate-limiting | no | friends won't spam each other |
| Display-name validation | minimal | if a friend wants to call themselves "Lord Buttsworth," that's between friends |
| AI clue suggestion (codenamesduet) | server-side, but for the API key — not for cheat prevention | the clue-giver could ask Claude themselves in another tab; we're not the gatekeeper of that |

## Stack snapshot

React 19 + TypeScript + Vite on the frontend; Supabase (Postgres with RLS, PostgREST, Realtime, Auth via magic links, Edge Functions in Deno) on the backend; Netlify for FE hosting; Anthropic Claude via Edge Functions for AI features (codenamesduet's clue suggester, scrabble's move suggester + autonomous opponent, and crosswords' clue explainer). See [README.md](README.md) for the longer narrative.

## Game roster — trajectory

The original target was ~7–8 games; sixteen are live today (codenamesduet, connections, psychicnum, spellingbee, bananagrams, waffle, wordle, stackdown, scrabble, boggle, crosswords, wordwheel, wordiply, strands, letterboxed, setgame); psychicnum is a deliberately minimal toy whose job is to exercise the multi-game architecture with the smallest possible game-logic surface.

**New games tend to be ports.** The planned roster is essentially complete, but the pattern for any future addition still holds: Joel has implementations of these games in other stacks (the rules / problem-space are well understood), so the work is fitting them into the Supabase + React shell, not designing the game logic. When porting:

- Treat the existing implementation as the spec for *what the game does* and adapt the FE to that.
- Server-authoritative state and the gametype-per-schema split are non-negotiable; if the source code keeps state somewhere else, that's where the porting work happens.
- Look for opportunities to share components / hooks with what's already in `common/` — see [docs/ui.md → Consistency across games](docs/ui.md#consistency-across-games) and [docs/code-conventions.md → Shared vs game-specific](docs/code-conventions.md#shared-vs-game-specific).
