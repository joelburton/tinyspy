# App audit — the plan

**THE LIVE SPRINT, and the only one.** An app-wide walk through every area's
React, SQL and CSS together, locking down shared ideas to reduce difference and
code. This file is the plan and the process; it is **not** a record of what
shipped. Anything decided-built-done lives in `docs/` or the owning folder's
`doc.md`, and anything owed to a folder lives in that folder's `todo.md`. The
reasoning archive behind the CSS half is [css-philosophy.md](css-philosophy.md).

**Trimmed to this shape on 2026-09-05**, when the sprint restarted for the
second time (§4 → "The restarts"). Before that it held every decision the sprint
had made; those went to [docs/ui.md](../docs/ui.md),
[docs/code-conventions.md](../docs/code-conventions.md),
[docs/naming.md](../docs/naming.md), [docs/testing.md](../docs/testing.md) and
the folders' `todo.md` files in the same pass, and the plan keeps only what is
still open or still process.

## Where to start

**Every file was `cs-unmet`** on 2026-09-05, when the sprint restarted. The
three areas that had closed — `deep`, `utils`, `game-lib` — went from the table
below with their blessings; Joel: *"it's super-easy for me to rebless things
when we go into an area where i've already seen the files."*

**`utils` is closed** (2026-09-04): ten files `cs-blessed-utils`, eight
findings worked or closed, and a shared `shuffle` written where nine hand-rolled
Fisher–Yates loops had been — those nine callers are a line in seven games'
`todo.md`, to convert as each area opens.

**`icons` is OPEN** (2026-09-04): one code file stamped `cs-met-icons`,
`doc.md`'s lede + Design committed, and eight findings recorded in
`plans/areas/icons.md` — an unused export, archaeology in five comments,
seven stale call-site claims, a "panel" that is a page, three names that say
the picture, no order, the one-importer rule unguarded, and two docs that
describe an older file. Nothing in the code has moved; the findings wait for
Joel's read.

- **§3** is the areas, in order, and the ONLY place an area's position is
  written down.
- **§4** is the process — the stamps, what opening an area means, what "broken"
  is allowed to mean while this runs. Read it before doing anything.
- **§2** is the steps, and where the sprint is in them.

## 1. What this sprint is, and why

It began as CSS. Sixteen games share a great deal and should have little
customized CSS; instead the app exploded into thousands of lines of module CSS
against a few hundred of shared, and the same choice was made in many places
while things with the same meaning were styled differently for no reason. The
root cause (css-philosophy.md) was **unchecked CSS Modules**: containing CSS per
game or per component was almost always wrong, in an app where the games
*should* look alike and the conventions *should* be shared.

Two things followed from measuring it, and they set the priorities:

- **Color is the smaller half.** The common surfaces already referenced color
  and never declared it; the color discipline worked there.
- **Patterns are the bigger win.** The duplication is shapes that have no name
  — every dialog has the same fields / save / cancel / spacing and no class
  says so, so each is rebuilt locally.

Then it grew: the same duplication lives in the React (three pages hand-rolling
one header; a component's parts renamed by every consumer) and in the SQL, and
the sweep reads each file once, so **anything the area needs gets done while it
is open**. That is what "area by area" means, and why this stopped being "the
CSS sprint". Growing is expected, not scope creep — as long as the growth is
organized by area.

**What success looks like:**

- Far less CSS.
- Lots of colors, most predictably computed from a base, so most of theming is
  changing the base and letting the rest follow. **A color should have a
  meaning.**
- What's left in a game's module is **board geometry and brand color.** A
  dialog rule or a button rule still sitting in a game module means we missed
  one. **Crosswords and scrabble are exempted by ruling**: crosswords was
  imported from an implementation written outside this repo and genuinely
  needs a UI unlike any other game's (printed notation, a whole-word cursor
  highlight, a keyboard-required layout); scrabble's premium-square board is a
  different object from a grid of tiles. Don't optimize for them and don't
  measure the sprint by them.
- Every file read once, by Joel, with the reading recorded (§4 → the stamp).

## 2. The steps

| # | step | state |
|---|---|---|
| 1 | this doc | done; trimmed 2026-09-05 |
| 2 | build the theme | **DONE 2026-08-20.** [docs/ui.md → Themes](../docs/ui.md#themes) |
| 3 | rebuild `/palette` | **swatch half DONE 2026-08-20.** The in-situ half — every variant rendered DOING ITS JOB, ink as text, bar in a list row, fill on a tile — is DEFERRED, not skipped: it was built by hand, was wrong about the pill in three ways at once, and got reverted. It returns when the demos can render the REAL components (`<GenericFeedbackPill>`, `<Dot>`, `<TurnLogBar>`, the shared `.tile`), which may mean after those components' areas. An invented example is worse than none — it manufactures evidence about the stylesheet. `/palette` and `/font` are otherwise OUT of the sprint (§3) |
| 4 | the midnight spike | **DONE 2026-08-21.** [dark-mode.md](dark-mode.md) has everything it found; dark mode is not part of this sprint |
| 5 | shallow whole-app pattern pass | **DONE 2026-08-21.** The rules it produced are [docs/code-conventions.md → Patterns](../docs/code-conventions.md#patterns--a-class-a-token-or-a-utility); the patterns still unbuilt are `todo.md` items in `forms`, `floating-panels`, `core-css`, `buttons`, `lists` |
| 6 | homepage · clubpage, with the pattern half of the toolkit | **STOPPED 2026-08-21 on purpose**, because the vocabularies didn't exist yet and every conversion was picking a spacing value by hand. Both pages are re-audited from scratch as areas (§3) |
| 6a | the conversion process + the allowlist guard | **DONE.** §5 and [docs/code-conventions.md → The CSS checklist](../docs/code-conventions.md#the-css-checklist) rule 7 |
| 6b | the vocabularies | **NAMED 2026-08-21, LANDED 2026-08-22.** [docs/ui.md → The non-color vocabularies](../docs/ui.md#the-non-color-vocabularies). Values are provisional and get tuned area by area |
| 6c | the z- layers | **DONE 2026-08-25.** [docs/code-conventions.md → The z- layers](../docs/code-conventions.md#the-z--layers) and [docs/ui.md → Floating panels](../docs/ui.md#floating-panels--five-families-one-shell) |
| 7 | **the areas** | All the remaining reading, run **area by area** — the process is §4, the order is §3. Each area's audit and working notes live in `plans/areas/<area>.md` while it is open. **Areas are named, never numbered** |
| 11 | assets | 17 game logos carry baked color; the wordmark and favicon carry near-whites that fail on a dark page. All of it at once, at the end — doing one per game argues about a tree sixteen times |
| 12 | fold + delete | the allowlists empty; **every `cs-` stamp comes out** (`cs-stamp.mjs unstamp`, then the script and its guard go); `plans/areas/` goes; the non-sprint plans this sprint leans on (`tile-feedback.md`, `tab-rings.md`, `feedback-system.md`, `feedback-design.md`) have folded into `docs/` or a `doc.md`; this doc goes. What `css-philosophy.md` becomes is Joel's call — he wants it kept |

Steps 8, 9 and 10 were folded into 7 on 2026-08-22 and their numbers are
retired rather than reused, so a stale "step 9" reads as stale.

## 3. The areas, in order

**The table is keyed to folders**: pick any file, read its folder, and exactly
one row names it. That is the test two earlier gaps failed (chat's files and
the game scaffolding were on no roster until something needed to be *filed*),
and keying to folders makes it answerable by looking rather than remembering.
**An area may span two or three tiny sibling folders** when they are one
subject, because a one-file area helps nobody. What never happens is the
reverse: no folder is named by two rows.

**The order is by depth, decided 2026-09-05** from the folder-level import
graph (who imports whom across `common/` and `shared/`, and which folders the
games and the root files reach). Two rules, Joel's: **deep-down things
earlier**, so the app is felt coming together from its fundamental parts; and
**what everything needs before what only games need**, so `turn-log` and
`info-sheet` come after `routing` and `boot`. Within a tier, the folder more
things read goes first. Two calls the graph could not make on its own:
`feedback` sits mid-depth (six folders under it, twelve and every game above
it), so it runs once its dependencies are read rather than first as
originally decided; and `manifest` and `game-page` import each other, so one
will list the other as a dependency whichever goes first.

| #  | area | the folders it reads | what it is |
|----|---|---|---|
| | **Foundations** — read by nearly everything, reading nothing | | |
| 1  | `utils` | `utils` | **CLOSED 2026-09-04.** The small general helpers that belong to no page, no game and no subsystem; thirty folders and every game import them |
| 2  | `icons` | `icons` | **OPEN 2026-09-04.** the glyph registry |
| 3  | `web-storage` | `web-storage` | storage that cannot throw, and the sticky-choice hook |
| 4  | `outcomes` | `outcomes` | the outcome vocabulary — [docs/outcomes.md](../docs/outcomes.md) |
| 5  | `single-flight` | `single-flight` | the guard every submit wraps |
| 6  | `mobile` | `mobile` | the one desktop→mobile breakpoint, the device hooks, the viewport. `breakpoints.css` lives here |
| 7  | `routing` | `routing` | the router and `usePath` |
| | **The look, before anything renders** | | |
| 8  | `corecss` | `core-css` · `themes` | the stylesheets every page loads and none owns, and the theme chain |
| 9  | `branding` | `branding` | the app logo, the wordmark, and the `<GameLogo>` that renders a game's. **Not step 11's asset pass** — the 17 logo files live in `src/<game>/`, so that stays one sweep at the end |
| | **The data path and the boot** | | |
| 10 | `supabase` | `supabase` | the client, the wrappers, the envelope. It reaches `faults` for the fault sink; the sink's function is read here and its modal waits for `common-hosts` |
| 11 | `session` | `session` | who is signed in, and their profile |
| 12 | `boot` | `boot` | mounting, the session gate, panic, the stale-chunk reload |
| 13 | `realtime` | `realtime` | presence, reconnect, the subscribe hooks. Presence is what pauses a game and the pause boundary that reads it is `pause-suspend`'s; whichever opens second inherits what the first decided |
| | **The people** | | |
| 14 | `members` | `members` · `text` | who someone is, their color, the disc, and the inline text that renders player segments |
| | **The controls everyone touches** | | |
| 15 | `buttons` | `buttons` | the button taxonomy |
| 16 | `keyboard` | `keyboard` | key capture, tab rings, shortcuts — and [tab-rings.md](tab-rings.md)'s mechanism |
| 17 | `lists` | `lists` | pick-one and scrolling lists — [SelectionList](../docs/ui.md#selection-lists) is the canonical one |
| 18 | `forms` | `forms` · `fields` | the design language of forms: the frame, the state, and every field — including the three only a setup form renders |
| | **Floating things and the root hosts** | | |
| 19 | `floating-panels` | `floating-panels` | the machinery and shared look of every window-like thing that floats over the page. Not the instances |
| 20 | `menu` | `menu` | the one menu, its store, and what a game puts in it |
| 21 | `common-hosts` | `toasts` · `tooltips` · `faults` · `invitations` | **the question is what earns a mount at the root.** Two defensible rules — *wide*: mounted once at the root, driven by a store, because what triggers it is elsewhere (six things qualify); *narrow*: renders other people's content (the three hosts; `GameInvitations` is headless; `EditProfileModal` and `WordEditDialog` are instances that merely live at the root). Either is fine once written down; the narrow one has to say where the other two go. Also to decide: whether the stores come with the components |
| 22 | `root-files` | `main.tsx` · `App.tsx` · `gametypes.ts` | the three files in no folder; the shell holds the route table and what hangs off the root, and is not split. After the hosts, because `App.tsx` is mostly what hangs off the root |
| | **The feedback system** | | |
| 23 | `feedback` | `feedback` · `terminalCopy` (in `terminal`) · `turnCopy` (in `turn-log`) | A redesign, not a tidy: everything between an envelope and a player reading words. [feedback-system.md](feedback-system.md) is what it is, [feedback-design.md](feedback-design.md) is the target. `FailureLine` and its stylesheet sit in the folder and were not on the earlier sixteen-file roster — settle that at the opening |
| | **Page furniture** | | |
| 24 | `page-header` | `page-header` | the top strip and the marks in it — furniture every page carries and no page owns |
| 25 | `definitions` | `definitions` · `anagram-finder` | click-a-word lookup, dictionary curation, and the anagram dialog |
| 26 | `chat` | `chat` | the club chat panel end to end. It belongs to no page: `ClubPage` and `GamePage` both mount it, which is why it is not `club-page`'s |
| 27 | `scratchpad` | `scratchpad` | the shared notes panel |
| 28 | `account` | `account` | your own menu and profile editing |
| | **The pages** | | |
| 29 | `simple-page` | `auth` · `loading` · `error-page` | the pages that are not home, club or game. **The roster's test is "does `App` render it directly?"** — it catches `ErrorPage` and `Loading`, which stand in for a page AND appear inside one |
| 30 | `homepage` | `home` | the landing page after login |
| 31 | `club-page` | `club` | the club page; its `todo.md` carries what step 6 left |
| 32 | `setup-form` | `setup-form` | the start-a-game dialog, its sections, and the recap rows the info column and the PDF share. With the pages because the club page is where a game starts |
| | **The game shell** — needed by games and nothing else | | |
| 33 | `manifest` | `manifest` | the registry and the manifest contract every game fills in |
| 34 | `game-page` | `game-page` | the live game's page and what it hands down — `GamePage`, `gamePageCtx`, `useCommonGame`, the error boundary, the device gate, the mount points. It imports 23 folders, which is why it comes after them |
| 35 | `info-sheet` | `info-sheet` | the info column: its mobile sheet, its switch, and the bordered panel its readouts wear |
| 36 | `timer` | `timer` | the game clock |
| 37 | `pause-suspend` | `pause-suspend` | pausing, presence-pause, suspend |
| 38 | `turn-log` | `turn-log` | the chronological history readout and its viewer. `turnCopy` is here but `feedback` owns its words |
| 39 | `word-list` | `word-list` | the alphabetical finds readout — common, not a family's: it takes its rows as a prop |
| 40 | `word-entry` | `word-entry` | the typed-word box and its row. No `<input>`; keystrokes come off the window |
| 41 | `terminal` | `terminal` | what shows when a game ends. `terminalCopy` is here but `feedback` owns its words |
| 42 | `reveal` | `reveal` | showing the answer after the end — and [the reveal-solution taxonomy](../docs/deferred.md) it has to build |
| 43 | `move-flash` | `move-flash` | flashing the tiles a move changed. **Read [tile-feedback.md](tile-feedback.md) here**, not only per game — this is the mechanism that pass is about |
| 44 | `pdf` | `pdf` | printing a board — the frame, the columns, the marks. [docs/pdf.md](../docs/pdf.md) is already its doc |
| | **The shared families** | | |
| 45 | `dict-trie` | `shared/dict-trie` | the shared dictionary trie |
| 46 | `rank-ladder` | `shared/rank-ladder` | the Start..Genius ladder, its bar and its stat grid |
| 47 | `board-cursor` | `shared/board-cursor` | arrows move a cursor over a board. [keyboard-nav-plan.md](keyboard-nav-plan.md) would add five games to it |
| 48 | `wordle-style` | `shared/wordle-style` | the per-letter color codes of the hidden-target games, on screen and on paper |
| 49 | `onscreen-keyboard` | `shared/onscreen-keyboard` | the on-screen QWERTY |
| 50 | `grid-and-drag` | `shared/grid-and-drag` | dragging a tile to the right place on the grid |
| 51 | `bee-games` | `shared/bee-games` | what spellingbee and wordwheel share and nothing else does. **The name is a placeholder** |
| 52 | `word-hunt` | `shared/word-hunt` | find-words-on-a-board games |
| | **The games** | | |
| 53 | per game, one area each | `src/<game>/` | **Sixteen areas**, keyed by CODENAME. Two passes back to back: the audit — React, SQL and CSS together — then the **tile-feedback** pass against [tile-feedback.md](tile-feedback.md). `psychicnum` first, as the control: the deliberately minimal toy, so what it settles is about the shape of a game area rather than about the game |

**`common/devtools` is on no row, deliberately.** `/palette` and `/font` are
ABSOLUTELY EXCLUDED (Joel, 2026-09-02: *"Do not read them, do not edit them, do
not touch them."*). They are instruments whose audience is Joel, and there is no
user to make them consistent for. **The exclusion covers findings ABOUT them,
not just the files** — a finding about when those routes render is a finding
about those routes.

**The three root files are the one case where "keyed to folders" needs a row
of its own.** `App.tsx` is a shell — the route table and what hangs off the
root — and it does not get split into per-page pieces; the boot/routing line is
a scope line for the audit, not one the code owes anyone.

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
| `cs-met` | **on an open area's agreed roster** — an area is being done for it | Claude, when Joel agrees the roster |
| `cs-audited` | an audit for it exists in `plans/areas/<area>.md` | Claude |
| `cs-partial` | some findings resolved; it names which are outstanding and where | Claude |
| `cs-fixed` | every finding resolved | Claude |
| `cs-blessed` | **Joel read it himself** | **only Joel** |
| `cs-na` | in the tree, deliberately not read | either |

**A judgment stamp names the area that made it**, as a suffix:
`cs-met-feedback`, `cs-audited-club-page`, `cs-blessed-forms`. `cs-unmet` and
`cs-na` stay bare. It answers a question only the file itself can answer —
Joel: *"hey, when did I approve this? should I revisit it now that we're
elsewhere in the sprint?"* — and a claim with no author cannot be re-examined.
**The suffix is not guarded, deliberately**: validating the area would need a
manifest, and a manifest rots on the renames this sprint does constantly, while
a stamp reading `cs-blessed-dialogs-and-forms` after that area split still
answers the question right. The cost, stated plainly: a typo'd area passes
silently.

**`cs-fixed` and `cs-blessed` are different claims.** "Claude found nothing"
and "Joel actually read it" are not the same statement, and the sprint's real
exit criterion is the second one.

**There is no ladder to walk.** The stamp is the latest true statement about a
file, not a position in a sequence. A file can go `unmet` → `audited` in one
sitting, and — the load-bearing half — **a dependency at `cs-found` stays there
until an area is scheduled for it. Being found is not a claim on attention.**

**`cs-found` means one specific thing, and reading is not it** (Joel): *"'found'
marks 'we came across this organically while exploring that area' — this helps
us make sure a page will be audited in an area. Reading-needed-for-research
isn't 'found'."* A file the area DEPENDS ON gets the stamp, because that is how
something downstream of an audited surface eventually gets an area of its own.
A file opened as EVIDENCE — compared against, measured, quoted — does not,
however carefully it was read.

**`cs-found` and `cs-met` are different claims too.** `found` says *this
deserves an area*; nobody owes it anything. `met` says *this HAS an area, and
the area is open*; somebody is coming for it. Neither means read.

`scripts/cs-stamp.mjs` does the work (`stamp` · `unstamp` · `tally` · `list` ·
`set`; `splitStamp()` splits state from area at the first hyphen, which is why
an area name may contain as many as it likes) and owns the scope: **what git
tracks**, in `src/` `e2e/` `supabase/` `scripts/`, in a language with a
first-line comment. Assets and puzzle data have nowhere to put a comment, so
they are step 11's. `src/guards/csStamps.test.ts` fails on a file with no stamp
(which is every NEW file) or a word outside the eight, and prints the tally.
Stamping a migration is safe (`schema_migrations` keys on `version` with no
checksum), and `stamp` / `unstamp` are exact inverses, proved by round-tripping
every file.

### The restarts

**2026-09-02.** Sprints nested inside this one — the error/envelope sprint above
all — rebuilt machinery underneath every surface already audited, so the three
finished audits were deleted and every stamp went back to `cs-unmet`. An audit
of a surface whose foundation moved afterwards describes an app that no longer
exists, and keeping one invites the worst outcome: treating it as current.

**2026-09-05.** The `src/common/` restructure rekeyed the areas table to folders,
and the three areas that had closed (`deep`, `utils`, `game-lib`) were keyed to
folders that no longer exist and spanned parts of a dozen current ones. Rather
than special-case "done but not complete", **every stamp went back to
`cs-unmet` again, every old area file was deleted, and this plan was trimmed
to the plan.** What those area files held that still mattered went to the
owning folder's `todo.md`; what the plan held that had shipped went to `docs/`.
Joel: *"starting with the areas empty and from the top will be less confusing
than special-casing 'done but not complete'."*

**Finding numbers die with their area file.** Each area regenerates from
`F-<area>-1`, so an old number would come to name a different finding. A
surviving mention describes the finding and names the audit it came from,
never a number that will be reused.

### Areas

An area is a loose unit of reading — a folder, a page, a game.
`plans/areas/<area>.md` exists for every area from the start, as a skeleton
(Joel, 2026-09-05: *"this gives us a place to drop things — for example, if
we forward-fix an area, we'll already have a place to put that"*), and holds
its audit (findings, each with its resolution), its predicted test breaks,
and its notes — the things worth remembering about an area that are neither a
finding nor owed work. **The plan holds the order** (§3); the area file holds
the reading; the folder's `todo.md` and `doc.md` hold what outlives the
sprint, and a note here never stands in for either. A skeleton is not an open
area: opening is still "list the files and STOP".

**AREAS ARE REFERRED TO BY NAME, NEVER BY POSITION** (Joel): *"the ordinal
numbers of the areas will move as we go through them. Do not put this kind of
stuff in other pages."* §3's table is the ONLY place an area's position is
written down. Everywhere else — area files, docs, commit messages, conversation
— an area is `club-page` or "directly after `feedback`", never "area 7".
Adding an area or reordering the list touches §3 and nothing else.

**Where a note goes — one of three places:**

- **the folder's `todo.md`** — work OWED to that folder, whenever it turns up
  and whoever finds it. Four sections, always all four, in a ramp of certainty:
  Bugs · Soon · Someday · Maybe
  ([docs/common-folders.md](../docs/common-folders.md#every-folder-carries-a-docmd-and-a-todomd)).
  This is the durable home, and it is where an area starts reading when it
  opens.
- **the area file** — the audit, the findings, the record of what the sprint
  did here, and the working notes. Everything, including archaeology, while the
  area is open; nothing that has to outlive it.
- **the standing register** — `docs/games/<game>.md` → Deferred for a game,
  `docs/deferred.md` otherwise — only for something genuinely OUT of the
  sprint's scope, added deliberately and by name.

The split is by *whose work it is*, not by whether it is finished.

**A finding's ID names its AREA: `F-feedback-1`, `F-club-page-7`**,
sub-numbered `F-club-page-6.1` when one finding grows a list of its own.
Numbering restarts at 1 in every area. Use the full ID everywhere the finding
is referred to inside the sprint — the area file, conversation, a commit
message — and never outside it (below). This doc has sections AND steps, so
write `§5` for a section, `step 5` for a step, and never a bare number for
either.

**Dependencies are listed, not audited.** Reading the homepage is the first
time the page header appears; auditing it there would hand Joel a list nobody
can hold in one sitting. So a dependency is stamped `cs-found`, listed by name
in the area file, and left. **The stamp tracks the file, the plan tracks the
area**: a file audited inside one area can be fixed inside a later one.

### How an area opens, and how it closes

**Opening an area is one thing: LIST ITS FILES AND STOP** (Joel). The whole
output is the files thought to belong to the area — its OWN files, not the
things they depend on. **No stamps, no audit, no reading ahead**, until Joel
has agreed the list. What counts as "the homepage area" is Joel's to define,
and stamping first means the disagreement arrives *after* the audit exists — a
list of findings about files he would have excluded, which is exactly the
drowning this process is built to prevent. A game's roster is `src/<game>/`,
its two SQL files, and `docs/games/<game>.md`.

**An area's first read is its folder's `todo.md`**, so it does not start by
re-deriving what earlier areas already handed it.

**An area is committed before the next one opens.** Several commits inside one
area is normal; **no commit spans two areas.** The one exception: a sweep
caused by this area's rename ships with this area.

**An area's last two steps, as steps and not as habits:**

1. **Re-read the whole area in one sitting, after its last group.** Each
   group's fixes are verified against that group and not against the rest, so
   a claim one group disproved can still stand in a sibling file, and a count
   one group corrected gets re-written by the next. The one closing re-read the
   sprint has done found eleven findings that six group passes had not — most
   of them the area's own recorded faults recurring in prose written that
   week.
2. **Harvest the folder's `doc.md`** (Joel, 2026-09-04). Everything durable and
   important the area learned has to be somewhere that outlives it — the
   `doc.md`'s Design, or a docstring or comment in the code, whichever is the
   better home — and its row comes off `DESIGNS_OWED` in
   `src/guards/folderDocs.test.ts`. Anything still owed goes to `todo.md`. The
   area file is then a record of the reading and nothing more.

**Claude does not decide that we are moving on.** Finishing a step is not
permission to start the next one, and that includes the sprint's own setup.

### Durable files never cite the plan, the audit, or a finding

**Ruled 2026-09-05, and it applies to every file that outlives the sprint:
`docs/`, a folder's `doc.md` or `todo.md`, and every docstring and comment in
code.** None of them may point at this file, at a `§` of it, at a
`plans/areas/<area>.md` file, or at an `F-<area>-n` finding ID. Joel: *"the
plan is a transient asset for the sprint"*, and *"F-numbers … go away after the
sprint."* A shipped plan is deleted (CLAUDE.md → Plans) and an area file is
deleted with it, so a cite into either is a dangling pointer with a known
expiry; a finding ID is worse, because every area's numbering restarts at 1.
The link guard catches a dead *path*; it cannot catch a `§20` or an `F-deep-11`
written in prose.

What a durable file says instead:

- **the reason, in its own words.** If the words are already there, the cite
  was a courtesy and just goes.
- **the doc that owns the rule** — `docs/ui.md → The grammar`. When the rule
  has not reached a doc yet, moving it is part of the same edit.
- **nothing**, when the cite was a handoff to an area that has not opened. A
  handoff is a `todo.md` item.

The non-sprint plans — `tile-feedback.md`, `tab-rings.md`, `dark-mode.md`,
`css-philosophy.md`, `feedback-system.md`, `feedback-design.md` — are the
exception only until each folds into `docs/` or a `doc.md`; a cite to one of
them is tolerated today and repointed the day it folds.

### The docstring marker — a pass every area makes

Joel, reading `dbLog.ts`: a `/**` docstring is what a reader consults to decide
*should I read this, should I call it*; a note about one field or one line is
a comment and takes `//`. His editor lights `/**` up, so a field note written
with it reads as "you must read this first" and the signal that tells him what
to read is gone. The rule lives in
[docs/code-conventions.md → Code clarity & docstrings](../docs/code-conventions.md#code-clarity--docstrings);
this is the note that it gets applied **per area, not swept**. Separating a
method's docstring from a field note takes a read per file, which is what an
area already does.

### Findings are numbered AND slugged

Every finding in an area file gets an ID and a slug, written together as its
heading, with its status in front when it has one:

```
## F-club-page-26 · `three-wrappers` · Three `.frame` rules, and only one of the
differences is a decision
```

The **ID** is the address: it never changes, and a finding raised after the
audit takes the next free number rather than a sub-number. The **slug** is the
hook (Joel): two or three kebab words naming the SUBJECT rather than the
verdict, so it survives the finding being resolved either way, and written once
and reused verbatim so it is greppable. A new finding gets a slug when it is
written, no exceptions. **In conversation, say the ID AND the slug** —
`F-club-page-26 (three-wrappers)` — every mention: *"a little bit more to read
is less disruptive for me than switching context to remember what F99 is."* A
slug may be renamed if the subject genuinely changes, never silently.

### Broken is expected, and it comes in three kinds

The app does not need to work until the sprint ends; only what has reached
`cs-fixed` should. Stopping mid-area to repair every consumer makes the diff
unreadable and is how both of us lose the thread. But "broken" covers three
different things and they get three different rules.

| kind | what it is | the rule |
|---|---|---|
| **compile break** | a rename, a newly-required prop; consumers don't build | **We MAY sweep every consumer in the same commit — and Joel decides that, not Claude.** The case it fits is a rename, where the fix is find-and-replace and keeping `tsc -b` alive is worth it for the area we're standing in |
| **test break** | it builds; a spec asserts the old shape | **Predict it, write the spec names in the area file, leave it.** The diff against that prediction is what tells us we broke something we didn't expect |
| **behavior break** | it builds and passes; it looks or acts wrong somewhere we haven't reached | **Leave it.** Note it in the owning folder's `todo.md` |

**A sweep is invisible to the stamp model** (Joel). When we do fix the consumers
of a rename, those files are edited and **their stamps do not move** — a
`cs-unmet` file stays `cs-unmet`. The stamp answers *has this been read*, not
*has this been edited*; a find-and-replace involves no reading and produces no
knowledge. It is also why such a commit doesn't break "no commit spans two
areas": the sweep belongs to the area whose rename caused it.

### Renaming is the point, not a risk

A lot of renaming happens here — it is what a whole-repo read is FOR, and
"that's a lot of work" is not an argument against one. The stamp is what makes
it safe: a rename that breaks something reaches a file we have not read yet,
and that file's stamp already says so.

## 5. How a value gets converted

**Vocabularies are not swept in; they are applied area by area** (Joel). When
an area is being converted, for each raw value in it:

- **it equals a vocabulary value → change it silently.** Nobody chose `4px`
  over `--radius-sm`; they're the same number.
- **it doesn't → surface it, look at it together, then change it.** Almost
  every near-miss was picked at a different time by a different hand, not
  decided. Asking once, in context, is how we find the few that were. What
  the answer may be is the a/b/c rule
  ([docs/ui.md → The a/b/c rule](../docs/ui.md#the-abc-rule--a-value-that-doesnt-fit)):
  add a level, fit an existing one, or keep it bespoke with a written reason —
  and *"there is no such thing as 6 bespoke values."*

This is why there is no up-front adoption pass: you cannot fit the near-misses
to a scale without looking at them, and looking at all of them at once is the
forest-for-trees failure §6 exists to prevent. **Tuned surfaces are exempt**
([docs/naming.md → tuned / justified / locked](../docs/naming.md#tuned--justified--locked)).

**The guard is a shrinking allowlist keyed by value**
(`src/guards/vocabularies.test.ts`): a file not yet converted is on the list
and silent; a converted value that regresses fails; a new file fails
immediately. Its `pending` is the sprint's own to-do list, and an area deletes
from it as it converts.

**The structural passes are not color passes.** A few values shifting is fine
and expected; what is not fine is a value shifting without anyone noticing.
Every move is recorded, decided, or marked (§6). Broad color tinkering is a
separate later pass, and its agenda is `src/common/themes/todo.md`.

## 6. When a decision won't come — paint it hot pink

**Do not pause mid-step to noodle on one color.** If a value can't be snapped
to an obvious existing one, point it at the marker and move on:

```css
--UNDECIDED-color: #ff00ff;
```

Better to see a screaming page and fix a dozen of them together, thoughtfully,
than to stall a structural pass on a single hue. `/palette` makes them
impossible to miss, and a guard fails the build if any token resolves to the
marker, so none can ship.

**There is no hot pink for a LENGTH.** A wrong hue is loud and harmless; an
absurd border-width breaks the layout and a plausible one is invisible. So the
non-color vocabularies get the other half of the same discipline — **snap to
the nearest step, keep moving, and write the objection down here.**

**The quibble list.** Anything a surface's conversion made you want to argue
about, recorded when it comes up and settled together at the end, when there is
a whole app to look at rather than one screen. The failure this prevents:
"don't quibble" quietly meaning "your objection evaporated".

| raised at | the quibble |
|---|---|
| *(empty — add as the sweep surfaces them)* | |

## 7. Open

- **A guard has to tell bespoke-BY-INTENT from bespoke-by-laziness** (Joel).
  The vocabularies exist to answer *"are we going crazy-stupid with bespoke
  numbers?"* and *"before I make up a value, should I check whether it fits a
  vocabulary?"*, and neither requires bespoke to be rare — boards are almost
  always bespoke, correctly. Today `vocabularies.test.ts` knows two states,
  converted and `pending`, and `pending` means *nobody has looked yet*, which
  is exactly what a deliberate bespoke value is not. What is missing is a third
  state, marked AT THE DECLARATION with its reason, which the guard reads and
  COUNTS rather than fails on. `SelectionList.module.css` already writes the
  annotation by hand for its row padding; nothing reads it. **Due before the
  first game area**, since that is where the count either stays legible or
  stops meaning anything.
- **The vocabulary VALUES are provisional** and get tuned as areas convert.
  `0.4rem` is deliberately absent from the spacer scale: it and `0.5rem` are
  the two most-used values in locked surfaces, which is what
  difference-without-distinction looks like, so every `0.4` becomes
  `--spacer-4` at its area's pass, and if converting one loses something real
  that is when a member gets added.
- **Owed to tile-feedback**, and it stays here until that plan folds: the
  dim-up rule wants restating in light-mode language, and
  `--tile-disabled-color` cannot be one token — a delta frozen into an
  absolute is right for exactly one starting point, and the tile ramp has
  five.
- **The monospace surfaces** — nine declarations across seven files, none a
  considered decision — are decided once (`setup-form/todo.md`) and applied
  per game, deliberately NOT swept (Joel).
