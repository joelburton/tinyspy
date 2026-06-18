# Deferred work

Things we explicitly chose NOT to do, with a one-line reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

When an item gets picked up, delete it from this file. When a new "we'll do this later" decision happens, add it here so future-us doesn't lose track.

For per-feature deep context on each item, follow the link into the relevant feature doc — `tinyspy.md`'s "Open items," `psychicnum.md`'s "Open items / known scope-creep," `common.md`'s "Deferred / open."

## Tinyspy

See [`tinyspy.md → Open items`](games/tinyspy.md#open-items) for the longer treatment of each.

- **Mission / campaign mode.** Variable starting token counts per the Duet rulebook's mission maps. Schema not built; would just take a non-9 default at create_game time, controlled by a new mission parameter. Worth doing when there's real demand.
- **Tile `aria-label` for screen readers.** Board tiles are `<button>`s in `BoardGrid.tsx` but have no `aria-label` describing reveal state. Screen-reader users hear only the word, not whether it's been revealed and as what color. Add an `aria-label` that spells out the verdict — something like `${word}, revealed as green agent`. Needs a small `'G' | 'N' | 'A' → 'green agent' | 'neutral' | 'assassin'` helper (the previous `labels.ts → labelName` was removed when the GameLog switched from text labels to colored words; the screen-reader use case warrants bringing it back in narrower form).

## Psychic Num

No outstanding deferred items today. Open scope-creep notes live in [`psychicnum.md → Open items`](games/psychicnum.md#open-items).

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- **Setup-shape evolution strategy for `clubs_gametypes.default_setup`.** Today's saved-defaults storage is "whatever the per-game `create_game` validates today, persisted verbatim." If a future code change reshapes a setup field — renames it, narrows the value type, drops it, adds a new required field — clubs with a saved default from before the change can land in an unhappy state: their saved blob is missing or wrong, and the dialog seeds the form with stale data. Today the FE merges manifest defaults under the saved blob, so missing fields fill in cleanly; the per-game `create_game` validator rejects malformed shapes loudly on Start (the user re-picks). Removed fields stay in the blob until next save (no harm — extras ignored by validators that accept-extras, or rejected by strict validators with a clear message). Wholesale-renamed fields are the breakage case: the dialog shows defaults for the new field, the stale field is silently dropped on next save. **For now, the simplest policy applies**: per-game `create_game` validates strictly; users land on errors when their saved default is incompatible; they re-pick once and the next save heals the row. When a real setup-evolution event happens, formalize: either (a) gametype-version stamp on the saved blob + per-version up-migration on read, or (b) explicit `default_setup` clear-on-incompatible-change in the migration that ships the shape change. Until then: don't reshape setup fields without thinking about the saved defaults in flight.
- **Club-level game-list editor.** Today every newly-created club is auto-populated with every registered gametype in `common.clubs_gametypes` (via `handle_new_user` / `create_club`). There's no UI for a club to opt out of a gametype it doesn't want, and there's no auto-propagation to existing clubs when a new gametype is registered later (DB-admin INSERT handles that case under the alpha prior). A future "club settings" surface could let members manage their own m2m rows.
- **Per-club stats schema.** Solo clubs are the planned anchor for per-user stats; schema not built yet. No UI surface to drive it.
- **Profile column hardening via `common.profiles_public` view.** If profile data ever grows sensitive (real names, email-derived metadata, settings), revoke direct SELECT on `common.profiles` from `authenticated` and expose a view exposing only the safe columns. See the comment on the existing `profiles_select_authenticated` policy in the baseline migration.
- **Username picker UI.** Currently the trigger auto-seeds username from email's local-part. Picker waits on the larger "magic links vs passwords" auth-method decision; when that lands, collision handling moves into the auth flow.
- **Global auto-nav on `common.games` is_current_view flips.** Currently the auto-nav-into-current-game logic lives in `ClubPage` and only fires while the user is on the club page. For users elsewhere (their own profile, a different club, an unrelated /g/ URL), a club starting a new game won't pull them in. Worth a global subscription when this gap matters in practice.
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See [`code-review-2026-06-16.md`](code-review-2026-06-16.md#12-set_current_view--unset_current_view-error-path-is-fire-and-forget-fragile) §1.2 and inline `// Fragile:` comments at `useCommonGame.ts`.
- **Draggable + resizable chat panel.** Today's `<ClubChatPanel>` is fixed-position in the layout. The old connections repo has a draggable/resizable chat panel with persistence of its rect; that interaction is the right shape for a general game-UI pattern, not a wordknit-specific affordance. Likely uses `position: fixed` + `react-rnd` or hand-rolled pointer-down/move state + `localStorage` for the saved rect. Land alongside the scratchpad below (similar interaction, same chrome).
- **Per-game scratchpad with takeover-lock.** A shared notepad players can use during a game (clue notes, brainstorm space, mid-game "I think this might be…"). Some games will use it heavily (wordknit category brainstorming, future crosswords); some not at all (psychic-num would skip). Should be a `common/` component that each manifest opts into (e.g. a `scratchpad?: { enabled: true }` field). Storage is DB-backed (survives pause-unmount per the [[feedback-pause-on-disconnect]] rule); takeover-lock via Realtime Broadcast lets one editor at a time write while others see read-only + can claim it. Old connections repo has a working version of this; the lock-and-broadcast plumbing is what to port. Land when one of the games would benefit visibly.
- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See [`code-review-2026-06-16.md`](code-review-2026-06-16.md#13-usesession-profile-verify-failure-mode-is-permissive-fragile) §1.3 and the `// Fragile:` comment at `useSession.ts`.
- **Re-audit unused outcome `-bg` tokens once all games have landed.** `common/theme.css` defines five `-border` / `-bg` outcome-token pairs (won / lost / active / near / current). Today `near-bg` and `current-bg` are unused; `won-bg`, `lost-bg`, `active-bg` are used by Calendar (and ClubGameCard's delete-confirm pill for `lost-bg`). Kept for vocabulary parity — a reader seeing `-border` should reasonably expect a `-bg` companion. Worth re-auditing once all ~7 planned games are in: if `near-bg` / `current-bg` still have zero callers, drop them (and consider deriving the rest with `color-mix` against the `-border` token to retire the `-bg` half of the vocabulary entirely).
- **Idle-tracking accumulator leak via non-graceful unmount.** `useCommonGame`'s cleanup writes `unset_current_view` (which folds the open idle window into `total_idle_seconds`), but only when React's effect cleanup runs. Browser crash / tab kill / hard network loss skip the cleanup, so the idle accumulator stops accumulating and the next mount sees that span as wall-clock-elapsed — `useGameTimer` subtracts a too-small idle figure from the countdown. Affects any game with a countdown timer (tinyspy / wordknit / psychic-num can all opt in via `setup.timer`). Mitigations when this becomes annoying: `navigator.sendBeacon` firing an unset-write on `beforeunload`, or a mount-time heuristic ("if presence shows me alone and the last `started_at + total_idle_seconds + max-game-duration` is implausibly stale, treat the gap as idle"). For friends-only this leak is acceptable. See inline `// Fragile:` comments at `useCommonGame.ts`.

## Wordknit

See [`wordknit.md → Future work`](games/wordknit.md#future-work) for the longer treatment.

- **Per-tile rise-and-fade animations** on category match. The wrong-guess shake exists; the match-resolved animation doesn't.
- **Scheduled puzzle import.** Today's `npm run puzzles:import` is manual. Graduates to a GitHub Action or a Supabase scheduled Edge Function when the manual cadence gets annoying enough.

## FreeBee

See [`freebee.md → Open / deferred`](games/freebee.md#open--deferred) for context.

- **Compete mode.** Schema, RLS, and RPCs (`submit_word`'s compete branch, `play_state='won_compete'`, the per-player duplicate rule, `setup.target_rank` validation) all designed-in and tested via pgTAP. The FE is coop-only in v1: no mode radio in the setup form, no target-rank slider, no leaderboard component, no compete-aware `buildOver` case. Adding compete is FE work only — no migration.
- **Custom-letters puzzle.** A player-specified 6-outer + 1-center override that bypasses the diverse builder. The edge function's `setup.custom_letters` / `setup.custom_center` fields exist on the `FreebeeSetup` type but are never populated, and the setup form has no inputs for them. Wiring is a small SetupForm addition + a branch in the edge function before the pangram sampling.
- **Click-to-define popover.** Deliberately deferred as a *common* feature, not freebee-specific — every word game will want it (boggle, future crosswords). When tackled, try a free dictionary API (Free Dictionary API at api.dictionaryapi.dev) before defaulting to a Postgres `common.definitions` table. See the memory note at `~/.claude/projects/-Users-joel-src-codenames/memory/project_common_dictionary_lookup.md` for the API-vs-table evaluation plan.
- **Surface `common.games.status` through `GamePageCtx`.** `freebee/components/PlayArea.tsx`'s `buildOver` currently derives `outcome` from rank because the ctx exposes `playState` but not the `status` jsonb. Threading `status` through would let the modal copy distinguish manual end / timeout / completed crisply (and other gametypes' `labelFor`-equivalent FE renders would benefit). Refactor when a second consumer wants the same data.

## Tooling

- **Generate ESLint `GAMETYPES` from `src/games.ts`.** Currently the games list is hand-maintained in two places (`src/games.ts` + `eslint.config.js`). A tiny script could derive the ESLint list from the registry. Not worth the machinery until we have ≥ 3 games — the dup is one line and the lint failure on a missed update is obvious.

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC — but the *shape* of that RPC is TBD until we have a second non-toy game to compare.
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
