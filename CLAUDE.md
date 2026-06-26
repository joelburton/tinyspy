# Project priors

Context for AI assistants and contributors working on this repo. These are project-level priors that should shape every decision; the specific docs build on top:

| file | what's there |
|---|---|
| [docs/naming.md](docs/naming.md) | Terminology glossary (gametype, game, board, club, member, persona) |
| [docs/code-conventions.md](docs/code-conventions.md) | How we write code: DB conventions, FE conventions, code clarity, known gotchas |
| [docs/common.md](docs/common.md) | The architectural layer: clubs, profiles, registry, routing, removability invariant |
| [docs/states.md](docs/states.md) | View-state / play-state vocabulary, suspend / current / pause concepts |
| [docs/testing.md](docs/testing.md) | Test theory, persona conventions, pgTAP + Vitest patterns |
| [docs/ui.md](docs/ui.md) | FE design philosophy: desktop-first, theme tokens, global-vs-per-game vocab, consistency goals |
| [docs/deferred.md](docs/deferred.md) | Things explicitly deferred from code reviews and conversations |
| [docs/cheatsheet.md](docs/cheatsheet.md) | One-screen command + file lookup |
| [README.md](README.md) | Narrative + stack |
| [docs/games/tinyspy.md](docs/games/tinyspy.md) | Codenames Duet rules + tinyspy schema, RPCs, FE, Edge Function, tests |
| [docs/games/psychicnum.md](docs/games/psychicnum.md) | PsychicNum rules + schema, the hidden-target pattern, FE, tests |
| [docs/games/wordknit.md](docs/games/wordknit.md) | WordKnit (Connections-style) rules + schema, the FE-knows decision, pause-on-disconnect pattern, peer-selection via Broadcast |
| [docs/games/freebee.md](docs/games/freebee.md) | FreeBee (NYT-Spelling-Bee-style) rules + schema, hidden-wordlist reveal pattern, edge-function board builder, rank ladder, manual end-game flow |
| [docs/games/monkeygram.md](docs/games/monkeygram.md) | MonkeyGram (Bananagrams-style) rules + schema; the FE-owned `board` / server-owned `tiles` split + derived hand, the fixed 25×25 player-board arena, snapshot-on-unmount persistence, owner-only RLS, the peel/dump bank loop, the keyboard cursor |
| [docs/games/waffle.md](docs/games/waffle.md) | SyrupSwap (codename `waffle`; brand ≠ codename) — Waffle-style swap-to-solve rules + schema; hidden-solution color feedback (column-grant + `security_invoker` views), coop/compete sibling pair, on-demand board generation (`waffle-build-board` edge function), player-pickable difficulty band |
| [docs/games/wordle.md](docs/games/wordle.md) | WordNerd (codename `wordle`; brand ≠ codename) — NYT-Wordle-style guess-the-word rules + schema; hidden-target color feedback + per-guess log with mode-aware RLS, on-screen keyboard, coop (shared board) / compete (fewest-guesses winner) sibling pair |
| [docs/games/stackdown.md](docs/games/stackdown.md) | StackDown (codename `stackdown`) — mahjong-style word game: clear a stack of 30 lettered tiles by spelling six words off the exposed ones; the sequence-as-word + strict no-trap board invariant, pre-generated board library (`stackdown:import`), hidden-solution reveal, coop (shared collaborative word via Broadcast) / compete (race to clear) sibling pair |
| [docs/games/scrabble.md](docs/games/scrabble.md) | RackAttack (codename `scrabble`; brand ≠ codename) — Scrabble-style word game on the standard 15×15 premium board with a shared 100-tile bag + blanks; the **trusting-commit** architecture (geometry/word-extraction/scoring live ONLY in `lib/play.ts`; the server `play_word` trusts the FE's words+score and does only dictionary check + bag draw + bookkeeping, with optimistic-concurrency `version` CAS for races); coop (one shared rack/board/score, no turns) / compete (turn-based, private racks, highest score wins) sibling pair |


## Educational priority — clarity over brevity

The primary author is an engineer learning AI-assisted development who also genuinely enjoys reading code and writing TypeScript and React. **The codebase itself is part of the artifact.** Optimize for the author reading it later understanding *why* things are the way they are. However, do not make purely archaeological comments or docs; "how it used to work" is not useful.

This **overrides** the general agent default of "no comments unless strictly necessary." Comments that teach are part of the value of this codebase.

See [docs/code-conventions.md → Code clarity & docstrings](docs/code-conventions.md#code-clarity--docstrings) for the concrete rules this implies — what to document, what doesn't belong, and the model examples.

## Audience — friends, not strangers

This is a venue for groups of friends to play games together. It is **not** a public matchmaking platform.

The metaphor that anchors design decisions: this app **replaces a group of friends on a Zoom call playing one game together**. Use it as a forcing function when a UX or schema question is ambiguous — "what would the Zoom-call answer be?"

- **No spectators.** The only people viewing a game will be players in that game. Presence-pause fires the moment a player in a game isn't connected, because someone-missing means the call has stalled.
- **One game at a time.** The whole group is on the same thing; structurally enforced by the `is_current_view` partial unique index on `common.games`.
- **No "find an open game" listings, no public lobby, no random pairings, no leaderboards-among-strangers.**

The social primitive is the **club**: a named, persistent group of friends who play games together. The club IS the Zoom call — a venue that exists between sessions, where chat threads across every game the friends play. See [docs/common.md](docs/common.md) for the model. Clubs invite friends to join; games happen inside clubs. Chat, presence, "people you've played with," and game invitations are organized by club, not by individual game. This shapes UX decisions: e.g., a game's "share" affordance is "play with a club," not "post to a public list." 

## Alpha software — break things freely

The actual user population is Joel plus a handful of friends who *know* this is alpha-stage and have signed up for the bumpy ride. There are no production users to protect.

What this means in practice:

- **Don't engineer for backwards compatibility.** No redirect shims for old URL shapes, no dual-running code paths during a migration, no "legacy" branches that exist to be polite to existing data. Make the change, tell Joel to tell the friends.
- **Schema rewrites are fine.** Drop tables, rename columns, change RPC signatures. The cost is "Joel sends a Discord message" — not "engineering a multi-week dual-write transition." To keep the supbase migration files readable, prefer editing baseline migrations rather than appending a new migration. Once the game is out of alpha stage, we'll switch to deployed and will not edit old migration files.
- **Data loss between rebuilds is expected and accepted.** `supabase db reset` wipes everything; in-progress games disappear; chat history goes with them. This is fine. The friends understand.
- **Forcing re-authentication / re-account-creation is fine.** Renaming `display_name` → `username` invalidated everyone's previous handle. They picked new ones. Migrating to a fresh Supabase project means everyone signs in afresh. None of this is a blocker.
- **Bookmarks rotting is fine.** 

This **doesn't** mean be cavalier with destructive actions. The principle is about *avoiding compat apparatus we don't need*, not about being sloppy with the friends' goodwill. Still:

- **Always confirm before destructive operations** (dropping databases, force-pushes, etc.). The "friends will understand" license is for *design* decisions, not for *unauthorized* destruction.
- **The friends' actual game data, if it matters to them, still matters.** Joel decides what's expendable; if he says "you can wipe the dev DB," yes. He hasn't said that about prod — but prod is currently empty / non-load-bearing.

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
| AI clue suggestion (TinySpy) | server-side, but for the API key — not for cheat prevention | the clue-giver could ask Claude themselves in another tab; we're not the gatekeeper of that |

## Stack snapshot

React 19 + TypeScript + Vite on the frontend; Supabase (Postgres with RLS, PostgREST, Realtime, Auth via magic links, Edge Functions in Deno) on the backend; Netlify for FE hosting; Anthropic Claude via Edge Functions for AI features (tinyspy's clue suggester is the current example). See [README.md](README.md) for the longer narrative.

## Game roster — trajectory

The rough target is ~7–8 games. Eight live today (TinySpy, WordKnit, PsychicNum, FreeBee, MonkeyGram, SyrupSwap, WordNerd, StackDown); PsychicNum is a deliberately minimal toy whose job is to exercise the multi-game architecture with the smallest possible game-logic surface — it's slated for removal after beta. Future games may include: Boggle and crosswords.

**Most upcoming games are ports.** Joel has implementations of these games in other stacks (the rules / problem-space are well understood). The work is fitting them into the Supabase + React shell, not designing the game logic. When porting:

- Treat the existing implementation as the spec for *what the game does* and adapt the FE to that.
- Server-authoritative state and the gametype-per-schema split are non-negotiable; if the source code keeps state somewhere else, that's where the porting work happens.
- Look for opportunities to share components / hooks with what's already in `common/` — see [docs/ui.md → Consistency across games](docs/ui.md#consistency-across-games) and [docs/code-conventions.md → Shared vs game-specific](docs/code-conventions.md#shared-vs-game-specific).
