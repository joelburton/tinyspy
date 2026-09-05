# Deferred work

Things we've chosen not to do *yet*, with a reminder of what + why. This isn't a roadmap or a "next up" queue — it's the register of decisions made in code review and conversation that we want to remember.

## Where an item goes

**This file holds only cross-cutting work** — `common/`, the shell, the theme, tooling, and whole-app design questions.

**A deferral that lives inside one game lives in that game's doc**, under a `## Deferred` heading. Work tends to happen game-by-game, so the item should be in the file you already have open. The sorting key is **which file you'd edit to do the work**, not which game surfaces it: the `WordList` marker ideas below are filed here, not under spellingbee/boggle, because the code is in `common/`.

Two headings, and the distinction matters:

| heading | meaning |
|---|---|
| `## Deferred` | Real work, not done yet. Someone may pick it up. |
| `## Won't do` | **Decided against.** Kept *only* so reviews and future sessions don't re-propose it. Brief — the decision, the date, one line of why. Not a queue. |

Don't put a won't-do under "Deferred," or it reads as a backlog item forever. Games with neither kind of item get neither heading.

When an item gets picked up, delete it. When a new "we'll do this later" decision happens, add it to the right place.

**Database-touching items are NOT indexed separately** — each lives in the doc
that owns it, like any other deferral. Two queues once collected them
(`db-work.md`, then `plans/db-work-2.md`), and both existed for a reason that
expired: while the alpha prior made baselines editable, schema work was cheap and
worth batching. Since 2026-08-13 a shape change is a forward migration against
data that must survive (CLAUDE.md → "Production software"), so DB work is no
cheaper for being listed together and an index buys nothing.

*Worth knowing before anyone sweeps for hidden DB work again:* the second queue
WAS a whole-docs sweep — every `## Deferred`, `## Open decisions`, `### Open
questions` and `## TODO` across `docs/` and `docs/games/` — and it found only two
DB-touching items, both of which are still open and now live with their games:
crosswords' bulk import ([data, not schema](games/crosswords.md#9-deferred)) and
setgame's [`card` → `tile` rename](games/setgame.md#deferred), the one deferral
here that needs a forward migration. Everything else it examined was FE, CSS or a
ratified decision.

*(A future pass may split `## Deferred` further into "useful now" vs "far-future idea" — game-by-game, when each is next opened.)*

## Per-game registers

Only these games have open items today; the rest have none.

| game | |
|---|---|
| [bananagrams](games/bananagrams.md#deferred) | the peel pill's peer case · won't-do: touch input, replay |
| [boggle](games/boggle.md#12-wont-do) | won't-do only: word-list freshness via Storage, a "check board" helper |
| [codenamesduet](games/codenamesduet.md#wont-do) | won't-do only: missions, tile `aria-label`s |
| [connections](games/connections.md#deferred) | per-tile match animations · a `data[0]` cast standing in for a compiler flag |
| [crosswords](games/crosswords.md#9-deferred) | the fullest register — ⌥M, `fetch-nyt-range`, NYT dedup, the library picker bound before the bulk import, the scratchpad lock races, standing schema flags, unpinned tests |
| [letterboxed](games/letterboxed.md#deferred) | rare-letter seed weighting · won't-do: trimming the seed table (measured — 55 MB against a 500 MB tier) |
| [psychicnum](games/psychicnum.md#wont-do) | won't-do only: anti-spam, a livelier `.infoState` |
| [setgame](games/setgame.md#deferred) | a coop `target_sets` · an `undefined` lost into a `\| null` slot · won't-do: calling "no set", a wrong-claim penalty |
| [stackdown](games/stackdown.md#7-deferred) | `tile-gone` should be a pill · a `data[0]` cast standing in for a compiler flag |
| [wordwheel](games/wordwheel.md#deferred) | the `Letters`/`Wheel` CSS fold (owns the spellingbee pair's ledger) · `s`-heavy seeds |

## Common / architecture

See [`common.md → Deferred / open`](common.md#deferred--open) for more detail on each.

- ~~**Setup-shape evolution strategy for `clubs_gametypes.default_setup`.**~~ **Decided (2026-08-03): YAGNI.** The saved-defaults blob is stored verbatim, so a *renamed* setup field would silently reset a club's preferences (the dialog shows the new field's default; the stale key is dropped on next save). We're not going to rename one — the roster is complete and the setups are settled — so the versioning machinery it was reserving isn't worth building. If it ever happens, the answer is one line in the same migration that ships the shape change: clear the incompatible `default_setup` rows and let the friends re-pick once. Adds, drops and narrowed types already behave (the FE merges manifest defaults under the blob; strict validators reject loudly on Start and the next save heals the row).
- ~~**Auto-propagating a newly-registered gametype to existing clubs.**~~ **Decided (2026-08-02): won't do.** The roster is complete, so the case that motivated it — a gametype registered after a club exists — is now the rare one, and it already has two answers: the "Edit club" dialog, and a per-game backfill in that game's migration (bananagrams does this). Neither is worth a standing auto-propagation mechanism.
- ~~**No recovery from a LOST realtime event.**~~ **Fixed (2026-08-06).** The mechanism turned out to be measurable — `SUBSCRIBED` is only the join ack, and events committed before the server's `system` "Subscribed to PostgreSQL" attach confirmation are dropped — which made the fix a patch after all, not new plumbing: every postgres_changes hook now refetches again when the attach is confirmed (`common/lib/supabase/postgresAttached.ts`), closing the window. Pinned by `e2e/realtime-deaf-window.e2e.ts` (written failing, flipped by the fix). Full story: [realtime-lost-events.md](realtime-lost-events.md).
- **Four guards strip comments by regex, and a `/*` inside a string literal can blank real code.** `src/guards/` has four hand-rolled comment strippers — `rawStorage.test.ts`, `cssClasses.test.ts:55`, `cssTokens.test.ts:40`, and `callSiteShape.test.ts`'s cruder line-prefix test — and all of them treat `/* … */` as a comment wherever it appears. A string literal containing `/*` therefore blanks everything to the next close, which for a scanning guard means **passing while a violation ships**: the one failure mode a guard must not have. **It is reachable, and a glob is the ordinary way** — measured 2026-09-03 by running `rawStorage`'s stripper over all of `src/` against the TypeScript parser's own comment ranges: 38 lines in 8 files are blanked that the parser says are code, and 0 go the other way. Seven of the eight are one-line and self-contained (the guards' own regex literals, a `'/*'`/`'*/'` string pair in `dbCallWrapped`); the eighth is `cssTokens.test.ts`, where `'themes/*.css'` in a bucket's `where:` hides the twenty-five lines after it. Every hidden region is inside `src/guards/`, so nothing a guard looks for is hidden today, but the argument that a `/*` in a string is contrived was wrong. The *other* half of the same hole is already closed — `cssClasses:58`, `vocabularies:75` and now `rawStorage` all use `(^|[^:])//` so a URL cannot swallow the rest of a line. **Filed rather than fixed** (the `utils` area, 2026-09-03, `F-utils-11`): fixing one stripper with a real tokenizer would make a single guard exact and leave four implementations that disagree, which is worse than the hole. It is worth doing as ONE change to all four or not at all. `typescript` is already a direct devDependency (`~6.0.2`), so `ts.createScanner` needs nothing new — but **no guard uses the TS API today**, so adopting it is a decision about the shape of `src/guards/` as a whole. **There is no owning area:** `src/guards/` is not on app-audit §7's list, which is why this is here rather than in an area file.

- **The history viewer's banner ✕ is hand-written in eight games; convert it to `<CloseButton>`.** The shared dismiss glyph landed 2026-08-26 in the CSS sprint's `forms` area — `common/components/buttons/CloseButton.tsx`, converted at the floating-panel titlebar, the toast and the feedback pill. The eight left are the history-viewer banner exits, one per game (`codenamesduet`, `connections`, `psychicnum`, `scrabble`, `stackdown`, `strands`, `waffle`, `wordle`). The *class* is already shared (`historyViewer.bannerExit`); the **glyph and the button markup are not** — `✕` (U+2715) is typed by hand into each of the eight `BoardCol.tsx`, so they agree today by luck and drift the moment one is touched. **Filed rather than swept** (Joel, 2026-08-26): each of those games has its own CSS pass scheduled, and a sweep now would collide with it. The work per game is three lines — import, swap the `<button>`, and let `.bannerExit` keep only its `flex: 0 0 auto` and the pinning. **Not in the family:** letterboxed's `.chainRemove`, which is an *undo* ("Take back WORD") that merely looks like a close.
- **The envelope does not carry the HTTP status, so the PN488 line cannot say it.** The status survives every layer but the last: `dbFetch` keeps it on the Response, postgrest-js forwards it, each wrapper reads it into its `transport` and logs it on the call's own `[db]` line — and then returns the envelope alone, whose nine keys are the wire shape SQL composes. So `reportUnhandled(call, res)`, which gets only what the call site holds, prints `status=200` for an `ok` (true on every transport) and **leaves it blank for a `not-ok`**, since a declared refusal arrived 200 and a raw fault arrived 4xx and nothing in the envelope says which (Joel, 2026-09-02, `F-deep-50`: *"we should definitely not show 200 if we don't know"*). The same gap is why `call` is a hand-written string at ~95 scream sites. **The fix to consider is a tenth key** — the status, and possibly the call label, added by the wrapper to the envelope it returns. By the envelope's own design that is a compile error at every builder in SQL, Deno and TypeScript ("every key is always present"), which is the point of required keys and also why it is not a small change: it means deciding whether the wire shape SQL composes and the shape a call site reads are still the same type. A `WeakMap<Envelope, TransportFacts>` side channel in the wrappers was considered and declined the same day as messier than the gap it closes.
- **`edgeFnTransport` treats a relay failure and a function that threw as the same thing.** functions-js distinguishes them — `FunctionsRelayError` means the request never reached our code, `FunctionsHttpError` means it ran and answered — and there is an `x-relay-error` header saying so. We read neither, so both become the same fault. The two deserve different words: one is "the edge platform is having a problem", which is nobody's bug and reads like a `service-error`; the other is ours and reads like a fault. Found 2026-09-01 while measuring what each layer can see for the fault-presentation move, and deliberately left out of it — that change was about WHO presents, not about classifying better. Nothing is broken meanwhile: both paths do reach the player as a fault with their diagnostics line.
- **`help` names two different things, and one of them is wrong.** The reserved sense is **UI assistance** — the rules dialog, an InfoCol explanation, a field's `entryHelp`. It is also, wrongly, the umbrella for **hint + spoiler**, which are priced in-game assistance and not help at all (Joel, 2026-08-28: *"asking for a hint or a spoiler is NOT 'help'"*). Filed here rather than in [letterboxed.md](games/letterboxed.md) because the umbrella half is cross-cutting.
  - **In letterboxed** (the only game with the pattern): `askHelp(kind: 'hint' | 'spoiler')` at `PlayArea.tsx:238` — Joel's name for it is **`askForHintOrSpoiler`**, and a hint-only game's would be `askHint`. Its two wrappers `takeHint` / `takeSpoiler` are already right. Also `helpPillText()`, the file `letterboxed/lib/help.ts`, the RPC **`letterboxed.log_help`** (SQL + generated `db.ts` + `replay_test.sql` + the game doc — no migration, since the schema shape is a `kind` column that doesn't say "help"), and the prose "help ladder" / "Peer help".
  - **Repo-wide**, the same word is the umbrella in [win-lose.md](win-lose.md) (**"priced help"** — a named rule), [ui.md](ui.md) and [setgame.md](games/setgame.md) ("the help ladder"). Renaming the identifiers without the umbrella leaves the collision in place; renaming the umbrella needs a word that works in a rule, which `askForHintOrSpoiler` does not. **assist** is the candidate — "the priced-assist rule", "the assist ladder", `log_assist`.
  - Deliberately not done during the envelope sprint (unrelated), and scoped when picked up: identifiers only, or identifiers + umbrella.
- **User-visible error surface for view-state RPC failures.** `useCommonGame`'s `set_current_view` / `unset_current_view` calls log-and-swallow errors on the assumption that idempotency + the next reconnect's SUBSCRIBED-refire will self-heal transient failures. A persistent failure (RLS broken, RPC missing, network gone) goes unnoticed — the club's current pointer drifts from what the FE thinks it is until someone notices. Acceptable for friends-alpha; revisit when there's a generic toast/error-surface layer. See the inline `// Fragile:` comments at `useCommonGame.ts`.
- **A failed profile probe still guesses, and the guess is "you are fine".** `useSession`'s
  read of `common.profiles` treats a FAILURE as "signed in, no username yet", so a
  broken RLS policy or a dead connection at startup routes the user to
  ClaimHandleScreen — a screen about a state nobody has established. Its own comment
  has called this over-permissive since the 2026-06-16 review; the envelope sweep
  confirmed it is not an envelope problem (the read reports correctly, and `dbFetch`
  raises the modal) but a MISSING UI STATE: the honest answer is "we don't know", and
  there is no screen for it. Filed 2026-08-29 while converting the call site. Closely
  related to the entry below, which is the same shape one layer in.
- **BUG — my own member dot reads as absent on the first paint of a club page.**
  Observed on prod (a build ~10 days old) by Joel, 2026-08-30. Entering a club he
  is a member of, **his own** dot rendered hollow rather than filled — the
  hollow/filled pair being "not present" vs "present". A hollow dot for Leah was
  correct there (she had not joined the club yet); his own cannot be, because
  seeing the ClubPage header at all requires him to be present. **An immediate
  refresh showed it filled.**

  Joel's read: *"we either have a logic bug or a race I lost."* The refresh
  clearing it points at the race — the presence channel's own membership arriving
  after the first render, so the page paints before the client sees itself — but
  the self case is special enough that it may not need to wait for the channel at
  all. Not investigated; filed only.

  Filed here rather than under a game: club presence is `common/`, and the dot is
  the shared `<Dot>`.

- **Stricter `useSession` profile-verify at startup.** Today profile-verify failure is uniformly permissive (assume the session is valid). Right for transient mid-session blips, over-permissive for startup-time PostgREST/RLS failures — a corrupted auth setup looks like "no profile yet" and the user is let through. Acceptable for friends-alpha; revisit when a real auth path (passwords, third-party providers) lands and we can distinguish startup-restore from mid-session refresh. See the `// Fragile:` comment at `useSession.ts`.
- ~~**Retire the `-bg` half of the outcome vocabulary with `color-mix`.**~~ Overtaken by the 2026-08-18 palette sweep (docs/ui.md → The color system), which renamed the tier `-wash` and deleted the three cells nobody read. What survives of the idea is one live question, recorded in the token: the feedback pill computes its tint as `fill 18% over the surface` while the `-wash` tier exists at a different value for the same job, so one of the two is redundant. Deciding which moves pixels.
- **Member-color borders beyond dots — the `-edge` question.** The paired `--member-NAME-border-color` tokens + the shared `<Dot>` shipped 2026-07-07 (docs/ui.md → Player identity = a colored disc). What's still open: raw member colors also sit directly on the page background in **tile-selection borders** (connections peers), **crosswords peer-cursor frames**, and **chat name labels** — a light-yellow player has the same contrast problem there that the dot border solved. When those bite, decide whether the border token generalizes into an `-edge` ("this color legible against the body background") vocabulary, and whether name labels should switch to the border shade outright.
- **Below-board `--avail-h` chrome-subtraction isn't tokenized** (carried over from the 2026-07-01 review §3.1). The below-board slot *structure* + reserved height were shared/tokenized, but each game still hand-subtracts its own chrome height in the board/`.wrap` `--avail-h` (`- 5rem` / `- 4.4rem` / `- 8.5rem` / `- 3.5rem`) rather than deriving it from the slot token — hand-synced and drift-prone. Derive it from the slot token when convenient. *(A broader CSS pass may re-examine this — flagged so it isn't lost.)*
- **Literal radii → tokenize by *semantic intent*** (2026-07-01 review §3.3; the
  process settled 2026-08-21). `4px` / `6px` / `8px` recur across sites equal to
  `--radius-sm` / `-md` / `-lg`. The ruling stands and is the important half:
  this is **NOT a mechanical `4px→-sm` swap** — each site is tokenized by what it
  *is* (a card → `lg`, a panel → `md`, a chip → `sm`), which is a human judgment.

  What changed is *when*: no longer a sweep, but **area by area as each surface
  is converted** (plans/app-audit.md §13 → "How a value gets converted"). A
  raw value equal to a token changes silently; one that isn't — the `2px` and
  `3px` micro-radii, boggle's `12px` tray — gets surfaced and looked at once, in
  context, rather than living as a standing exemption. Tuned surfaces (a game's
  board) are exempt outright.

  Two related leftovers from the same review: bananagrams `.dumpHot` green is
  still a literal (a distinct dump-zone-arming affordance), and
  `--shadow-popover` was minted by the palette sweep, with the `0.12` and `0.08`
  variants named beside it rather than folded in.

- **An orange that can carry white ink.** The filled caution tone puts white at
  **3.08:1**, under the 4.5 floor for a label, and nobody chose that — it fell out
  of the assumption that a filled tone carries white. strands' ready-to-use Hint
  is the one button wearing it. The fix we want is a *deeper orange* that clears
  the floor while still reading as orange rather than as destructive's maroon —
  not dark ink on the current one, which would also flip the hover-direction rule
  (a filled tone's hover must move the way its ink is safe: darker for white,
  lighter for dark). Try it during an eyeball pass, with
  `--button-caution-secondary-color` as the fallback if no orange works.
- **The five terminal frames, seen at 4px around a real board.** They were picked
  as one family — same lightness, same chroma, four hues plus an achromatic
  neutral — and the won/lost pair was taken deliberately greener and redder than
  the near-grays they replaced. What is open is not a number but a look: does the
  raised chroma read as a *band* at 4px, or as the outcome at strength? Two of the
  five (near, warning) have no consumer at all, so they are judged on the palette
  page rather than in a game.
- **Should the `--secondary-*` slot tokens be renamed `--tone-*`?** Raised during the button-taxonomy work (shipped 2026-08-18) and never settled. `.secondary` is a *treatment* and the slot holds a *tone*, so the current name describes the caller rather than the contents — and it now has a `--primary-*` twin with the same shape, which makes the asymmetry easier to see: `--button-slot-primary-color` reads as "the filled treatment's fill", which is what it is, while `--button-slot-secondary-color` reads as "the outline's ink" only because you know what `secondary` means. A rename touches `theme.css` + `ActionButton.module.css` + strands' `HintBar` and nothing else.

- **`dismiss` may want a shared component, not just a shared class.** The icon-only ✕ appears on toasts, pills, banners, floating panels and game cards with **five** implementations (`Toast .close`, `GenericFeedbackPill .close`, `historyViewer .bannerExit`, `FloatingPanel .closeButton`, `ClubGameCard .deleteButton`). They agree on being neutral and disagree on everything else — size, glyph, hover, whether there's a border. Now that the neutral `<button>` means none of them is undoing anything, the differences left are real and small enough to be worth a single component. Not urgent; noticed while sorting the fourteen kinds ([ui.md](ui.md#what-a-button-is-the-fourteen-kinds)).

- **Eight controls override the disabled fade with their own number.** `--chrome-disabled-opacity` moved 0.5 → 0.75 on 2026-08-18 (the reasoning is at the token: the missing hover and the tooltip carry "disabled", so the fade only has to make the dead one findable in a row — fading harder cost reading the label). Eight components predate that and still hard-code their own, every one of them someone finding 0.5 too harsh and picking a number in isolation — which is the problem the global just solved centrally:

  | value | rule | file |
  |---|---|---|
  | `0.45` | `.shuffle:disabled` | `common/components/buttons/ShuffleButton.module.css` |
  | `0.5` | `.button:disabled` | `common/components/club/StartGameButtons.module.css` |
  | `0.5` | `.timerInput:disabled` | `common/components/setup/SetupTimerSection.module.css` |
  | `0.5` | `.btn:disabled` | `crosswords/components/Controls.module.css` |
  | `0.55` | `.select:disabled` | `common/components/fields/SelectField.module.css` |
  | `0.6` | `.button:disabled` | `common/components/definitions/AnagramDialog.module.css` |
  | `0.6` | `.saveButton:disabled, .deleteButton:disabled` | `common/components/definitions/WordEditDialog.module.css` |
  | `0.6` | `.key:disabled` | `common/components/game/entry/GuessKeyboard.module.css` |

  Collapsing all eight onto the token makes eight controls visibly lighter, so it is a **look change, not a cleanup** — worth doing deliberately and eyeballing, not folding into an unrelated commit.

  **The GAME PIECES in the same scan are not part of this** and must not be swept up: `PlayArea .tile`, `setgame .card` and `strands .tile` at `opacity: 1`, and `stackdown .tile` at `0.92`, are the *chrome fades, game pieces don't* rule ([tile-feedback.md](../plans/tile-feedback.md)) — a decided tile's color IS its message and has to show at full strength. Those overrides are the rule working, not drift.

  Four comments also still quote the retired `button:disabled { opacity: 0.5 }` when explaining why they override it — `common/components/game/PlayArea.module.css:874`, `setgame/components/Card.module.css:48`, `stackdown/components/WordEntry.module.css:58`, `strands/components/Board.module.css:184`. Those are wrong today whatever is decided about the values, since the number they cite no longer exists.

- **The trie's growth path is correct and untested, and it is the one place in that file that could corrupt rather than misanswer.** `buildTrie` ([`common/lib/game/trie.ts`](../src/shared/dict-trie/trie.ts)) starts at `1 << 16` nodes and doubles on demand: `nx = n++; if (n > cap) grow()`, where `grow()` allocates two fresh typed arrays, copies, and reassigns — after which the write uses the reassigned array. Three things have to stay in that order, and it is one comparison from writing past the end. **Nothing exercises it.** Every trie built in a test is small: `trie.test.ts` uses a handful of words and boggle's C-oracle parity suite uses a 2,000-word fixture (~53k nodes, measured). The tries that actually cross 65,536 nodes are built at the **scrabble edge function's cold start** from a bundled word list — production only, reached by no unit test. **It works**, verified by execution 2026-09-04 and not by reading: a probe of 17,576 six-letter words (**71,006 nodes**, several doublings) returned correct lookups, terminals and misses; the probe was run and removed. So this is a coverage gap, not a doubt — but the failure mode if that ordering is ever disturbed is a **corrupted dictionary at cold start with no exception**: words that quietly stop being words for one deploy's worth of games. **Filed rather than tested** (Joel, 2026-09-04, `game-lib` group F, `F-game-lib-46`): the case is eight lines and runs in about half a second, but it would be the slowest in that file by a wide margin — every other case builds three words — and the unit suite is deliberately instant. The recipe if it is ever wanted: build every three-letter combination doubled (`abcabc` … `zzzzzz`), assert `nNodes > 65536` plus a hit, a miss, and a prefix-that-is-not-a-word.

## Terminal results (whole-app)

The shipped treatment is [`ui.md → Terminal results`](ui.md#terminal-results--the-moment-vs-the-record); these are the pieces of it deliberately left undone.

- **A dramatic LOSS dialog.** `useCelebration` is tone-agnostic ("pop X on the flip"), so the same primitive could carry an inverted moment: dark backdrop instead of confetti, the culprit as the centerpiece, a low sting instead of the tada jingle. The heuristic that decides who gets one: **only when the game authors a dramatic *event*.** codenamesduet's assassin is *the* case — there's a culprit, a moment, a story. Attrition losses (waffle running out of swaps, wordle out of guesses) have none, and stay in the red pill. Not built for any game today; losses are uniformly quiet.
- ~~**Hide-the-solution-on-loss beyond waffle + wordle.**~~ **Done 2026-08-03** — stackdown, psychicnum, and codenamesduet now gate their reveal, each offering it as a terminal button *and* a menu item; crosswords already did. Shipped with the eye pair (amber bare-eye `SpoilerButton` for one item mid-game, red boxed-eye `RevealButton` for the whole solution at game-over), originally on a shared `solution_revealed` flag. **Superseded 2026-08-15**: the reveal became local, reversible and universal — every game with an answer gates it, including connections and wordiply, and the flag + RPC are gone ([common.md → Revealing the solution](common.md#revealing-the-solution), [ui.md → Terminal results](ui.md#terminal-results--the-moment-vs-the-record)). Still NOT extended to the word-list games (spellingbee / boggle / wordwheel — their found/missed filter already is the control) or bananagrams / scrabble (no answer to hide).
- ~~**Crosswords replay.**~~ **Decided 2026-07-31: won't do — reversed 2026-08-03, and shipped.** The argument against was that a crossword can't surprise you twice once the answers have been read. What that missed is that crosswords already *had* the feature under another name: **Clear board** wiped the fill and kept the grid, i.e. a restart with a different label and one missing power (it couldn't un-terminal a finished puzzle). So the choice wasn't "add a replay" but "keep two names for one act" — see [ui.md → Restart](ui.md#terminal-results--the-moment-vs-the-record). codenamesduet and bananagrams got one the same day, for the reasons recorded there.
- ~~**Keeping a prior attempt's turn log across a replay.**~~ **Decided (2026-08-02): won't do.** `common.reset_game` wipes the log and will keep wiping it. Preserving it means an attempt/generation column on every game's log table plus `reset_game` changes — `common` and all sixteen games — to serve a comparison nobody has asked for. A replay is a fresh attempt, not a diffable branch.

## Two band-2 words have no hint

`common.words` promises a hint for every 5-letter word at difficulty 1 or 2 —
2496 of 2496 at band 1, and **1665 of 1667 at band 2**. The two exceptions are a
data gap, and the one place it bites is stackdown, whose hint rung reads
`common.words.hint` for the next word the player still has to clear.

**Nothing is broken today**: no board in the shipped library uses either word
(`select count(*) from stackdown.boards b where exists (select 1 from
unnest(b.words) w join common.words cw on cw.word = w where cw.hint is null)`
returns 0). The exposure is that stackdown's boards are generated from the same
dictionary, so the next batch could pick one up — and after the envelope
conversion that board's hint button answers a **fault**, deliberately: every
word a stackdown board can use is band 1 or 2 (the setup form offers only those
and the library holds only those), so a missing hint means the dictionary is
wrong rather than the game being unusual.

Find them with `select word from common.words where len = 5 and difficulty <= 2
and hint is null`. Fixing is a `common.words` edit — a hint for each, or a band
bump if they don't belong at 2 — not a stackdown one, which is why it sits here
rather than in that game's register.

## Wordlist markers (spellingbee + boggle)

The shared `WordList` (used by both spellingbee and boggle) now leads each row with a **circle marker** carrying finder attribution — a filled ● in the finder's color for found words, a hollow ○ in light gray for post-terminal misses — with the word text itself plain black. Rationale worth keeping: a solid disc is a far better color carrier than thin colored text (bigger area, no legibility/antialiasing fight), which **decouples identity from legibility** and relaxes the member palette — colors no longer have to survive as thin text, only as a ~12px disc. The deferred ideas that fall out of having a marker vocabulary:

- **◐ (U+25D0) "multiple players found this word," in the first-finder's color.** A visual "others got this too" cue. Honesty constraint: compete finds are private mid-game (RLS gates `found_words` to your own rows until terminal), so ◐ can only truthfully appear **post-terminal in compete**, though it could be **live in coop**. Not built — just the marker reserved.
- **⦻ (U+29BB) "scored zero because multiple players found it."** Reserved, but it only ever ships with the dupes-cancel scoring mode it labels — which is now a [far-future](#far-future) question, not a queued one.
- ~~**Filter dropdown on the WordList.**~~ **Done 2026-08-04** — shipped as **two** selects rather than one, because the axes are independent: **KIND** (Legal / Required / Bonus) and **WHO** (All / Found / Missed / each player by handle). A single flat list couldn't express "leah's bonus words", and picking `Bonus` would have silently discarded a `leah` selection. `Missed` stayed *inside* the WHO enumeration rather than splitting into a third select — a missed word has no finder, so `Missed × leah` is a contradiction. The honesty constraint held as predicted but landed as *option derivation* instead of wording: an option that would be dishonest simply isn't offered (per-player only in coop or compete-post-terminal; Found/Missed only once a missed row exists), so unlike the turn log's picker there's no "hidden until the game ends" empty line to write. Shipped alongside it: the terminal reveal now covers **both** shipped lists, so missed **bonus** words show too (the interesting-vocabulary payoff), and found rows carry `finderIds` so filtering to yourself can't hide a word someone else found a second earlier. See [playarea.md → Word list](playarea.md#word-list). The per-player options are NOT yet self-labeled with their color dot — a `<select>` can't hold one; that would need a custom listbox, and it isn't worth one here.

## Feedback channels (local vs group)

The channel-qualified feedback split shipped — **local** feedback is `useLocalFeedback` (a near-input `<GenericFeedbackPill>`, validity tones, never a player color) and **group/peer** feedback is `useGlobalFeedback` → the header `<PageHeaderStatusSlot>` (the actor's color disc), two separate channels so neither clobbers the other. The naming convention (`Global`/`Local`/`Generic`, never bare "feedback") lives in [code-conventions.md](code-conventions.md).

- **The two channels are the same machinery, written twice, and only one of them is a hook** (found 2026-08-28 while building the envelope pill mapping; not blocking that sprint or the CSS one). `useLocalFeedback` holds the state, the fault branch and the auto-clear timer; the **global** side is four `useState` / `useCallback` / `useMemo` blocks inline in `GamePage.tsx:198-298` doing the same three jobs. The hook's own docstring says they differ only in *where the host renders it*. Concretely:
  - **The fault branch exists twice, verbatim** — `if (msg.fault) { showFaultModal(…); return }` at `useLocalFeedback.ts:78` and `GamePage.tsx:286`, with near-identical comments. It is a rule about faults, not about a channel: a fault never enters *a* slot.
  - **The `timed` auto-clear exists twice**, with different mechanics (a re-armable ref timer vs an effect keyed on the message). The two *durations* are deliberately per-channel (own-move 1400ms vs peer-news 3000ms); the mechanism is not.
  - **`mode: 'permanent'` does not enforce itself.** `clearLocalFeedback` checks the hook's `locked` option, never `msg.mode.kind` — so a `permanent` message shown through a host that didn't pass `locked` is clearable by the next keystroke, which is the exact bug `permanent` was introduced to make inexpressible. Two mechanisms for one idea, and the message-level one is the one that *looks* authoritative.
  - **`locked` may be buying nothing today.** No caller shows a permanent pill *through* the hook — all thirteen games derive it at render (`over ? terminalPill(…) : … : localFeedback`, wordle:513 is the model), so it outranks `localFeedback` in a ternary and never enters hook state. At terminal, the message `locked` protects isn't the one being rendered. 10 of 13 games pass it anyway, and `useDismissLocalFeedbackOnKey`'s docstring is built on it being load-bearing.
  - **`useGlobalFeedback` is not the twin of `useLocalFeedback`** — it is a peer-event-stream narrator (a seen-set bootstrap that fires a pill per new item) which *feeds* the global sink. The filenames promise a symmetry that isn't there.
  - **`docs/code-conventions.md:738` cites `GENERIC_FEEDBACK_DISMISS_MS`, which does not exist.** The two real constants are `LOCAL_FEEDBACK_DISMISS_MS` (exported) and `PEER_PILL_MS` (private to `GamePage`, and not channel-qualified, so it breaks the rule the doc is stating).

  Doing it means deciding what is genuinely per-channel (the durations, `locked`, where it renders) and what is one mechanism with two copies, then giving the global side the same treatment the local side got. Fix the doc's stale constant name at the same time.

## Mobile

Carried over from the 2026-07-10 mobile-FE review (that review doc has since been retired; its live items are these). The design + what shipped are documented in [`mobile.md`](mobile.md); these are the pieces deliberately left, plus two on-device checks still owed.

- **InfoSheet: full dialog behavior (focus management + tap-outside).** The mobile info-sheet already has the *cheap* half of dialog semantics — the open sheet is a `role="dialog"` + `aria-modal` that **Escape** dismisses, and the closed sheet is `visibility: hidden` so a keyboard user can't Tab into the off-canvas column. **Still deferred:** move focus *into* the sheet when it opens and restore it to the trigger on close, trap Tab within the sheet while open, and dismiss by tapping the backdrop outside it. These are a deliberate cut for a friends-only, touch-first alpha — on a phone you tap the ✕; the only place the rest matters is the supported keyboard-tablet class. Fix direction: a focus ref moved on open/close + an `inert` (or a focus-trap) on the rest of the page while open, and a backdrop element that closes on tap. Lives in [`InfoSheet.tsx`](../src/common/info-sheet/InfoSheet.tsx).
- **`--phone-l`'s landscape arm catches short *desktop* windows.** `--phone-l` is `(orientation: landscape) and (max-height: 27.5rem)` with **no pointer condition**, and it's OR'd into `--phone`. So a desktop browser window dragged shorter than ~440px (docked half-screen) gets the phone treatment: page padding collapses to `0.25rem`, and — the odd part — every `FloatingPanel` becomes a full-screen sheet via the `!important` geometry override *while staying draggable/resizable in JS* (the drag-disable keys off `--touch`/`pointer: coarse`, which a desktop mouse doesn't match). Dragging then updates react-rnd's inline transform that the CSS immediately overrides — nothing moves, cursors lie. It's a CSS/JS disagreement about "what a phone is": the CSS sheet keys off `--phone` (shape) while the drag-disable keys off `--touch` (pointer). Harmless in practice — **no real device matches phone-l-without-touch; only weird desktop windows do** — which is why it's recorded rather than fixed. Cheapest fix if it ever annoys: add `(pointer: coarse)` to the `--phone-l` arm in **both** [`breakpoints.css`](../src/common/mobile/breakpoints.css) **and** [`usePhone.ts`](../src/common/mobile/usePhone.ts) (the hand-synced pair), accepting that this makes `--phone` no longer purely shape-based.
- **Ungated `:hover` on tappable board elements, in three games.** A touchscreen keeps `:hover` on the last-tapped element until you tap somewhere else, so a hover-only style sits there after every move looking like state. strands' tiles had this (a dimmed letter after each submission) and were fixed during its on-device pass by wrapping the rule in `@media (hover: hover)` — the same gate, for the same reason, as the tooltip bubble ([`ui.md`](ui.md) → Tooltips). The same ungated pattern is in [`stackdown/Board.module.css`](../src/stackdown/components/Board.module.css), [`spellingbee/Letters.module.css`](../src/spellingbee/components/Letters.module.css) and [`wordwheel/Wheel.module.css`](../src/wordwheel/components/Wheel.module.css); not touched, because that pass was scoped to strands. Cheap when someone's in there: wrap each rule in the gate and re-check on a phone.
- **The game shell is 1px taller than the viewport on desktop.** Every game page reports `scrollHeight` 901 against a 900px viewport — a scrollbar sliver, and the never-scroll invariant is meant to be absolute. Not a game's doing: the club page is clean, and wordle / waffle / boggle / strands are all identically 1px over. The arithmetic is `--game-chrome-height: 5rem` (80px) against the real chrome, which measures 65px of header + gap plus the 16px of `body` vertical padding = 81px. Left alone because `--game-chrome-height` feeds **every** game's board-sizing formula, so correcting it resizes all sixteen boards and wants its own pass with screenshots rather than a drive-by. Fix direction: either make the constant honest and re-check each game's below-board reserve, or have the shell measure its own chrome.
- **Two shipped mobile changes still owe an on-device check** (code-complete; only the real-device verification is outstanding, and neither is reproducible in headless Playwright):
  - **`viewport-fit=cover` safe-area regression sweep.** [`index.html`](../index.html) now sets `viewport-fit=cover` so `env(safe-area-inset-*)` resolves non-zero (FloatingPanel's phone-sheet notch insets were previously inert). With `cover` the browser stops letterboxing, so **every** full-bleed surface owns its own safe-area padding — verify on a notched phone that the game header, club page, toasts, and celebration dialog don't slip under the notch or the home indicator.
  - **`touch-action: manipulation` zoom suppression.** Added to every tap-heavy surface (shared `.tile`, keyboard keys, stackdown tiles, boggle path-tracing, spellingbee hive) to defeat iOS double-tap-to-zoom + the ~300ms tap delay. Confirm on a real iOS device that rapid taps no longer zoom — Playwright's touch synthesis can't reproduce Safari's gesture heuristics.

## Printing to PDF — which games get it

The per-game table (all sixteen, ✅/❌) now leads [`pdf.md`](pdf.md#which-games-print) —
that's the one place to check or update. What's a *decision* rather than a status:

**Nothing outstanding — all sixteen games print.**
 waffle and wordle were a
permanent exclusion until 2026-08-02; the 4-state tile encoding
([`pdf.md`](pdf.md#backgrounds-are-white)) removed what actually blocked them, which
was their green/yellow/gray feedback flattening to one gray in mono.

## To discuss

- **A disconnected player is the one person who is not told** (raised
  2026-08-31, wanted). Pause is derived locally from `presentUserIds`, which is
  only ever updated by the server-pushed `presence: sync` event — so when YOUR
  wifi drops, your socket dies, no events arrive, your set stays frozen with
  everyone still in it, and `computePause` says false. Your peers all see the
  pause overlay naming you; you see a normal board that has silently stopped
  receiving anything. Nothing reacts to `CLOSED` / `CHANNEL_ERROR` /
  `TIMED_OUT` either — `useCommonGame`'s `subscribe` callback handles only
  `SUBSCRIBED`.

  **`tick_timer` is the heartbeat we already have and don't use.** It is the
  app's only per-second round trip, so N consecutive failures is a cheap and
  accurate "I cannot reach the server" — enough to show the disconnected player
  the same overlay their peers are seeing, once, in the right words. Today its
  `.then` swallows every failure, and the only automatic signal a dropped player
  got was the fault modals its failures raised — the wrong instrument in every
  respect: wrong words, blocks the page, repeats every second. Those are gone:
  `useGameTimer` passes `presentFaults: false` and stays silent for the four
  `FE` codes, so a dropped player now gets nothing at all.

  Silencing them left A GAP rather than removing pure noise, which is why this
  is filed rather than forgotten — the fix is to use the tick as the heartbeat
  it already is.
- **Does a fault still want a modal AND a pill?** (raised 2026-08-31, unresolved.)
  The rule today is that the modal is an ESCALATION, not a replacement — a fault
  gets both, and `genericPills.ts` says so deliberately, because filtering it out
  would leave the board showing a stale answer after the modal is dismissed.
  That rule was written when the two could *disagree*: the modal said "You appear
  to be offline" while the pill said `TypeError: Failed to fetch`, because two
  layers worded the same failure. They now share one author and say the same
  sentence — so the argument for showing both is weaker than it was, and the
  question is whether one sentence twice is worth a blocking box plus a pill.
  Not a bug; a ruling nobody has made since the premise changed.
- **`docs/nomenclature.md` — a dictionary of what each word means and, more
  importantly, what it doesn't** (Joel's idea, 2026-08-28). One file to check
  when we agree something like *"'environmental' means fetch-failed"* — a
  decision that today is spread across `envelopes.md`, two code comments and a
  conversation. **Exactly one thing: a table.** Not advice, not explanations.
  - **`naming.md` splits.** It is ~343 lines of two documents: a dictionary
    (Terminology lexicon 15–184, tuned/justified/locked 210–231, Cross-game
    canonical names 298–322, Watch list of generic words 323–340) and ~95 lines
    of "how to pick a good name" (The big idea, Numbers or names?, the seven
    Naming principles). The advice stays and reads better without the glossary
    on top of it; the dictionary moves and `naming.md` points at it.
  - **A short entry is a FORCING FUNCTION, not a compromise.** If a word needs a
    long explanation, that explanation belongs in the area doc and its absence
    is a hole worth filing — `tuned` / `justified` / `locked` want a CSS doc, not
    a paragraph here. The entry is one line plus a pointer. Sampling suggests
    most terms already have a natural owner (`common.md` for the architecture
    nouns, `testing.md` for `persona`), so this is mostly *finding* homes, not
    writing them.
  - **The "never for" column is the point.** *"`help` = UI assistance — the rules
    dialog, an InfoCol explanation, a field's `entryHelp`; never a hint or a
    spoiler"* is what stops a collision. *"`outcome` = the verdict on a play, see
    outcomes.md"* prevents nothing on its own. Write the negative clause only
    where a collision has actually happened.
  - **Prefix the key where the bare word has a natural-language meaning** —
    `cssdesign-justified`, `game-peer`, `outcome-warning`. This is `naming.md`'s
    own rule ("qualify when the name will be read in isolation") applied to the
    one place that is *always* read in isolation, and it does much of the "never
    for" column's job for free. Two cautions: **reuse the bucket prefixes that
    already exist** (`outcomes-`, `mark-`, `chrome-`, `button-`, `pill-`,
    `toast-`, `view-`, `gamelist-`, `member-`, `page-`, `field-`,
    `flex-color-` — see [ui.md](ui.md)) rather than minting a parallel set, and
    **say when the prefix is the dictionary's alone** (`--outcomes-warning-*` is
    real CSS; the TypeScript says `tone: 'warning'`), or someone greps the
    qualified form, finds nothing, and calls the doc stale.
  - **It will go somewhat stale, and that is accepted** (Joel): a table with a
    "never for" column is cheap to check and obvious when wrong, which is not
    true of prose. Partial guard if it earns one: assert that identifiers
    matching a reserved word appear only in that word's allowed directories —
    that would have caught `askHelp` and `letterboxed/lib/help.ts`.
  - **Chores:** three inbound anchors point into the lexicon (`naming.md#member`,
    `#peer`, `#player`, plus `#watch-list-of-generic-words`) out of 44 references
    to the file; `CLAUDE.md`'s table needs a row and an edit to the `naming.md`
    row, which currently calls it the glossary.

  The `help` / `hint` item under **Common / architecture** above is the same
  problem, one instance: that one is a collision to fix, this is the mechanism
  that would have prevented it.

- ~~**Leaving "alpha": stop editing baseline migrations, start appending new ones.**~~
  **Done — the switch was made around 2026-08-13** (the first forward migrations
  are `20260813000001…3`, then `20260815000000_drop_solution_revealed` and
  `20260822000000_clubs_is_solo`), and written into
  [`CLAUDE.md`](../CLAUDE.md) → "Production software" on 2026-08-29 after it
  turned out the file still described the old regime.

  What survived the switch, and was most of the sting: the **schema-vs-code
  split** (2026-08-03). `supabase/sql/<game>.sql` is re-applied in full every
  deploy and is edited in place *forever* — roughly two-thirds of each game's
  SQL by line count. Only **shape** accumulates. And the baselines are still not
  squashed (settled 2026-08-02): one file per game plus `common`, frozen, so
  each game's schema stays legible in one sitting.

## Tooling

- ~~**pgTAP coverage gaps around the replay RPCs**~~ **Closed 2026-08-03.** Mid-game restart is now asserted where it actually bites — scrabble's `version` bump, with a stale-move rejection proving an in-flight client is invalidated — and the coop `target_rank` carry (plus an explicit `null`) is pinned in both spellingbee and wordwheel. The three games that gained a replay the same day arrived with their own `replay_test.sql`.

## Far future

Items where the question itself is still up for grabs, not just the implementation.

- **Boggle compete "dupes-cancel" scoring.** The *authentic* paper Boggle rule: a word found by more than one player scores zero for everyone. Boggle deliberately does the opposite today — the `boggle.found_words` PK is `(game_id, user_id, word)`, dedup is per-player, so two players who independently find the same word both keep it. **Far future because the question is whether we want the rule at all** (2026-08-03), not how to build it; the build is a scoring change in `submit_word` / `_finish` plus a setup flag, and it's what would license the **⦻ marker** in the shared `WordList` ([Wordlist markers](#wordlist-markers-spellingbee--boggle)). If it's ever picked up, the thing to decide first is the honesty problem: compete finds are private mid-game (RLS scopes `found_words` to you until terminal), so a word can't show as canceled while you play — you'd see it accepted and watch it zero out at scoring. Either that reveal *is* the fun, or the mode should hide the running score.
- **Per-club / per-user stats schema.** Solo clubs are the planned anchor for per-user stats; the schema isn't built and there's no UI surface. Far future for the same reason as leaderboards below: nobody has asked, so the shape (which stats, per-club vs global, live-aggregated vs written on `end_game`) would be invented rather than derived from a want. Full entry in [`common.md → Deferred / open`](common.md#deferred--open).
- **Cross-game leaderboards / achievements.** When we want them, they live in `common` and each game writes to them via a common RPC. The roster is now deep enough that "compare across games" is meaningful — so the blocker isn't the game count any more, it's that nobody's asked for it. Still far-future: the RPC *shape* stays TBD until there's a concrete want (which stat, per-club vs global, achievements vs raw scores).
- **Production data preservation.** Currently we wipe and rebuild freely; production-grade data migrations aren't a concern until the project has live users worth preserving. When that changes, revisit the "alpha software, friends understand" prior in `CLAUDE.md`.
