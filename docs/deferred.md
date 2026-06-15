# Deferred work

Things we explicitly chose NOT to do, with a one-line reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

When an item gets picked up, delete it from this file. When a new "we'll do this later" decision happens, add it here so future-us doesn't lose track.

For per-feature deep context on each item, follow the link into the relevant feature doc — `tinyspy.md`'s "Open items," `psychicnum.md`'s "Open items / known scope-creep," `common.md`'s "Deferred / open."

## Tinyspy

See [`tinyspy.md → Open items`](tinyspy.md#open-items) for the longer treatment of each.

- **Harden `game_players_select`.** Partner's `key_card` is currently readable by either player via RLS — convention says "don't query the other seat" but enforcement is missing. Fix: split into own-row reads + a `game_players_roster` view that omits `key_card`.
- **Mission / campaign mode.** Variable starting token counts per the Duet rulebook's mission maps. Schema not built; would just take a non-9 default at create_game time, controlled by a new mission parameter. Worth doing when there's real demand.
- **Per-player guess UI.** Currently a single guesser at a time (the non-clue-giver during active play). Could expand to "either player can vote on a guess" for richer cooperative play, but that's a rules change, not just code.
- **Tile `aria-label` for screen readers.** Board tiles are `<button>`s but have no `aria-label` describing reveal state. Screen-reader users hear only the word, not whether it's been revealed and as what color. Add `aria-label={\`${word}${revealed ? `, revealed as ${labelName(revealed_as)}` : ''}\`}` to the tile button in `BoardScreen.tsx`.

## Psychic Num

See [`psychicnum.md → Open items / known scope-creep`](psychicnum.md#open-items--known-scope-creep) for the full cleanup recipe.

- **Remove `winner_id` overspec.** The schema and FE track which user guessed correctly; the original spec was strictly team-wins, not individual-attribution. ~30 lines of removal across 5 files when someone gets to it. The cleanup recipe is in `psychicnum.md`.
- **Solo-mode UI.** The RPCs allow any club size, but no UI drives single-member-club play. Tied to the broader solo-clubs question below.

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- **Saved default setup config on `club_game_kinds`.** The m2m landed with just `(club_id, gametype)` for the opt-in question; the deferred half is adding a nullable `default_config jsonb` column for per-club saved/learned form-defaults. Defaults are **per-club, not per-user** — friends coordinate over SMS before starting, so "whoever clicked Start" arbitrariness doesn't matter ("hey, want to play boggle? we can do a 5x5 with no timer"). Wrapper lookup chain when the dialog opens: saved default → manifest's `defaults`. Saved-vs-learned (explicit "save as default" button vs every successful start auto-writes-back) is the one open question, but the storage shape is identical either way so the call can wait. Motivation grows with setup-option count: tinyspy + psychic-num have one or two choices and re-picking is fine; a real boggle has ~9 (board size, min word length, dup handling, timer, …) and most players have the set they like. Land when the third game's setup dialog makes re-picking annoying.
- **Club-level game-list editor.** Today every newly-created club is auto-populated with every registered gametype in `common.club_game_kinds` (via `handle_new_user` / `create_club`). There's no UI for a club to opt out of a gametype it doesn't want, and there's no auto-propagation to existing clubs when a new gametype is registered later (DB-admin INSERT handles that case under the alpha prior). A future "club settings" surface could let members manage their own m2m rows.
- **`common.club_games` denormalized index.** Trigger-maintained roll-up across game schemas, for cross-game aggregate queries (sort + paginate across all games, "most recent activity"). Build only if registry-dispatch `fetchClubGames` becomes painful at scale.
- **Friends / presence layer.** The "you already know your friends" framing currently makes them unnecessary. Revisit if and when the audience grows past handful-of-friends scale.
- **Per-club stats schema.** Solo clubs are the planned anchor for per-user stats; schema not built yet. No UI surface to drive it.
- **Profile column hardening via `common.profiles_public` view.** If profile data ever grows sensitive (real names, email-derived metadata, settings), revoke direct SELECT on `common.profiles` from `authenticated` and expose a view exposing only the safe columns. See the comment on the existing `profiles_select_authenticated` policy in the baseline migration.
- **Username picker UI.** Currently the trigger auto-seeds username from email's local-part. Picker waits on the larger "magic links vs passwords" auth-method decision; when that lands, collision handling moves into the auth flow.
- **Solo-club UI surface.** Solo clubs exist (auto-created on signup) but are UI-hidden. When solo-mode play for boggle / crosswords / etc. lands, decide how solo clubs surface to their owner.
- **Global auto-nav on club_active_game.** Currently the auto-nav-into-active-game logic lives in `ClubPage` and only fires while the user is on the club page. For users elsewhere (their own profile, a different club, an unrelated /g/ URL), a club starting a new game won't pull them in. Worth a global subscription when this gap matters in practice.
- **Structured game status + per-manifest renderer.** `ClubGameEntry.statusLabel` is a flat `string` today, which works because every current game can summarize itself in plain text. Games with richer status — a future NYT-Connections clone ("3/4 groups found, 2 guesses left"), a crossword ("80% filled, 12 minutes elapsed"), or tinyspy upgraded to "Won · 2 turns left" with emphasis — want accent color, weight, multi-line, or a `<Link>` to the replay. Plan: parametrize `ClubGameEntry<TStatus>` so each game owns its status shape (usually a discriminated union); add `renderStatus(status): ReactNode` to `GameManifest`; ClubPage calls `manifest.renderStatus(entry.status)` blindly and stays game-agnostic. Manifests already ship in the main bundle so this is free — the discipline is that `renderStatus` may not import from the Root chunk (use `common/theme.css` utility classes only). Deliberately NOT stored as pre-rendered HTML in the DB: that would bake styling forever, lock out JSX (Link, viewer-conditional rendering), and force re-rendering every historical row on a redesign. Defer until the second game with a structurally-rich status lands (likely the NYT-Connections port); refactor both games in the same PR — that's the moment the right shape becomes obvious.

## Wordknit

See [`wordknit.md → Open items`](wordknit.md#open-items) and the "POC scope" / "Future work" sections of that file for the longer treatment.

- **Per-tile contributor frame.** `useSharedSelection` already tracks who selected which tile, but `BoardScreen` renders every selected tile with a single uniform treatment instead of a per-contributor color frame. Surfacing the `selections` map from the hook and rendering the frame in the tile button is a small follow-up (~30 lines, all in `BoardScreen.tsx`). Worth doing before the POC graduates — the visual cue ("Bea is contributing the teal tile") is part of what makes coop selection legible.
- **Polish features parked from the original repo.** Hint dialog, scratchpad with collaborative-edit takeover, per-tile rise-and-fade animations, per-player local shuffle, calendar / "puzzle of the day," share dialog, "play next." Each can land independently once the puzzle archive is wired up. Until then, the POC is deliberately bare to keep the architectural shape visible.
- **Puzzle archive + date-picker.** The setup dialog renders a placeholder gesturing at this. The work is two pieces: (1) an NYT-archive importer (the original repo has a Node version we can port to a Supabase edge function or a one-shot SQL load), and (2) a date picker in `wordknit/components/Setup.tsx`. Today's create_game hardcodes a single board.
- **Roll out the pause-on-disconnect pattern to tinyspy and psychic-num.** The infrastructure (`computePause` + `PauseOverlay`) lives in `common/` so it transfers cleanly. Each rollout is ~10 lines of wiring per BoardScreen. Worth doing before either game gets serious use — Joel's principle is "if `#-present` ≠ `#-expected`, pause." See `~/.claude/projects/-Users-joel-src-codenames/memory/feedback_pause_on_disconnect.md` for the durable note.

## Tooling

- **Generate ESLint `GAMETYPES` from `src/games.ts`.** Currently the games list is hand-maintained in two places (`src/games.ts` + `eslint.config.js`). A tiny script could derive the ESLint list from the registry. Not worth the machinery until we have ≥ 3 games — the dup is one line and the lint failure on a missed update is obvious.

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC — but the *shape* of that RPC is TBD until we have a second non-toy game to compare.
- **Friends vs 1:1 clubs.** Once clubs are well-used, a 2-person club may make `common.friends` redundant. Or friends stays as a lightweight "would play with" graph and clubs are the persistent rooms that form from it. Decide when there are users who'd notice the difference.
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
