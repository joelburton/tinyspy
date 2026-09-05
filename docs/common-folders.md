# How `common/` and `shared/` are organized

The app's non-game code lives in two top-level folders under `src/`, and which
one a module is in is a statement about it:

- **`src/common/`** — the shell every game (or every page) is MADE OF: chat,
  the manifest, setup, the club page, the terminal row, feedback, the supabase
  wrappers. A game that lacks one of these is an exception, not a category.
- **`src/shared/`** — a FAMILY: code factored out of two or three games that
  happened to need the same thing. The found-words data model, the two games
  that drag tiles on a grid, the pair with an on-screen keyboard. Most games
  will never import any of it.

The import path is where that distinction is said out loud. `@/shared/bee-games/…`
tells the reader "this is a spellingbee-shaped game"; `@/common/chat/…` tells
them "everybody has this".

## Principles

- **One folder per feature, holding everything about that feature.** `chat/` is
  the panel, its hooks and its stores together. There is no `components/` ·
  `hooks/` · `lib/` split — not at the top, and **not inside a feature folder
  either**. The naming convention carries that distinction on its own:
  leading-cap is a component (`Chat.tsx`), `useX` is a hook (`useClubChat.ts`),
  lowercase is everything else (`chatUnread.ts`), and `.module.css` is a
  stylesheet.
- **A feature big enough to want subfolders splits by sub-feature, not by
  type.** `core-css/patterns/` is the one nesting in the tree, and `patterns`
  names a kind of stylesheet, not a kind of file.
- **Co-located siblings move together.** A component's `*.module.css` and its
  `*.test.tsx` live beside it; treat the pair or triple as one unit.
- **Per-game code is NOT here.** Each game's `PlayArea` / `BoardCol` / `InfoCol`
  / `useGame` lives under `src/<game>/`. A file with exactly one game importing
  it belongs to that game, not to `shared/` — `StrikeMarks` is connections's.
  The deliberate exception is `common/buttons/`, which holds every purpose
  button whoever uses it, because a button is a look (an icon, a default name,
  a tone) and not logic.

### Common never imports shared

The direction is one way:

```
    game  ──→  common          a game is made of the shell
    game  ──→  shared          a game may belong to a family
  shared  ──→  common          a family may use the shell
  common  ──✗  shared          NEVER
```

A shell file importing `@/shared/…` makes every game carry a family's code and
empties the word "common" of meaning — the reader can no longer tell from a
path whether a module is everyone's or three games'. Nothing about it breaks,
which is why it is guarded rather than trusted:
[`src/guards/commonNeverImportsShared.test.ts`](../src/guards/commonNeverImportsShared.test.ts)
fails on any such import, in either spelling.

A family importing another family is fine and unguarded; there is no such edge
today. And `src/shared/` is held to the same cross-game rule `src/common/` is —
eslint blocks it from importing `src/<game>/`.

### Imports use the `@/` alias when they leave their folder

`@/` is the root of `src/` (a `paths` entry in `tsconfig.app.json` /
`tsconfig.node.json` and a matching `resolve.alias` in `vite.config.ts` — both
must change together; neither works alone).

**The scope: alias when the import leaves its own top-level folder, relative
within it.** A game reaching the shell writes `@/common/turn-log/TurnLog`; one
file in `common/chat/` reaching another writes `./chatUnread`; `common/chat/`
reaching `common/supabase/` writes `../supabase/db`. Root files (`main.tsx`,
`App.tsx`, `gametypes.ts`) stay relative — they are in no top-level folder and
never climb `../`, which is the thing the alias exists to kill.

## Where does a new file go?

Read the folder's stated job below and match the file's **job**, not its shape.
The rules that have bitten before:

- **Furniture that every page carries and no page owns** (the top strip) →
  `page-header/`. It isn't home's, club's or game's just because all three
  render it — filing it under any one of them is what let three copies drift.
  **A button that lives in the strip goes here too**, even when what it opens
  lives elsewhere: `ChatButton` and `ScratchpadButton` are header marks, not
  parts of chat or of the scratchpad.
- **Every field is in `fields/`** — including the three only a setup form
  renders today. `fields/` is the repo of fields; the setup dialog is one
  consumer. The form frame itself (`StandardForm`, `formState`) is `forms/`.
- The **in-game move-entry box** is NOT a form field → `word-entry/`. It has no
  `<input>`; it reads keystrokes off the window.
- A **toast** (bottom-right announcement) is NOT feedback → `toasts/`.
  **Feedback** is specifically the near-input validity pill and its
  local/global state.
- A **generic text renderer** (`RichMessage`) is NOT feedback just because an
  error happens to use it → `text/`.
- **A generic primitive is common regardless of how many games use it**
  (`useArrowHistory` has one caller and is still an input helper), and **a game
  mechanic is shared regardless of how many use it** (`RankBar` would still be
  shared if a fourth game grew a rank ladder). Count is not the test; whether
  the family can be NAMED is.

## Every folder carries a `doc.md` and a `todo.md`

Both names are fixed, and the folder supplies the identity. That is the same
rule the rest of the folder runs on: **the name states the kind.** `Chat.tsx`
is a component because it is leading-cap, `useClubChat.ts` is a hook because it
is `useX`, `chatUnread.ts` is lib because it is lowercase — and `doc.md` is the
doc because it is called `doc.md`. A file named `chat.md` would instead read as
a module named chat, which in a folder full of modules named chat is the one
thing it is not.

**Every game folder carries a `todo.md` too** (since 2026-09-05), in the same
shape, so a game has a place for owed work the moment it turns up. A game's
doc stays `docs/games/<game>.md`, which also carries the game's older deferred
items; the two get reconciled game by game as each is audited, not in a sweep.

The shape of both files is fixed too, because they are written one folder at a
time over months and a format that is merely described drifts.
[`src/guards/folderDocs.test.ts`](../src/guards/folderDocs.test.ts) enforces
what is mechanical about it.

### `doc.md` — three fixed elements, then freedom

```markdown
# chat

The club chat panel, end to end: the panel, its data, and the unread mark.
It belongs to no page — ClubPage and GamePage both mount it.

## Design

...why it is shaped this way...

## <anything else>
```

- **The H1 is the folder name**, always. This is what pays for the fixed
  filename: the file is anonymous in a tab bar, so it says its name on line 1.
- **The lede is unlabeled prose, at most three sentences.** No heading above
  it, so it cannot quietly grow into a section. Write it for someone who has
  never opened the folder.
- **`## Design` is required**, even when it is four lines. It explains the area
  at a high level, to someone who does not know it: what problem the folder
  exists for, and how its pieces answer that. **Narrative and jargon-free** —
  paragraphs that follow one another, not a stack of bolded claims. It is
  **not** a tour of the files; the files have docstrings.
- After that, any sections you like — **and that is where technical depth
  goes.** A `## Details` section carries the sharp specifics a reader consults
  once they have the shape (`common/mobile` is the pattern).

**The register to aim for.** Describing a whole GAME this way would take a few
paragraphs, not a chapter: which tables hold its state, whether the frontend
knows the solution, how a turn resolves, and what makes it different from the
other games. That is the altitude — enough that a reader can hold the area in
their head and know where to look next. Everything sharper is a later section or
a docstring.

Two tests for a draft. Read it as if you had never opened the folder: a sentence
that only lands once you already know the answer is not explaining anything, and
belongs in `## Details`. And read the lede again once the Design exists — the
lede written when the folder was created describes it from outside, and usually
wants rewriting the day someone finally explains the folder.

**What does not go in**, which is the half that actually stops the drift:

- **No archaeology.** How it used to work is not useful (CLAUDE.md).
- **Nothing that belongs in a docstring.** Per-function detail lives in the
  file, where it is read.
- **No todo items.** They have a file, one folder over.
- **No restating a canonical doc** — cite it. Where `docs/mobile.md` owns the
  subject, the lede says so and the folder's doc stays short.

### `todo.md` — four fixed sections, in a ramp of certainty

```markdown
# chat — todo

## Bugs

## Soon

## Someday

## Maybe
```

The reason `docs/deferred.md` became a sink is that an item's kind was a matter
of tone. Here the kind is **where the item sits**, so classifying costs nothing
and re-classifying is a move up the file:

| section | what belongs there |
|---|---|
| `Bugs` | wrong today. What is wrong, and how to see it |
| `Soon` | should change, and nothing is blocking it |
| `Someday` | deliberately not now. Probably yes, eventually |
| `Maybe` | an idea. May never happen |

- **All four headings are always present, empty or not.** The skeleton exists
  so that adding the first item is one line rather than a guess at the
  structure — which is how ad-hoc files drift apart in the first place.
- **The order is a ramp of certainty**, so an item that firms up moves *up* the
  file. That is the whole re-classification mechanism.
- **`Bugs`, not `Broken`** — deliberately. The app audit gives "broken" a
  specific meaning while it runs (a compile break, a test break and a behavior
  break each have their own rule), and reusing it here would blur the one word
  that currently has a sharp edge.
- **One bullet per item**, first sentence is the whole item, detail after. It
  states its own reason and **never cites a finding id or an area file**: area
  files are deleted when the sprint ends and their numbering restarts per
  area, so an id would dangle or, worse, come to name something else.
- **A done item is deleted**, not struck through.

**`docs/deferred.md` narrows rather than migrates.** It keeps what crosses
folders; a folder-scoped item moves to that folder's `todo.md` when the folder's
area is audited. No sweep.

## `src/common/`

| folder | what it is |
|---|---|
| `account` | your own menu and profile editing |
| `anagram-finder` | the anagram dialog |
| `auth` | the pre-app screens — sign in, claim a handle |
| `boot` | what `main.tsx` runs before React mounts (`panic`, `reloadOnStaleChunk`) |
| `branding` | the app and per-game logos |
| `buttons` | every purpose button and the `StandardButton` base |
| `chat` | the club chat panel end to end (its header mark is in `page-header`) |
| `club` | the club room and everything on it |
| `core-css` | the stylesheets every page loads, plus `patterns/` |
| `definitions` | click-a-word lookup and dictionary curation |
| `devtools` | pages that ship for the author, not for players (palette, font specimen) |
| `error-page` | the stand-in when a page can't render |
| `faults` | the fault sink and its modal |
| `feedback` | the near-input pill and its local/global state |
| `fields` | every field — the repo of fields, whoever renders them |
| `floating-panels` | the shell every floating thing rides on, and the panels on it |
| `forms` | the form frame and what every form shares that isn't a field |
| `game-page` | the live game's page and what it hands down |
| `home` | the landing page |
| `icons` | every glyph, under the name of what it means |
| `info-sheet` | the info column: its mobile sheet, its switch, the chrome its panels share |
| `invitations` | game invitations |
| `keyboard` | key capture, tab rings, shortcuts |
| `lists` | pick-one and scrolling lists |
| `loading` | the stand-in while a page loads |
| `manifest` | what a game declares — the contract |
| `members` | who someone is, their color, and the disc that shows it |
| `menu` | the one menu, its store, and what a game puts in it |
| `mobile` | the desktop-versus-mobile machinery: the breakpoint, the device hooks, the viewport |
| `move-flash` | flashing the tiles a move changed |
| `outcomes` | the outcome vocabulary — won · lost · near · warning · neutral · noted |
| `page-header` | the top strip and the marks in it |
| `pause-suspend` | pausing, presence-pause, suspend |
| `pdf` | everything about printing a board |
| `realtime` | channels, reconnect, refetch, presence |
| `reveal` | showing the answer after the end |
| `routing` | the hash router and `<Link>` |
| `scratchpad` | the shared notes panel |
| `session` | who is signed in, and their profile |
| `setup-form` | the start-a-game dialog, its sections, and its data |
| `single-flight` | one run of an async action at a time — a second click while the first is in flight is dropped |
| `supabase` | the client, the envelope wrappers, the DB handle |
| `terminal` | what shows when a game ends |
| `text` | inline rich text |
| `themes` | the theme files and the loader |
| `timer` | the game clock |
| `toasts` | the bottom-right stack |
| `tooltips` | the tooltip host |
| `turn-log` | the chronological history readout and its viewer |
| `utils` | simple logic helpers with no feature — plain functions only, no hooks |
| `web-storage` | `localStorage` and `sessionStorage`, wrapped so a browser that blocks them can't throw |
| `word-entry` | the typed-word box and its row |
| `word-list` | the alphabetical finds readout |

**Touch web storage only through `web-storage/storage.ts`.** `localStorage` and
`sessionStorage` *throw* where a browser blocks site data — on the property
access as readily as on the call — so `readStored` / `writeStored` /
`removeStored` wrap every access, and
[`src/guards/rawStorage.test.ts`](../src/guards/rawStorage.test.ts) fails the
build on a raw one outside them. `readStored`'s `whenUnavailable` argument is
required on purpose: storage being *gone* is not the same event as a key being
*absent*, and `reloadOnStaleChunk` is the caller that needs the opposite answer
from everyone else.

## `src/shared/`

| folder | the family | what it is |
|---|---|---|
| `bee-games` | spellingbee, wordwheel | the found-words data model, the game factory, the compete leaderboard, the typed-word look |
| `board-cursor` | bananagrams, scrabble | arrows move a cursor over a board: the reusable key handling plus the letter-grid cursor math |
| `dict-trie` | boggle, scrabble | the flat trie behind boggle's solver and scrabble's suggester |
| `grid-and-drag` | bananagrams, scrabble | dragging a tile to the right place on the grid |
| `onscreen-keyboard` | wordle, wordiply | the on-screen QWERTY |
| `rank-ladder` | the games with a Start..Genius ladder | the ladder, its bar and its stat grid — no data model behind it, so any game with a ladder can take it |
| `word-hunt` | spellingbee, wordwheel, boggle, wordiply | find-words-on-a-board games: the display rows, the reveal, the submit hook |
| `wordle-style` | wordle, waffle | the per-letter color codes of the hidden-target games, on screen (`tileColor`) and on paper (`pdfTiles`) |

## Judgment calls (recorded so they don't get re-litigated)

- **`useCommonGame`** is both game-state and realtime; it lives in `game-page/`
  (its job is "the common game," realtime is the mechanism).
- **`GameLogo`** → `branding/` with the app logo. It's a logo (rendered in the
  game header AND on club cards), grouped with `PuzpuzpuzLogo` by that shape.
- **`RichMessage`** → `text/`. General-purpose; it renders setup errors today
  but its job is inline player-segment text, not feedback.
- **`gameManifest.ts` and `gamePageCtx.ts`** are THE contract a game is written
  against, so they keep dead-obvious paths: the manifest in `manifest/`, the
  context in `game-page/` with the page that builds it. The manifest LIST is
  `src/gametypes.ts` — the one file allowed to import games.
- **`ClubGameDeleteButton`** stays in `club/`, not `buttons/`: it is the card's
  hover trash can with its own two-step confirmation, not a purpose button.
- **`outcomes`** is its own folder, not terminal's. It is read by boards, the
  pills, the feedback layer and `dbResult`; [outcomes.md](outcomes.md) is
  already its doc.
- **`revealWords` stays in `shared/word-hunt`** while `useSolutionReveal` is
  `common/reveal` — reveal is split between common and shared on purpose.
- **`pdfTiles` is the one printer outside `common/pdf/`.** Printing lives in
  one folder deliberately, and this bends that: it takes `TileColor` from
  `wordle-style`, and common may not import a family. It is honestly a
  wordle/waffle file anyway — those two are its only callers. It still reads
  `common/pdf/frame`'s grays, which is a family using the shell, the allowed
  direction. Joel's call, 2026-09-04, when the guard surfaced the edge.
- **`Menu.tsx` + `menuModel.ts`, `FilterSelect.tsx` + `filterSelectHelpers.ts`.**
  A component and a same-named lowercase module cannot share a folder: the
  filesystem is case-insensitive, so `./menu` and `./Menu` name the same file
  and the resolver picks whichever it reaches first. Both lowercase modules
  were renamed rather than the components. **This is the cost of the
  no-type-subfolders rule**, and the next collision has to be resolved the same
  way.

## The rest of `docs/` still cites pre-move paths

Only this file was rewritten with the move, along with every markdown LINK
target that pointed into `src/common/`. **Prose mentions of an old path
elsewhere in `docs/` were deliberately left alone** — they are corrected as
each area of the app audit harvests its folder's `doc.md`. So a sentence
naming `common/lib/game/…` is stale, not a second layout; a link that resolves
is current. Where a file went is in git: `git log --follow` on the new path
finds its history under the old one.

## How this was applied (for the next reorg)

The move was a **`git mv` + import-rewrite codemod** (a throwaway Node script),
not hand work, then verified with `tsc -b` → `vitest` → `vite build` → a
club→game e2e. Gotchas worth knowing if you reorganize again:

- **`vi.mock('…relative…')` paths are NOT `import` statements**, so an
  import-rewriting codemod that only walks import statements misses them — the
  mocks silently stop intercepting and tests fail with "real module ran."
- **`import.meta.glob` keys carry the pattern verbatim**, and are invisible to
  a codemod for the same reason.
- **Paths live outside `src/` too.** `postcss.config.js` names a stylesheet as
  global data, and the Deno edge functions and `supabase/scripts/` import
  `trie`, `envelope`, `mulberry32` and `memberColor` by relative path with an
  explicit `.ts`. None of these is reachable by a pass that walks `src/`.
- **A guard's path list is code.** Twelve files under `src/guards/` name paths
  under `src/common/`; several also encode a SCOPE (`vocabularies` walks the
  shell, `fieldTests` reads one directory) that a move can silently empty.
  Re-path them, then **plant a break in each and watch it fail** — that is the
  only way to know a re-pathed guard still bites.
- **Restart the vite dev server afterward.** HMR caches module resolutions, and
  a rename storm leaves the running server serving 404s for old paths
  (Playwright reuses that server, so e2e breaks until it's restarted).
