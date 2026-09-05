# Restructuring `src/common/` — an idea, not a plan yet

> # ⚠️ THIS FILE DOES NOT DESCRIBE THE APP
>
> **Nothing below exists.** There is no `src/shared/`, there are no feature
> folders, and no doc has moved out of `docs/`. `src/common/` is laid out
> exactly as [docs/common-folders.md](../docs/common-folders.md) says, and that
> doc stays authoritative until this idea is agreed, scheduled and shipped.
>
> This is a **conversation record**: Joel's goals, restated so we both read them
> the same way, plus Claude's reflections on them. It is not queued behind
> app-audit, it has no area, and no other doc or plan should cite it as a
> target. If you arrived here from a search, treat everything past this box as
> hypothetical.

Written 2026-09-04 from a session that was explicitly exploration only.

**A word about the word "feature".** In this file a *feature* is a unit of the
app's own code — chat, the info sheet, setup, the turn log — the thing a folder
would be named for. That is NOT the sense [docs/features.md](../docs/features.md)
uses: there, a "feature" is a property that makes games similar to each other
(primary input, hidden-solution machinery, has hints). The two overlap only on
the shared side, where a family of games that resemble each other is also a
family of code. Don't build the feature-folder vocabulary from features.md.

## 1. Joel's goals, restated

The layout of `src/common/` was designed when it was small. It has grown to
roughly 500 files across some 50 folders, and the structure no longer helps the
way it once did. Four changes are on the table. They are an **organizational**
restructure, not a code refactor: files move and imports follow, but no
function changes.

**1. Separate "common" from "shared".** Two different kinds of thing live under
one name today:

- **Common** — the shell every game (or every page) builds on: chat, the
  manifest and page context, setup, the club page, the terminal row, feedback,
  the supabase wrappers. A game is *made of* these.
- **Shared** — code factored out of two or three games because they happened to
  need the same thing: the trie, the found-words machinery of spellingbee /
  wordwheel / boggle, the grid-cursor and drag code of bananagrams / scrabble.
  A game *may use* these, and most games never will.

The proposal is a top-level sibling, `src/shared/`, so the import path itself
says which kind a module is.

**2. Organize by feature, not by type.** Today the top split is
`components/` · `hooks/` · `lib/`, and each of those then has the *same* domain
subfolders (`chat/` appears in all three). That scatters one feature across
three trees. Some type placements are also arbitrary — nine files in `lib/`
export hooks. The proposal is one folder per feature holding everything about
that feature. Whether a feature folder should itself be split into
components / hooks / lib is **open, and Joel has no opinion yet**: the naming
convention (leading-cap components, `useX` hooks, lowercase lib, `.md` docs)
may already do that job.

**3. Break up the `game/` catch-alls.** `components/game/`, `hooks/game/` and
`lib/game/` have each become the place a thing goes when it's about "a game",
which is nearly everything. They should split along real feature lines.

**4. Put focused docs beside the code.** (Joel's point 5.) `docs/` holds a lot
that's good, but several files are so long and cover so much ground that they
are hard to read. Once feature folders exist, each can carry a short `.md`
explaining that one feature at a high level — how chat works, say — and the
giant docs shrink to what is genuinely cross-cutting.

**What Joel is explicit about.** Deciding what is common versus shared, and what
is big enough to deserve a feature folder, takes human judgment and is his call.
The output of this exploration is therefore a set of proposed classifications
for him to rule on, not a move.

## 2. Evidence gathered in the session

All of it comes from reading the import graph: for every module under
`src/common/`, which of the sixteen game folders import it. Test files were
excluded; imports from `common/` into itself and from `src/guards/` were not
counted as game importers.

**The distribution is bimodal.** About 45 modules are imported by every game or
all but one. About 63 are imported by one, two or three games. The 40 or so in
between are where the judgment lives (see §4).

**The low end is not a grab bag — it clusters into named families**, and each
family is spread across four or five type folders today:

| family | games | files today |
|---|---|---|
| found-words | spellingbee, wordwheel, boggle | `makeFoundWordsGame`, `foundWords`, `foundWordsDisplayRows`, `foundWordsLeaderboard`, `rankLadder`, `revealWords`, `RankBar`, `Stats`, `WordList`, `groupTiles`, `pdf/wordListBody`, `pdf/wordSections`, `typedWord.module.css`, `foundWordsPlayArea.module.css` |
| grid-and-drag | bananagrams, scrabble | `gridCursor` (lib + css), `useBoardCursorKeys`, `useDragGesture`, `dragGhost.module.css` |
| hidden-target color | waffle, wordle | `tileColor`, `pdf/tiles` |
| move-flash | connections, psychicnum, waffle, wordle | `useTurnStartFlash`, `useMoveCausedChange`, `feedbackTiming` |
| dictionary solvers | boggle, scrabble | `trie`, `mulberry32` |
| on-screen keyboard | wordle, wordiply | `GuessKeyboard` |

**Eight buttons in `components/buttons/` are used by exactly one game**:
EndTurn (codenamesduet); Peel, WordCheck, ZoomFit (bananagrams); Exchange,
Pass, SharePreview, SubmitWithScore (scrabble). They are there because the
folder's rule is "every purpose button". Claude first read that as a catch-all
in miniature; Joel ruled the opposite (§4): a button is a look, not logic, so
the folder is right to hold them all.

**The `game/` folders confirm goal 3.** `components/game/` has about 25 files at
its root, `hooks/game/` 15, `lib/game/` 20. Inside them are recognizable
sub-features: the info sheet, the turn log and history viewer, the terminal row
and celebration, pause and suspend, the setup rows, the pills, entry,
invitations, solution reveal, the status label, and the page shell itself.

**The audit already partitioned this code by feature.** `plans/areas/` holds
one file per app-audit area, and most of them ARE feature names: chat,
club-page, feedback, floating-panels, forms, homepage, shared-game-chrome. The
areas that got *type* names instead — `hooks`, `utils`, `game-lib` — are where
the folder tree forced the audit to cut by type.

**The hooks-in-`lib/` puzzle has a principled answer.** The nine `lib/` files
that export a hook are stores: a module-level store plus its subscribe hook,
shipped together, where the store is the thing and the hook is its React face.
So `lib/` was meant to mean "not React-owned". But that guarantee has already
leaked — nineteen files under `lib/` import React — so the split no longer
buys what it was for.

**The current layout is path-coupled.** Twelve guard files under `src/guards/`
name explicit paths under `src/common/`, and the notes from the last reorg
(docs/common-folders.md → "How this was applied") record that `vi.mock()` path
arguments are invisible to an import-rewriting codemod.

## 3. Claude's reflections

**The restructure is sound, and the current layout defends less than it looks
like it does.** docs/common-folders.md's own first principle is "organized by
feature-domain"; the type split sits on top of that, and its rule that "the same
domain name recurs across the three layers" is the workaround for the split, not
a reason for it. Feature folders make the echo unnecessary. Nothing the by-type
layout offers is lost: `components/` as "find all the buttons" survives because
buttons, fields and floating-panels are features in their own right.

**Make `shared/` a sibling, not `common/shared/`.** An import from
`@/shared/found-words/` tells the reader "this is a found-words game"; one from
`@/common/` says "every game has this". Nesting shared under common muddles the
word that is doing the work.

**Draw the common/shared line by NAME, not by count.** A count rots as games
are added (the repo's own rule about tallies). The test that holds up: a module
is **shared** when it belongs to a family of games that can be named — "the
found-words games", "the games that drag tiles on a grid" — and **common** when
a game lacking it is an exception rather than a category. (docs/features.md
happens to name some of those game families, which is a convenience for the
shared side only; it is not where feature-folder names come from.) By that test `useCaptureKeys` is common although only five
games grab bare keys, and `RankBar` is shared even if a fourth game grew a rank
ladder. A corollary: **generic primitives are common regardless of importer
count** (`useArrowHistory` has one user today and is still a generic input
helper), and **game mechanics are shared regardless of importer count**.

**A "shared" thing with ONE user is not shared — it belongs to the game.**
`StrikeMarks` (connections only) should move into connections rather than into
`shared/`. The rule has one deliberate exception, ruled below: the purpose
buttons stay together in one folder whoever uses them, because a button is a
look (an icon, a default name, a tone) and not logic — all of them wrap
`StandardButton` and none calls a hook, reads a store or touches an RPC. And a
one-user MECHANISM is still common: `DeviceBlockNotice` and
`useGameHasKeyboard` are the manifest's device and keyboard gates, which
bananagrams happens to be the only game to trip today.

**Don't recreate components/hooks/lib inside a feature folder.** It reproduces
the current problem one level down, and the naming convention already carries
the distinction. A feature big enough to want subfolders — the game-page shell —
should split by sub-feature, not by type.

**The shell contracts keep a dead-obvious path.** `gameManifest.ts` and
`gamePageCtx.ts` earned their `lib/` root placement by being THE contract; in a
feature layout they still deserve a top-level home, not burial inside a
`game-page/` folder.

**Docs: split the surface docs, keep the cross-cutting ones.** The docs that
move beside code are the ones scoped to a feature. `docs/playarea.md` is
really an info-sheet doc, a turn-log doc, an entry doc and a board-sizing note;
`docs/ui.md` is buttons plus floating-panels plus feedback plus the color
system. The ones that stay in `docs/` are cross-cutting by nature: naming,
code-conventions, envelopes, outcomes, states, win-lose, testing, features,
mobile. Two consequences to decide up front:

- The per-game docs in `docs/games/` fall under the same logic and would move
  into each game's folder — or the rule gets a stated exception.
- CLAUDE.md's doc table becomes a pointer to an index, since what it indexes
  stops being one folder.

**The one benefit of the current layout Joel had not named is really a cost.**
Path coupling. The by-type layout has been stable long enough that a lot of
the repo's self-checks were written against it. The move is therefore a codemod
+ a guard-path pass + a mock-path pass, and each guard is worth planting a break
in afterward to prove it still bites.

## 4. Rulings so far (Joel, 2026-09-04)

Not everything is decided, and it doesn't need to be yet. These are the calls
made on the first-pass classification; they are the taste the rest gets
measured against.

**The rule.** Shell furniture or a generic primitive is **common**, whatever
its importer count. A family of games that can be named is **shared**. One
user means the file belongs to that game — except buttons (below).

**Clearly shared — the families.**

- found-words (spellingbee, wordwheel, boggle): `makeFoundWordsGame`,
  `foundWords`, `foundWordsDisplayRows`, `foundWordsLeaderboard`, `rankLadder`,
  `revealWords`, `RankBar`, `Stats`, `WordList`'s helpers `useWordListFilter`
  + `useRecentlyFound`, `groupTiles`, `wordListBody`, `wordSections`,
  `wordColumns`, the typedWord + foundWordsPlayArea stylesheets
- grid-and-drag (bananagrams, scrabble): `gridCursor` + its stylesheet,
  `useBoardCursorKeys`, `useDragGesture`, the dragGhost stylesheet
- hidden-target color (waffle, wordle): `tileColor`, `pdf/tiles`
- move-flash (connections, psychicnum, waffle, wordle): `useTurnStartFlash`,
  `useMoveCausedChange`, `feedbackTiming`
- dictionary trie (boggle, scrabble): `trie`
- on-screen keyboard (wordle, wordiply): `GuessKeyboard`

**Clearly common, and how it folders.**

- **Both info-column readouts are common**, not shared: the turn log (TurnLog,
  TurnLogActor, ActorMention, useHistoryViewer, useTurnLogPlayerPicker,
  turnCopy, TurnStatusLine, the historyViewer stylesheet) AND `WordList`.
  Sixty percent of games use one and forty the other; neither is a family.
- **Buttons stay together in one folder**, including the eight used by one
  game each (EndTurn; Peel, WordCheck, ZoomFit; Exchange, Pass, SharePreview,
  SubmitWithScore) and the ones that name a mechanic (Hint, Spoiler, AI).
  They are a look, not logic — see §3.
- **Icons are their own folder**, separate from buttons.
- **Small primitives are each their own folder**, not one "primitives" bucket:
  toasts, tooltips, text (Dot, RichMessage), lists (SelectionList,
  SimpleScrollableList, FilterSelect), loading-and-errs.
- **Setup and the fields stay together.** SetupCoopStyleSection,
  SetupNextPuzzleSection and ManualBoardField go with the other fields,
  something like `common/fields/`, not with the feature each configures.
- **Scratchpad is its own feature, in common** — it will reach more games over
  time, which makes it common rather than shared.
- **The pages for the palette and the font specimen** go in a dev-tools
  folder (`devtools/` or `design-tools/`), not among app features.
- Util, routing, themes, patterns, the root CSS, branding and the test helpers
  are common and become separate folders; the exact split is not decided.
- The rest of the first-pass common list stands as proposed: auth + session,
  home, club, account, chat, page header + menu, floating panels, feedback,
  definitions, the game-page shell, invitations, info sheet, terminal, entry,
  supabase, members, the input and ui primitives, the pdf core (frame,
  columns, turnLog). `mulberry32` is a generic primitive and is common even
  though only boggle and scrabble seed boards on the client.

**Belongs to one game**: `StrikeMarks` → connections. (`infoPanel.module.css`
was listed here as an orphan on 2026-09-04; wrong — `WordList` imports it, so
it is common and goes wherever `WordList` goes.)

**Two rulings about the audit, same day.**

- **Blessing markers keep their original area name.** A file tagged
  `cs-fixed-game-lib` keeps that tag after it moves; it is history. If Joel
  touches the file again he'll rename it to the current area.
- **If the reorg happens, it happens BEFORE the `feedback` area opens.** The
  audit table then loses `hooks`, `shared-game-chrome` and what's left of
  `utils`, and gains one area per feature folder and per shared family. Several
  areas so far had to be split into groups because they were unwieldy anyway.

**How to verify the move** (agreed 2026-09-04): `tsc -b` first (it resolves
every import in the project, not just the ones a test reaches), then the full
vitest run (the path-coupled guards and any `vi.mock()` path the codemod
missed both fail there), then `vite build` (CSS-module and `?url` imports are
typed by a wildcard, so only the build resolves them), then ONE e2e at the end
after restarting the dev server. Vitest carries most of the weight; the e2e
only confirms the built app boots and a game renders styled.

## 5. The proposed folder list (Claude's first pass, 2026-09-04 — for Joel to rename and move between)

Every non-test file under `src/common/` is placed below. Names are kebab-case
and unique across all three tables. "Sampling" is a few files, not a roster.
Written so Joel can edit the tables in place rather than rule file by file.

### Common

| folder | what it is | sampling | notes |
|---|---|---|---|
| `supabase` | the client, the envelope wrappers, the DB handle | supabase, envelope, dbEnvelope, dbResult, dbFetch, dbLog, edgeFnTransport, db | blessed under `deep` already |
| `realtime` | channels, reconnect, refetch, presence | channelDedup, channelTeardown, postgresAttached, realtimeDiag, useRealtimeRefetch, useRealtimeReconnect, useClubPresence, useClubSetupPresence | could merge into `supabase`; split here because presence and the deaf-window fix are their own subject |
| `routing` | the hash router and Link | router, Link | |
| `session` | who is signed in, their profile | useSession, useProfile | |
| `auth` | the pre-app screens | LoginScreen, ClaimHandleScreen | |
| `home` | the landing page | HomePage | |
| `club` | the club room and everything on it | ClubPage, ClubGameCard, ClubGameRow, CreateClubModal, EditClubModal, StartGameRow, ModeFilter, GametypeFilter, useClubRoster, ClubHelpCompanion, friendlyDate | friendlyDate has only club callers today; could stay in `util` |
| `account` | your own menu and profile editing | EditProfileModal, ColorChoiceList, editProfileStore, useAccountMenuSection | |
| `chat` | the club chat panel end to end | Chat, ChatBody, useClubChat, useChatFeedback, chatOpenStore, chatUnread, linkify | linkify's only caller is ChatBody. ChatButton: see `page-header` |
| `scratchpad` | the shared notes panel | GameScratchpadCompanion, useScratchpad, scratchpadOpenStore | ScratchpadButton: see `page-header` |
| `page-header` | the top strip and the marks in it | PageHeader, PageHeaderButton, PageHeaderMenu, PageHeaderPlayersStrip, PageHeaderStatusSlot, ChatButton, ScratchpadButton | today's rule keeps the chat and scratchpad marks here, not in their features (flag 2). PauseButton is also a header mark but stays in `buttons` per the ruling |
| `menu` | the one menu, its store, and what a game puts in it | Menu, menu, pageMenuStore, gameMenu | gameMenu assembles a game's header menu; it could go to `game-page` instead |
| `forms` | every field, the form frame, and the setup dialog with its sections | Field, TextField, SelectField, RadioRow, DictBandField, ManualBoardField, StandardForm, formState, fieldContract, SetupGameModal, SetupSection, PlayersSection, SetupTimerSection, SetupCoopStyleSection, SetupNextPuzzleSection, setupForm, setupRows, difficulty, fieldNames | one folder for fields and setup per the ruling; Joel said `fields`, the audit area is `forms` (flag 1). The largest common folder, about 50 files |
| `floating-panels` | the shell every floating thing rides on | FloatingPanel, Dialog, NormalModal, BlockingModal, ConfirmationBlockingModal, AcknowledgeBlockingModal, Companion, useDraggablePanel, useFocusTrap, usePanelEscape, useConfirmation, useAcknowledge | |
| `feedback` | the pill and its local/global state | GenericFeedbackPill, FailureLine, useLocalFeedback, useGlobalFeedback, useDismissLocalFeedbackOnKey, genericFeedback, genericPills, localPills | the `feedback` audit area's roster, minus turnCopy, placed in `turn-log` |
| `faults` | the last-resort screens and sink | FaultModal, faultStore, panic, reloadOnStaleChunk | panic and reloadOnStaleChunk are called only from main.tsx |
| `toasts` | the bottom-right stack | Toast, ToastHost, toastStore | |
| `tooltips` | the tooltip host | TooltipHost | one file |
| `text` | inline rich text | Dot, RichMessage | |
| `lists` | pick-one and scrolling lists | SelectionList, SimpleScrollableList, FilterSelect, test/filterSelect | |
| `loading-and-errs` | the stand-in pages | Loading, ErrorPage | name kept from today; `page-fallbacks` if a job name is wanted |
| `definitions` | click-a-word lookup and dictionary curation | DefinitionPopover, DefinitionView, WordLookupDialog, AnagramDialog, WordEditDialog, useDefinition, useDefinePopover, parseDefinition, wordEditStore | |
| `buttons` | every purpose button and the base | StandardButton, EndGameButton, RevealButton, HintButton, PeelButton, PauseButton, … | all 27, per the ruling |
| `icons` | the inline SVG set | icons | one file |
| `branding` | the app and per-game logos | PuzpuzpuzLogo, PuzpuzpuzWordmark, GameLogo, homeTitle.png, puzpuzpuz.svg | |
| `devtools` | pages that ship for the author, not for players | PalettePage, palette, FontPage, fontSpecimen | out of every audit; Joel's name for the folder |
| `manifest` | what a game declares | gameManifest, statusLabel, manifestRpcs | the contract; stays at a dead-obvious top-level path. `src/gametypes.ts` stays where it is |
| `game-page` | the live game's page and what it hands down | GamePage, gamePageCtx, useCommonGame, useStandardGameActions, PlayAreaErrorBoundary, PlayAreaMountLog, PlayArea.module.css, GameHelpCompanion, ModePill, OpponentStrip, DeviceBlockNotice, useGameHasKeyboard, useGameTimer, timerLabel | the timer is two files and could be its own folder |
| `pause` | pausing, presence-pause, suspend | PauseBoundary, PauseOverlay, SuspendConfirmationBlockingModal, pause | PauseButton stays in `buttons` |
| `info-sheet` | the mobile info sheet and its switch | InfoSheet, useInfoSheet, infoSheetStore, InfoSwitchButton, MobileStatusBar | |
| `turn-log` | the chronological history readout and its viewer | TurnLog, TurnLogActor, ActorMention, historyViewer.module.css, useHistoryViewer, useTurnLogPlayerPicker, TurnStatusLine, turnCopy, pdf/turnLog | turnCopy is claimed by the `feedback` area; it says whose turn it is, which reads as turn-log |
| `word-list` | the alphabetical finds readout | WordList, useWordListFilter, useRecentlyFound, infoPanel.module.css | common per the ruling. Its display-row and leaderboard helpers are in `found-words`, so this folder imports from shared (flag 3) |
| `terminal` | what shows when a game ends | TerminalActionRow, LocalTerminalRow, terminalCopy, CelebrationBlockingModal, useCelebration, terminalOutcomeVerb, outcomes | outcomes is the vocabulary; it could sit in `manifest` instead |
| `reveal` | showing the answer after the end | useSolutionReveal | RevealButton stays in `buttons`; revealWords is open item 1 in §6 |
| `entry` | the typed-move box and its row | EntryBox, EntryRow, MoveRow | useWordSubmit is open item 2 in §6 |
| `invitations` | game invitations | GameInvitations, useGameInvitations, gameInvites | |
| `members` | who someone is, and their color | member, memberList, memberColor, test/gamePlayers | |
| `keyboard` | key capture, tab rings, shortcuts | useCaptureKeys, useSwallowTab, useTabRing, useGlobalKeyHandler, useAppShortcuts, useBacktickEscape, useArrowHistory, keyboardHandoff | |
| `device` | what kind of screen and pointer this is | useIsMobile, useMediaQuery, usePhone, useCoarsePointer, useVisualViewport, layoutWidth, breakpoints.css | breakpoints.css could stay with `core-css` (flag 4) |
| `storage` | web storage, wrapped | storage, storage.fake, useStickyChoice | |
| `util` | the residue: helpers with no feature | cls, logStamp, mulberry32, useSingleFlight, useFlash | kept deliberately tiny (flag 4) |
| `core-css` | the stylesheets every page loads | base.css, fixed.css, utilities.css, patterns/badge.css, patterns/focus-ring.css, … | the `corecss` audit area |
| `themes` | the theme files and loader | daylight.css, light-mode.css, dark-mode.css, midnight.css, loadTheme | |
| `pdf` | the printable frame and shared pieces | frame, columns, marks, tiles, wordColumns, wordListBody, wordSections | open item 3 in §6: tiles and the word helpers could ride with their family instead |

### Shared

| folder | what it is | sampling | notes |
|---|---|---|---|
| `found-words` | find-many-words games: spellingbee, wordwheel, boggle | makeFoundWordsGame, foundWords, foundWordsDisplayRows, foundWordsLeaderboard, rankLadder, RankBar, Stats, groupTiles, revealWords, typedWord.module.css, foundWordsPlayArea.module.css | the biggest family. groupTiles is used by ManualBoardField in `forms`, so common imports shared there too (flag 3) |
| `grid-and-drag` | tiles moved on a grid with a cursor: bananagrams, scrabble | gridCursor, gridCursor.module.css, useBoardCursorKeys, useDragGesture, dragGhost.module.css | open item 4 in §6 if the keyboard-nav plan widens it |
| `color-feedback` | hidden-target color feedback: waffle, wordle | tileColor, pdf/tiles | two files |
| `move-flash` | flashing the tile a move changed: connections, psychicnum, waffle, wordle | useTurnStartFlash, useMoveCausedChange, feedbackTiming | |
| `dictionary-trie` | the flat trie behind boggle's solver and scrabble's suggester | trie | one file |
| `guess-keyboard` | the on-screen QWERTY: wordle, wordiply | GuessKeyboard | one file plus its stylesheet |

### Belongs to a game

| file | game | notes |
|---|---|---|
| StrikeMarks, StrikeMarks.module.css | connections | only user |

That is the whole table. The eight single-game buttons stay in `buttons` per
the ruling; DeviceBlockNotice and useGameHasKeyboard are manifest gates, so
they sit in `game-page`.

### Flags on the list (numbered for Joel to answer by number)

1. **`forms` versus `fields`** as the one folder's name.
2. **The header-marks rule.** ChatButton, ScratchpadButton and PauseButton each
   belong to a feature but live where they're drawn. Keep that, or move them
   home?
3. **Two common-imports-shared edges**: `word-list` uses found-words helpers,
   and `forms` uses groupTiles. Either the helpers move up to common, or the
   direction is allowed.
4. **`util` and `device` are the two folders that don't name a feature.**
   `util` is kept to five files on purpose. If the target is zero type-ish
   folders, useSingleFlight and useFlash need homes.

## 6. Still open

1. **Reveal straddles the line.** `RevealButton` + `useSolutionReveal` serve ten
   games and are common by the rule; `revealWords` serves only found-words.
   Split across common and shared, or keep all of reveal together?
2. **`useWordSubmit`** (boggle, spellingbee, wordwheel, wordiply) — three
   found-words games plus one that isn't, and it is a submit MECHANISM rather
   than a mechanic. Shared beside found-words, or common entry?
3. **Where a family's PDF helper lives** — beside the family it prints, or in
   one `pdf/` folder as today.
4. **Grid-and-drag versus the keyboard-nav plan.** `useBoardCursorKeys` and
   `gridCursor` are shared by two games today, but
   plans/keyboard-nav-plan.md would extend arrow navigation to five. Classify
   by today, or by that plan?
5. **The feature list** — what is big enough to be a folder, and what happens
   to a one-file feature (its own folder anyway, or folded into a parent).
6. **The docs boundary** — which docs split, and whether `docs/games/` moves.
7. **Whether a feature folder gets type subfolders.** Open by Joel's own
   statement; §3 argues no.

## 7. What happens to this file

If the idea is agreed, this becomes a real plan with a roster and replaces
docs/common-folders.md when it ships, at which point the plan is deleted. If
the idea is dropped, delete this file; nothing else references it.
