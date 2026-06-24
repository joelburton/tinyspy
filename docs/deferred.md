# Deferred work

Things we explicitly chose NOT to do, with a one-line reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

When an item gets picked up, delete it from this file. When a new "we'll do this later" decision happens, add it here so future-us doesn't lose track.

For per-feature deep context on each item, follow the link into the relevant feature doc — `tinyspy.md`'s "Open items," `psychicnum.md`'s "Open items / known scope-creep," `common.md`'s "Deferred / open."

## TinySpy

See [`tinyspy.md → Open items`](games/tinyspy.md#open-items) for the longer treatment of each.

- **Mission / campaign mode.** Variable starting token counts per the Duet rulebook's mission maps. Schema not built; would just take a non-9 default at create_game time, controlled by a new mission parameter. Worth doing when there's real demand.
- **Tile `aria-label` for screen readers.** Board tiles are `<button>`s in `BoardGrid.tsx` but have no `aria-label` describing reveal state. Screen-reader users hear only the word, not whether it's been revealed and as what color. Add an `aria-label` that spells out the verdict — something like `${word}, revealed as green agent`. Needs a small `'G' | 'N' | 'A' → 'green agent' | 'neutral' | 'assassin'` helper (the previous `labels.ts → labelName` was removed when the GameLog switched from text labels to colored words; the screen-reader use case warrants bringing it back in narrower form).

## PsychicNum

No outstanding deferred items today. Open scope-creep notes live in [`psychicnum.md → Open items`](games/psychicnum.md#open-items).

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- **Setup-shape evolution strategy for `clubs_gametypes.default_setup`.** Today's saved-defaults storage is "whatever the per-game `create_game` validates today, persisted verbatim." If a future code change reshapes a setup field — renames it, narrows the value type, drops it, adds a new required field — clubs with a saved default from before the change can land in an unhappy state: their saved blob is missing or wrong, and the dialog seeds the form with stale data. Today the FE merges manifest defaults under the saved blob, so missing fields fill in cleanly; the per-game `create_game` validator rejects malformed shapes loudly on Start (the user re-picks). Removed fields stay in the blob until next save (no harm — extras ignored by validators that accept-extras, or rejected by strict validators with a clear message). Wholesale-renamed fields are the breakage case: the dialog shows defaults for the new field, the stale field is silently dropped on next save. **For now, the simplest policy applies**: per-game `create_game` validates strictly; users land on errors when their saved default is incompatible; they re-pick once and the next save heals the row. When a real setup-evolution event happens, formalize: either (a) gametype-version stamp on the saved blob + per-version up-migration on read, or (b) explicit `default_setup` clear-on-incompatible-change in the migration that ships the shape change. Until then: don't reshape setup fields without thinking about the saved defaults in flight.
- **Auto-propagating a newly-registered gametype to existing clubs.** A new club is seeded via `common.default_gametypes_for_club` (friend clubs get every registered gametype; solo clubs get only the `min_players <= 1` subset), and members can hand-edit the set afterward via the "Edit club" dialog (`common.set_club_gametypes`). What's *still* deferred: when a new gametype is registered after a club already exists, nothing auto-adds it to that club. A per-game baseline migration can backfill (monkeygram does), or members can add it from the editor; under the alpha prior (`db:reset` wipes everything anyway) neither is load-bearing.

- **De-duplicate the mode prefix in `labelFor` status strings.** With the gametype mode now shown as a `<ModePill>` next to the name (see [ui.md → Mode pills](ui.md#mode-pills)), several games' `labelFor` outputs still lead with `coop ·` / `compete ·` (psychicnum, freebee, wordknit, and the mid-game lines in waffle / wordle / stackdown). That repeats the pill on the same card and re-introduces the `coop` (vs "Co-op") spelling the pill change was meant to retire. Strip the prefix from each game's `labelFor` — a per-manifest sweep, touching the FE label tests that assert those strings. Deferred because it's a separate, mechanical pass and the redundancy is cosmetic, not broken.
- **Per-club stats schema.** Solo clubs are the planned anchor for per-user stats; schema not built yet. No UI surface to drive it.
- **Profile column hardening via `common.profiles_public` view.** If profile data ever grows sensitive (real names, email-derived metadata, settings), revoke direct SELECT on `common.profiles` from `authenticated` and expose a view exposing only the safe columns. See the comment on the existing `profiles_select_authenticated` policy in the baseline migration.
- **Username picker UI.** Currently the trigger auto-seeds username from email's local-part. Picker waits on the larger "magic links vs passwords" auth-method decision; when that lands, collision handling moves into the auth flow.
- ~~**Global auto-nav on `common.games` is_current_view flips.**~~ **RESOLVED — and the whole approach changed.** The club-page-only auto-nav is gone entirely; being added to a game now pops a global **join invitation** (`useGameInvitations`, mounted in App.tsx) wherever the player is, and they Join on their own terms. So the "users elsewhere don't get pulled in" gap is closed, but by an invite-to-join model rather than yanking people in. See [`common.md` → Joining a game — the invitation popup](common.md#joining-a-game--the-invitation-popup).
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See [`code-review-2026-06-16.md`](code-review-2026-06-16.md#12-set_current_view--unset_current_view-error-path-is-fire-and-forget-fragile) §1.2 and inline `// Fragile:` comments at `useCommonGame.ts`.
- **Draggable + resizable chat panel.** Today's `<ClubChatPanel>` is fixed-position in the layout. The old connections repo has a draggable/resizable chat panel with persistence of its rect; that interaction is the right shape for a general game-UI pattern, not a wordknit-specific affordance. Likely uses `position: fixed` + `react-rnd` or hand-rolled pointer-down/move state + `localStorage` for the saved rect. Land alongside the scratchpad below (similar interaction, same chrome).
- **Per-game scratchpad with takeover-lock.** A shared notepad players can use during a game (clue notes, brainstorm space, mid-game "I think this might be…"). Some games will use it heavily (wordknit category brainstorming, future crosswords); some not at all (PsychicNum would skip). Should be a `common/` component that each manifest opts into (e.g. a `scratchpad?: { enabled: true }` field). Storage is DB-backed (survives pause-unmount per the [[feedback-pause-on-disconnect]] rule); takeover-lock via Realtime Broadcast lets one editor at a time write while others see read-only + can claim it. Old connections repo has a working version of this; the lock-and-broadcast plumbing is what to port. Land when one of the games would benefit visibly.
- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See [`code-review-2026-06-16.md`](code-review-2026-06-16.md#13-usesession-profile-verify-failure-mode-is-permissive-fragile) §1.3 and the `// Fragile:` comment at `useSession.ts`.
- **Re-audit unused outcome `-bg` tokens once all games have landed.** `common/theme.css` defines five `-border` / `-bg` outcome-token pairs (won / lost / active / near / current). Today `near-bg` and `current-bg` are unused; `won-bg`, `lost-bg`, `active-bg` are used by Calendar (and ClubGameCard's delete-confirm pill for `lost-bg`). Kept for vocabulary parity — a reader seeing `-border` should reasonably expect a `-bg` companion. Worth re-auditing once all ~7 planned games are in: if `near-bg` / `current-bg` still have zero callers, drop them (and consider deriving the rest with `color-mix` against the `-border` token to retire the `-bg` half of the vocabulary entirely).
- ~~**Idle-tracking accumulator leak via non-graceful unmount.**~~ **RESOLVED** by the additive tick clock (`common.timers` / `common.tick_timer`): there's no idle accumulator to leak any more. The clock only advances while a client is actively calling `tick_timer`, so a crash / tab kill / network loss just stops the ticks — exactly the right behavior, no transition-write to miss. (See `docs/states.md` → the game-clock note, and `useGameTimer`.)

## WordKnit

See [`wordknit.md → Future work`](games/wordknit.md#future-work) for the longer treatment.

- **Per-tile rise-and-fade animations** on category match. The wrong-guess shake exists; the match-resolved animation doesn't.
- **Scheduled puzzle import.** Today's `npm run wordknit:import` is manual. Graduates to a GitHub Action or a Supabase scheduled Edge Function when the manual cadence gets annoying enough.

## FreeBee

See [`freebee.md → Open / deferred`](games/freebee.md#open--deferred) for context.

- **Custom-letters puzzle.** A player-specified 6-outer + 1-center override that bypasses the diverse builder. The edge function's `setup.custom_letters` / `setup.custom_center` fields exist on the `FreeBeeSetup` type but are never populated, and the setup form has no inputs for them. Wiring is a small SetupForm addition + a branch in the edge function before the pangram sampling.
- ~~**Click-to-define popover + "look up any word" shortcut.**~~ **SHIPPED 2026-06-18; reworked onto `common.words` 2026-06-20.** Common word-lookup feature, documented in [`common.md → Word definitions`](common.md#word-definitions-click-to-define--lookup). Definitions are columns on the shared `common.words` list (`definition` / `definition_source`) + the `cache_definition` UPDATE RPC, the `define` Edge Function (read-through cache → Wiktionary; "Unknown word" for non-list words), and the freebee FE wiring (clickable `WordList` rows + the `~` shortcut). pgTAP `common/words_test.sql`; FE `parseDefinition.test.ts`. Possible follow-ups: surface the lookup in other word games as they land; richer rendering of the custom format (numbered senses, inflection styling — deliberately minimal today); richer Wiktionary rendering (etymology/IPA, currently dropped).
- **Surface `common.games.status` through `GamePageCtx`.** `freebee/components/PlayArea.tsx`'s `buildOver` currently derives `outcome` from rank because the ctx exposes `playState` but not the `status` jsonb. Threading `status` through would let the modal copy distinguish manual end / timeout / completed crisply (and other gametypes' `labelFor`-equivalent FE renders would benefit). Refactor when a second consumer wants the same data.

## SyrupSwap (waffle)

- **Recently-swapped tile flash.** A cosmetic cue: briefly pulse/highlight the two tiles a swap just moved, so the eye tracks the change (like freebee's fade-underline on a freshly-found word). Today the only change-signal is the updated color. Small `WaffleGrid` addition (diff prev vs. next board to find the two moved cells, animate them).

## Tooling

- **Generate ESLint `GAMETYPES` from `src/games.ts`.** Currently the games list is hand-maintained in two places (`src/games.ts` + `eslint.config.js`). A tiny script could derive the ESLint list from the registry. Not worth the machinery until we have ≥ 3 games — the dup is one line and the lint failure on a missed update is obvious.

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC — but the *shape* of that RPC is TBD until we have a second non-toy game to compare.
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
