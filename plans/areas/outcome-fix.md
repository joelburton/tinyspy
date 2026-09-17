# Area: outcome-fix

No folder: every game's move path. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order and the area's whole reading (§3, the
`outcome-fix` row), this file holds the audit. Owed work lives in each game's
`todo.md`, not here.

**Status: CLOSED 2026-09-17 — Joel: *"close outcome-fix"*. NOT BLESSED, and
deliberately so.** Every other area closes by its roster reading
`cs-blessed-<area>`; this one cannot, because Joel ruled the same day that its
files *"belong to other areas and should not have been stamped for it"*. So no
file was blessed, no stamp was written at the close, and **the 106 files
carrying `cs-fixed-outcome-fix` / `cs-met-outcome-fix` keep those stamps until
he says what becomes of them.** What closing means here is only this: every
finding is settled and nothing is waiting on a reading of this file.

All eleven games worked, the closing re-read DONE 2026-09-17, seventeen
findings from it (F-5 to F-21) recorded below, the doc half and then the code
half fixed the same day. The two decisions left this file for the games that
own them — F-13 is closed in place, filed to `src/strands/todo.md`, and F-14
was MOVED WHOLE to `src/stackdown/todo.md` (its number is not reused) — and
F-18 was ruled and fixed. **The five todos the area filed are open where owed
work lives, in the games' `todo.md`**: setgame's hint ring, psychicnum's
decided-tile fill, wordle's not-ok ring, connections' `matched`, game-page's
`verdictTone`. Opened 2026-09-16: the plan and the roster were agreed (Joel: *"yes,
go ahead. then begin."*) and the roster stamped `cs-met-outcome-fix` —
eighty-three files, all `cs-unmet` before: the six SQL files; per log game its
`GameTurnLog.tsx`, `PlayArea.tsx`, `BoardCol.tsx`, `hooks/useGame.ts`,
`pdf/model.ts` (scrabble prints from `PlayArea`), the `Board.tsx` where a verdict
mark keys on an outcome and the `pdf/print*Pdf.ts` that read one; stackdown's
`WordEntry.tsx`; the decision-site libs; codenamesduet's `hooks/useBoard.ts`;
the bee family's `lib/answer.ts` ×2 and the shared `useWordSubmit.ts`
(wordwheel's `lib/answer.ts` joins when it is written). **Created by the area,
so on the roster too:** `src/wordwheel/lib/answer.ts` and the four
`lib/answer.test.ts` — wordwheel's, and spellingbee's, boggle's and wordiply's
from F-17. Work starts with
stackdown, per step 3, reading its `todo.md` first. The rule is Joel's,
already written in [docs/outcomes.md → One event, one outcome](../../docs/outcomes.md):
the server's outcome, if provided, is always right; where the frontend decides,
it decides ONCE; and a game is audited by asking the same question of the
pill, the board and the log (and the PDF, the fourth reader). The proof planted
by `turn-log` F-17 — four games logging hints and reveals as `near` — is still in place and
is not fixed ahead of the read.

## The roster (agreed 2026-09-16)

**The decision sites today**, one per game, however wrong the placement:

- `codenamesduet/lib/turnOutcome.ts` — already one function
- `connections/lib/evaluate.ts` — right placement, narrowed type
  (`GuessOutcome`, `OUTCOME_FOR_RESULT`, `RESULT_FOR_OUTCOME`); `lib/history.ts`
  reads it
- `wordiply/lib/answer.ts` — the doc's worked example (`ANSWER_OUTCOME`)
- `strands/components/GameTurnLog.tsx` — `OUTCOME` table + `HINT_OUTCOME`
- `letterboxed/components/GameTurnLog.tsx` — `barFor`
- `scrabble/components/GameTurnLog.tsx` — `outcomeFor`
- `stackdown/components/GameTurnLog.tsx` — an inline `const outcome`
- `setgame`, `psychicnum`, `wordle`, `waffle` — inline in the log's JSX

**The row seam** the log reads — each game's `hooks/useGame.ts` (codenamesduet's
guess rows are in `hooks/useBoard.ts`); connections' already carries `outcome`.

**The four readers**, per log game (codenamesduet, connections, letterboxed,
psychicnum, scrabble, setgame, stackdown, strands, waffle, wordiply, wordle):

- the log — `components/GameTurnLog.tsx`
- the pill — the move's `show(...)` in `components/PlayArea.tsx` /
  `components/BoardCol.tsx` (every game holds the local slot in both)
- the board's verdict mark — `components/Board.tsx` / `BoardCol.tsx` where an
  outcome keys a class or tone (connections, psychicnum, stackdown, wordle,
  waffle, codenamesduet, scrabble)
- the PDF — `pdf/model.ts` (ten games; setgame's reads `kind`) and the
  `pdf/print<Game>Pdf.ts` that read a verdict (codenamesduet, connections,
  letterboxed, psychicnum, stackdown, waffle, wordle)

**The bee family** (spellingbee, boggle, wordwheel) — `lib/answer.ts` ×3 and
`shared/word-hunt/useWordSubmit.ts`, which already decides once through
`outcomeFor`. On the list so the three-questions audit is asked of them; expected
to pass quickly.

**The SQL**, one line each where a ruled word differs from what the RPC says
today: `supabase/sql/{psychicnum,wordle,stackdown,strands,scrabble,connections}.sql`
(see step 5). letterboxed's and setgame's RPCs stay as they are.

**Read as evidence, not roster:** `common/outcomes/` (closed),
`common/info-sheet/InfoActionsRow.tsx`'s `Exclude<Outcome, 'error'>`
(info-sheet's todo owns it), `docs/outcomes.md`, `docs/games/<game>.md`.

**Out:** bananagrams and crosswords — a pill but no log and no verdict mark, so
there is nothing to disagree.

## The investigation — 2026-09-16, before the roster was agreed

Joel: *"many games get the outcome from calling an RPC. investigate."* Four
read-only passes covered all fourteen games (the eleven with a log and the bee
family), each tracing the move RPC's envelope, the log row's columns, and the
four readers. What they established:

**1 · The server already decides, and says so in the envelope — and almost
nothing reads it.** `common.ok_envelope(data, outcome, message)` takes the word
as its second argument, and eight of the eleven log games' move RPCs pass one:

| game | RPC's ok arm says | read by the FE? |
|---|---|---|
| psychicnum | guess `won` / `neutral`; hint, reveal `warning`; PA002 dup `warning` | only the dup |
| wordle | accepted `won` / `lost`; dup `warning`; not-a-word `lost` | only the two rejects |
| stackdown | word `won` / `lost`; hint, reveal `warning` | the refusal, the hint and the reveal, yes |
| letterboxed | word `won`; undo, clear `neutral`; `log_help` says nothing | no — every pill is a literal |
| strands | theme, spangram, **hint_word `won`**; dup, too_short `warning`; invalid `lost`; spent hint `warning` | no — `resultFor` is a literal switch |
| setgame | claim `won`; hint says nothing | no |
| codenamesduet | guess agent `won` / bystander `lost` / terminal `won`·`lost` | no — the pill branches `return` nothing |
| scrabble | word `won` / invalid `lost`; exchange `won`; pass `neutral` | no — three literals |
| connections | **in `data.result`** (`won`/`near`/`lost`), `outcome` left null | branched on, then re-typed as three literals |
| waffle | nothing — a swap has no verdict | (nothing to read; the log's `neutral` is right) |
| wordiply · spellingbee · boggle · wordwheel | nothing — the FE decides (rule 2's case) | — |

No game has a `PA` raise except psychicnum (PA002). Every other refusal is a
`PN` with a severity, resolved by `notOkOutcome`, and those pills are already
one shared decision.

**2 · The row never stores the word.** Every log table carries the FACTS
(`is_correct`, `result`, `kind`, `valid`, `reason`) and the frontend maps them
to a word — per surface. That is the split: the pill sees the envelope, the
log sees the row, and a TEAMMATE's move arrives only as a row, with no envelope
at all. Two traps in the facts themselves: psychicnum writes its hint and reveal
rows with `is_correct = true`, so `kind` has to be read first; scrabble's
dictionary refusal is an `ok` with `outcome: 'lost'` that writes NO row, so the
log can never show it.

**3 · Where the words disagree today.** Beyond the four planted `near`s
(psychicnum hint + reveal, stackdown hint + spoiler, letterboxed hint + spoiler,
setgame hint — all `warning` on the server or by ruling), the reads found the
server and the frontend disagreeing on the word itself:

| game · event | server | pill | log | other |
|---|---|---|---|---|
| psychicnum · miss | `neutral` | `lost` (literal) | `lost` | peer `lost` |
| wordle · miss | `lost` | (none) | `neutral` | — |
| strands · hint_word | `won` | `won` (literal) | `near` (ruled right on 2026-09-16) | PDF `ok` |
| strands · dup, too_short | `warning` | `warning` | `lost` | PDF `no` |
| strands · spent hint | `warning` | (none) | `neutral` | — |
| scrabble · exchange | `won` | `won` (literal) | `neutral` | peer `neutral` |
| scrabble · forfeit | — | terminal | `lost` | peer `neutral` |
| letterboxed · hint, spoiler | (none) | `noted` | `near` | — |
| letterboxed · undo, clear | `neutral` | (none) | `neutral` | peer `noted` |
| codenamesduet · a guess | `won` / `lost` | (none) | a per-TURN fold, `near` for mixed | board: the G/N/A palette |
| bee family · accepted | (none) | `won` — a literal in the shared engine | — | each `lib/answer.ts` has an `accepted` entry nobody reads |

connections agrees everywhere — by three hand-typed literals happening to match
`OUTCOME_FOR_RESULT`. strands keys FOUR maps off one `result` column (the
pill's switch, the log's `OUTCOME`, the PDF's `MARK`, history's `BODY`).

**4 · The bee family passes on refusals and leaks on success.**
`useWordSubmit.ts` routes every refusal through the game's `outcomeFor`, but the
accepted word's `won` is a literal at its line 290, and `outcomeFor`'s parameter
type cannot be asked about `'accepted'`. wordwheel has no `lib/answer.ts` — its
map is an inline ternary in `PlayArea.tsx`. wordiply, the doc's worked example,
holds, with two `'won'` literals on the peer path that are right by construction.

**5 · A different vocabulary is not a disagreement.** wordle's and waffle's tile
colors (g/y/x), codenamesduet's key-card palette (G/N/A) and setgame's card
fills are the game's own feedback, deliberately outside `--outcomes-*`; they are
not readers of the outcome and stay as they are.

## The plan

The rule is already written (`docs/outcomes.md` → One event, one outcome). What
this area does is give it a mechanism, then make one decision per game about
the word, then fix each game against both. The order matters: the mechanism
first, because it decides what the per-game work looks like.

### Step 1 · The mechanism — where the one decision lives

**Ruled 2026-09-16 (Joel).** No new column: *"if there's a table for
translating the answer from the db, why would you also store that derivable
data in the db?"* The row keeps its facts; the word is derived from them.

So a game has exactly two sources for a word, and each surface reads one:

- **The envelope, for the pill.** Where the move goes through an RPC, the RPC
  keeps returning `message` + `outcome` exactly as it does today, and the pill
  reads `res.outcome` instead of a literal. Connections moves its word from
  `data.result` into the `outcome` field (a 1:1 translation the SQL already
  makes).
- **One map per game, for everything that reads rows** — the log bar, the
  tile mark, the PDF, a teammate's peer line, the history replay — and for
  every move the frontend refuses without an RPC. A `Record` in that game's
  `lib/answer.ts`, keyed by the game's own answer words, is the wordiply shape:

      export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
        accepted: 'won', too_short: 'lost', missing_base: 'lost',
        not_a_word: 'warning', already_found: 'warning',
      }

  For a row, the key is what the row's facts say (`kind` before `is_correct`
  in psychicnum; `result` in strands and connections; `kind` + `valid` in
  stackdown; `kind` in scrabble, setgame, letterboxed; `is_correct` in wordle).
  For a local refusal, the key is the engine's answer.

**The two sources are one rule in two languages**, and that is the thing the
area has to keep true: the SQL `case` that fills the envelope and the map that
reads the row must say the same word for the same facts. The safeguard is a
test per game that pins them together — the RPC's returned `outcome` for each
event kind (pgTAP already exercises every move RPC) and the map's word for the
row that RPC wrote, asserted against ONE fixture of expected words. A word
changed in one language fails the other's test.

### Step 2 · The words — one decision per game, Joel's

With the mechanism, every server-adjudicated event has exactly one word, and
where the server and the frontend disagree today someone has to pick. These are
not mine to settle; the table is the list of calls to make, with what each
surface says now:

| # | game · event | today | the question |
|---|---|---|---|
| a | psychicnum · a miss | server `neutral`, FE `lost` | is a wrong guess a loss or just news? (the doc records the server's `neutral` as deliberate) |
| b | wordle · a miss | server `lost`, log `neutral` | same question; the log's docstring argues `neutral` |
| c | strands · hint_word | server `won`, log `near` | Joel ruled `near` right on 2026-09-16 ("progress, not the goal") — then the SQL changes to say it |
| d | strands · dup, too_short | server `warning`, log `lost` | the log's "earned nothing" vs the server's "not a real attempt" |
| e | strands · spent hint | server `warning`, no pill, log `neutral` | the log's paragraph defends `neutral`; the server says `warning` |
| f | scrabble · exchange | server `won`, log `neutral` | is swapping tiles a success? |
| g | scrabble · forfeit | log `lost`, peer `neutral` | one word |
| h | letterboxed · hint, spoiler | pill `noted`, log `near`, ruling `warning` | `log_help` starts deciding; `noted` vs `warning` |
| i | letterboxed · undo, clear | server + log `neutral`, peer `noted` | one word |
| j | codenamesduet · the grain | server per guess, log per turn | the row carries the GUESS's word; the turn's bar is a fold over guess outcomes in `turnOutcome`, and its `mixed → near` is the one rule that is the turn's own — keep, or drop the fold? |
| k | hints, and reveals/spoilers, everywhere | `near` in four games | a hint is `warning` (ruled); a reveal or spoiler is red — `lost` |

**Rulings (Joel, 2026-09-16), all eleven:** (a) `lost` · (b) `neutral` — a
non-solving accepted guess; the SQL's `lost` changes · (c) `near` — the SQL
changes to say it · (d) `warning` · (e) `warning` — *"it's still 'using a
hint', which is a warning. the log's paragraph is wrong."* · (f) `neutral` —
the SQL changes · (g) `neutral` — the end-with-tiles-in-hand row · (h) a hint
`warning`, a spoiler `lost` · (i) `noted` (Joel: "info" — confirmed as the vocabulary's blue word) · (j) the turn keeps the fold
(`won` / `lost` / `near` for mixed), not the last guess's word · (k) **a hint
is `warning`; a reveal or spoiler is red — `lost`, confirmed** — so psychicnum's reveal
and stackdown's reveal, `warning` on the server today, change in the SQL.

**Vocabulary, ruled 2026-09-16: an outcome is called an OUTCOME, never a
"tone."** Joel: *"there is one and only one word we use for 'outcome' and that
is 'outcome'. do not use 'tone'. an outcome is not a tone."* And the boundary,
immediately after: *"we do use 'tone' for game chrome (like buttons); those take
a 'tone'. that's a different vocabulary."* So a prop, field, local or comment
carrying an `Outcome` is named `outcome`; a BUTTON's tone is untouched, and so
are the game palettes that are deliberately outside `--outcomes-*` (wordle's
tile colors, codenamesduet's key card). **Each game's `tone`-for-outcome is
fixed at that game's step** (Joel: *"we should fix the games use of tone for
outcomes during this area"*) — connections' `verdict.tone` and
`tone: feedbackMsg.outcome`, wordle's `rejectTone`, and the prose in wordiply,
spellingbee, boggle and psychicnum. The SHARED half — `VERDICT_TONE`,
`verdictTone.ts` and the `--verdict-tone` custom property — is filed in
`common/game-page/todo.md`, because `--verdict-tone` needs a name saying which
color ROLE it is rather than a straight rename.

**Vocabulary, ruled the same day: "help" is NEVER the word for a hint, a
reveal or a spoiler** — *"'help' is non-game text that explains how to play."*
Reveal and spoiler are one thing under two games' names. This file said
"help" for the family until this ruling; the todo entries that say it are
corrected as the games are worked.

### Step 3 · Per game, in this order

Each game is one commit: SQL where a word changes, frontend, tests, doc. The order goes
from the smallest change to the ones with a decision in them, so the shape is
proven before it meets codenamesduet.

1. **stackdown** — the server already says every word; a map over `kind` + `valid`;
   the log's inline `const`, the peer literals and the `WordEntry` verdict read
   the map, the refusal pill reads `res.outcome`.
2. **setgame** — no SQL: `record_hint` records a local action and the pill
   shows nothing; a map over `kind` (`claim → won`, `hint → warning`); the
   log's ternary and the peer literal read it.
3. **psychicnum** — decision (a); a map over `kind` then `is_correct`; the pill reads
   `res.outcome`, the log's two `near`s and the peer ternary read the map;
   `lib/history.ts` carries the map's word.
4. **wordle** — decision (b); a map over `is_correct`; the log reads it; the ring narrowing
   (`rejectTone: 'lost' | 'warning'`) becomes `Outcome`, per its todo.
5. **letterboxed** — decisions (h)(i); no SQL: the hint and spoiler are
   computed on the frontend and pilled before `log_help` runs, so they are
   FE-decided events and the map over `kind` is their home (`hint → warning`,
   `spoiler → lost`, `undone`/`cleared → noted`); `barFor` becomes the map; the
   played-word pill reads `res.outcome`.
6. **strands** — decisions (c)(d)(e); the four maps collapse to one over `result`
   (the PDF's `MARK` and history's `BODY` keep their own vocabularies but index
   the map for the verdict half); the SQL `case` says the same words.
7. **scrabble** — decisions (f)(g); `outcomeFor` becomes the map over `kind`, the
   peer copy goes, the three pill literals read `res.outcome`. The dictionary refusal writes no row and
   stays a pill-only event — noted in scrabble's todo as a row-shape question,
   not worked here.
8. **connections** — `submit_guess` puts the word in `outcome`, not only
   `data.result`; `OUTCOME_FOR_RESULT` is already the map;
   `GuessOutcome` widens to `Outcome` and `RESULT_FOR_OUTCOME` dies (the wire
   still carries `result`, computed from the local evaluation); the three pill
   literals read `res.outcome`; `HISTORY_LIT_TINT` becomes total or keys on the
   three it draws. Its todo's first bug closes here.
9. **codenamesduet** — decision (j); a map over the key letter; `turnOutcome` folds
   over its words rather than letters.
10. **the bee family + wordiply** — no SQL: the engine's accepted `'won'` goes
    through `outcomeFor('accepted')`; wordwheel gets a `lib/answer.ts`; the two
    stale docstrings in `useWordSubmit.ts` and `docs/games/spellingbee.md` are
    corrected.
11. **waffle** — nothing to change; recorded as passing.

### Step 4 · What holds it — tests, a guard, the docs

- **The two-language test, per game**: one fixture of expected words per
  event kind; pgTAP asserts the RPC's envelope `outcome` against it, vitest
  asserts the map's word for that event's row against it.
- ~~**A guard, `src/guards/outcomeSeams.test.ts`**: an outcome-word literal
  (`'won'`, `'near'`, …) may not appear in a game's `GameTurnLog.tsx`,
  `Board*.tsx`, `pdf/` or `lib/history.ts`.~~ **NO GUARD** (Joel, 2026-09-17:
  *"i don't think we need a guard for this."*)

  The spec was written before any game was worked, and eleven games later it was
  the wrong shape: it bans a SPELLING where the defect is a BEHAVIOR. A surface
  may ask what a word is (`outcome === 'lost' && shared.verdictShake`, `gameOver
  === 'won'`, `g.outcome === 'near' ? 'One away!' : …`); what it may not do is
  CHOOSE one. Every one of those asking-lines contains an outcome literal and is
  correct, so the guard would have fired on dozens of good lines and needed an
  allowlist to survive. Narrowing it to the value position was possible but would
  have been a regex over TypeScript, which this repo already has a filed bug
  about.

  What holds each game instead: its `answer.test.ts`, its pgTAP envelope pin, and
  the "one outcome decision" section in its doc naming where the decision lives.
- **The proof**: the four planted `near`s are gone by construction, not by
  search-and-replace — the log has no word of its own to be wrong with.
- **Docs**: `docs/outcomes.md` → One event, one outcome gains the mechanism
  as ruled (the envelope for the pill, one map per game for rows and local
  refusals, the two-language test); each game's doc names its `lib/answer.ts`.
  Two sentences in `outcomes.md` → The words describe the pre-ruling state and
  change with (h) and (k): `warning`'s "Help you asked for — stackdown's spoiler
  … amber" (a spoiler is `lost` now) and `noted`'s "letterboxed's help pills use
  it" (they become `warning` / `lost`) — and both say "help", which the
  vocabulary ruling retires for this meaning.

### Step 5 · Shipping

No migration: no shape changes. The SQL changes are one line each, in six
games' behavior files — psychicnum (a miss `lost`, a reveal `lost`), wordle (a
non-solving guess `neutral`), stackdown (a reveal `lost`), strands (hint_word
`near`), scrabble (an exchange `neutral`), connections (the word into the
`outcome` field) — and ship with the FE as every deploy does; `gmake db-sql ENV=local` +
`npm run test:db` first.

### The questions, all answered 2026-09-16

1. ~~The mechanism~~ — no column; the envelope for the pill, one map per game
   for rows and local refusals.
2. ~~The words~~ — the eleven rulings under step 2.
3. ~~codenamesduet's grain~~ — the turn keeps the fold.
4. ~~scrabble's dictionary refusal~~ — stays out of the log; the pill shows it
   and the board flashes the tiles red (`flashReject`), both reading the
   envelope's `lost`. Nothing to record in scrabble's todo: it is the design.

## The games, as each is worked

**1 · stackdown — DONE 2026-09-16** (`4b3cdbf5`). `lib/answer.ts`: four answers
(`accepted` · `invalid` · `hint` · `reveal`), `ANSWER_OUTCOME`, and
`answerOf(row)` reading `kind` before `valid`. Log bar, board tiles, entry slots
and the peer line index the table; the pill keeps reading the envelope. SQL, one
line: the spoiler is `lost`. `Board`/`WordEntry` widened from `'won' | 'lost'`
to `Outcome` and paint through the total `VERDICT_TONE`. Tests: `answer.test.ts`
plus `outcome` assertions in `gameplay_test.sql` / `reveal_test.sql`. Doc: a new
**The one outcome decision** section in `docs/games/stackdown.md`.

**2 · setgame — DONE 2026-09-16.** `lib/answer.ts`: three answers (`claim` ·
`hint` · `not_a_set`) and the table, no `answerOf` — the `events` row's `kind`
IS the key. The log bar, the peer line and the refusal pill index it. No SQL, as
predicted: `submit_set` already says `won` and `record_hint` deliberately says
nothing. Tests: `answer.test.ts` and the `outcome` assertion in
`gameplay_test.sql`. Doc: the same new section in `docs/games/setgame.md`, and
the turn-log paragraph's "amber (`near`)" corrected to `warning`.

**3 · psychicnum — DONE 2026-09-17.** `lib/answer.ts`: five answers (`hit` ·
`miss` · `hint` · `reveal` · `not_on_board`) and `answerOf(row)` reading `kind`
before `is_correct` — the trap this game is the proof of, since a hint and a
reveal are both written `is_correct = true`. The log bar, both peer lines and
the not-on-board pill index the table; the guess pill reads `res.outcome`. THREE
SQL words changed: a miss `neutral` → `lost` (decision a, in both arms) and the
spoiler `warning` → `lost` (ruling k). Eight pgTAP assertions moved with them —
every one a miss or the reveal, which is the change proving itself. Tests:
`answer.test.ts` plus the assertions already throughout `gameplay_test.sql` /
`turn_order_test.sql`. Doc: the new section, the two envelope tables, and four
stale "amber" claims about the spoiler.

**4 · wordle — DONE 2026-09-17.** `lib/answer.ts`: two answers, `correct` →
`won` and `incorrect` → **`neutral`** (decision b) — the SQL said `lost` and the
log said `neutral`, and NOTHING held them together, which is why the change
broke no pgTAP. Both halves are pinned now. The log bar and both peer lines
index the table (coop's teammate line had said a flat `neutral` even for a
solving guess). The two soft rejects stay OUT of the table by F-3's ruling — no
row, and the pill and the reject ring both read the envelope. **wordle's
`todo.md` item is closed by this**: `Board` takes an `Outcome` and looks its
ring color up in `VERDICT_TONE`, so `rejectTone: 'lost' | 'warning'` and the
call-site narrowing in `BoardCol` are both gone. Two stale claims fixed with it:
a `BoardCol` docstring describing the narrowing, and a comment citing
`docs/ui.md` as "tone follows the event" when it says **outcome**.

**5 · letterboxed — DONE 2026-09-17.** `lib/answer.ts`: five answers keyed by
the `events` row's own `kind` — `played` · `undone` · `cleared` · `hint` ·
`spoiler` → `won` · `noted` · `noted` · `warning` · `lost` (decisions h and i).
`barFor` is deleted; the log bar, both peer lines, the rung's own pill and the
played-word pill all read one word.

**The plan said letterboxed needed no SQL and that was wrong.** Ruling (i) makes
undo and clear `noted`, and `undo_word` / `clear_chain` answered `neutral`.
Nothing read those envelopes — both handlers dismiss the pill rather than
showing one — but leaving them would have broken the area's own invariant, so
both changed and both are pinned (`gameplay_test.sql`, against
`lib/answer.test.ts`). The undo pin failed on the change; the clear had none and
got one.

**The `help` rename shipped here**, by Joel's word (*"let's fix that when hit
letterboxed"*): `askHelp` → `askForHintOrSpoiler`, `helpPillText` →
`hintOrSpoilerPillText`, `lib/help.ts` → `lib/hintOrSpoiler.ts`, and the RPC
`letterboxed.log_help` → `letterboxed.log_hint_or_spoiler` (SQL + regenerated
`db.ts` + `replay_test.sql` + the doc). Only `askForHintOrSpoiler` was Joel's
name; the rest follow its construction and are his to shorten. The old
function's `drop function if exists` stays forever — the behavior file is
re-applied, not diffed. `docs/deferred.md`'s item and letterboxed's todo entry
both close.

**6 · strands — DONE 2026-09-17.** `lib/answer.ts`: seven answers —
`submit_path`'s six results plus `spent_hint`, which is what a `kind: 'hint'`
row is (it carries no `result`). Decisions (c)(d)(e) all applied: `hint_word`
`near`, `duplicate` and `too_short` `warning`, a spent hint `warning`. ONE SQL
line — `hint_word` was `won` on the server and `near` in the log, and the change
broke no pgTAP, so it is pinned now.

**Four tables keyed off one `result` column, and only two were duplicates.**
The log's `OUTCOME` + `HINT_OUTCOME` and the pill's switch both decided the
word; they are one table now. The PDF's `MARK` (`best`/`find`/`ok`/`no`, glyphs
for black-and-white paper) and history's `BODY` (sentence text) STAY — they key
off the same column but answer different questions, which is what separates a
second vocabulary from a second decision.

Two of this game's own readings were overturned and both are recorded in the
new file: `duplicate`/`too_short` as `lost` argued from the hint economy rather
than the move, and the spent hint's `neutral` argued that a hint is the opposite
of progress — true, and not a reason to say nothing happened.

**7 · scrabble — DONE 2026-09-17.** `lib/answer.ts`: four answers, keyed by the
`plays` row's own `kind`. Decisions (f) and (g): an exchange is `neutral` (ONE
SQL line — it answered `won`, which made trading tiles read like scoring) and a
forfeit is `neutral` (the log said `lost` while a teammate's line said `neutral`
about the same row). Three of four are `neutral` now, which is the honest shape:
this game adjudicates the PLAY and lets the score carry everything else. Neither
the exchange nor the accepted word was pinned; both are.

The `forfeit` row is the one answer with no SQL half to pin against: `end_game`
writes it, and that RPC's envelope is about the GAME ending rather than about
the row, so the table is its only authority. Noted in the test.

**The dictionary refusal stays out of the table**, as question 4 already ruled:
`_commit_word` answers `invalid` with `lost` and writes no row, so the pill and
the red tile flash are its only surfaces — and both now read that envelope
instead of a literal.

**8 · connections — DONE 2026-09-17.** The cause-shape, and the fix was not to
widen the narrowing. `lib/answer.ts` holds the three wire words
(`correct`/`oneAway`/`wrong` → `won`/`near`/`lost`), which is
`OUTCOME_FOR_RESULT` moved to the area's shape.

**`GuessOutcome` is gone, and so is `RESULT_FOR_OUTCOME`.** `evaluateGuess` now
answers in the WIRE word, so a verdict travels from the evaluator to the column
with no translation — the outbound seam in `BoardCol` disappeared rather than
being rewritten. The inbound seam in `useGame` stays and reads the column
through the table once.

**The history tint is what forced the shape.** Its three classes cannot be keyed
by a seven-value vocabulary, and padding `Record<Outcome, string>` with four
classes nobody draws is blocked by the dead-class guard — so it keys on the
three-value ANSWER, which is total over what can arrive and is not a narrowing
of anything. `GuessRow` gained `result` alongside `outcome` to carry it. That is
the real answer to the todo's question ("could a guess ever answer with a fourth
word?"): the question was mis-shaped, because the three tints were never about
the outcome list.

**SQL: `result` names the case, `outcome` carries the word.** It had been
putting the outcome word in `data.result` and leaving `outcome` null — one field
doing both jobs, and the field built for the word left empty. Three pgTAP
assertions moved with it, which is the first game this area has touched where
the change broke the tests it should have.

`matched` on `GuessRow` is now derivable from `result`; filed in the game's todo
rather than collapsed here, since its docstring argues a case that the new field
retires.

**9 · codenamesduet — DONE 2026-09-17, and it needs NO `lib/answer.ts`.** The
plan's step 3 called for "a map over the key letter"; the read says there is
nothing to key. Nothing here shows a single guess's outcome — a guess answers
with a REVEAL and the board says it, so the pill is deliberately silent on all
five `ok` answers; the log prints the guessed words in the key-card palette
(`--codenamesduet-agent` ×3), which is outside `--outcomes-*` by design; the PDF
uses its own `Mark`. The only thing wearing an outcome is the TURN, and
`turnOutcome` was already the one function that decides it (decision (j): it
keeps the fold). Building a one-reader table beside its only reader would have
been invention, so it was not built — the reasoning is in `turnOutcome`'s
docstring and the game's doc instead.

**What the read DID find: the PDF had a field named `outcome` holding a `Mark`.**
`PrintCell.outcome: Mark | null` — the outcome vocabulary's word on a value from
the key-card one, the same class of mistake as calling an outcome a "tone". It
is `revealed` now, with `outcomeOf` → `revealedOf` and `OUTCOME_MARK` →
`REVEALED_MARK`.

Also confirmed rather than assumed: `submit_guess` DOES say a per-guess word (an
agent `won`, a bystander `lost`) and it agrees with the fold everywhere the two
are comparable. Nothing reads it, because nothing shows it — recorded so the
next reader does not mistake the silence for a gap.

**10 · the bee family + wordiply — DONE 2026-09-17.** The engine's literal is
gone: `useWordSubmit`'s `outcomeFor` takes `'accepted'` too, so an accepted word
reads the game's own table instead of a flat `'won'` — the one answer a game
could not have an opinion about, even though spellingbee's and boggle's tables
had carried one for it all along with nobody reading it. **wordwheel got the
`lib/answer.ts` it never had** (its `outcomeFor` was an inline ternary over
three answers). wordiply needed nothing: its `answerFor` already covered
`accepted`, and its `onAnswer` and `outcomeFor` already read one table.

The engine's test stub failed on the change, which is the change proving itself:
it answered `warning` for everything, so an accepted word went from `won` to
`warning` the moment the literal stopped overriding it.

Both stale docstrings the plan named are corrected. `useWordSubmit`'s claim that
"wordiply's dictionary miss is a `warning` [on the board] and a `lost` in the
pill, a disagreement worth fixing" is no longer true — it is `warning` in both,
because both read `ANSWER_OUTCOME`. `docs/games/spellingbee.md` now names its
table and says why wordiply's differs.

**11 · waffle — PASSES, 2026-09-17, audited not assumed.** One move kind; the
log's bar is `neutral` and that is the only word it has; `submit_swap`
deliberately carries no outcome and no message, because the colors reach
everyone together over realtime; no pill reports a swap at all. The board's
g/y/x tile colors and the terminal frame are other vocabularies. No
`lib/answer.ts` — one move, one word, one reader — and the log's docstring now
says so rather than leaving the absence to be rediscovered. The two
`peerMilestone` lines ("solved it", "out of swaps") are news about a player's
state rather than verdicts on a move, and were left.

**ALL ELEVEN GROUPS ARE DONE**, step 4 shipped (`9a207b74`, no guard), and
the closing re-read ran 2026-09-17 — see F-5 onward.

## Findings

**F-outcome-fix-2 · the two-language safeguard has no shared fixture, and will
not get one.** Step 4 asks for "one fixture of expected words per event kind"
read by both pgTAP and vitest. There is no place both languages can read
without codegen or a test that parses SQL, neither worth it. What the first two
games do instead: a pgTAP `outcome` assertion per server-adjudicated event, a
vitest assertion on the table, and a comment in each naming the other as its
other half. Each language is pinned; the pair is held by the comment, not by
the machine. Step 4 is amended to say so when it is worked.

**F-outcome-fix-4 · a hint's and a spoiler's BUTTON stay amber while a
spoiler's outcome turns red, and that is right.** stackdown's and psychicnum's Spoiler buttons are
`warning`-toned beside their Hint twins, and the spoiler's outcome is now `lost`.
Not a disagreement: a button's tone is about the move you are about to make — a
caution, "this will cost you" — where an outcome is about what happened. Both
games' docs say so now rather than leaving the pair looking like a miss. It is
also the chrome/outcome boundary Joel drew the same day, applied.

**F-outcome-fix-3 · an event with no row is pill-only, and stays out of the
table. RULED 2026-09-17.** Three games have one. stackdown's `BoardCol` decides
two words for keystrokes (no exposed tile with that letter → `lost`; an
ambiguous letter → `warning`). scrabble's dictionary refusal is an `ok` with
`lost` that writes nothing. psychicnum's PA002 "Already guessed" is an `ok`
carried on a raise, so it has no `data` either.

psychicnum's is the one that got looked at properly. It is genuinely reachable:
`Board.tsx` sets `disabled={guessed || ...}`, so a guessed tile cannot be
CLICKED again, but `submitGuess` checks only `words.includes(guess)` — so typing
a word you already tried reaches the server. It costs nothing when it does: the
raise rolls its subtransaction back, so no budget moves and no row is written.

Joel, on whether to start writing a row so the log could show it: *"so it sounds
like we only show a pill, so it's fine to leave that."* So an event that changes
nothing and leaves no record is reported once, in the pill, and the table stays
a table of things that happened. The same answer covers all three games.

Note for whoever reads this later: psychicnum's two entry paths disagree about
the duplicate rule — clicking is gated locally, typing is not — and the
`results` map that gates the click is already in `BoardCol`. That is a behavior
question, not an outcome one, and it was not opened.

## The closing re-read — 2026-09-17

Scope, per Joel: *"i'm only interested in findings about the outcomes stuff; i
do not want general suggestions about the game files."* Every roster file was
read end to end (six parallel reads, one per game pair, each re-verified against
the tree before it was recorded), plus the docs the area's commits touched. The
fault classes grepped over the whole roster: `tone` for an outcome, `help` for
a hint, an outcome literal in value position, the old names, dates against
`git log`, counts and "the only" in the outcome prose, cites to a dead heading.

**The doc half of every finding below was FIXED first** (Joel: *"do the
re-read and update docs"*): `docs/outcomes.md`, `common/outcomes/doc.md`,
`CLAUDE.md`, and the game docs for codenamesduet, stackdown, scrabble,
connections, wordle, strands, letterboxed, spellingbee, wordiply, boggle,
wordwheel, waffle and psychicnum.

**The CODE half is FIXED too, the same day.** First the mechanical findings
(Joel: *"please do the mechanical findings"*) — F-5, F-6, F-7, F-8, F-10, F-11,
F-12, F-15, F-16, F-17, F-21 — then F-18's ruling. `tsc -b`, eslint, vitest
(341 files / 3266 tests) and pgTAP (178 files / 2489 tests) are green, and the
four `"outcome":null` pins were verified by planting a wrong word and watching
the suite fail. The two decisions went to the games that own them: F-13 is
closed below, filed to `src/strands/todo.md`, and F-14 was moved whole to
`src/stackdown/todo.md`.

### F-outcome-fix-5 · `psychicnum-spoiler-comment` · the `request_reveal` header still says the spoiler is `warning`

`supabase/sql/psychicnum.sql`, the comment above `request_reveal`: *"Logged as
a `kind = 'reveal'` row so it flows into the turn log over realtime (amber)"*
and *"ONE `ok`, carrying the revealed word, and its outcome is `warning`: a
spoiler is neither good nor bad play … (docs/outcomes.md → Help you asked
for). Its twin is stackdown.reveal_next_word, which answers the same way down
to the outcome."* The function returns `'lost'` (ruling k, changed in
`864885bd`), and the body's own comment two lines above the return says RED.
`docs/outcomes.md` has no heading "Help you asked for" — the paragraph is now
"A hint you asked for", under The words. stackdown's twin does answer `lost`,
so only the word and the cite are wrong. **FIXED**: the header says `lost`
and cites One event, one outcome, and "(amber)" on the log row is now "(red)".

### F-outcome-fix-6 · `psychicnum-no-lost-prose` · the `submit_guess` prose still describes a text return with "deliberately NO 'lost'"

The RPC answers an envelope — `won` for a hit, `lost` for a miss, `warning` for
PA002 — and has since the envelope sprint; ruling (a) made a miss `lost`. Three
places still describe `'won' | 'correct' | 'wrong'` and a paragraph arguing
there is deliberately no `lost`:

- `docs/games/psychicnum.md` §`submit_guess` (the heading said `→ text`) and
  the test-table row — **FIXED**; the Deferred link to the heading repointed.
- `supabase/sql/psychicnum.sql` the `submit_guess` header (the *"Returns one
  of: 'won' … 'correct' … 'wrong' … There is deliberately NO 'lost'"* block)
  — **FIXED**: it describes the envelope (`verdict`, `found_all`, the outcome
  per arm, PA002), and keeps the real point of the old block — the answer is
  the caller's own verdict, never the game's fate.
- `supabase/tests/psychicnum/gameplay_test.sql` (the header list, and the
  descriptions *"returns 'wrong'"*, *"returns correct, not a loss value"* —
  the assertions themselves pin `won`/`lost`) and `turn_order_test.sql`
  (*"returns 'wrong'"*) — **FIXED**, and the header gained the twin comment
  F-16 wanted.

### F-outcome-fix-7 · `connections-verdict-tone` · the `tone`-for-outcome the plan said step 8 would fix is still there

Step 2 recorded *"connections' `verdict.tone` and `tone: feedbackMsg.outcome`"*
as fixed at that game's step. Step 8 did not touch them. The sites, all
carrying an `Outcome`: `components/Board.tsx` — the `BoardVerdict` field
`tone: Outcome`, its game-level `VERDICT_TONE` copy (a `Record<Outcome, string
| null>` that differs from the shared one only in `won: null`), the read
`VERDICT_TONE[verdict.tone]`, and the docstring/comments *"The verdict's tone
class, keyed by the tone its PILL wore"*, *"the mark wears its pill's tone"*,
*"ringed in its pill's tone"*, *"in a PALE tier of its pill's tone"*, *"wears
the frame in that tone"*; `components/BoardCol.tsx` — `tone:
feedbackMsg.outcome`, `tone: newestGuess.outcome`, *"The tone of the game-over
frame"*, *"the shake needs no tone test"*; `components/PlayArea.tsx` *"(its
tone is the verdict's)"*; `PlayArea.test.tsx` *"in the tone its pill wears"*
(twice, one of them also calling "Incorrect" an `error` — it is `lost`, and
the assertion beside it says `verdictLost`). Fix: the field is `outcome`, the
prose says outcome. The doc's two "PILL's tone" sentences are **FIXED**. Code
**FIXED**: `BoardVerdict.tone` is `outcome`, both writers with it, and every
sentence says outcome. `VERDICT_TONE` itself is NOT renamed — that name is the
shared half filed in `common/game-page/todo.md`, and connections' copy moves
with it.

### F-outcome-fix-8 · `tone-for-outcome-prose` · the same word in other games' prose

- `wordle/components/BoardCol.tsx` *"Takes the tone and the sentence as
  ARGUMENTS"* (the parameter is `outcome: Outcome`); `wordle/components/PlayArea.tsx`
  *"neutral-toned with their identity dot"* — also FALSE, since the line
  indexes `ANSWER_OUTCOME` and a teammate's solving guess wears `won`.
- `supabase/sql/strands.sql` *"The outcome is the tone the frontend's `pillFor`
  was already choosing"* (`pillFor` no longer exists either — F-12) and
  *"`warning`, the help-you-asked-for tone"*; `supabase/tests/strands/hint_test.sql`
  *'in the help-you-asked-for tone'*; `strands/components/HintBar.tsx` *"the
  roster's amber "help" tone"* (ui.md defines no such tone).
- `supabase/sql/connections.sql` *"`warning` is the tone that says so"* — inside
  a paragraph that is stale anyway (F-12).
- `psychicnum/components/Board.module.css` *"SATURATED outcome tones"* (and
  the token name beside it was wrong too — F-12).
- Docs — **FIXED**: spellingbee's terminal table (*"→ tone won"* ×7 — a
  `TerminalOutcome`, but the vocabulary rule holds), wordiply's *"neutral
  tone"*, waffle's `tone:'neutral'` and *"reads as `success` … (tone follows
  the event)"* (`success` is not a word in the list; it is `won`), connections'
  *"PILL's tone"* ×2. `docs/games/stackdown.md`'s Deferred item *"the `lost`
  tone"* is LEFT — see F-12.

Code sites **FIXED**: wordle's two, strands' three (the SQL's `pillFor`
sentence now names `lib/answer.ts`), connections' SQL, psychicnum's CSS.
HintBar's "amber help tone" is the button's real tone, `caution`. One sibling
the grep had not listed went with them: `stackdown/components/InfoCol.tsx`
called the two cheat buttons *"warning-toned"* — an outcome word for a button
whose registry tone is `caution`.

### F-outcome-fix-9 · `guessoutcome-still-cited` · two docs called connections' `GuessOutcome` an open narrowing — **FIXED**

`docs/outcomes.md` → A narrower Outcome type still listed *"connections'
`GuessOutcome`"* as one of two open questions, and `src/common/outcomes/doc.md`
named it as a living subset. Step 8 deleted it. Both now name only the info
action row's `Exclude<Outcome, 'error'>`. (The `9a207b74` doc pass rewrote One
event, one outcome and missed its own file's later section.)

### F-outcome-fix-10 · `key-card-called-outcome` · the sibling of the PDF fix, and the doc's stale claims

Step 9 renamed the PDF's `outcome: Mark` to `revealed` because a key-card value
is not an outcome. The same misnaming stands next door: `codenamesduet/components/GameTurnLog.tsx`
*"each word colored by its reveal outcome (agent green / neutral tan / assassin
red)"*, `GameTurnLog.module.css` *"colored by its reveal outcome"*,
`GameTurnLog.test.tsx` *"the per-outcome color hookup (on guessed words AND the
outcome bar)"* — only the bar wears an outcome; `pdf/model.test.ts` *"as a
neutral outcome"*, *"the outcome is derived from the two burn flags"*, *"with
no outcome"*; `pdf/printCodenamesduetPdf.ts` *"its outcome border"*, *"no
outcome, so no color"* (the border is `MARK_RGB[c.revealed]`). All **FIXED** —
each says what the cell REVEALED, and the key-card vocabulary is named as not an
outcome.

The doc — **FIXED**: *"codenamesduet is the one game on the roster with no
`lib/answer.ts`"* was false (waffle has none; `docs/outcomes.md` names both);
the roster entry for `turnOutcome.ts` still listed the bar's words as `'bad'`
/ `'partial'` / `'good'` — the pre-`outcomes` spellings that area said it had
swept; and the `GameTurnLog.tsx` entry said *"each colored by reveal outcome"*.

### F-outcome-fix-11 · `help-for-hint-survivors` · the sweep this area ran missed these

The ruling (2026-09-17): "help" is never the word for a hint, a reveal or a
spoiler. Left standing:

- **letterboxed** — `components/PlayArea.tsx`: `type HelpAnswer` (the
  `log_hint_or_spoiler` answer), *"word results, help, End / Concede's
  not-oks"*, the section banner *"─── Help (coop only) ───"* and *"the server
  is told only that help was taken"*, *"there is nothing left to help"*;
  `pdf/printLetterboxedPdf.ts` *"retreats and help included"*;
  `components/StateLine.tsx` *"Help taken is deliberately NOT here"*;
  `lib/history.test.ts` `it('help does not move the chain')`;
  `pdf/model.test.ts` `it('keeps retreats and help in the printed log')`;
  `supabase/sql/letterboxed.sql` in `log_hint_or_spoiler`: *"neither help
  button in compete"*, the two raise texts `'BUG: help in a compete game'`
  (PN414) and `'BUG: help of an unknown kind'` (PN415), *"computing the
  help"*, *"who asked for help"*, *"the FE has already shown the help
  itself"*. The doc quotes the two raise texts, so they move together.
- **psychicnum** — `components/PlayArea.tsx` *"The two help asks"* (twice),
  *"the helper rows arrive"*, *"no move left to help with"*, *"the info
  column's two help buttons"*; `lib/history.ts` *"(they're free helpers)"*;
  `PlayArea.test.tsx` *"amber for a help ask"*; `gameplay_test.sql` *"neither
  helper spent any budget"*.
- **stackdown** `components/PlayArea.tsx` *"The help rungs and Reveal"*.
- **setgame** `components/InfoCol.tsx` *"a free generative help decides a
  race"* (`PlayArea.tsx` has the same sentence right); `supabase/sql/setgame.sql`
  PN280's `detail = 'hints are coop-only; free generative help would decide a
  race'`; `components/GameTurnLog.module.css` *"a hint is help taken"*.
- **strands** `components/HintBar.tsx` *""help" tone"*; `strands.sql`
  *"help-you-asked-for"*; `hint_test.sql` the same.
- **Docs — FIXED**: `CLAUDE.md`'s docs table said *"the priced-help rule"*
  (the banned phrase, in the file that states the rules); letterboxed's `## 6.
  Help` heading, *"help is amber"*, *"help nothing"*, *"Help narrates"*,
  *"retreats and help included"*, the modes table's `help` row, *"the help
  BFS"*; psychicnum's *"Two helpers"*, *"every guess **and helper**"*, *"Two
  helper RPCs"*.

Code sites **FIXED**, including the two raise texts — PN414 is now *"BUG: a
hint or spoiler in a compete game"* and PN415 *"BUG: a rung of an unknown
kind"*, with `docs/games/letterboxed.md`'s error table moved with them — and
letterboxed's `HelpAnswer` type, which is `RungAnswer`. What let this recur:
the sweep grepped "help ladder" and "priced help" and not the word.

### F-outcome-fix-12 · `stale-outcome-claims` · sentences about outcomes that the tree no longer supports

Docs **FIXED**; code **FIXED** too, except the two items marked LEFT below
(both Joel's to delete). Per file:

- **stackdown** — a teammate's word stopped flashing in the entry row on
  2026-09-15 (`9f6310f3`, before this area): `markPeerWord` marks their
  TILES, in the table's word. Still claiming the entry row: `components/PlayArea.tsx`
  (*"Two sources feed it … a TEAMMATE's played word (green if valid, red if
  rejected)"* and *"flash their played word (green/red) in the entry row"*),
  `components/BoardCol.tsx` (*"own-accepted or a coop teammate's word"*, the
  "coop peer narration" trigger, *"own-accepted / coop peer word"* ×2). The
  doc's peer-narration paragraph also had the WORDS wrong (*"tried FOOFS — not a
  word` [error]"* — it is `tried FOOFS`, `lost`; *"revealed a word [warning]"*
  — it is `took a spoiler`, `lost`) and named an `onPeerWord` that does not
  exist; its `WordEntry` entry claimed the teammate flash; its keystroke
  paragraph said *"a local **error** pill"* where the code says `lost`. Its
  Deferred item *"The word flash only fires for half the players"* (an
  `onPeerWord` → *"the `lost` tone"*, and "your OWN invalid word gets … nothing
  on the board") describes a state `9f6310f3` ended — left in place; it looks
  resolved and is Joel's to delete.
- **scrabble** — `docs/games/scrabble.md` said `_commit_exchange` answers *"in
  outcome `won`"* (ruling f: `neutral`; the same doc's outcome section had it
  right) and called the illegal-shape refusal *"an error pill"* (`lost`) —
  FIXED. `components/GameTurnLog.tsx` *"red for a coop forfeit"* — ruling g
  made it `neutral`, and the bar indexes the table — **FIXED**.
- **wordle** — `docs/games/wordle.md` listed `invalid` among the soft rejects
  (it is fault PN256, as the same doc says elsewhere) and said the pill is
  *"`error` for not-a-word / RPC failure"* (not-a-word is `lost`; a not-ok wears
  its severity) — FIXED. `components/BoardCol.tsx` *"keeps its amber ring"* /
  *"rings amber for a beat"* (the ring wears the refusal's outcome; not-a-word
  is red) and *"which is how the `?? 'lost'` below it came to exist"* (nothing
  below carries it); `supabase/sql/wordle.sql`'s `submit_guess` header still
  lists `'invalid'` as a soft rejection and describes a bare `result` rather
  than the envelope's word; `gameplay_test.sql` *"The non-solving guess below"*
  — it is above — **FIXED** (the SQL header now describes the envelope and its
  two soft rejects; PN256 is named as the fault it is).
- **strands** — `docs/games/strands.md` said a spent hint takes *"a `neutral`
  bar"* (ruling e: `warning`), *"the ones `resultFor` was already choosing"*,
  and the glyphs are *"named for the outcome"* (they are a verdict-glyph
  vocabulary, which the same doc says is not an outcome) — FIXED.
  `lib/answer.ts` names `submit_guess` (the RPC is `submit_path`) and *"a
  teammate's line"* (strands has no peer narration; `useGame` says why);
  `components/PlayArea.tsx` the same teammate's line; `components/GameTurnLog.tsx`
  *"an amber bar IS "valid word""* (`near` is gold) and *"All three paint the
  same red bar"* (two are `warning`, one `lost`); `strands.sql` names
  `pillFor`, deleted 2026-09-12 — **FIXED**.
- **letterboxed** — `docs/games/letterboxed.md`'s turn-log paragraph said
  *"help is amber … retreats are neutral"* against its own §6 (spoiler `lost`,
  retreats `noted`) — FIXED.
- **spellingbee / wordwheel** — `docs/games/spellingbee.md` step 6 said the
  RPC's `result` enum *"picks the tone + copy"* for the pill (the pill is shown
  before the RPC fires, from `lib/answer.ts`; `'tooShort'` is not a result the
  server has), and its check list used names (`tooShort`, `badLetters`,
  `notAWord`, `alreadyFound`) that exist nowhere in the code — FIXED to the
  engine's answers. `supabase/sql/spellingbee.sql` and `wordwheel.sql`
  `submit_word` headers still list *"tooShort / badLetters / missingCenter /
  notAWord"* as checks the function runs and say *"Rejected results (notAWord,
  tooShort, …) carry `points: 0`"* — both are trusting-commit and return no
  rejected result — **FIXED**: each header says the FE judges the word, names
  the results the `ok` can carry, and says the envelope carries no outcome.
- **boggle** — the doc's *"too short / duplicate → instant info"* (`warning`)
  — FIXED. **wordiply** — *"A rejected guess never hits the server"*
  (`recordReject` records it) — FIXED.
- **waffle** — the doc said the celebration is gated on `playState` because
  *"manual-end reuses `outcome:'won'` for styling"* (a manual end is `neutral`;
  the real reason is `game.mode` being null until the fetch lands, which the
  code's comment says) — FIXED.
- **psychicnum** — `theme.css` and `components/Board.module.css` name
  `--outcome-{won,lost,near}-fill-color` / `--outcome-*-fill-color`, tokens
  that do not exist (the bucket is `--outcomes-*`); `lib/answer.ts` says a
  hint is *"a nudge you asked for and paid for"* — `request_hint` costs
  nothing — **FIXED** (the tokens are `--outcomes-*-bar-color` /
  `--outcomes-*-fill-color`, and the hint is free here).
- **connections** — `lib/answer.ts` says *"The pill, the tile verdict, the log
  bar, the history tint and the PDF all read THIS"*: the pill and the tile
  verdict read the ENVELOPE (`res.outcome`, `feedbackMsg.outcome`), and the
  history tint is keyed by `Answer`, deliberately not by outcome (step 8's own
  reasoning); only the log bar, the PDF and the peer line read the table.
  `supabase/sql/connections.sql`'s `next_puzzle_for_club` header still says
  *"The empty case is `outcome: 'warning'`"* while the function raises PN302
  ten lines later and says so twice below — **FIXED**: the table docstring
  names the row readers and the envelope readers apart, and the SQL header
  describes PN302. (Two sentences in the same header were stale the same way
  and went with it — a `returns table(...)`-era "0 rows" line and a "no
  handler, this raises nothing" line, when PN302 is exactly a raise.) The doc's `.verdictError`
  (the class is `verdictLost`) and *"green/amber/red"* (`near` is gold) —
  FIXED.
- **shared** — `shared/word-hunt/useWordSubmit.ts` *"None does: every one of
  the four routes both this and `outcomeFor` through its own `lib/answer.ts`"*
  — wordwheel's `onAnswer` reads no outcome at all (it only bumps the shake),
  and the sentence is a census — **FIXED**: it states the condition instead.

### F-outcome-fix-13 · `strands-pill-reads-the-table` · the one pill that indexes `ANSWER_OUTCOME` instead of `res.outcome`

`strands/components/PlayArea.tsx` `resultFor` builds the pill from
`ANSWER_OUTCOME[r.result]`, and its comment says so as a choice. The rule in
`docs/outcomes.md` → How a game does it is *"The PILL reads the RPC's envelope
instead — `res.outcome`, never a literal"*, and every other RPC game does. The
two agree today (both halves pinned), so nothing is wrong on screen; it is the
rule with an unrecorded exception, and `resultFor` was on the plan's old-name
list. Options: (1) pass `res.outcome` into `resultFor` and let the table serve
the row readers only — the rule as written; (2) keep it and write strands
down as the exception in `outcomes.md`, with the reason. Recommend (1): the
comment beside it (*"the outcome travels in the envelope"*) already argues for
it.

**CLOSED here 2026-09-17** (Joel): option (1), FILED as a Soon item in
`src/strands/todo.md` — it is that game's work, not this area's.

### F-outcome-fix-15 · `peer-line-literals` · a teammate's accepted word is `'won'` by hand

The rule: anything reading a row indexes the table. A teammate's found word
arrives as a row, and these choose its word: `wordiply/components/PlayArea.tsx`
`showAnswer(r.word, 'won', true)` and `FeedbackMessage.peer(member, 'won', …)`
(step 10 recorded them as "right by construction" — they are right, and they
are still a second place), `spellingbee/components/PlayArea.tsx`,
`wordwheel/components/PlayArea.tsx`, `boggle/components/PlayArea.tsx` the same
`peer(member, 'won', …)`, and `connections/components/PlayArea.tsx`
`peer(member, 'won', 'found category')` where the sibling branch two lines down
already reads `g.outcome`. Fix: `ANSWER_OUTCOME.accepted` / `g.outcome`. The
PlayArea tests that pin `'won'` on those lines keep passing. **FIXED** — all
five now index a table.

### F-outcome-fix-16 · `sql-half-unpinned` · envelope words the area's rule says are pinned, and are not

The rule: every server-adjudicated event's `outcome` is asserted in pgTAP.
Missing, per game:

- **strands** `gameplay_test.sql`: theme and spangram (`won`, `else 'won'` in
  `submit_path`), `duplicate` (`warning`), `invalid` (`lost`) — only `data.result`
  is asserted; `hint_word` and `too_short` are the pinned ones.
- **scrabble**: the dictionary refusal (`invalid` → `lost`) in `play_word_test.sql`
  asserts `result`, `bad_words`, `version`, never `outcome`; `pass_turn`
  (`neutral`) has no `outcome` assertion in `exchange_pass_test.sql`.
- **letterboxed** `gameplay_test.sql`: the SOLVED branch of `submit_word` (a
  second `'won'` envelope) asserts only `data.solved`.
- **"no outcome" is asserted nowhere, because `envelope_is` is containment**
  (`actual @> expected`): an expected envelope that omits `outcome` passes
  whatever the server puts there. The events whose docs and docstrings say
  "deliberately carries no outcome": setgame `record_hint` (`hint_test.sql`),
  letterboxed `log_hint_or_spoiler` (called once, in `replay_test.sql`, with no
  assertion), codenamesduet `pass_turn` (`game_loop_test.sql`), waffle
  `submit_swap` (`gameplay_test.sql`). `ok_envelope` writes `"outcome": null`,
  so adding `"outcome":null` to each expected envelope pins it.
- **Twin comments missing**: connections' `gameplay_test.sql` pins all three
  words and names `lib/answer.ts` nowhere (the vitest half names it);
  psychicnum's `gameplay_test.sql` the same; letterboxed's `won` pin (the undo
  and clear pins beside it have the comment).

All **FIXED**. The four `"outcome":null` pins were verified by planting a wrong
word in waffle's and watching the suite fail — a single-file `supabase test db`
run cannot say (it exits 3 with no plan), so plant against `npm run test:db`.

### F-outcome-fix-17 · `fe-half-unpinned` · three tables have no `lib/answer.test.ts`

spellingbee, boggle and wordiply have `ANSWER_OUTCOME` tables and no test that
reads them; only wordwheel's (written by step 10) does. No test file in those
folders imports the table. Their SQL carries no outcome, so the vitest half is
the whole pin. **FIXED**: `src/{spellingbee,boggle,wordiply}/lib/answer.test.ts`
on wordwheel's model (they join the roster).

### F-outcome-fix-18 · `answer-docstring-archaeology` · the area wrote history into the code, and one date is wrong

CLAUDE.md: *"do not make purely archaeological comments … 'how it used to work'
is not useful."* Written by this area, in outcome comments:

- the "which they did:" sentence in `lib/answer.ts` of stackdown (*"a spoiler
  was amber in the pill and gold in the log…"*), setgame, letterboxed (plus
  *"`neutral` had been the word"*), wordiply (from `24664a0a`) and strands
  (*"Four separate tables used to key off…"*, plus two parenthetical "the log
  called it…" lines);
- dated lines: `scrabble/lib/answer.ts` and `scrabble.sql` (*"`won` until
  2026-09-17"*), `wordle/lib/answer.ts` and `wordle/lib/answer.test.ts`
  (*"`lost` until 2026-09-17"*, *"Neither half existed until 2026-09-17"*),
  `useWordSubmit.ts` (*"a flat `'won'` here until 2026-09-17"*, *"used to be a
  `warning` here and a `lost` in the pill"*), `wordle.sql` (*"as its log had
  been saying all along, while this said `lost`"*), and the test comments in
  scrabble's `exchange_pass_test.sql`, strands' and wordle's `gameplay_test.sql`;
- **one date is WRONG**: `supabase/sql/psychicnum.sql` beside the miss branch
  says `neutral` *"was the word here until 2026-09-16"* — the change is
  `864885bd`, 2026-09-17 (the 09-16 commit touched no such line). Every other
  date matches its commit; "ruled 2026-09-16" lines are ruling dates and are
  right.

**RULED 2026-09-17 and FIXED**, Joel taking the recommendation: **the dated
lines are cut**, and **the "which they did" sentences stay — in the present
tense**, without the clause that makes them history.

The dated ones were pure archaeology: nobody reading `useWordSubmit` needs what
it said yesterday, and the date rots into a puzzle. The others are doing the
work a docstring owes its caller — they answer *"why is there a table at all?"*
— and they answer it just as well as a condition: *"a spoiler is one event, and
the pill, the log and the server each choosing its color are three chances to
disagree about what it was."* Nine files lost a date, six `lib/answer.ts` were
rewritten (psychicnum's too, which this finding had not listed), and the one
wrong date went with them rather than being corrected.

### F-outcome-fix-19 · `counts-in-the-outcome-docs` · **FIXED**

`docs/outcomes.md` had *"nine other games follow it now"*, *"the shape eleven
games settled into"*, *"Four games' SQL turned out to be asserting nothing"*,
*"Four games did log a hint … none does now"* and *"the bar took a hand-cut
four until 2026-09-15"* — five counts and two histories in the rule's home,
written the day before. Each now states the condition. Also *"no rule has been
found there yet"* for what an `ok` shows, when this area's rule is that the
pill reads `res.outcome` — repointed.

### F-outcome-fix-20 · `docs-missing-the-decision-site` · **FIXED**

The closing checklist asks that each game's doc name its one decision site.
wordiply (the doc's own worked example), boggle and wordwheel never mentioned
`lib/answer.ts`; waffle's doc did not say why it has none (only
`GameTurnLog.tsx`'s docstring did). Each has a short "The one outcome decision"
section now, at the top of its Frontend section.

### F-outcome-fix-21 · `wordle-board-default-lost` · a dead default that chooses a word

`wordle/components/Board.tsx` declares `rejectOutcome?: Outcome` with a default
of `'lost'`. Its caller (`BoardCol`) always passes it, so the default runs never
— and it is a second place naming a refusal's word, one that disagrees with the
duplicate's `warning`. Fix: the prop is required. **FIXED**. The
`useState<Outcome>('lost')` beside it in `BoardCol` is the filed todo's
subject, not this.

### What checked out

Every game's three-questions audit passed on the events the area worked: the
pill reads `res.outcome` (strands excepted, F-13), the log bar / peer line /
PDF / history index the table, the SQL says the same word, and the pinned
halves name each other where they exist (F-16 lists the gaps). No live hit
anywhere for `GuessOutcome`, `RESULT_FOR_OUTCOME`, `OUTCOME_FOR_RESULT`,
`HINT_OUTCOME`, `barFor`, scrabble's `outcomeFor`, `rejectTone`, `log_help`,
`askHelp`, `helpPillText`, `lib/help`, `OUTCOME_MARK`, the PDF's `outcomeOf`,
`TurnOutcome` or `canAskHelp` — `pillFor` survives only as strands' SQL comment
(F-8/F-12) and `resultFor` is F-13. codenamesduet's bar reads `turnOutcome`
and nothing else chooses a word; its PDF field is `revealed` everywhere in
code. waffle's bar is `neutral` and its docstring says why. The bee family's
`outcomeFor` all index their tables and every table covers `accepted`. Every
date in the area's prose matched `git log` except the one in F-18 — and F-18's
ruling took the dated lines out of the code altogether.

## Closing

- [x] the whole area re-read in one sitting after the last group — 2026-09-17,
      F-5 to F-21
- [x] the rule's home in `docs/outcomes.md` says what shipped; each game's
      `docs/games/<game>.md` names its one decision site — the doc half of every
      finding is done, and so is the code half (2026-09-17)
- [x] every game's `todo.md` holds what is still owed — F-13 is now strands'
      and F-14 is stackdown's (a Soon item in each), and the five items the area
      filed are open where they belong: setgame's hint ring, psychicnum's
      decided-tile fill, wordle's not-ok ring, connections' `matched`,
      game-page's `verdictTone`
- [ ] **the stamps — the one thing this close does NOT settle.** Joel,
      2026-09-17: the files belong to other areas and will not be blessed for
      this one, and what the `cs-*-outcome-fix` stamps become is his call. No
      stamp was written at the close, and none may be: a `cs-blessed` records
      that Joel read a file, which is a claim only he can make.
