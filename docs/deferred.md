# Deferred work

Things we explicitly chose NOT to do, with a one-line reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

When an item gets picked up, delete it from this file. When a new "we'll do this later" decision happens, add it here so future-us doesn't lose track.

For per-feature deep context on each item, follow the link into the relevant feature doc — `codenamesduet.md`'s "Open items," `psychicnum.md`'s "Open items / known scope-creep," `common.md`'s "Deferred / open."

## codenamesduet

See [`codenamesduet.md → Open items`](games/codenamesduet.md#open-items) for the longer treatment of each.

- **Mission / campaign mode.** Variable starting token counts per the Duet rulebook's mission maps. Schema not built; would just take a non-9 default at create_game time, controlled by a new mission parameter. Worth doing when there's real demand.
- **Tile `aria-label` for screen readers.** Board tiles are `<button>`s in `Board.tsx` but have no `aria-label` describing reveal state. Screen-reader users hear only the word, not whether it's been revealed and as what color. Add an `aria-label` that spells out the verdict — something like `${word}, revealed as green agent`. Needs a small `'G' | 'N' | 'A' → 'green agent' | 'neutral' | 'assassin'` helper (the previous `labels.ts → labelName` was removed when the GameLog switched from text labels to colored words; the screen-reader use case warrants bringing it back in narrower form).

## psychicnum

- **Make the game-status readout (`.infoState`) more visually interesting.** The
  info-column game-status area (`.infoState` — "N/3 found · M/9 guesses used") is
  plain and boring. Give it more visual life: spellingbee's info column (its
  rank ladder / stats treatment) is a good reference for what "interesting" looks
  like. Cross-game concern (the `.infoState` class is shared), but psychicnum is
  where it's most noticeably flat. Deferred from the psychicnum v2 → v3 pass.
- **The budget-exhausting *correct* guess flashes "Incorrect" for a beat**
  (code-review-2026-07-04 §1.4 F6). `submit_guess` returns `'lost'` for the guess
  that takes the budget to zero regardless of hit/miss, and `BoardCol` maps
  anything but `'won'`/`'correct'` to the red "Incorrect" pill — so a last guess
  that *finds* a secret briefly shows "Incorrect" while its tile turns green,
  then the terminal pill replaces it. Cosmetic/transient. Fix when convenient:
  return a richer value (`'lost_correct'`) from the RPC, or branch the pill on
  the local board check (the guessed word is a now-green secret).

Open scope-creep notes also live in [`psychicnum.md → Open items`](games/psychicnum.md#open-items).

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- **Setup-shape evolution strategy for `clubs_gametypes.default_setup`.** Today's saved-defaults storage is "whatever the per-game `create_game` validates today, persisted verbatim." If a future code change reshapes a setup field — renames it, narrows the value type, drops it, adds a new required field — clubs with a saved default from before the change can land in an unhappy state: their saved blob is missing or wrong, and the dialog seeds the form with stale data. Today the FE merges manifest defaults under the saved blob, so missing fields fill in cleanly; the per-game `create_game` validator rejects malformed shapes loudly on Start (the user re-picks). Removed fields stay in the blob until next save (no harm — extras ignored by validators that accept-extras, or rejected by strict validators with a clear message). Wholesale-renamed fields are the breakage case: the dialog shows defaults for the new field, the stale field is silently dropped on next save. **For now, the simplest policy applies**: per-game `create_game` validates strictly; users land on errors when their saved default is incompatible; they re-pick once and the next save heals the row. When a real setup-evolution event happens, formalize: either (a) gametype-version stamp on the saved blob + per-version up-migration on read, or (b) explicit `default_setup` clear-on-incompatible-change in the migration that ships the shape change. Until then: don't reshape setup fields without thinking about the saved defaults in flight.
- **Auto-propagating a newly-registered gametype to existing clubs.** A new club is seeded via `common.default_gametypes_for_club` (friend clubs get every registered gametype; solo clubs get only the `min_players <= 1` subset), and members can hand-edit the set afterward via the "Edit club" dialog (`common.set_club_gametypes`). What's *still* deferred: when a new gametype is registered after a club already exists, nothing auto-adds it to that club. A per-game baseline migration can backfill (bananagrams does), or members can add it from the editor; under the alpha prior (`db:reset` wipes everything anyway) neither is load-bearing.

- ~~**De-duplicate the mode prefix in `labelFor` status strings.**~~ **DONE.** With the mode now shown by `<ModePill>`, the `coop ·` / `compete ·` prefixes were stripped from every game's `labelFor` (psychicnum, spellingbee, connections, and the factory-based waffle / wordle / stackdown); the strings are now bare (`solved`, `ada won the race`, `racing…`). No FE tests asserted them. See [ui.md → Mode pills](ui.md#mode-pills).
- **Per-club stats schema.** Solo clubs are the planned anchor for per-user stats; schema not built yet. No UI surface to drive it.
- **Profile column hardening via `common.profiles_public` view.** If profile data ever grows sensitive (real names, email-derived metadata, settings), revoke direct SELECT on `common.profiles` from `authenticated` and expose a view exposing only the safe columns. See the comment on the existing `profiles_select_authenticated` policy in the baseline migration.
- **Username picker UI.** Currently the trigger auto-seeds username from email's local-part. Picker waits on the larger "magic links vs passwords" auth-method decision; when that lands, collision handling moves into the auth flow.
- ~~**Global auto-nav on `common.games` is_current_view flips.**~~ **RESOLVED — and the whole approach changed.** The club-page-only auto-nav is gone entirely; being added to a game now pops a global **join invitation** (`useGameInvitations`, mounted in App.tsx) wherever the player is, and they Join on their own terms. So the "users elsewhere don't get pulled in" gap is closed, but by an invite-to-join model rather than yanking people in. See [`common.md` → Joining a game — the invitation popup](common.md#joining-a-game--the-invitation-popup).
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See the inline `// Fragile:` comments at `useCommonGame.ts`.
- **Stable-name Realtime channel reuse on a fast remount** (code-review-2026-07-04 §1.3 L4). A fast unmount→remount of a stable-name channel (`game:${gameId}`, the club-presence channels) can, per `@supabase/realtime-js` 2.108.1, hand the new mount a still-tearing-down instance whose `SUBSCRIBED` never fires (StrictMode double-mount; club↔game navigation inside the unsubscribe RTT) — so no presence track / `set_current_view` / postgres-changes until the next reconnect. **Empirically not user-visible today** (StrictMode dev + green cross-client e2e), so deferred; it's timing, not guarantee. Fix direction: await the prior `removeChannel` promise before re-creating a same-name channel (a small module-level teardown registry). The related self-echo comment at `useCommonGame.ts:466–470` (claims Realtime echoes broadcasts to the sender; the default is `broadcast: { self: false }`, the code works because it applies locally anyway) can be corrected at the same time.
- **Draggable + resizable chat panel.** Today's `<FloatingChat>` is fixed-position in the layout. The old connections repo has a draggable/resizable chat panel with persistence of its rect; that interaction is the right shape for a general game-UI pattern, not a connections-specific affordance. Likely uses `position: fixed` + `react-rnd` or hand-rolled pointer-down/move state + `localStorage` for the saved rect. Land alongside the scratchpad below (similar interaction, same chrome).
- ~~**Per-game scratchpad with takeover-lock.**~~ **SHIPPED** as a `common/` feature (crosswords is the first consumer). `common.game_scratchpads` (surrogate PK, nullable `owner_id`, `body`, `version`) + `common.set_scratchpad` RPC + mode-aware RLS; manifests opt in via `scratchpad?: { enabled; perPlayerInCompete? }`. `GameScratchpad` (a `<FloatingPanel>` on `useDraggablePanel`, per-game rect) + `ScratchpadBubble` (header toggle via `scratchpadOpenStore`), rendered by GamePage outside PauseBoundary (survives pause + shows at terminal). `useScratchpad` does DB body sync (CDC "newer wins" + optimistic debounced flush) + the Broadcast takeover lock on a stable-name channel — **coop shares one pad (locked); compete gives each player a private pad (`perPlayerInCompete`)**, since a shared pad would leak solving progress. pgTAP `common/scratchpad_test.sql`, e2e `scratchpad.e2e.ts` (two-client sync + lock). Possible follow-ups: connections could adopt it (category brainstorming); richer conflict UX than one-writer-at-a-time.
- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See the `// Fragile:` comment at `useSession.ts`.
- **Re-audit unused outcome `-bg` tokens once all games have landed.** `common/theme.css` defines five `-border` / `-bg` outcome-token pairs (won / lost / active / near / current). Today `near-bg` and `current-bg` are unused; `won-bg`, `lost-bg`, `active-bg` are used by Calendar (and ClubGameCard's delete-confirm pill for `lost-bg`). Kept for vocabulary parity — a reader seeing `-border` should reasonably expect a `-bg` companion. Worth re-auditing once all ~7 planned games are in: if `near-bg` / `current-bg` still have zero callers, drop them (and consider deriving the rest with `color-mix` against the `-border` token to retire the `-bg` half of the vocabulary entirely).
- ~~**Idle-tracking accumulator leak via non-graceful unmount.**~~ **RESOLVED** by the additive tick clock (`common.timers` / `common.tick_timer`): there's no idle accumulator to leak any more. The clock only advances while a client is actively calling `tick_timer`, so a crash / tab kill / network loss just stops the ticks — exactly the right behavior, no transition-write to miss. (See `docs/states.md` → the game-clock note, and `useGameTimer`.)
- **Promote the turn-log "whose guesses" player-picker to `common/`.** wordle's `GameTurnLog` added a small understated dropdown in the turn-log header (via the new optional `<TurnLog headerAction>` slot) that switches **whose turns the log shows**: coop with 2+ players is one "Team", every other case lists the players (viewer first + default + "You" when they're playing; a spectating club member sees the player's name instead), and in compete an opponent's rows are RLS-hidden until terminal (the log shows "Hidden until game ends."). This is **almost certainly not wordle-specific** — most turn-log games will want it. **Don't extract yet** (only one consumer); when a second game wants it, lift the picker + the per-player filtering into a shared component/hook (the `headerAction` slot is already shared). Likely **unifies with the WordList "filter dropdown"** under [Wordlist markers](#wordlist-markers-spellingbee--boggle) — same "per-player select that filters a chronological/alphabetical list" idea on a different surface, with the same post-terminal-only honesty constraint for compete.
- **Player-dot borders + one shared `<Dot>` component (prep for expanded palette + color themes).** Player-color dots appear all over (PlayersStrip / OpponentStrip / bananagrams PeersStrip / chat / setup player picker / UserMenu / ColorChoiceList / feedback pills / RichMessage), some as CSS `border-radius: 50%` circles, others as unicode `●` baked into text — plus a hollow `○` variant meaning "no player" (not logged in, word not found). The plan, for when the member palette expands and overall color themes land: some colors will be too light against a white background (or too dark against black), so **each member color gets a paired border token** (e.g. `--color-member-yellow-border`, a dark gold ringing a light-yellow fill). Work items when picked up:
  - **Generate the border shades algorithmically in OKLCH** (clamp perceived lightness to a fixed L, keep hue+chroma — darkening in HSL drifts yellow toward olive), as explicit per-theme tokens in `theme.css` seeded by the algorithm and hand-tunable after. NOT a use-site `color-mix()` derivation: one mix percentage can't be right across hues (yellow needs far more darkening than blue). `memberColor.ts` grows a `borderVarFor()` twin next to `colorVarFor()`; DB color *names* are untouched.
  - **One shared `<Dot>` component** (`color` + `variant: filled | hollow`; an inline-block span, CSS circle — svg buys nothing here), replacing both the per-module CSS copies and the unicode bullets. The hollow variant (transparent fill + `--color-text` border) is the case that most needs the tokenization — a hardcoded black outline vanishes on a dark theme (the PlayersStrip `border: 2px solid black` tweak of 2026-07-07 is this feature's prototype).
  - **The bulk of the migration is the `●`/`○` glyphs living inside strings** (~8 sites: codenamesduet/wordle PlayAreas, connections manifest, ClubPage, GamePage, boggle Help, plus test assertions): those messages must carry structure (a color/segment field, like RichMessage's segments) instead of an embedded glyph. Side win: no more font/platform-dependent bullet size/baseline.
  - **Open question:** is the border token really a general `-edge` token? Raw member colors also sit on the page background in tile-selection frames, crosswords peer-cursor frames, and chat name labels — a light-yellow player breaks those the same way. Decide the token name/scope (`-border` vs `-edge`) when picked up.

## connections

See [`connections.md → Future work`](games/connections.md#future-work) for the longer treatment.

- **Per-tile rise-and-fade animations** on category match. The wrong-guess shake exists; the match-resolved animation doesn't.
- **Scheduled puzzle import.** Today's `npm run connections:import` is manual. Graduates to a GitHub Action or a Supabase scheduled Edge Function when the manual cadence gets annoying enough.

## spellingbee

See [`spellingbee.md → Open / deferred`](games/spellingbee.md#open--deferred) for context.

- ~~**Custom-letters puzzle.**~~ **SHIPPED.** A player-specified 6-outer + 1-center override that bypasses the diverse builder. `setup.custom_center` + `setup.custom_letters` are now wired end to end: a SetupForm "Custom letters (optional)" fieldset, a `customLettersError` Start gate (folded into `spellingbeeSetupError`), a custom short-circuit in the edge function before the pangram sampling, and a relaxed ≥1 (vs ≥30) word gate in `create_game` (which also strips the one-off letters from the saved default). Works in either mode. See [`spellingbee.md → Custom letters`](games/spellingbee.md#custom-letters); pgTAP `custom_letters_test.sql`, Vitest `setup.test.ts`, e2e `spellingbee.e2e.ts`.
- ~~**Click-to-define popover + "look up any word" shortcut.**~~ **SHIPPED 2026-06-18; reworked onto `common.words` 2026-06-20.** Common word-lookup feature, documented in [`common.md → Word definitions`](common.md#word-definitions-click-to-define--lookup). Definitions are columns on the shared `common.words` list (`definition` / `definition_source`) + the `cache_definition` UPDATE RPC, the `common-define` Edge Function (read-through cache → Wiktionary; "Unknown word" for non-list words), and the spellingbee FE wiring (clickable `WordList` rows + the `~` shortcut). pgTAP `common/words_test.sql`; FE `parseDefinition.test.ts`. Possible follow-ups: surface the lookup in other word games as they land; richer rendering of the custom format (numbered senses, inflection styling — deliberately minimal today); richer Wiktionary rendering (etymology/IPA, currently dropped).
- **Surface `common.games.status` through `GamePageCtx`.** `spellingbee/components/PlayArea.tsx`'s `buildOver` currently derives `outcome` from rank because the ctx exposes `playState` but not the `status` jsonb. Threading `status` through would let the modal copy distinguish manual end / timeout / completed crisply (and other gametypes' `labelFor`-equivalent FE renders would benefit). Refactor when a second consumer wants the same data.

## waffle (waffle)

No outstanding deferred items today.

## bananagrams (bananagrams)

- **The "🍌 Peel! You drew N" local pill fires for a *peer's* peel too.** A peer peeling grows the caller's own `tiles` (everyone draws on a peel), so the caller's draw-announcement watcher reads it as a draw and shows the peel pill even though the caller didn't peel. Reads slightly oddly ("I didn't peel, why the pill?"). Cosmetic — the tile counts are always correct. Joel hasn't decided whether to reword the peer case (e.g. "🍌 <name> peeled — you drew N") or leave it. Low priority.

## crosswords (crosswords)

Deferred from the crosswords build + its 2026-07-05 review. (The game doc's §9
also lists NYT overlay-PNG analysis + NYT dedup; those live there.)

- ~~**FE "upload your own `.puz`/`.ipuz`."**~~ **SHIPPED 2026-07-05** — the setup
  form's "Upload file" tab (drop zone + file chooser) parses the file client-side
  (`lib/importFile.ts` → the relocated `lib/parse/`) and starts a self-contained
  game via `create_game`'s inline `board` arg. See `crosswords.md` §5.
- **Cryptic apparatus** — the rebus-"collapse" toggle + the AI "Explain this
  clue" helper from crossplay, still deferred. (The **cryptic edge marks**
  `|`/`_` shipped — `set_mark` + `docs/crosswords-marks-plan.md`.)
- **`generateSolutionPdf` (answer-key PDF).** Print ports the puzzle generator
  only; the answer-key variant needs the shielded solution and was dropped for
  v1 — could be terminal-gated later (the solution is readable then).
- **Scratchpad lock races C3b / C3c** (review 2026-07-05; C3a — the holder-guard
  — was fixed). Both self-heal within seconds and can't corrupt the DB, so
  they're deferred: **C3b** — two clients' simultaneous first keystrokes each
  adopt the *other's* claim (both read-only for ~STALE_MS) and the loser's
  in-flight flush still lands (no server lock check); **C3c** — a late joiner
  sees no lock state for ≤1s (Broadcast has no history / no snapshot-on-join),
  so typing in that window can steal the lock from an active holder. Crossplay's
  server arbitrated both; our serverless design would need a claim tiebreak +
  a snapshot-on-join. Low priority at friend scale.

## Wordlist markers (spellingbee + boggle)

The shared `WordList` (used by both spellingbee and boggle) now leads each row with a **circle marker** carrying finder attribution — a filled ● in the finder's color for found words, a hollow ○ in light grey for post-terminal misses — with the word text itself plain black. Rationale worth keeping: a solid disc is a far better color carrier than thin colored text (bigger area, no legibility/antialiasing fight), which **decouples identity from legibility** and relaxes the member palette — colors no longer have to survive as thin text, only as a ~12px disc. The deferred ideas that fall out of having a marker vocabulary:

- **◐ (U+25D0) "multiple players found this word," in the first-finder's color.** A visual "others got this too" cue. Honesty constraint: compete finds are private mid-game (RLS gates `found_words` to your own rows until terminal), so ◐ can only truthfully appear **post-terminal in compete**, though it could be **live in coop**. Not built — just the marker reserved.
- **⦻ (U+29BB) "scored zero because multiple players found it."** This is the *authentic* Boggle rule (shared words cancel), and boggle compete today deliberately does the **opposite**: the `boggle.found_words` PK is `(game_id, user_id, word)` and dedup is per-player, so two players independently keep the same word and both score it. So ⦻ isn't just a marker — it rides along with an **optional shared-word-cancellation scoring mode** (a scoring-model change in `submit_word` / `_finish`). The marker's value is exactly that it makes the otherwise-confusing paper rule legible. Build only if we add that scoring mode.
- **Filter dropdown on the WordList.** A small select to narrow the displayed words: `all words`, `missed`, `everyone`, `me`, and one entry per other player by username (`moth`, `leah`, …). There are real moments you want to focus — "what did we miss?", "what did Leah get?" — that the full alphabetical wall buries. Pure FE: filters the rows the list already has (found rows + the post-terminal reveal), nothing new from the server. Same honesty constraint as the markers above: `missed` and per-player options only mean anything **post-terminal in compete** (mid-game RLS shows you only your own finds), so the per-player entries should appear only when the data is actually visible (coop, or compete post-terminal). The finder-color circles make the per-player options self-labeling — each name can carry its color dot.

## Feedback channels (local vs group)

> **✅ RESOLVED — the feedback refactor (`7f160b4` → `2af0e4d`, branch `playarea-layout`).** Exactly this split shipped: **local** feedback is `common/hooks/feedback/useLocalFeedback.ts` (a near-input `<GenericFeedbackPill>` in the below-board slot, validity tones, never a player color); **group/peer** feedback is `common/hooks/feedback/useGlobalFeedback.ts` → the header `<StatusSlot>` (carries the actor's color disc). The two are separate channels so neither clobbers the other, and the naming convention (`Global`/`Local`/`Generic`, never bare "feedback") is in `docs/code-conventions.md`. Only remaining follow-up: unify the *turn-outcome* vocabulary (TurnLog good/bad/near/…), deliberately deferred. *Original note below for the record.*

`ctx.feedback` → `<FeedbackPill>` renders in the GamePage header's `<StatusSlot>`, *replacing* the `<PlayersStrip>`. It's used inconsistently: most games route **local** feedback — validation of the player's own action ("not a word", "no 'X' on your rack", "too short") — into this **group**-positioned slot, clobbering the player roster. The distinction worth enforcing:

- **Local feedback** — ephemeral, for *me*, about what I just did; belongs near the input where my eyes are. Validity tones (success / warning / error / info), **never** a player color.
- **Group feedback** — shared/peer events ("leah found APPLE", "moth hit Genius", "Joel revealed a hint"); belongs in the header slot beside the `<PlayersStrip>`, and should speak the *identity* language (the actor's color disc — see [Player identity = a colored disc](ui.md#player-identity--a-colored-disc)). They're separate channels precisely so a transient local message can't overwrite a group event, and vice versa (the overwrite insight).

**Reference impl:** spellingbee already does this — a dedicated near-input `Feedback.tsx` (its own tone palette incl. `warning`, which the header palette lacks) for the player's own submission, header slot reserved for peer events. **Cleanup:** promote spellingbee's local `Feedback` into `common/`, give every game a near-input local channel, and reserve the header slot for genuine group/activity feedback (which barely exists today).

## Printing to PDF — which games get it

Print-to-PDF is a per-game opt-in (see [`pdf.md`](pdf.md)). **Five games print today:**
scrabble, psychicnum, boggle, spellingbee, bananagrams.

**Two games are deliberately excluded** (a permanent "won't do", not a deferral): both
are turn-by-turn *board progressions* where a single static snapshot can't represent the
game — you'd need a board snapshot per turn for it to mean anything on paper, which a
one-page printout isn't.

- **waffle** — the game is a sequence of tile *swaps*; a lone end-board doesn't capture
  the solve.
- **wordle** — the game *is* the guess-by-guess progression; a single board can't stand
  in for it.

**Still open** (would fit the existing helpers cleanly, no snapshot problem): codenamesduet
and connections (turn-log / word-list families) and stackdown.

## Tooling

- **Fold waffle + spellingbee's create_game tails into `_shared/startGame.ts`'s `invokeCreateGame`.** The board-builder edge functions now share `callerClient` (all three) + `invokeCreateGame` (boggle) from `supabase/functions/_shared/startGame.ts` (code-review-2026-07-04 §4.3 Part B). waffle + spellingbee still call `create_game` inline because their tails carry bespoke diagnostic `console.log`s (`'create_game RPC error:'`, `'success: id=…'`) that `invokeCreateGame` doesn't emit — and per the keep-logs prior we don't silently drop diagnostics. To finish the extraction: decide whether `invokeCreateGame` should log internally (keyed by schema) so all three can adopt it, or add an optional logger hook; then repoint both. Small, log-policy-gated — ask Joel before changing those log lines.
- **Generate ESLint `GAMETYPES` from `src/games.ts`.** Currently the games list is hand-maintained in two places (`src/games.ts` + `eslint.config.js`). A tiny script could derive the ESLint list from the registry. Now worth doing: with ten games registered the dup has already drifted **silently** — a stretch where five games were missing from `GAMETYPES` left their cross-game imports unguarded, and nothing failed (a game simply absent from the forbidden list produces no lint error). So the old "a missed update is obvious" assumption was wrong; deriving from the registry is the real fix (the list was manually re-synced in the meantime — code-review-2026-07-04 §1.5).
- **Stale e2e fixtures: `bananagrams` + `boggle`.** `e2e/bananagrams.e2e.ts` uses `data-row`/`data-col` selectors but the board renders `data-x`/`data-y`, and its input interaction predates the v3 UI + the concede/peel changes; `e2e/boggle.e2e.ts`'s input interaction predates the capture-entry model (it should type via `page.keyboard`, no `<input data-game-input>`). Both were deferred through the v3 sweep and never re-run. Refresh selectors + interactions when either game is next touched. The Playwright infra itself is healthy — and the **WebKit + Firefox engines are now installed** (`npx playwright install webkit firefox`), so cross-engine (Safari/Firefox) layout repro is available.

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC — but the *shape* of that RPC is TBD until we have a second non-toy game to compare.
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
