# Project priors

**Spelling is American.** `color`, not `colour`; `gray`, not `grey`;
`behavior`, `center`, `canceled`. This is an American app written by an
American, and it holds everywhere — identifiers, CSS tokens, comments, docs,
commit messages, and UI copy alike.

Context for AI assistants and contributors working on this repo. These are project-level priors that should shape every decision; the specific docs build on top:

| file | what's there |
|---|---|
| [docs/naming.md](docs/naming.md) | Terminology glossary (gametype, game, board, club, member, persona) |
| [docs/code-conventions.md](docs/code-conventions.md) | How we write code: DB conventions, FE conventions, code clarity, known gotchas |
| [docs/common-folders.md](docs/common-folders.md) | How `src/common/` is organized: the folder taxonomy + PURPOSE of each folder for components/hooks/lib, placement rules ("where does a new file go?"), and a retrospective on how the reorg was applied |
| [docs/common.md](docs/common.md) | The **architecture** layer (not UI): clubs/profiles/games schema, the game-RPC helpers (`create_game` / `end_game` / manual-end / concede / timers), RLS, routing + the FE shell/registry, the sibling-manifest + code-splitting patterns, the removability invariant — plus the word list + its two-tier filter rule, definitions, the ⌥` anagram finder, and **dictionary curation** (editors-only edit/add/delete with the `words_edits` journal + the solution-before-dictionary rule) |
| [docs/supabase.md](docs/supabase.md) | How the app talks to Supabase, end to end: the client, schema handles + exposure, query conventions (explicit columns, view-reads/table-subscribes, split lifecycle, the `max_rows` bounds trap), the Realtime channel registry + the four data-hook shapes + the publication invariant, RPC/RLS/edge-function conventions, the **divergence register**, and the 2026-07-12 review's findings + recommendations |
| [docs/realtime-lost-events.md](docs/realtime-lost-events.md) | The **lost-event** failure mode, measured and FIXED: `SUBSCRIBED` is only the join ack — a channel has a **deaf window** until the `system` "Subscribed to PostgreSQL" attach confirmation (width tracks tenant-boot slowness), and a `postgres_changes` event committed inside it is LOST, not late. The fix: every postgres_changes hook refetches again on the attach confirmation (`postgresAttached.ts`). Plus the delivery-window probes, the engineered regression spec (`e2e/realtime-deaf-window.e2e.ts`), the diagnosis recipe, and the always-on `[rt]` console instrumentation (`realtimeDiag.ts`) |
| [docs/states.md](docs/states.md) | View-state / play-state vocabulary, suspend / current / pause concepts |
| [docs/testing.md](docs/testing.md) | Test theory, persona conventions, pgTAP + Vitest patterns, the e2e scope boundary + the repo-wide invariant guards — and **the screenshot gallery** (`gmake gallery`: every game × mode × phase × desktop/mobile/PDF into one contact sheet; a browsing tool, not a test) |
| [docs/tile-feedback.md](docs/tile-feedback.md) | **A DESIGN TARGET, not current state** (the one doc here that isn't): the agreed vocabulary for what a **tile** and a **board** may say during play — one channel per meaning (background = state · background flash = attention · border width = selected · border color = verdict, or the keyboard cursor · inset ring = a peer is here · dashed outline = hint · box-shadow = hover · dim-down = in flight / not your turn / game over), each with a lifetime and an audience. Plus the rules that make it hold: *chrome fades, game pieces don't* and its mirror *depth belongs to game pieces, not chrome*; attention is a judgement about what the viewer already knows; **read the cause, never infer it from the diff**; a mark on a piece covers the piece; revealing the answer is a state change, not a mark. Carries the **roster** (3 of 16 converted: wordle, waffle, psychicnum) with what each remaining game will force — start a session there. Folds into ui.md once the games conform |
| [docs/keyboard-nav-plan.md](docs/keyboard-nav-plan.md) | **A PLAN, to be built and deleted**: arrow-key navigation of a board's pieces for the five games where clicking pieces IS the move (waffle, psychicnum, connections, codenamesduet, strands) — the three tests that exclude the other eleven, the grammar (`Space` toggles · `⌫` clears · **`Enter` alone commits**), pure-geometry movement + the shape-vs-state split + the reachability invariant, the marks (cursor = border colour, selection = width, peer = inset ring, move-end = state), the two prerequisites that land first (`⌥Z` takes the shuffle; psychicnum drops its EntryRow), and the per-game rollout |
| [docs/error-copy-sprint.md](docs/error-copy-sprint.md) | **A PLAN, to be built and deleted — not scheduled**: the error-message design is wrong in shape, not in detail. `ERROR_COPY` exists because of a false premise (that changing a SQL-raised sentence needs a migration — it doesn't; `supabase/sql/` is re-applied every deploy), and the table conflates *"we have words for this"* with *"this is not a bug"*. Carries the evidence — 74 keys where the tone tracks nothing (the same event is `error` in one game and `info` in another), `info` on lost races where the moves you made **cannot be accepted**, a possible live bug where waffle's "No swaps left" may sit where the LOSS belongs, and two entries (`ai-malformed`, `dictionary-source-failed`) that should be faults — plus the direction to explore (*"he who hits the error describes it fully"*) and what the 2026-08-18 color sprint already renamed so the palette stopped lying |
| [docs/buttons.html](docs/buttons.html) | **A RENDERED REFERENCE, not prose** — the button tone grid as a live page: all four tones (action · caution · destructive · quiet) × both treatments (primary filled / secondary outline), at rest, hovered and disabled, with the oklab sliders that DERIVE the whole family from each tone's chosen `-primary`. The twin of `theme.css` → CHROME; if they disagree, the stylesheet wins. Open it off disk — it lives in `docs/` and does not ship |
| [docs/ui.md](docs/ui.md) | FE **visual language**: desktop-first, layout stability, theme tokens + two-vocabularies, **the color system** (the `--<bucket>-<thing>-<modifier>-<quality>` grammar and the buckets · *a family is a complete grid*, reserved cells included, held by the shipped `/palette` page rather than an allow-list · the five outcome variants `-ink` / `-fill` / `-edge` / `-terminal-frame` / `-wash` · **every color has a name**, and a component references one but never holds one · alias-on-dependency vs copy-on-coincidence, where *a copy keeps the same hex* · no cross-bucket borrowing · collapsing a lookalike needs certainty, not a hex match · what's machine-checked), the feedback pill (tones, tone-follows-the-event), page chrome (GamePage/ClubPage), modals/dialogs/toasts, tiles + the warm ramp, mode pills, **the button taxonomy** (the bare `<button>` is NEUTRAL and `.button` is the general button; the fourteen kinds in four families — accidental / game pieces / keyboard / general — plus *pieces use depth for hover and darkening for press* and *general buttons use colour only*), button iconography, the v1→v3 versioning note |
| [docs/mobile.md](docs/mobile.md) | The mobile-appearance pass: the desktop-first rules for it, the single `56.25rem` desktop→mobile breakpoint, what's been mobile-ready'd so far (club-page tabs, dots-only player strip, the `.card` shell pages), and recorded TODOs (cap handles at 10 / club names at 20) |
| [docs/playarea.md](docs/playarea.md) | THE **play-surface** doc: the two-column PlayArea layout, info-column readouts (+ the canonical order, OpponentStrip rules, locally-terminal look), text entry (capture), the turn log, the turn-history viewer, board sizing — plus the `PlayArea` → `BoardCol` / `InfoCol` decomposition (`useHistoryViewer`, per-game `lib/history.ts`) |
| [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) | Every key the app listens for: how a keystroke is routed (the window dispatcher + its focused-field / floating-panel / modifier gates), the global shell shortcuts (`` ` ``, `/`, `?`, `~`, `` ⌥` ``, `⇧<`, `+`, `⌥+`, `⌥⌫`), menu/dialog/chat keys, the club + home lists, then the **per-game board keys** for all sixteen |
| [docs/pdf.md](docs/pdf.md) | Printing game boards to PDF (jsPDF): the clean-printable design language — the three-shade greyscale palette, color-only-for-meaning, white backgrounds, header/Setup conventions; the shared `common/pdf/` helpers (frame + turnLog + wordColumns + `wordListBody`) and the three body families (turn-log, word-list, and crosswords' whole-cloth ported printer) |
| [docs/features.md](docs/features.md) | Games categorized by feature: dimensions (every game has exactly one value — a game missing from one is a gap to notice) vs tags (a game has the feature or not) |
| [docs/win-lose.md](docs/win-lose.md) | The **finish/defeat taxonomy** + its canonical vocabulary: the three primitives (finish line: built-in/target/none · compete style: **race**/**best** · the reachable-end rule), per-game coop and compete tables, the timeout adjudications (all lose / rank the finishers / rank the standings), the **no-survival-wins** invariant, clock fairness (shared vs **player clock**; flag fall = concede), the **priced-help** rule (+ psychicnum's un-priced compete reveal, the one undecided cell), and the proposed knobs (`compete_style`, standings-on-a-loss, wordiply's composite score) |
| [docs/game-status-labels.md](docs/game-status-labels.md) | What every game writes as its **title** and renders as its club-page **status line**, per play state — plus the known inconsistencies between them |
| [docs/deferred.md](docs/deferred.md) | **Cross-cutting** deferred work only (`common/`, shell, theme, tooling, whole-app design) + the index of which games have their own registers. A deferral inside one game lives in that game's doc under `## Deferred`; something decided against lives under `## Won't do` — see the file's "Where an item goes" |
| [docs/cheatsheet.md](docs/cheatsheet.md) | One-screen command + file lookup |
| [README.md](README.md) | Narrative + stack |
| [docs/games/codenamesduet.md](docs/games/codenamesduet.md) | Codenames Duet rules + codenamesduet schema, RPCs, FE, Edge Function, tests |
| [docs/games/psychicnum.md](docs/games/psychicnum.md) | psychicnum rules + schema, the hidden-secrets pattern, FE, tests |
| [docs/games/connections.md](docs/games/connections.md) | connections (Connections-style) rules + schema, the FE-knows decision, pause-on-disconnect pattern, peer-selection via Broadcast |
| [docs/games/spellingbee.md](docs/games/spellingbee.md) | spellingbee (NYT-Spelling-Bee-style) rules + schema; both word lists (required + bonus) ship to the FE which validates + scores locally via the shared `useWordSubmit` hook (trusting-commit, like boggle); edge-function board builder, rank ladder, manual end-game flow |
| [docs/games/bananagrams.md](docs/games/bananagrams.md) | bananagrams (Bananagrams-style) rules + schema; the FE-owned `board` / server-owned `tiles` split + derived hand, the fixed 25×25 player-board arena, snapshot-on-unmount persistence, owner-only RLS, the peel/dump bank loop, the keyboard cursor; the **per-player `concede`** (drop out = a real loss, others keep racing; replaced the whole-table `end_game`) + active-player `peel`; the **v3 desktop-only layout exception** (board fills / hand+peel+dump in the info column / no turn log) |
| [docs/games/waffle.md](docs/games/waffle.md) | waffle — Waffle-style swap-to-solve rules + schema; hidden-solution color feedback (column-grant + `security_invoker` views), coop/compete sibling pair, on-demand board generation (`waffle-build-board` edge function), player-pickable difficulty band |
| [docs/games/wordle.md](docs/games/wordle.md) | wordle — NYT-Wordle-style guess-the-word rules + schema; hidden-target color feedback + per-guess log with mode-aware RLS, on-screen keyboard, coop (shared board) / compete (fewest-guesses winner) sibling pair |
| [docs/games/stackdown.md](docs/games/stackdown.md) | stackdown — mahjong-style word game: clear a stack of 30 lettered tiles by spelling six words off the exposed ones; the sequence-as-word + strict no-trap board invariant, pre-generated board library (`gmake g-stackdown-puzzles`), hidden-solution reveal, coop (one shared board cleared collaboratively — words built privately in parallel, not via Broadcast) / compete (race to clear) sibling pair |
| [docs/games/scrabble.md](docs/games/scrabble.md) | scrabble — Scrabble-style word game on the standard 15×15 premium board with a shared 100-tile bag + blanks; **trusting-commit** architecture (the FE computes words + score, the server validates the dictionary + draws tiles); coop (shared rack, no turns) / compete (turn-based, private racks, highest score wins) sibling pair; plus an AI move suggester (coop) and an autonomous AI opponent (compete) |
| [docs/games/boggle.md](docs/games/boggle.md) | boggle (brand **MothCubes**) — Boggle-style find-words-in-a-grid; the **required vs bonus** word-list split, both lists shipped to the FE which validates + scores locally (trusting-commit, no hidden-solution view); pure-TS solver + on-demand board-builder edge function; all 8 wsboggle dice sets incl. 6×6; coop (shared finds) / compete (independent scoring) sibling pair |
| [docs/games/crosswords.md](docs/games/crosswords.md) | crosswords (brand **CrossPlay**) — collaborative/competitive crossword, a port of `~/src/crossplay`; **server-only solution** shielded via column grants, revealed at terminal; per-cell realtime via the direct-apply **`useCells`** CDC hook ("newer wins" + optimistic echo); two puzzle sources (a curated CLI library + NYT-by-date inline); check/reveal RPCs, peer cursors + the common scratchpad; a **documented v3 layout exception** (keyboard-required — NOT desktop-only: fits a tablet with a keyboard); coop (shared grid + peer cursors) / compete (private grids, first-correct-wins) sibling pair |
| [docs/games/wordwheel.md](docs/games/wordwheel.md) | wordwheel (brand **MooseWheel**) — Guardian-Word-Wheel-style word finder, a **targeted fork of spellingbee**; nine tiles on a wheel (bigger red centre used in every word + 8 outer) forming a **multiset** — duplicate letters allowed, a word spends a tile per use (the bounded-multiset vs spellingbee's set — the only game-logic delta, enforced by the edge fn's multiset-fit post-filter + shipped-list membership; a duplicated centre is spent first); +15 pangram (any 9-letter word fitting the wheel), `s` allowed; **difficulty-tagged `pangrams` seed table keyed by sorted letters** (~36.7k multiset seeds) so the pool scales with the required band; trusting-commit + shared `useWordSubmit`; coop/compete sibling pair. Note the load-bearing **realtime publication** invariant on `found_words` (schema_test guards it) |
| [docs/games/wordiply.md](docs/games/wordiply.md) | wordiply (brand **WordWire**) — Guardian-Wordiply-style base extender; a short **base** (a 2–4 letter *combination*, NOT a word) that every guess must contain as a contiguous substring, be longer than, and be a legal word; **5 guesses** (coop = 5 shared / compete = 5 per player). Two readouts, **no scalar score**: length score (`round(100·longestGuess/max_word_length)`) + letter count — both, plus the longest word, **shown only at terminal**; DURING play each guess shows only its **length** (a per-row badge). Compete winner = a lexicographic **comparator** (length score → letter count → earlier-if-timed → co-winners), not first-to-rank. Trusting-commit + shared `useWordSubmit` (points = word length); **touch-first input via the shared `common/…/entry/GuessKeyboard`** (a Wordle-style on-screen keyboard extracted so wordle + wordiply share one; physical keys still work via `useCaptureKeys`). Board built by an edge fn via `candidate_bases` + `try_base` with a **max-children gate** (throws out over-generous bases like `in`/`an`; word length is NOT capped) — or from a **player-chosen base** (`setup.custom_base`, the "try wordiply with MOTH" challenge), which relaxes the child floor to 1 and raises the ceiling to 1000 but **keeps the headroom rule**, the one gate stopping a MOTH board whose best answer is MOTHER. Same load-bearing **realtime publication** invariant (both `games` + `guesses`; schema_test guards it) |
| [docs/games/setgame.md](docs/games/setgame.md) | setgame (brand **HareTrigger**) — Set-style card game: 81 cards over four ternary attributes, and a **set** is three that are all-same-or-all-different in every one. Codenamed `setgame` because `set` is a Postgres keyword *and* a TS builtin; the found thing is a **claim**. Base-3 packing makes any two cards determine the third, so validating is arithmetic and "does this board hold a set" is a pair loop. **The roster's first contended board** — compete shares one table, so a claim removes cards from under a rival (games-row lock server-side; selection keyed by card, not slot). Refills **in place** with a staged deal; no hidden solution at all, just a column grant on the undealt deck's ORDER. Coop = clear the deck (stranding 6–9 cards is the normal ending); compete = most sets, **ties intact**, and a timeout **ranks the standings** |
| [docs/games/letterboxed.md](docs/games/letterboxed.md) | letterboxed (brand **SnakeBox**) — NYT-Letter-Boxed-style word chainer: twelve letters three to a side of a square, no two consecutive letters from one side, **each word starts with the previous word's last letter**, cover all twelve within the cap; **par is structurally 2** (every board is built backwards from a chained seed **word pair**), so the cap is waffle-style `par + extra_words`; server-authoritative moves + an **openly-shipped playable list** (the FE's hint BFS in `lib/solve.ts` is why) with the solution display-gated and compete chains **column-shielded**; undo refunds (costs a turn in turn-coop; clear has no FE surface); seed-pair pool sampled + **re-partitioned per game** by the edge fn (`gmake g-letterboxed-seeds`); coop (shared lock-stepped chain, opt-in turns) / compete (private chains, first-to-cover wins; timeout resolves on coverage) sibling pair. Note the load-bearing **realtime publication** invariant on all three tables (games+players+events; the central registry test guards it) |
| [docs/games/strands.md](docs/games/strands.md) | strands (brand **PaulPath**) — NYT-Strands-style word search: an 8×6 board whose hidden **theme words + spangram TILE it exactly** (48 cells, each once — verified across the archive, and the reason "all found" = "board consumed"); **8-way adjacency** including diagonals; **server-authoritative with the solution shielded** (column grant + `_solution_for`, deliberately NOT connections' FE-knows — a dictionary lookup forces a round trip anyway); match **by path, not by string**; the earned **hint economy** (valid non-theme words fill a capped bar; cashing it rings a theme word's tiles without their order); **no text entry at all** (a board repeats letters, so a typed string can't identify a path); the NYT archive cached to `supabase/data/strands-puzzles.jsonl` so imports need no network. Coop/compete sibling pair — compete's winner is **fewest hints used** (so the race does NOT end on first solve; a solver goes locally terminal and the others play on), and a rival sees only that one number mid-race |


## Educational priority — clarity over brevity

The primary author is an engineer learning AI-assisted development who also genuinely enjoys reading code and writing TypeScript and React. **The codebase itself is part of the artifact.** Optimize for the author reading it later understanding *why* things are the way they are. However, do not make purely archaeological comments or docs; "how it used to work" is not useful.

This **overrides** the general agent default of "no comments unless strictly necessary." Comments that teach are part of the value of this codebase.

See [docs/code-conventions.md → Code clarity & docstrings](docs/code-conventions.md#code-clarity--docstrings) for the concrete rules this implies — what to document, what doesn't belong, and the model examples.

## A question is a question

When Joel asks a question, answer the question. Do not assume that because he
asked something, it's confusing, or should change, or that you should commit to
phrasing it differently in the future. A question is just that: a question.
Answer it and don't change things.

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

## Alpha software — break things freely

The actual user population is Joel plus a handful of friends who *know* this is alpha-stage and have signed up for the bumpy ride. There are no production users to protect.

What this means in practice:

- **Don't engineer for backwards compatibility.** No redirect shims for old URL shapes, no dual-running code paths during a migration, no "legacy" branches that exist to be polite to existing data. Make the change, tell Joel to tell the friends.
- **Schema rewrites are fine.** Drop tables, rename columns, change RPC signatures. The cost is "Joel sends a Discord message" — not "engineering a multi-week dual-write transition." To keep the supabase files readable, prefer editing in place rather than appending a new migration. Once the game is out of alpha stage, we'll switch to deployed and will not edit old migration files.
- **Where a SQL change goes** ([docs/supabase.md → Schema vs code](docs/supabase.md#schema-vs-code)). Each game's SQL is two files: `supabase/migrations/<ts>_<game>.sql` is **shape** (tables, constraints, indexes, the Realtime publication, seeds) and is applied once; `supabase/sql/<game>.sql` is **behavior** (functions, views, policies, triggers, grants) and is re-applied in full on every deploy. So a function/policy/grant change is an in-place edit to `supabase/sql/` **forever, alpha or not** — it never becomes a migration. Only shape changes accumulate, and only those are affected by leaving alpha.
- **Data loss between rebuilds is expected and accepted.** `supabase db reset` wipes everything; in-progress games disappear; chat history goes with them. This is fine. The friends understand.
- **Forcing re-authentication / re-account-creation is fine.** Renaming `display_name` → `username` invalidated everyone's previous handle. They picked new ones. Migrating to a fresh Supabase project means everyone signs in afresh. None of this is a blocker.
- **Bookmarks rotting is fine.** 

This **doesn't** mean be cavalier with destructive actions. The principle is about *avoiding compat apparatus we don't need*, not about being sloppy with the friends' goodwill. Still:

- **Always confirm before destructive operations** (dropping databases, force-pushes, etc.). The "friends will understand" license is for *design* decisions, not for *unauthorized* destruction.
- **The friends' actual game data, if it matters to them, still matters.** Joel decides what's expendable; if he says "you can wipe the dev DB," yes. **Prod is deployed and real** — it has carried live profiles and games. Ask before wiping it, and take a `supabase db dump --linked` first.

### In-place migration edits now cost a PROD RESET

The edit-in-place convention above is written for `db reset`, which is a LOCAL
operation. Prod applies migrations with `supabase db push`, which **skips any
migration the remote has already recorded** — so an in-place edit to an applied
migration never reaches production, while `supabase/sql/` (re-applied in full
every deploy) *does*. The two halves then disagree, and the deploy fails partway
through the affected game's SQL file.

That happened on 2026-08-04: `strands.guesses` → `strands.events` was edited into
the already-applied strands migration, and the only non-destructive fix would
have been a forward migration. Joel chose to reset prod instead, which preserves
the convention at the cost of every account and game on it.

So, before editing an applied migration in place, decide which you're buying:
the convention, or prod's data. **Two operational notes if you reset prod:**

- **Clear the stamps.** `gmake db-schema ENV=local` deletes `.make/<env>/*.stamp`
  precisely because a reset makes them lie. Resetting prod with the Supabase CLI
  directly does NOT, so the next `gmake db-data ENV=prod` skips the word import
  and leaves `common.words` empty — every word game silently broken. `rm -f
  .make/prod/*.stamp` first.
- **`db-data` is not part of `deploy`.** The deploy target ships structure +
  functions + FE only; a reset database also needs `gmake db-data ENV=prod`.

When you encounter a question like "should we keep the old URL pattern working?" or "do we need a migration path for existing rows?" — the default answer is **no, just make the change cleanly**. If you're not sure whether a specific destructive choice is in-bounds, ask once; once Joel says yes, take the simpler path.

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
