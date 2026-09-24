# App audit — the plan

**THE LIVE SPRINT, and the only one.** An app-wide walk through every area's
React, SQL and CSS together, locking down shared ideas to reduce difference and
code. This file is the plan and the process, and nothing else: what an area did
is in its own `plans/areas/<area>.md` (its findings, and a closing summary),
what shipped is in `docs/` and the folders' `doc.md`, and what is owed is in
the folders' `todo.md`.

## Where to start

**Owed blessings — Joel's, not work:**

- `corecss` — every finding worked and the re-read done; its files stay
  `cs-audited-corecss` until Joel blesses them, which waits until the areas
  that wear those stylesheets have closed.
- `board-marks` — re-opened 2026-09-20 and the work is done; its files keep
  their old blessing until Joel re-reads them.
- `outcome-fix` — closed as a pass across every game's move path; its files
  are `cs-fixed-outcome-fix`, not blessed.

**Not opened yet:** the ten remaining games (Joel picks the next).

**Before opening anything, read §4.** §3 is the order and the progress.

## 1. What this sprint is, and why

It began as CSS: sixteen games share a great deal and should have little
customized CSS, and instead the app had thousands of lines of module CSS
against a few hundred shared, the same choice made in many places and things
with the same meaning styled differently. Measuring it showed color was the
smaller half and **unnamed patterns** the bigger one — every dialog had the
same fields, save, cancel and spacing and no class said so.

The same duplication lives in the React and the SQL, and the sweep reads each
file once, so **anything an area needs gets done while it is open**. That is
what "area by area" means. Growth is expected, as long as it is organized by
area.

**What success looks like:**

- Far less CSS, and what's left in a game's module is **board geometry and brand
  color**. A dialog or button rule in a game module means one was missed.
  **Crosswords and scrabble are exempt by ruling**: crosswords' notation and
  keyboard-first layout, and scrabble's premium-square board, are genuinely
  unlike the rest. Don't measure the sprint by them.
- Colors mostly computed from a base, so theming is changing the base. **A
  color should have a meaning.**
- Every file read once, by Joel, with the reading recorded (§4 → The stamp).

## 2. The steps

| step | state |
|---|---|
| 1–6 — this doc, the theme, `/palette`, the midnight spike, the pattern pass, the conversion process, the vocabularies, the z- layers | done. What they produced is [docs/tokens.md](../docs/tokens.md), [docs/code-conventions.md](../docs/code-conventions.md), `core-css/base.css` and [dark-mode.md](dark-mode.md). `/palette`'s in-situ half waits until it can render the REAL components, since an invented example manufactures evidence |
| 7 — **the areas** | **in progress.** All the reading, area by area: the order is §3, the process §4 |
| 11 — assets | 17 game logos carry baked color; the wordmark and favicon carry near-whites that fail on a dark page. All at once, at the end |
| 12 — fold and delete | the allowlists empty; every `cs-` stamp comes out (`cs-stamp.mjs unstamp`, then the script and its guard go); `plans/areas/` goes; `tile-feedback.md` folds into `docs/`; this doc goes |

Steps 8–10 were folded into 7 and their numbers are retired.

## 3. The areas, in order

**Keyed to folders**: pick any file, read its folder, and exactly one row names
it. An area may span a few tiny sibling folders that are one subject; a folder
named by two rows has a file belonging to another area's subject, and both rows
say so. **The order is by depth** (Joel): deep-down things first, and what
everything needs before what only games need. Each closed area's story is its
area file's closing summary.

| # | area | the folders it reads | state · what it is |
|---|---|---|---|
| | **Foundations** | | |
| 1 | `utils` | `utils` | closed 09-04 · small general helpers |
| 2 | `icons` | `icons` | closed 09-04 · the glyph registry |
| 3 | `web-storage` | `web-storage` | closed 09-05 · storage that cannot throw |
| 4 | `outcomes` | `outcomes` | closed 09-05 · the outcome vocabulary |
| 5 | `single-flight` | `single-flight` | closed 09-05 · the guard every submit wraps |
| 6 | `mobile` | `mobile` | closed 09-05 · the breakpoint, the device hooks |
| 7 | `routing` | `routing` | closed 09-05 · the router and the two URL shapes |
| | **The data path and the boot** | | |
| 8 | `supabase` | `supabase` · `functions/_shared/envelope.ts` + `dbResult.ts` | closed 09-05 · the client, the wrappers, the envelope |
| 9 | `session` | `session` | closed 09-05 · who is signed in |
| 10 | `boot` | `boot` · `main.tsx` · `App.tsx` · `themes/loadTheme.ts` | closed 09-05 · mounting, the theme load, the session gate |
| 11 | `realtime` | `realtime` | closed 09-05 · presence, reconnect, the subscribe hooks |
| | **The look** | | |
| 12 | `corecss` | `core-css` · `themes` (less `loadTheme.ts`) | **awaits Joel's blessing** · the stylesheets every page loads |
| 13 | `branding` | `branding` | closed 09-05 · the logos and the wordmark |
| | **The people** | | |
| 14 | `members` | `members` | closed 09-09 · who someone is, and their color |
| | **The controls** | | |
| 15 | `buttons` | `buttons` | closed 09-08 · the button taxonomy |
| 16 | `keyboard` | `keyboard` | closed 09-10 · whose keystroke it is |
| 17 | `lists` | `lists` | closed 09-11 · pick-one and scrolling lists |
| 18 | `forms` | `forms` · `fields` | closed 09-11 · forms and every field |
| 19 | `actions` | `actions` | closed 09-11 · what a command is |
| | **Floating things and the root hosts** | | |
| 20 | `floating-panels` | `floating-panels` | closed 09-11 · every window that floats over the page |
| 21 | `menu` | `menu` | closed 09-11 · the one menu |
| 22 | `common-hosts` | `toasts` · `tooltips` · `faults` · `invitations` | closed 09-11 · the root hosts |
| | **The feedback system** | | |
| 23 | `feedback` | `feedback` · `terminalMessage` (in `terminal`) · `turnText` (in `info-sheet`) | closed 09-12 · everything between an envelope and a player reading words |
| | **Page furniture** | | |
| 24 | `page-header` | `page-header` | closed 09-12 · the top strip and its marks |
| 25 | `definitions` | `definitions` · `anagram-finder` | closed 09-12 · click-a-word lookup, curation, anagrams |
| 26 | `chat` | `chat` | closed 09-12 · the club chat |
| 27 | `scratchpad` | `scratchpad` | closed 09-12 · a game's notepad |
| 28 | `account` | `account` | closed 09-12 · your menu and profile |
| | **The pages** | | |
| 29 | `simple-page` | `auth` · `loading` · `error-page` | closed 09-13 · the pages `App` renders directly |
| 30 | `homepage` | `home` | closed 09-13 · the landing page |
| 31 | `club-page` | `club` | closed 09-14 · the club page |
| 32 | `setup-form` | `setup-form` | closed 09-14 · the start-a-game dialog |
| | **The game shell** | | |
| 33 | `manifest` | `manifest` · `gametypes.ts` | closed 09-14 · the registry and the manifest contract |
| 34 | `game-page` | `game-page` | closed 09-15 · the live game's page |
| 35 | `board-marks` | `board-marks` (+ setgame's `lib/flash.ts`) | **awaits Joel's re-bless** · a board's marks and their lifetimes |
| 36 | `timer` | `timer` | closed 09-16 · the game clock |
| 37 | `pause-suspend` | `pause-suspend` | closed 09-16 · stopping a game while a player is missing |
| 38 | `turn-log` | `turn-log` | closed 09-16 · the history readout and its viewer |
| 39 | `outcome-fix` | no folder — every game's move path | closed 09-17, `cs-fixed`, **not blessed** · one outcome per move, read everywhere |
| 40 | `history-always-available` | no folder — the viewer games | closed 09-18, nothing stamped · every past turn replays |
| 41 | `z-index` | no folder — a task | closed 09-18, nothing stamped · the z- layers |
| 42 | `word-list` | `word-list` | closed 09-21 · the found-words list |
| 43 | `word-entry` | `word-entry` | closed 09-18 · the typed-word box and its row |
| 44 | `terminal` | `terminal` | closed 09-18 · a game's ending, and the celebration |
| 45 | `reveal` | `reveal` | closed 09-18 · showing the answer |
| 46 | `info-sheet` | `info-sheet` | closed 09-19 · the info column and its phone page |
| 47 | `pdf` | `pdf` · `shared/wordle-style/pdfTiles.ts` | closed 09-19 · printing a board |
| | **The shared families** | | |
| 48 | `dict-trie` | `shared/dict-trie` | closed 09-24 · the dictionary trie |
| 49 | `rank-ladder` | `shared/rank-ladder` | closed 09-21 · the rank ladder |
| 50 | `board-cursor` | `shared/board-cursor` | closed 09-24 · a cursor moving over a board |
| 51 | `wordle-style` | `shared/wordle-style` | closed 09-22 · the per-letter color codes |
| 52 | `onscreen-keyboard` | `shared/onscreen-keyboard` | closed 09-22 · the on-screen QWERTY |
| 53 | `grid-and-drag` | `shared/grid-and-drag` | closed 09-24 · dragging a tile onto the grid |
| 54 | `bee-games` | `shared/bee-games` | closed 09-21 · what spellingbee and wordwheel share |
| 55 | `found-words` | `shared/found-words` | closed 09-21 · the games that keep a found-words list |
| | **The games** — one area each, keyed by codename; `psychicnum` first as the control | | |
| 56 | `psychicnum` | `src/psychicnum/` | closed 09-19 |
| 57 | `connections` | `src/connections/` | closed 09-19 |
| 58 | `wordle` | `src/wordle/` | closed 09-22 |
| 59 | `spellingbee` | `src/spellingbee/` | closed 09-23 |
| 60 | `codenamesduet` | `src/codenamesduet/` | closed 09-23 |
| 61 | `wordwheel` | `src/wordwheel/` | closed 09-24 |
| 62 | `bananagrams` · `boggle` · `crosswords` · `letterboxed` · `scrabble` · `setgame` · `stackdown` · `strands` · `waffle` · `wordiply` | `src/<game>/` | not opened |

**`common/devtools` is on no row, deliberately.** `/palette` and `/font` are
ABSOLUTELY EXCLUDED (Joel: *"Do not read them, do not edit them, do not touch
them."*), and so are findings ABOUT them. **The three root files** are named by
file: `main.tsx` and `App.tsx` are `boot`'s, `gametypes.ts` is `manifest`'s.

## 4. The area process — stamps, areas, and what "broken" means

The sprint reads **every** file — CSS, React, tests, SQL, edge functions,
scripts — so the first requirement is knowing, for any file, whether it has
been read.

### The stamp

Every file in scope carries one comment on its first line, `cs-` for
"css-system" (the sprint outgrew the name; the name stays).

| stamp | means | who sets it |
|---|---|---|
| `cs-unmet` | not reached yet | the initial sweep |
| `cs-found` | reached through the import/render graph | whoever reads the file that pointed at it |
| `cs-met` | **on an open area's agreed roster** | Claude, when Joel agrees the roster |
| `cs-audited` | an audit for it exists in `plans/areas/<area>.md` | Claude |
| `cs-partial` | some findings resolved; it names which are outstanding and where | Claude |
| `cs-fixed` | every finding resolved | Claude |
| `cs-blessed` | **Joel read it himself** | **only Joel** |
| `cs-na` | in the tree, deliberately not read | either |

**A judgment stamp names the area that made it**, as a suffix:
`cs-met-feedback`, `cs-blessed-forms`; `cs-unmet` and `cs-na` stay bare. It
answers "when did I approve this, and should I revisit it?". The suffix is not
guarded, deliberately: a manifest of areas would rot on every rename, and the
cost is that a typo'd area passes silently.

**`cs-fixed` and `cs-blessed` are different claims.** "Claude found nothing"
and "Joel read it" are not the same statement, and the sprint's exit criterion
is the second.

**There is no ladder to walk.** A stamp is the latest true statement about a
file. A file can go `unmet` → `audited` in one sitting, and **a dependency at
`cs-found` stays there until an area is scheduled for it**.

**`cs-found` means an area DEPENDS on the file** (Joel: *"we came across this
organically while exploring that area"*), which is how something downstream
eventually gets an area of its own. A file opened as EVIDENCE — compared
against, measured, quoted — is not found, however carefully it was read.
`found` says *this deserves an area*; `met` says *this has an open area*.
Neither means read.

`scripts/cs-stamp.mjs` does the work (`stamp` · `unstamp` · `tally` · `list` ·
`set`) and owns the scope: what git tracks in `src/` `e2e/` `supabase/`
`scripts/`, in a language with a first-line comment. `src/guards/csStamps`
fails on a file with no stamp (every NEW file) or a word outside the eight.

**The sprint has restarted twice**, each time sending every stamp back to
`cs-unmet` and deleting the area files, because the machinery under the
audited surfaces had moved. **Finding numbers die with their area file**: a
surviving mention describes the finding, never a number that may be reused.

### Areas

An area is a loose unit of reading — a folder, a page, a game — and
`plans/areas/<area>.md` holds its audit (findings, each with its resolution),
its predicted test breaks, its notes, and at the close a summary. **The plan
holds the order** (§3); the area file holds the reading; the folder's
`todo.md` and `doc.md` hold what outlives the sprint. A skeleton is not an
open area.

**AREAS ARE REFERRED TO BY NAME, NEVER BY POSITION** (Joel): §3's table is the
only place a position is written. Everywhere else an area is `club-page` or
"directly after `feedback`", never "area 7".

**Where a note goes:**

- **the folder's `todo.md`** — work OWED to that folder, whenever it turns up.
  Five sections, always all five: Bugs · Soon · Someday · Maybe, then Won't do
  ([docs/common-folders.md](../docs/common-folders.md#every-folder-carries-a-docmd-and-a-todomd)).
- **the area file** — the audit, the findings, the working notes: everything,
  archaeology included, while the area is open.
- **the root `todo.md`** — only work no single folder owns. `docs/deferred.md`
  and the `## Deferred` sections of `docs/games/<game>.md` take no new items;
  every game folder has its own `todo.md`.

**A finding's ID names its area** — `F-feedback-1`, sub-numbered
`F-club-page-6.1` — and numbering restarts at 1 in every area. Use the full ID
inside the sprint and never outside it. Write `§5` for a section of this doc
and `step 5` for a step, never a bare number.

**Dependencies are listed, not audited.** A dependency is stamped `cs-found`,
listed by name in the area file, and left; a file audited in one area can be
fixed in a later one.

### How an area opens, and how it closes

**Opening an area is one thing: LIST ITS FILES AND STOP** (Joel). The output is
the files thought to belong to the area — its own, not its dependencies. **No
stamps, no audit, no reading ahead** until Joel has agreed the list; what
belongs to an area is his to define. A game's roster is `src/<game>/`, its two
SQL files, and `docs/games/<game>.md`.

**An area's first read is its folder's `todo.md`**, so it does not re-derive
what earlier areas already handed it. **Before reading it, drain into it:**
every item for this area in `docs/deferred.md`, and for a game the
`## Deferred` / `## Won't do` of `docs/games/<game>.md`, moves into the
folder's `todo.md` under the section that fits, and is deleted where it was.
Those registers take no new items; they empty as the areas open.

**Then read what moved under it.** The shell keeps changing, so an area's code
was written against a `common/game-page` that may no longer be the one it is
audited against. Read the commits that touched the shell since the game's code
was last written for its own sake — the last commit whose subject opens with
the game's name. Not the last commit to touch the folder: the opening commit
stamps every file, and a shared area's sweep that reached in already brought
the game to the new shape, so either anchor gives an empty or short window.

```sh
since=$(git log -1 --format=%cI -i --grep='^<game>' -- src/<game>/)
git log --oneline --since="$since" -- src/common/game-page/
```

What the window is for is false findings: list what those shell changes made
untrue before writing a single finding.

**An area is committed before the next one opens.** Several commits inside one
area is normal; two areas' work may not share a commit.

**This is not a fence around an area's files.** A fix the reading turned up in
another folder ships with the area that found it — a sweep caused by this
area's rename, a call site moving with a renamed export. The handoff to a
`todo.md` is for work with a DECISION in it, which that folder's area should
make with its files open.

**An area's last two steps:**

1. **Re-read the whole area in one sitting, after its last group.** Each
   group's fixes are verified against that group only, so a claim one group
   disproved can still stand in a sibling file. Every closing re-read so far
   has found more, most of them the area's own fixes writing stale claims next
   door. **The docstring-marker pass belongs here too** (below): prose written
   while working the findings is prose nothing has checked.
2. **Harvest the folder's `doc.md`.** Everything durable the area learned goes
   somewhere that outlives it: a section AFTER the intro (`## Details`, or a
   named one), or a docstring. **`## Intro to area` is not the harvest's
   destination** — it stays a short narrative introducing the area. A folder
   that holds components gets a render tree in Details (who renders it, what it
   renders); `game-page/doc.md` is the model. The folder leaves `INTROS_OWED`
   in `src/guards/folderDocs.test.ts`; anything still owed goes to `todo.md`.

**Those two steps are the last things Claude does. Neither is the close.** An
area is closed when its roster reads `cs-blessed-<area>`, and **only Joel sets
that stamp**. Claude never writes `cs-blessed`, and **"close the area" is not
an instruction to stamp** — a stamp written on an instruction records that Joel
said something, not that he read the file. The check at a close is that every
roster file says `cs-blessed-<THIS area>`: a check for *a stamp being present*
passes on an open area's first day, since its files carry `cs-audited-<area>`.

**Claude does not decide that we are moving on.** Finishing a step is not
permission to start the next one.

### A game area

**Three passes, back to back:**

1. **The restructure** — [playarea-readability.md](playarea-readability.md)
   applied step by step, each step a commit Joel reads, **with the stylesheet
   split**: one CSS module per component, named for it, so `PlayArea.module.css`
   holds only what `PlayArea.tsx` itself wears. The split is by IMPORTER and
   needs no judgment: a module two components import gets split along which
   component reads which class; a class both read stays where both can reach it.
   Rule bodies and `/* @@ */` markers move verbatim; only headers are rewritten.
   The restructure goes first because the audit's prose pass would otherwise
   polish comments the split and the comment pass then rewrite.
2. **The audit** — React, SQL and CSS together, **including the answer
   conversion**: the game's own answers (correct, wrong, near, already guessed,
   and their peer lines) built in its `lib/answer.ts` as the `{ outcome, text }`
   pair [common/feedback/doc.md](../src/common/feedback/doc.md) describes, so
   the pill, the log bar and the peer line read one table. psychicnum's
   `answerMessage()` / `peerAnswerMessage()` is the shape.
3. **Tile feedback** — the board against [tile-feedback.md](tile-feedback.md).

What psychicnum settled about a game's shape is
[docs/playarea.md → The shape of a game's PlayArea.tsx](../docs/playarea.md#the-shape-of-a-games-playareatsx).
Then the two closing steps above, and `docs/games/<game>.md` is deleted into
`src/<game>/doc.md`.

### Durable files never cite the plan, the audit, or a finding

**Every file that outlives the sprint** — `docs/`, a folder's `doc.md` or
`todo.md`, every docstring and comment — may not point at this file, a `§` of
it, a `plans/areas/<area>.md` file, or an `F-<area>-n` ID. The plan and the
area files are deleted when the sprint ends, and a finding ID is worse, since
numbering restarts per area. Say instead the reason in its own words, or the
doc that owns the rule (moving the rule there in the same edit if needed), or
nothing, when the cite was a handoff (a handoff is a `todo.md` item).
`tile-feedback.md` and `dark-mode.md` are tolerated until each folds into a
doc.

### The docstring marker — a pass every area makes

A `/**` docstring is what a reader consults to decide *should I read this,
should I call it*; a note about one field or one line takes `//`
([docs/code-conventions.md → Code clarity & docstrings](../docs/code-conventions.md#code-clarity--docstrings)).
It is applied **per area, not swept**, because telling a method's docstring
from a field note takes a read.

- **A props block is the case this pass keeps missing.** It reads as API
  surface, but it is one declaration, and a note on one prop is a note on one
  member. Much of the app still has it wrong, closed areas included; a blessed
  folder that predates the pass is not precedent.
- **There is no cheap test for it.** Indentation is not the tell; what the
  marker SITS ON is — a whole declaration, or one member of one.
- **The other half:** a paragraph explaining why the implementation is what it
  is belongs on the line it defends, not in the docstring.

### A restart REMOUNTS — assume nothing in a game still has to clear itself

`common.reset_game` bumps `common.games.restarts` and `GamePage` renders
`<PlayArea key={restarts}>`, so a restart unmounts the whole play surface on
every client — a half-typed word, an optimistic row, a mark mid-beat, the refs
inside shared hooks. **A finding that some state survives a restart is wrong by
default**; verify the mount boundary before believing one (it has been filed
wrongly twice). The reverse is quieter: code and comments that still defend
against a restart are dead weight that reads as load-bearing, so check a game
for both when its area opens.

### A narrower `Outcome` type is a finding until proven otherwise

**Any outcome is a valid outcome**, so a type admitting only some is presumed
wrong until its reason is written down and holds, and the same goes for a map
over outcomes. [docs/outcomes.md](../docs/outcomes.md) owns the rule and lists
the subsets that survive.

### Findings are numbered AND slugged

Every finding's heading carries an ID and a slug, with its status in front
when it has one:

```
## F-club-page-26 · `three-wrappers` · Three `.frame` rules, and only one of the
differences is a decision
```

The **ID** never changes; a finding raised later takes the next number. The
**slug** is two or three kebab words naming the SUBJECT, not the verdict, so
it survives either resolution and greps. **In conversation, say both** —
`F-club-page-26 (three-wrappers)` — every time (Joel: *"a little bit more to
read is less disruptive for me than switching context to remember what F99
is."*).

### Broken is expected, and it comes in three kinds

Only what has reached `cs-fixed` has to work; stopping mid-area to repair every
consumer makes the diff unreadable.

| kind | what it is | the rule |
|---|---|---|
| **compile break** | a rename, a newly-required prop; consumers don't build | **We MAY sweep every consumer in the same commit — Joel decides that.** It fits a rename, where the fix is find-and-replace |
| **test break** | it builds; a spec asserts the old shape | **Predict it, write the spec names in the area file, leave it** |
| **behavior break** | it builds and passes, and looks or acts wrong somewhere unreached | **Leave it.** Note it in the owning folder's `todo.md` |

**A sweep is invisible to the stamp model**: a consumer edited by a rename
keeps its stamp, because the stamp answers *has this been read*, not *has this
been edited*. The sweep belongs to the area whose rename caused it.

### Renaming is the point, not a risk

Renaming is what a whole-repo read is FOR, and "that's a lot of work" is not an
argument against one. The stamp is what makes it safe: a rename that breaks
something reaches a file not yet read, and that file's stamp already says so.

## 5. How a value gets converted

**Vocabularies are applied area by area, not swept** (Joel). For each raw value:

- **it equals a vocabulary value → change it silently.**
- **it doesn't → surface it, look at it together, then change it**, by the
  a/b/c rule ([docs/tokens.md → The a/b/c rule](../docs/tokens.md#the-abc-rule--a-value-that-doesnt-fit)):
  add a level, fit an existing one, or keep it bespoke with a written reason —
  *"there is no such thing as 6 bespoke values."*

**Tuned surfaces are exempt**
([docs/naming.md → tuned / justified / locked](../docs/naming.md#tuned--justified--locked)).
The guard is a shrinking allowlist keyed by value
(`src/guards/vocabularies.test.ts`); its `pending` is this sprint's own to-do
list, and an area deletes from it as it converts. **The structural passes are
not color passes**: a value shifting is fine, a value shifting unnoticed is
not. Broad color work is a later pass, and its agenda is
`src/common/themes/todo.md`.

## 6. When a decision won't come — paint it hot pink

**Do not pause mid-step to noodle on one color.** Point it at the marker and
move on — `--UNDECIDED-color: #ff00ff;` — and fix a dozen together later; a
guard fails the build if any token resolves to the marker. **There is no hot
pink for a LENGTH**: snap to the nearest step, keep moving, and write the
objection in the quibble list below, to be settled together at the end.

| raised at | the quibble |
|---|---|
| *(empty — add as the sweep surfaces them)* | |

## 7. Open

- **A guard has to tell bespoke-BY-INTENT from bespoke-by-laziness** (Joel).
  `vocabularies.test.ts` knows two states, converted and `pending`, and
  `pending` means *nobody has looked yet* — which a deliberate bespoke value is
  not. Missing is a third state, marked AT THE DECLARATION with its reason,
  which the guard reads and COUNTS rather than fails on
  (`SelectionList.module.css` already writes the annotation by hand).
- **The vocabulary VALUES are provisional** and get tuned as areas convert.
  `0.4rem` is deliberately absent from the spacer scale: every `0.4` becomes
  `--spacer-4` at its area's pass, and a member gets added only if converting
  one loses something real.
- **Owed to tile-feedback**, until that plan folds: the dim-up rule wants
  restating in light-mode language, and `--tile-disabled-color` cannot be one
  token — a delta frozen into an absolute is right for one starting point, and
  the tile ramp has five.
- **The monospace surfaces** — nine declarations across seven files, none a
  considered decision — are decided once (`setup-form/todo.md`) and applied per
  game, not swept (Joel).
