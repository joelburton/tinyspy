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

**Shape rulings from the markup passes (Joel, 2026-09-04).** `src/shared/` IS
a top-level sibling of `src/common/`, as goal 1 proposed. A feature folder
gets NO type subfolders — no components/ hooks/ lib/ inside it; leading-cap,
`useX` and lowercase names carry that distinction. **A common thing NEVER
imports from a shared thing.** The direction is one way: a game imports from
both, and shared may import from common (it does today — `word-hunt`'s row
builder takes its row type from `word-list`), but common must not reach down
into a family only some games have. Worth a guard once the folders exist. The
per-folder rulings are in the §5 tables, marked RULED.

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
| `club` | the club room and everything on it | ClubPage, ClubGameCard, ClubGameRow, ClubGameDeleteButton, CreateClubModal, EditClubModal, StartGameRow, ModeFilter, GametypeFilter, useClubRoster, ClubHelpCompanion | RULED: ClubGameDeleteButton stays here, not in `buttons` — it is the card's hover trash can with its own two-step confirmation, not a purpose button |
| `account` | your own menu and profile editing | EditProfileModal, ColorChoiceList, editProfileStore, useAccountMenuSection | |
| `chat` | the club chat panel end to end | Chat, ChatBody, useClubChat, useChatFeedback, chatOpenStore, chatUnread | its header mark is in `page-header` |
| `scratchpad` | the shared notes panel | GameScratchpadCompanion, useScratchpad, scratchpadOpenStore | its header mark is in `page-header` |
| `page-header` | the top strip and the marks in it | PageHeader, PageHeaderButton, PageHeaderMenu, PageHeaderPlayersStrip, PageHeaderStatusSlot, ChatButton, ScratchpadButton | RULED: the chat and scratchpad marks stay here — they are styled for the header, not for their features. PauseButton is also a header mark but stays in `buttons` |
| `menu` | the one menu, its store, and what a game puts in it | Menu, menu, pageMenuStore, gameMenu | gameMenu assembles a game's header menu; it could go to `game-page` instead |
| `fields` | every field — the repo of fields, whoever renders them today | Field, fieldProps, fieldContract, field.module.css, errorUnder, TextField, SelectField, RadioRow, CheckboxField, CheckboxListField, NumberField, DateField, ColorField, ReadOnlyField, PlayersField, DictBandField, ManualBoardField, groupTiles | RULED: ALL fields live here, including the three only a setup form renders today. groupTiles comes with ManualBoardField, whose helper it is |
| `forms` | the form frame and what every form shares that isn't a field | StandardForm, formState | |
| `setup-form` | the start-a-game dialog, its sections, and its data | SetupGameModal, SetupDisclosure, SetupSection, PlayersSection, SetupTimerSection, SetupCoopStyleSection, SetupNextPuzzleSection, setupForm, setupRows, difficulty, fieldNames | setupRows is the setup RECAP the info column and PDF share, which is setup's data even though the dialog doesn't draw it |
| `floating-panels` | the shell every floating thing rides on | FloatingPanel, Dialog, NormalModal, BlockingModal, ConfirmationBlockingModal, AcknowledgeBlockingModal, Companion, useDraggablePanel, useFocusTrap, usePanelEscape, useConfirmation, useAcknowledge | |
| `feedback` | the pill and its local/global state | GenericFeedbackPill, FailureLine, useLocalFeedback, useGlobalFeedback, useDismissLocalFeedbackOnKey, genericFeedback, genericPills, localPills | the `feedback` audit area's roster, minus turnCopy, placed in `turn-log` |
| `faults` | the fault sink and its modal | FaultModal, faultStore | |
| `boot` | what main.tsx runs before React mounts | panic, reloadOnStaleChunk | RULED name (Joel had said "main"; "boot" names the job). main.tsx also calls loadTheme and layoutWidth, but those are features it happens to start, so they stay in `themes` and `mobile` |
| `toasts` | the bottom-right stack | Toast, ToastHost, toastStore | |
| `tooltips` | the tooltip host | TooltipHost | one file |
| `text` | inline rich text | RichMessage | Dot moved to `members` (Joel asked; its docstring calls it the "this color is this player" marker, which is member identity) |
| `lists` | pick-one and scrolling lists | SelectionList, SimpleScrollableList, FilterSelect, test/filterSelect | |
| `loading` | the stand-in while a page loads | Loading | RULED: its own folder despite one file |
| `error-page` | the stand-in when a page can't render | ErrorPage | RULED: its own folder despite one file |
| `definitions` | click-a-word lookup and dictionary curation | DefinitionPopover, DefinitionView, WordLookupDialog, WordEditDialog, useDefinition, useDefinePopover, parseDefinition, wordEditStore | |
| `anagram-finder` | the anagram dialog | AnagramDialog | RULED: its own folder; the name matches its e2e spec |
| `buttons` | every purpose button and the base | StandardButton, EndGameButton, RevealButton, HintButton, PeelButton, PauseButton, … | all 27, per the ruling |
| `icons` | the inline SVG set | icons | one file |
| `branding` | the app and per-game logos | PuzpuzpuzLogo, PuzpuzpuzWordmark, GameLogo, homeTitle.png, puzpuzpuz.svg | |
| `devtools` | pages that ship for the author, not for players | PalettePage, palette, FontPage, fontSpecimen | out of every audit; Joel's name for the folder |
| `manifest` | what a game declares | gameManifest, statusLabel, manifestRpcs | the contract; stays at a dead-obvious top-level path. `src/gametypes.ts` stays where it is |
| `game-page` | the live game's page and what it hands down | GamePage, gamePageCtx, useCommonGame, useStandardGameActions, PlayAreaErrorBoundary, PlayAreaMountLog, PlayArea.module.css, GameHelpCompanion, ModePill, DeviceBlockNotice, useGameHasKeyboard | |
| `timer` | the game clock | useGameTimer, timerLabel | RULED: its own folder. SetupTimerSection stays in `setup-form` |
| `pause-suspend` | pausing, presence-pause, suspend | PauseBoundary, PauseOverlay, SuspendConfirmationBlockingModal, pause | RULED: one folder, named for both. PauseButton stays in `buttons` |
| `info-sheet` | the info column: its mobile sheet, its switch, and the chrome its panels share | InfoSheet, useInfoSheet, infoSheetStore, InfoSwitchButton, MobileStatusBar, OpponentStrip, infoPanel.module.css | OpponentStrip is imported by thirteen InfoCols and nothing else (verified). infoPanel.module.css is the info column's bordered panel, worn by the turn log, the word list and bananagrams's hand — Joel's guess was right. Since it now holds column-wide things, `info-col` may be the truer name |
| `turn-log` | the chronological history readout and its viewer | TurnLog, TurnLogActor, ActorMention, historyViewer.module.css, useHistoryViewer, useTurnLogPlayerPicker, TurnStatusLine, turnCopy | turnCopy is claimed by the `feedback` area; it says whose turn it is, which reads as turn-log. Its PDF half is in `pdf` |
| `word-list` | the alphabetical finds readout | WordList, useWordListFilter, useRecentlyFound | common per the ruling. It takes its rows as a prop; the game's PlayArea builds them with `word-hunt`'s buildDisplayRows, so nothing here imports from shared |
| `terminal` | what shows when a game ends | TerminalActionRow, LocalTerminalRow, terminalCopy, CelebrationBlockingModal, useCelebration, terminalOutcomeVerb | |
| `outcomes` | the outcome vocabulary — won · lost · near · warning · neutral · noted | outcomes | RULED: not terminal's. Read by boards, the pills, the feedback layer and dbResult; docs/outcomes.md is already its doc, which is the case for a folder of its own |
| `reveal` | showing the answer after the end | useSolutionReveal | RevealButton stays in `buttons`. RULED: revealWords stays in `word-hunt` — it is specific to those games, so reveal is split between common and shared on purpose |
| `word-entry` | the typed-word box and its row: no `<input>`, keystrokes read off the window | EntryBox, EntryRow, MoveRow, useArrowHistory | RULED name (psychicnum types a number through it, and that's fine). useArrowHistory is EntryBox's own up/down recall, layered on by EntryRow and wired nowhere else, so it lives here rather than in `keyboard`. useWordSubmit is in `word-hunt` |
| `invitations` | game invitations | GameInvitations, useGameInvitations, gameInvites | |
| `members` | who someone is, their color, and the disc that shows it | member, memberList, memberColor, Dot, test/gamePlayers | Dot in from `text` |
| `keyboard` | key capture, tab rings, shortcuts | useCaptureKeys, useSwallowTab, useTabRing, useGlobalKeyHandler, useAppShortcuts, useBacktickEscape, keyboardHandoff | useArrowHistory moved to `word-entry` — Joel's guess was right, its docstring says it applies to the EntryBox games and only them |
| `mobile` | the desktop-versus-mobile machinery: the breakpoint, the device hooks, the viewport | useIsMobile, useMediaQuery, usePhone, useCoarsePointer, useVisualViewport, layoutWidth, breakpoints.css | RULED name. Every file here cites docs/mobile.md, and useMediaQuery calls itself "the engine behind the device hooks", so the name is truer than it first looks. docs/mobile.md becomes its doc |
| `web-storage` | localStorage and sessionStorage, wrapped so a browser that blocks them can't throw | storage, storage.fake, useStickyChoice | `web-storage`, not `localstorage`: the wrapper covers sessionStorage too, and "Web Storage" is the spec's name for the pair |
| `utils` | simple logic helpers with no feature | cls, logStamp, mulberry32, friendlyDate, linkify | RULED: kept, for plain functions only — no hooks. friendlyDate in from `club`, linkify in from `chat` |
| `single-flight` | one run of an async action at a time — a second click while the first is in flight is dropped, not queued | useSingleFlight | Joel asked what it is. It's the guard every game's submit and action handlers wrap, so a double-click can't double-fire an RPC. No feature owns it, and it isn't plain logic, so it gets a one-file folder like `tooltips` and `icons` do |
| `move-flash` | flashing the tiles a move changed | useTurnStartFlash, useMoveCausedChange, feedbackTiming, useFlash | RULED common, up from shared: only four games use it today because the tile-feedback pass paused for the audit, and it's meant for more. useFlash (a transient hot set of ids that clears itself) is the mechanism under it, in from the old `util` |
| `core-css` | the stylesheets every page loads | base.css, fixed.css, utilities.css, patterns/badge.css, patterns/focus-ring.css, … | the `corecss` audit area |
| `themes` | the theme files and loader | daylight.css, light-mode.css, dark-mode.css, midnight.css, loadTheme | |
| `pdf` | everything about printing a board | frame, columns, marks, tiles, turnLog, wordColumns, wordListBody, wordSections | RULED: all of pdf stays together, including the helpers that print one family's readout |

### Shared

| folder | what it is | sampling | notes |
|---|---|---|---|
| `rank-ladder` | the Start..Genius ladder, its bar and its stat grid | rankLadder, RankBar, Stats | Joel asked for a breakup so the bar can serve games that aren't pure found-words. The docstrings split the old family in three: this is the part with no data model behind it, so any game with a ladder can take it |
| `bee-games` | what the spellingbee / wordwheel pair share and nothing else does: the data model, the game factory, the compete leaderboard, the typed-word look | foundWords, makeFoundWordsGame, foundWordsLeaderboard, typedWord.module.css, foundWordsPlayArea.module.css | every file's docstring says "spellingbee + wordwheel" and its importers agree. `bee-games` is a placeholder name — the repo calls them "the found-words rank-ladder games", which is too long for a folder |
| `word-hunt` | find-words-on-a-board games: spellingbee, wordwheel, boggle, wordiply | foundWordsDisplayRows, revealWords, useWordSubmit | "word-hunt" is the docstrings' own word (revealWords: "the three word-hunt games"). useWordSubmit lands here, out of `entry`: wordiply is a word-finding game too (docs/features.md → "Word-finding as core play"), so all four of its users are in this family |
| `board-cursor` | arrows move a cursor over a board: bananagrams and scrabble today, the five keyboard-nav games if that plan lands | useBoardCursorKeys, gridCursor, gridCursor.module.css | RULED: split from the drag files. useBoardCursorKeys is the keyboard every board-cursor game reuses (the window listener and the keep-typing-off-the-board guards); gridCursor is the axis-cursor math only the letter-grid games use, and the plan's five would add a plain stepper beside it |
| `grid-and-drag` | dragging a tile to the right place on the grid: bananagrams, scrabble | useDragGesture, dragGhost.module.css | RULED name and contents |
| `wordle-style` | the per-letter color codes of the hidden-target games: wordle, waffle | tileColor | RULED: no pdf here. Named for the family: the repo already says "Wordle-style" in a dozen places and names the tokens `wordle-green` / `wordle-yellow` / `wordle-gray`. One file |
| `dict-trie` | the flat trie behind boggle's solver and scrabble's suggester | trie | one file |
| `onscreen-keyboard` | the on-screen QWERTY: wordle, wordiply | GuessKeyboard | RULED name. One file plus its stylesheet |

### Belongs to a game

| file | game | notes |
|---|---|---|
| StrikeMarks, StrikeMarks.module.css | connections | only user |

That is the whole table. The eight single-game buttons stay in `buttons` per
the ruling; DeviceBlockNotice and useGameHasKeyboard are manifest gates, so
they sit in `game-page`.

### Flags on the list (numbered for Joel to answer by number)

Settled by the first markup pass (2026-09-04): the fields/forms/setup-form
split; the header marks stay in `page-header`; `utils` is plain logic only;
pdf stays together; move-flash is common. Still flagged:

1. ~~Three setup-only fields~~ — RULED: `fields` is the repo of fields; all of
   them live there.
2. ~~One common-imports-shared edge remains~~ — WITHDRAWN 2026-09-04: there is
   no such edge. `WordList` takes its rows as a prop; the game's own PlayArea
   calls `buildDisplayRows` and hands the result over, so every import runs
   game → shared or game → common. Nothing in the proposed `common/` imports
   from the proposed `shared/`.
3. ~~`device`~~ — RULED: renamed `mobile`; it is a feature after all.
4. ~~Claude's names~~ — RULED 2026-09-04: `boot`, `bee-games`,
   `single-flight`, `info-sheet` (not `info-col`) and `web-storage` all stand.

## 6. Still open

1. ~~Reveal straddles the line~~ — RULED 2026-09-04: split. `useSolutionReveal`
   is common (`reveal`); `revealWords` is specific to the word-hunt games and
   stays in `word-hunt`.
2. ~~`useWordSubmit`~~ — placed in `word-hunt` (§5): all four of its users are
   word-finding games by docs/features.md's own grouping.
3. ~~Where a family's PDF helper lives~~ — RULED 2026-09-04: all of pdf stays
   in one `pdf/` folder.
4. ~~Grid-and-drag versus the keyboard-nav plan~~ — RULED 2026-09-04: split
   into `board-cursor` (the keyboard + cursor math) and `grid-and-drag` (the
   drag pair). Not because of the plan: the keyboard and the drag were two
   jobs in one folder already. Both shared.
5. **The feature list** — what is big enough to be a folder, and what happens
   to a one-file feature (its own folder anyway, or folded into a parent).
6. **The docs boundary** — which docs split. (~~whether `docs/games/` moves~~ —
   RULED 2026-09-04: not now. It may be smart later, but it is not part of
   this reorg.)
7. ~~Whether a feature folder gets type subfolders~~ — RULED 2026-09-04: no.
   Joel took §3's recommendation; the naming convention does the job.

## 7. What happens to this file

If the idea is agreed, this becomes a real plan with a roster and replaces
docs/common-folders.md when it ships, at which point the plan is deleted. If
the idea is dropped, delete this file; nothing else references it.
