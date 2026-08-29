# The envelope rollout

**Short-lived.** This is the ordering for the prep that has to happen before the
remaining roster entries in [error-system.md](error-system.md) get converted —
the docs, the comments, the shared machinery, the retro-fixes. It ships nothing
a player sees. **Delete this file when step 5 is done**; nothing in it is
durable, because everything durable lands in `docs/envelopes.md`,
`docs/outcomes.md`, or the roster.

Why it exists at all: the roster has **101 entries left** and **40 already
done**. Every hour here is an hour spent not doing the remaining 101 the wrong
way, and not doing the finished 40 twice.

---

## Decisions already made (do not re-litigate)

- ~~**The severity rename is not a step.**~~ **Overtaken by step 3a** — the
  premise below ("a game not yet converted raises the old word") turned out to
  describe no raise in the repo, so the rename landed atomically after all. Kept
  because the reasoning about what the guard is for still stands.

  `validation` → `form-validation` and
  `error` → `service-error` was going to be one atomic commit. It isn't:
  `Severity` has exactly two consumers in TypeScript (`dbResult.ts:6` and the
  optional field at `dbResult.ts:142`), and nothing branches on it, so renaming
  the union's members breaks **zero** files. The 26 SQL raises and the 37 pgTAP
  files that assert a severity string are not compiled by anything. They convert
  **as each game comes up on the roster**, inside work already scheduled. A game
  not yet converted raises the old word, matches no arm, and wears the wrong
  look until its turn — a not-yet-fixed part not working, which is fine.
- **The guard takes no transition shim.** A `SEVERITIES` set holding both
  spellings would have accepted the old word forever and needed its own cleanup
  commit to close. It holds only the new four — and since 3a converted the
  raises in the same commit, it is green rather than red-as-a-to-do-list.
- ~~**`getNotOkFeedback` returns four fields**, not three.~~ **Overtaken by step
  3b** — it returns two (`tone`, `text`). `diagnostics` is built from transport
  facts an envelope doesn't carry, and `fault: true` would fire a second modal
  on top of the one `runRpc` already raised. What still holds is the reason
  `mode` and `dot` are excluded: they are the two the envelope cannot know —
  permanence belongs to the surface, `dot` is peer identity.
- **There is no `ok` equivalent, deliberately.** What a successful answer shows
  is game-specific and no rule has been found there. Recorded in
  `docs/envelopes.md` as a decision so nobody fills it by inventing one.

---

## Step 1 — reconcile the docs — **DONE 2026-08-28**

What landed, against the findings below:

- **`CLAUDE.md`** gained rows for `envelopes.md`, `outcomes.md` and this file,
  and its `error-system.md` row no longer calls that plan "the ONLY spec".
- **`docs/supabase.md` keeps none of the new mechanics** (Q1 → b). Its
  "Server errors" section is now headed by a marked block saying it describes
  the system being replaced, kept because it is how to read an unconverted RPC,
  and **deleted when the roster empties** (Q2 → a). Its RPC-conventions bullet
  now says a new raise uses `PA###`/`PN###`; the old edge-function `{ error,
  code }` body is no longer called an "envelope", since that word is taken.
- **`error-system.md` §3 shrank 634 → ~100 lines.** What moved into
  `docs/envelopes.md`: the SQLSTATE scheme in full (the allocator, the guard's
  four assertions, bare-literal errcodes), the three-populations table and the
  **raw fault vs declared fault** nomenclature, central fault presentation
  (`dbFetch` vs `runRpc`/`runEdgeFn`/`readRows`, and the `PA`/`PN`-beside-a-4xx
  diagnostic), the environmental-sentence rule, and the `[db]` line with its
  level table. What §3 keeps: why the conversion is affordable (the raise
  census, the savepoint measurement, the CHECK-constraint analysis), the
  discriminator-vs-verdict conversion rule, the multi-row-RPC split, and what
  `ERROR_COPY` shrinks to. The "no `copy` for message text" rule went to
  `docs/naming.md`'s watch list, where §3 itself said it belonged.
- **`docs/ui.md`** — three corrections, no restructuring: the `FeedbackTone`
  block declared a vocabulary (`success`, `info`) that no longer exists and is
  now `Outcome` pointing at `outcomes.md`; the fault modal's message
  and diagnostics no longer claim to come from `ERROR_COPY` and `faultBits`; the
  `outcomes-*` bucket row points at `outcomes.md` instead of listing meanings.

**Not done, deliberately:** ui.md wants a thorough sweep at the end of this
sprint and the CSS one. Only clearly-wrong statements were fixed.

### The original findings

Cheapest thing on the list, and its output is a decision list rather than a
diff. Three findings are already in hand:

1. **`docs/supabase.md` contradicts the new docs — it does not merely repeat
   them.** Line 456 describes `ERROR_COPY`'s membership as the live mechanism;
   line 506 says *"The envelope is `{ error: '<fe-error-key>', code?:
   '<SQLSTATE>' }`"*. Same word, different shape, stated as current. A reader
   landing there first learns the old system. **The open question is not
   "point at envelopes.md" but how much error content supabase.md keeps at
   all** — it is the RPC-conventions doc, so it plausibly keeps the raise
   mechanics (the `using` clauses, the per-RPC handler shape) and points for
   the rest, or keeps none. Either is defensible; two stale paragraphs is the
   only bad answer.
2. **`error-system.md` §3 "The shape" is 634 lines** (55–689) and is now the
   second-best copy of `envelopes.md`. The usual rule — a running sprint's plan
   outranks the docs — is inverted here, because the sharper version was written
   into `docs/`. §3 shrinks to a pointer; the plan keeps §4 (still open), §6
   (process) and §7 (the roster), which a reference doc should not hold.
3. **`docs/ui.md` is mostly not duplication.** Its 28 hits are nearly all
   `--outcomes-*` tokens, the seven CSS variants and the pill's border rule —
   ui.md's own job, and it keeps them. The single overlap is the seven-word list
   with meanings at line 475. One line to reconcile, not a section.

Also in step 1:

4. **`CLAUDE.md`'s doc table gains two rows.** Neither `envelopes.md` nor
   `outcomes.md` is listed, so the map every session reads first does not know
   they exist. That row is most of why step 1 holds at all.
5. **Read the long comments** (see step 2). Reading them is part of this step,
   because anything in them that is not in the docs is either a fact the docs
   still owe or a disagreement — the same product step 1 exists to produce.

---

## Step 2 — shrink the over-explaining comments — **DONE 2026-08-28**

The sweep ran after steps 3 and 4 rather than during them, because those steps
*grew* these files: step 1 moved a pile of reasoning into `docs/envelopes.md`,
and the code comments saying the same things were still sitting there.

| file | before the sprint | after 3 + 4 | now |
|---|---|---|---|
| `dbResult.ts` | 537 / 311 | 621 / 368 | **589 / 338** |
| `supabase/envelope.ts` | 102 / 73 | 132 / 103 | **110 / 81** |
| `_shared/envelope.ts` | 131 / 63 | 136 / 67 | **129 / 60** |
| `errorCopy.ts` | 233 / 165 | — | 226 / 160 |
| `outcomes.ts` | 52 / 40 | — | 45 / 35 |

Both files that grew are back below where they started, while holding more
machinery than they did. What went, in every case, is a paragraph the doc now
says better: the escalation rule, the environmental sentences' "name no action"
argument, `readRows`' zero-rows reasoning, `runEdgeFn`'s "the status says
whether it RAN", the `field` docstring's four paragraphs about `'_'`, and the
Severity union's argument for the compound names — that last one **moved** into
[envelopes.md](../docs/envelopes.md) → Severity rather than being deleted,
because it is a naming decision and nothing else owned it.

`errorCopy.ts` and `outcomes.ts` needed nothing beyond what steps 3 and 4
already did to them; `errorCopy.ts` is deleted wholesale at the end anyway.

### The rule, for the rest of the sprint

The rule: where a comment explains **what an envelope or an outcome is**, it
becomes a short reminder on the line and the reader goes to the doc. Where it
explains **what this code does**, it stays — that is the repo's standing
convention and this does not weaken it.

```ts
/* multiple paragraphs about what `field` means */   →   field: string | null   // which input; '_' = not one field
```

Current weight:

| file | lines | comment lines |
|---|---|---|
| `src/common/lib/supabase/dbResult.ts` | 537 | 311 |
| `src/common/lib/game/errorCopy.ts` | 233 | 165 |
| `supabase/functions/_shared/envelope.ts` | 131 | 63 |
| `src/common/lib/supabase/envelope.ts` | 102 | 73 |
| `src/common/lib/outcomes.ts` | 52 | 40 |

**The reading happens in step 1; the editing happens in steps 3 and 4**, as each
file is touched. Shrinking before step 3 means editing files step 3 rewrites,
and writing fresh long comments in step 3 that then need shrinking. A short
sweep at the end covers the files steps 3 and 4 never opened.

**What the step-1 reading found**, beyond length — four defects:

1. ~~**`dbResult.ts`: an orphaned docstring.**~~ **Fixed.** It described
   `callLabel` but sat immediately above `runEdgeFn`, which had its own
   docstring right after it; `callLabel` was 55 lines further down with none.
   Moved onto the function it describes.
2. **`errorCopy.ts` says `info` in five places** (lines 46, 159, 166, 203, 228)
   where the entries say `noted`. The outcome was renamed and the prose was not.
   Step 4 deletes this file's entries per key, which takes the comments with
   them — nothing to do beyond not being misled while reading it.
3. **`errorCopy.ts` has three orphaned comment blocks** left by deleted entries
   — lines 68-76 (the form raises), 154-161 (the dated archives), 184-193
   (wordiply's `custom_base`). Each explains keys that are gone. Same
   disposition as #2.
4. ~~**`dbResult.ts` has an empty section header**~~ ("The shapes") left behind
   when the types moved to `envelope.ts`. **Fixed** — deleted.

Nothing in the comments contradicted the docs on substance, which is the result
step 1 was looking for: the long comments and `docs/envelopes.md` agree, and the
comments are the more detailed of the two by a wide margin — which is exactly
the imbalance step 2 exists to correct.

---

## Step 3 — the shared machinery

**3a. The vocabulary commit — DONE 2026-08-28.** The `Severity` union's members,
the Deno helper names (`validation` → `formValidation`, `environmental` →
`serviceError`) and their 8 callers, `raiseCodes.test.ts`'s `SEVERITIES` set,
and `race` added everywhere.

**It included the SQL, against the decision above, because that decision rested
on a wrong premise.** All 26 raises spelling the old words sit in
**already-converted** RPCs — `common.sql`'s forms plus eleven games'
`create_game` — not in unconverted games, so "they convert as each game comes up
on the roster" described nobody, and the guard would have gone red on items no
scheduled work returns to. The measured cost was 26 SQL lines and 22 pgTAP
assertions, not the "37 pgTAP files" this plan estimated. Everything is green
(`tsc -b`, 2461 unit tests, `deno check` ×13, 2406 pgTAP).

Two things found while doing it, both fixed here:

- **The guard was blind to one Deno builder.** Its regex read `fault(` and
  `validation(` but never `environmental(`, so PN230, PN232 and PN240 were
  invisible to the uniqueness check and to the next-number line — 239 codes
  seen where there were 242. The builder list is now a `Record` the regex is
  built from, so adding a builder and forgetting the guard is one edit, not two.
  Both arms re-verified by planting (a bad hint, and a duplicated code).
- **`LogLevel` gained `RACE`**, at `console.warn` (Joel, 2026-08-28). The
  severity → level map is now a total `Record`, so a new severity is a compile
  error there. `warn` is deliberately not about how bad a race is — it is the
  one level chosen for how PUZZLING the thing is to a player: a move that simply
  didn't happen is rare and produces "what was that?", which should be one
  glance at the console rather than a dig through debug output.

Then a review round (Joel, 2026-08-28), which changed four more things:

- **The log levels are named for the severities they print beside.** `ERROR` →
  `SERVICE_ERROR`, `VALIDATION` → `FORM_VALIDATION`. A bare `ERROR` on a line
  reading `severity=service-error` reintroduced exactly the ambiguity the
  severity rename existed to remove. `SLOW` and `OK` stay as they are: they are
  `dbFetch` narrating transport, where no envelope reached a decision.
  **This changes what a `[db]` line prints.**
- **A map's name says what it maps.** `LEVEL_METHOD` → `LOGLEVEL_TO_CONSOLE_LOG_METHOD`,
  `NOT_OK_LEVEL` → `SEVERITY_TO_LOGLEVEL`. The house form is `FOO_TO_BAR`, and
  spell out what the values ARE — `_TO_METHOD` only parses for a reader who
  already knows they are `console`'s own method names.
- **No single-letter helpers.** `v` / `q` → `fieldValue` / `quotedText`, each
  with a docstring. The abbreviations hid the one interesting thing about each,
  which is what "empty" means.
- **"Environmental" now has a written definition**, in
  [envelopes.md](../docs/envelopes.md) → "Environmental" means the JS fetch
  failed. **An environmental problem is a failed JS fetch** (Joel's phrasing) —
  the promise rejected, no `Response` object exists — minus a fetch we canceled
  ourselves. `PGRST202` and a dead edge container are raw faults, because both
  answered; a working edge function reporting NYT down is a `service-error`.
  Three places said otherwise and are corrected. The word was drifting toward
  the third case, which is what the `environmental` → `serviceError` rename
  above had already half-fixed.

**3b. The additive machinery — DONE 2026-08-28.** Nothing needed a retro-fix to
land green.

- **`Outcome` and `GenericFeedbackTone` are one type, and `error` belongs to it**
  (Joel, 2026-08-28). The split was `Outcome = Exclude<GenericFeedbackTone,
  'error'>`, which made the appearance resolution below unbuildable: three of
  the four severities default to `error`, and the excluded value was the one
  they needed. `Outcome` is now the seven words, `GenericFeedbackTone` is gone,
  and the 14 usages renamed. What survives of the exclusion is narrower and
  checkable — **a successful result never reads as a failure** — so no `PA`
  raise may take `error`, pinned in `raiseCodes.test.ts` against the SQL that
  authors the value.
- **`notOkOutcome`** in `dbResult.ts` — the severity → default-appearance map,
  total by `Record<Severity, Outcome>`, plus the author's override.
- **`outcome` on the not-ok arm**, typed `Outcome | null`, meaning *the author
  overrode the default*; null means "use the default", not "no appearance".
- **`getNotOkFeedback`** in `src/common/lib/game/genericPills.ts` — generic, not
  `localPills.ts`, because a **local** pill is specifically the below-board one
  about this player and this mapping serves global pills too.
- **The vocabulary guard**: `raiseCodes.test.ts` now reads the TypeScript unions
  and asserts its own two sets equal them. Both arms verified by planting (a
  new outcome word; `error` removed from the union). This is the assertion the
  plan wanted — guard the vocabulary, don't just name it.

**`getNotOkFeedback` returns two fields, not the four decided above**, because
four could not be built. `diagnostics` is assembled from TRANSPORT facts (the
call, the status, the elapsed ms) that an envelope does not carry, so a function
taking only an envelope cannot produce it. And `fault: true` would be actively
wrong: `useLocalFeedback` routes any message carrying it to `showFaultModal`,
but by the time a call site reads the envelope, `runRpc` has already fired that
modal centrally **with** the diagnostics — so the flag would pop a second,
poorer modal. The pill instead carries the same sentence the modal leads with,
which is what `docs/envelopes.md` means by "the pill is what remains after it is
dismissed".

**One guard is deliberately deferred to step 4**: nothing should hand-write a
outcome beside a `runRpc` result. Nineteen sites still do, and step 4 converts
them, so the guard lands in the commit that turns it green rather than sitting
red in the suite meanwhile.

---

## Step 4 — retro-fix what is already converted

Two jobs with different costs; don't batch them together.

**Mechanical — DONE 2026-08-28.** The hand-written `tone: 'error'` call sites
were 14, not 19: one per game's in-game **New Game** button. Each is now
`showLocalFeedback({ ...getNotOkFeedback(res), mode: { kind: 'manual' } })`. The
other five `tone: 'error'` hits are not this pattern — three in `serverError.ts`
(deleted wholesale at the end), one toast on the club page, and bananagrams'
check-board line.

**It fixed a live bug**: every one of the 14 fired **two** fault modals. `runRpc`
/ `runEdgeFn` call `reportDbFault` (modal #1, with diagnostics), and then the
hand-written `fault: true` routed the message to `showFaultModal` through
`useLocalFeedback` (modal #2, same words, no diagnostics). `faultStore` has "no
batching, no dedupe", so both queued and the player dismissed one to find the
other.

**And it dropped a promotion, deliberately** (Joel, 2026-08-28). The old line
wore the fault look *whatever the server said*. The matrix behind that call:

| surface | what can actually arrive | after |
|---|---|---|
| the 8 `create_game` games | **`fault` only** — `common.create_game` raises PN059/PN060, both faults, and its three helpers raise nothing else | modal ×1, plus a pill |
| the 6 build-board games | `fault`, **or a `form-validation`** | fault: modal + pill · validation: pill only |

Most of those validations can't fire here (New Game reuses a setup that already
built a board, so anything deterministic about the values passes again). **Two
can**, because they are about a randomized generator giving up: waffle `PN121`
"No board could be built at that difficulty. Try another." and boggle `PN155`
"No board met those constraints — please relax them." Both now read as pills,
which is what their own raise-site comments asked for — waffle's says the
sentence belongs under a field "rather than raising a modal that offers nothing
to do", and the call site was overriding that.

The governing rule this settled is now in
[envelopes.md](../docs/envelopes.md) → What a caller does with one: **presenting
a fault is not a call site's job, and the modal is an escalation, not a
replacement.** `fault: true` on a feedback message becomes deletable once
`serverError.ts` goes — nothing else sets it, and the only non-routing read is
`useWordSubmit:237`, which clears a stale optimistic pill and needs to read the
envelope instead.

**Judgment, per site.** Which already-converted raises are actually races (the
19 `tone: 'noted'` `ERROR_COPY` entries are the candidates; `hint-in-compete` is
a fault). And `ERROR_COPY`'s deletion, per key, by the rule in error-system.md
§3: text → `message` verbatim, membership → severity, tone usually **disappears**
because severity carries a default appearance.

---

## Then

The roster — which is where we are now, and where the rules below were written.

### Step 5 — the call-site rules, and the retro-fix

The SQL half of a conversion had a written process from the start; the frontend
half did not, and stackdown's `submit_word` produced four wrong versions of one
branch in a row before the rules got said out loud. They now live in
[docs/envelopes.md → The shape of a call site](../docs/envelopes.md#the-shape-of-a-call-site)
and [→ Choosing which `ok` branch](../docs/envelopes.md#choosing-which-ok-branch),
and `error-system.md` §6 points at them from the per-game process. The list
below is the work they imply on everything already converted; the roster resumes
when it is empty.

In short: one branch per answer, every condition a positive assertion about the
case, a bare `else` that screams and is never contorted for, and never picking
an `ok` branch by asking whether there is a message or what the outcome is —
branch on `data` or `dbcode`, by equality against a specific value, and add to
`data` if it cannot tell the cases apart.

### The retro-fix list — every already-converted call site

**This runs BEFORE the rest of the roster** (Joel, 2026-08-29), and **not as one
commit**: each entry is looked at on its own. Every already-converted call site
was written before the rules existed, so each needs the same three things —

1. `res.type !== 'ok'` → `res.type === 'not-ok'`. Not cosmetic: a third `type`
   added to the envelope would reroute into the not-ok branch at **every** one
   of these on the same day, silently, with nothing failing to compile and no
   test going red.
2. The bare `else` that screams, worded
   `BUG: <rpc_name> fell through to unhandled`.
3. Each `ok` branch chosen by `data` or `dbcode` — never by `message`, never by
   `outcome`, and never by merely matching `ok`. Where `data` cannot tell the
   cases apart, the RPC's `data` gains something that can, which makes the entry
   a SQL edit too.
4. **That check is equality against a specific value** — never `=== null`,
   `!== null`, `?? …` or a truthiness test. Those name an absence, not a case,
   so a second wordless answer added later matches and is silently drawn as the
   first. → [envelopes.md → Choosing which `ok`
   branch](../docs/envelopes.md#choosing-which-ok-branch).
5. **Check that `if (!mounted) return` sits ABOVE the branch chain**, wherever
   the site has one. An `AbortError` from our own unmount gets no modal but
   still arrives as a `not-ok`, so a chain that asks `type` first renders a
   failure for its own cleanup. → [envelopes.md → The cancel guard comes
   FIRST](../docs/envelopes.md#the-cancel-guard-comes-first).
6. **Grep the RPC for `return common.ok_envelope()` with no arguments** while
   you are in its SQL. It is the tell that produced #4 — an `ok` that says
   nothing about which `ok` leaves the call site nothing to test but the
   absence. Give it a `data` that names the answer. → [envelopes.md → How SQL
   builds one](../docs/envelopes.md#how-sql-builds-one).

`create_game` has a shared consumer and sixteen private halves. Every game's
setup dialog starts through ONE branch — `SetupGameModal.tsx`, typed once as
`Envelope<{ id: string }>` at `games.ts:741` — while each game's SQL function,
its `manifest.ts` and its in-game New Game are its own. So the consumer converts
first and **every game's Start button breaks**, then each game's entry fixes its
own half and turns its Start back on. That breakage is the to-do list: it is
loud, it is per-game, and it disappears exactly when the work is done.

#### Common — 12 of 13 done

**Tick a box as its commit lands**, not at the end of a session: the list is
the only record of where the sweep is, and an untracked one costs a re-read of
the diff to find out (Joel, 2026-08-29).

- [x] `ClubPage.tsx` — `unset_current_view` (the presence heal, `void`) +
  `delete_game`, and five reads: `clubs`, `clubs_members`, `profiles`,
  `clubs_gametypes`, `games`. Both RPCs cost a SQL edit; the `failure` state
  was renamed `fault` along the way
- [x] `CreateClubModal.tsx` — `create_club`
- [x] `EditClubModal.tsx` — `set_club_gametypes`
- [x] `HomePage.tsx` — `clubs` read
- [x] `ChatBody.tsx` — `send_message`
- [x] `useClubChat.ts` — `messages` read
- [x] `ClaimHandleScreen.tsx` — `claim_username`
- [x] `EditProfileModal.tsx` — `update_profile_color`
- [x] `WordEditDialog.tsx` — `add_word` / `update_word` (one call, a ternary) +
  `delete_word`, and the `words` read
- [x] `AnagramDialog.tsx` — `anagrams`. The only payload RESHAPE so far: `data`
  was a bare array, which leaves a call site nothing to assert but its shape
- [x] `useSession.ts` — `profiles` read
- [x] `useProfile.ts` — `profiles` read. Had NO `!== 'ok'` and was still the
  worst-shaped site here: a failure and a zero-row merged into one branch, then
  re-split inside it
- [ ] `useCommonGame.ts` — `unset_current_view` (the last-viewer-leave, `void`).
  The same RPC ClubPage's heal calls, so it already has a payload to read

**What the ten cost, for estimating the rest.** They hold **11 RPCs and 5
queries**, and *every one of the 11 needed a SQL edit* — there was not one whose
`ok` a call site could already name. In three shapes: **8** returned a bare
`common.ok_envelope()`; **2** carried a value but no case name (`create_club`'s
handle, `claim_username`'s username); **1** was a bare array (`anagrams`). The
5 queries were one word each and needed nothing else.

The tests: **4 unit-test stubs across 3 files** were asserting the shape being
removed, and about ten pgTAP assertions moved with the payloads. Two pgTAP
successes — `add_word`, `delete_word` — turned out not to be asserted at all,
so what the frontend now branches on had nothing holding it; both are asserted
now, which is what tripped `plan(17)` → `plan(19)`.

`common.sql` now has **zero** bare `common.ok_envelope()` calls, leaving only
the four inside `connections.submit_guess` from the original census.

#### The six converted games

- [ ] connections — `BoardCol.submit_guess`, `SetupForm.next_puzzle_for_club` +
  `puzzle_for_date`, `PlayArea.next_puzzle_for_club`, and `useGame`'s three reads
- [ ] psychicnum — `BoardCol.submit_guess` and `useGame`'s three reads
- [ ] setgame — `PlayArea.submit_set` + `record_hint`, and `useGame`'s three reads
- [ ] stackdown — the three RPCs and three reads are **done**, and are the model
  the rules were written from; what is left is its `create_game` half
- [ ] waffle — `PlayArea.submit_swap` and `useGame`'s three reads
- [ ] wordle — `BoardCol.submit_guess` (**the one confirmed live bug**:
  `res.outcome ?? 'lost'`, `res.message ?? ''`, branch off `result` inside an
  already-`ok` block, no scream) and `useGame`'s three reads

#### `create_game` — the shared consumer, then a game at a time

- [ ] `SetupGameModal.tsx` + the `startGameInClub` contract in `games.ts` — the
  one branch all sixteen setup dialogs go through. It starts asserting the case
  name here, which breaks Start for every game until that game's own entry
  lands. Take it FIRST, so the rest is a shrinking list of red buttons.

Then, per game: its `create_game` SQL gains the case name, and its `manifest.ts`
+ `PlayArea.tsx` New Game branch on it. The six converted games take theirs
inside their entry above; these ten have nothing else converted yet, so
`create_game` is all they are here for.

- [ ] bananagrams
- [ ] boggle — via `boggle-build-board`
- [ ] codenamesduet
- [ ] crosswords — two paths, the edge function and the direct RPC
- [ ] letterboxed — via `letterboxed-build-board`
- [ ] scrabble
- [ ] spellingbee — via `spellingbee-build-board`
- [ ] strands
- [ ] wordiply — via `wordiply-build-board`
- [ ] wordwheel — via `wordwheel-build-board`
