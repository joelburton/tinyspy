# Project priors

Context for AI assistants and contributors working on this repo. These are project-level priors that should shape every decision; the specific docs ([docs/naming.md](docs/naming.md), [docs/cheatsheet.md](docs/cheatsheet.md), [README.md](README.md)) build on top.

## Educational priority — clarity over brevity

The primary author is an engineer learning AI-assisted development who also genuinely enjoys reading code and writing TypeScript and React. **The codebase itself is part of the artifact.** Optimize for someone reading it later (often the author, occasionally a fork-er) understanding *why* things are the way they are.

Concretely:

- **Docstrings on every exported function, component, hook, and RPC.** Explain what it does, why it exists, and any non-obvious constraints. The existing tinyspy RPCs in `supabase/migrations/20260612000000_baseline.sql` and components like `src/components/CluePanel.tsx` are the model — generous prose, examples, references to related pieces.
- **Code comments where the WHY isn't obvious.** Design decisions, subtle invariants, non-obvious trade-offs ("we refetch on SUBSCRIBED because broadcasts can be missed during reconnect"), workarounds for specific platform behavior.
- **Names describe role, not implementation.** `isClueGiver` not `playerA`. See [docs/naming.md](docs/naming.md).
- **Prefer one clear path over a clever one.** A few extra lines of straightforward code beat a tight expression that requires the reader to pause.

This **overrides** the general agent default of "no comments unless strictly necessary." Comments that teach are part of the value of this codebase.

What still doesn't belong:

- Comments that restate what well-named code already says (`// increment counter` above `counter++`).
- References to the current task, PR, or contributor (`// added for issue #42`, `// per joel's review`) — these belong in commit messages and rot in the code.
- Stale TODOs. If a TODO doesn't have a clear trigger for resolution, delete it instead.

## Audience — friends, not strangers

This is a venue for groups of friends to play games together. It is **not** a public matchmaking platform.

- No "find an open game" listings, no public lobby, no random pairings, no leaderboards-among-strangers.
- The social primitive is a **club**: a named, persistent group of friends who play games together. See [docs/naming.md → Clubs](docs/naming.md#clubs-the-common-social-layer).
- Clubs invite friends to join; games happen inside clubs. Chat, presence, "people you've played with," and game invitations are organized by club, not by individual game.
- This shapes UX decisions: e.g., a game's "share" affordance is "play with a club," not "post to a public list." The join-code path exists for ad-hoc pairings outside any club, but it's the fallback, not the primary flow.

## Alpha software — break things freely

The actual user population is Joel plus a handful of friends who *know* this is alpha-stage and have signed up for the bumpy ride. There are no production users to protect.

What this means in practice:

- **Don't engineer for backwards compatibility.** No redirect shims for old URL shapes, no dual-running code paths during a migration, no "legacy" branches that exist to be polite to existing data. Make the change, tell Joel to tell the friends.
- **Schema rewrites are fine.** Drop tables, rename columns, change RPC signatures. The cost is "Joel sends a Discord message" — not "engineering a multi-week dual-write transition."
- **Data loss between rebuilds is expected and accepted.** `supabase db reset` wipes everything; in-progress games disappear; chat history goes with them. This is fine. The Supabase project itself is on the chopping block (planned rebuild as "games"). The friends understand.
- **Forcing re-authentication / re-account-creation is fine.** Renaming `display_name` → `username` may invalidate someone's previous handle. They'll pick a new one. Migrating to a fresh Supabase project means everyone signs in afresh. None of this is a blocker.
- **Bookmarks rotting is fine.** When clubs introduce path-based URLs, old `#game=ABC` links won't work. Nobody will be sad.

This **doesn't** mean be cavalier with destructive actions. The principle is about *avoiding compat apparatus we don't need*, not about being sloppy with the friends' goodwill. Still:

- **Always confirm before destructive operations** (dropping databases, force-pushes, etc.). The "friends will understand" license is for *design* decisions, not for *unauthorized* destruction.
- **The friends' actual game data, if it matters to them, still matters.** Joel decides what's expendable; if he says "you can wipe the dev DB," yes. He hasn't said that about prod — but prod is currently empty / non-load-bearing.

When you encounter a question like "should we keep the old URL pattern working?" or "do we need a migration path from display_name to username for existing rows?" — the default answer is **no, just make the change cleanly**. If you're not sure whether a specific destructive choice is in-bounds, ask once; once Joel says yes, take the simpler path.

## Solo and multiplayer games — keep them orthogonal

Most games in this monorepo are playable solo (Boggle, crosswords, etc.). One — Tinyspy — requires exactly two players. Solo games are started outside any club; multiplayer games are started inside a club.

**Goal: the same code and tables should handle both modes wherever possible.** Avoid forked code paths or duplicated tables for "solo version" vs "club version."

Concretely:

- A game's `games` table should accommodate both with a nullable `club_id` (null = solo, non-null = club-played) rather than separate `solo_games` / `club_games` tables.
- Score reports, replay history, board generation, and any other game-internal logic should be the same code regardless of mode.
- Mode-specific behavior lives at the **edges**: RLS (who can see the game), the lobby flow (who can join), the post-game screen (invite-club-to-rematch vs. play-again-alone).

Tinyspy is the exception that proves the rule — its `club_id` is `not null` because the game is intrinsically multiplayer. Other games' `club_id` is nullable.

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
| AI clue suggestion (Tinyspy) | server-side, but for the API key — not for cheat prevention | the clue-giver could ask Claude themselves in another tab; we're not the gatekeeper of that |

## Stack snapshot

For grounding when a decision touches the stack:

- **Frontend:** React 19 + TypeScript + Vite, no UI framework. CSS Modules + a global theme stylesheet ([docs/naming.md → CSS](docs/naming.md#css)).
- **Backend:** Supabase — Postgres (with RLS), PostgREST, Realtime, Auth (magic links via Resend SMTP), Edge Functions (Deno).
- **Hosting:** Netlify (FE), Supabase (everything else).
- **AI features:** Anthropic Claude via Edge Functions (Tinyspy's clue suggester is the current example).

Multi-game architecture is rolling out — see [docs/naming.md](docs/naming.md) for the schema-per-game model and the games-registry pattern that makes any single game removable in three actions.
