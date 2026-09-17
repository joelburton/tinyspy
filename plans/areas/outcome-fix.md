# Area: outcome-fix

No folder: every game's move path. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order and the area's whole reading (§3, the
`outcome-fix` row), this file holds the audit. Owed work lives in each game's
`todo.md`, not here.

**Status: OPEN 2026-09-16.** The plan and the roster are agreed (Joel: *"yes,
go ahead. then begin."*) and the roster is stamped `cs-met-outcome-fix` —
eighty-three files, all `cs-unmet` before: the six SQL files; per log game its
`GameTurnLog.tsx`, `PlayArea.tsx`, `BoardCol.tsx`, `hooks/useGame.ts`,
`pdf/model.ts` (scrabble prints from `PlayArea`), the `Board.tsx` where a verdict
mark keys on an outcome and the `pdf/print*Pdf.ts` that read one; stackdown's
`WordEntry.tsx`; the decision-site libs; codenamesduet's `hooks/useBoard.ts`;
the bee family's `lib/answer.ts` ×2 and the shared `useWordSubmit.ts`
(wordwheel's `lib/answer.ts` joins when it is written). Work starts with
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
- **A guard, `src/guards/outcomeSeams.test.ts`**: an outcome-word literal
  (`'won'`, `'near'`, …) may not appear in a game's `GameTurnLog.tsx`,
  `Board*.tsx`, `pdf/` or `lib/history.ts` — a SURFACE never names the word. The
  allowed homes are `lib/answer.ts` (the FE-only table), `buildOver` (terminal,
  a different vocabulary) and the peer-milestone lines. Verified by planting.
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

## Findings

**F-outcome-fix-1 · setgame's live hint ring is green while its hint is amber.**
`--setgame-hint-ring` is `#16a34a`, and green is the app's success color; the
same hint's log bar is `warning`. So the board and the log say two different
things about one event. NOT fixed here — it is a LOOK decision, and setgame's
card fills are deliberately outside `--outcomes-*`. Filed in
`src/setgame/todo.md` beside the existing question about the same ring (history
borrowing the hint color), because the two have to be decided together.

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

**F-outcome-fix-5 · a decided tile's PERMANENT fill derives the word a second
time.** psychicnum's board paints `correct ? styles.correct : styles.incorrect`
from the row's boolean, and those two classes are `--outcomes-won-*` /
`--outcomes-lost-*`. That is the same mapping `ANSWER_OUTCOME` makes, written
again — so a miss ruled anything but `lost` would move the log and the pill and
leave the board behind.

Left alone, for a reason that is about the MARK and not about the word. The
`verdict*` classes are for a beat: a piece flashes the answer and hands itself
back. These fills are permanent — a guessed tile stays colored for the rest of
the game, as the board's record of what has been ruled out — and routing a
lasting state through the transient-verdict machinery is a decision that those
are one thing, not a rename. It is also not expressible today: every
`VERDICT_TONE` class sets exactly `--verdict-tone` / `--verdict-fill` /
`--verdict-ink`, and a decided tile needs an EDGE. The color exists
(`--outcomes-<family>-edge-color`, all seven, in `daylight.css`); what does not
is a shared class set for a permanently-decided piece. That is
[tile-feedback](../tile-feedback.md)'s question.

Expect the same shape in wordle, waffle and connections — decide it once, when
the first of them is reached, rather than per game.

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

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the rule's home in `docs/outcomes.md` says what shipped; each game's
      `doc.md`/`docs/games/<game>.md` names its one decision site
- [ ] every game's `todo.md` holds what is still owed; nothing durable left here
- [ ] every file on the roster blessed, or its stamp says why not
