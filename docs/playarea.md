# PlayArea — the shared play surface

This is the reference for the shared **play surface**: the two-column layout, the
info-column readouts, text entry, the event log, the turn-history viewer, and board
sizing — plus how each game's `PlayArea` is **decomposed** into `BoardCol` /
`InfoCol`. For the visual language that frames it (theme tokens, tiles, page chrome,
modals, mode pills, iconography), see [ui.md](ui.md).

## PlayArea layout

The shape every game's play surface takes — **all sixteen games** are on it. The
scaffold + readout classes live in
[`common/game-page/playArea.module.css`](../src/common/game-page/playArea.module.css)
(a CSS-only module imported the way `historyViewer.module.css` is, composed with a thin
per-game module via `cls()`). It was validated on **psychicnum**, then **connections**,
then stress-tested on **codenamesduet** — the structural odd-one-out (turn-based, one
clue then several guesses, per-viewer keycard overlays, a real free-text `<input>`
rather than capture-entry) — proving the pieces are general, not just "what the two
similar games happened to share"; the rest of the roster followed.

**The contract:**

- **No whole-page scroll.** The play area fills the viewport —
  `height: calc(100vh - var(--game-chrome-height))` — and only inner regions
  (the event log / word list, chat) scroll. The chrome token covers the body
  padding (1rem) + the header + the header→play-area gap; see [Page-height fits the viewport](ui.md#page-height-fits-the-viewport).
- **Two columns, no chrome around them.** A **board column** (`.boardCol`, left)
  and an **info column** (`.infoCol`, right). No border / margin / padding around
  the play area or around either column — the *only* thing between them is a
  single thin **divider**: a `border-left` (`--page-divider-color`) on the info
  column's inner edge, with symmetric breathing room (the layout `gap` on the
  board side, the info column's `padding-left` on the other).
- **Info column = fixed width, never grows during play** (the *one* fixed column;
  the board grows, this doesn't). Holds the four **info readouts** (see
  [Info-column readouts](#info-column-readouts) below) above the **event log**
  (chronological, one entry per turn) or **word list** (alphabetical found-words;
  boggle/spellingbee). It's the **mobile-secondary** column — on small screens it
  may collapse to a popup — so anything *critical to playing* goes in the board
  column instead. (That's why the word/number **entry** lives below the board,
  not here — and it's the capture model, not an `<input>`; see
  [Text entry](#text-entry--capture-not-input).)
- **Board column HUGS its board.** Every board-grid game shares one model:
  `.boardCol` is `flex: 0 0 auto` and only as wide as its board, which grows to fill
  *up to* a per-game max tile size (see [Board sizing](#board-sizing)). **Fill is the
  no-cap case** — with no cap the board grows to the full available width, so a
  capless game still reads as "fills." The column is **top-aligned**
  (`justify-content: flex-start`) — the board at the top — and anything stacked below
  (the entry row, or the terminal reveal) stretches to the board width. (bananagrams
  is the exception — a fixed 25×25 arena that FILLS its column, documented in
  docs/games/bananagrams.md.)
- **`align-items: stretch`** makes both columns full-height (the divider spans;
  the log scrolls inside). The board-column + info-column pair is narrower than the
  play area, so `justify-content: center` centers them with equal outer margins.

**Locked names:** board column / `.boardCol`, info column / `.infoCol`, the
divider, **event log** (`<EventLog>` — chronological, outcome-bar entries) vs
**word list** (`<WordList>` — alphabetical, circle markers). Tiles follow
[Interactive tile states](ui.md#interactive-tile-states); identity uses
[a colored disc](ui.md#player-identity--a-colored-disc); feedback splits
[local vs group](deferred.md#feedback-channels-local-vs-group).

**Shared vs per-game:** the shell + readout classes now live in the shared
`common/game-page/playArea.module.css` (a CSS-only scaffold, like
`historyViewer.module.css` — no behavior, so a stylesheet rather than a component).
What stays in each game's own module: the board **grid** (psychicnum grows tiles
to fill; connections fixes their height — same purpose, different behavior), any
result/semantic tile fills, the board tray frame, and game-specific readout
copy. `<EventLog>` *is* a shared component (it has behavior); the two-column shell
is just shared CSS. The shared **`.tile`** chrome lives in the same module.

**Two columns, two components.** The `.boardCol` / `.infoCol` regions here are the
CSS; each standard game also *splits* its `PlayArea` into a **`BoardCol`** component
(the input engine + below-board feedback, renders the `Board`) and an **`InfoCol`**
component (these readouts + the event log). The board-vs-info CSS split mirrors the
component split. See
[code-conventions.md → PlayArea decomposition](code-conventions.md#playarea-decomposition--boardcol--infocol)
and [the decomposition below](#the-boardcol--infocol-decomposition).

### Info-column readouts

The non-log part of the info column converges on a few recurring kinds of info,
each drawn the same way in every game so it reads the same. Three are **named
classes** (not raw `muted`) a game's own InfoCol applies to its own markup —
validated on psychicnum, and reuse these names when a new game's info column
needs the same. The setup recap is a shared **component** instead, since its
markup is identical everywhere and only its rows differ.

**The canonical order** (top → bottom), enforced on every standard game: **state
(`.infoState`) → opponent strip (`<OpponentStrip>`, compete) → action row
(`.infoActions`) → help (`.infoHelp`) → terminal extra (`.terminalExtra`,
game-over only) → setup disclosure (`<SetupDisclosure>`) → event log / word
list.**
The terminal extra sits **above** the setup disclosure deliberately (Joel's
rule, 2026-08-05): the reveal is the payoff, the setup recap is bookkeeping —
the recap must never push the answer down. A v1/v2 layout's order is *not* a reliable guide — read this
and reorder to match (drifting to setup-first with help/actions swapped was a real
codenamesduet bug). bananagrams is the documented exception: the hand + peel live
in its info column, so its action row sits at the very bottom, below the hand it
belongs to (see [bananagrams.md](games/bananagrams.md)).

**Opponent strip (`<OpponentStrip>`).** A horizontal list of opponents, each
`● name: value`. Three rules: identity rides a **leading color disc**, not a
colored name; every strip carries a **metric-label prefix** ("Found:", "Score:",
"Turns left:") so the bare numbers aren't ambiguous; and the metric **value is
full text color** (it's the key data — don't mute it). A whole `● name: value`
unit never wraps mid-entry (the strip wraps *between* entries). Fixed-seat
2-player games like codenamesduet may show peer status in the global feedback area
instead of a strip — use a strip when there's a meaningful per-opponent metric.

**Turn claims stop at terminal.** A finished game has nobody's turn, so no
readout may keep asserting one. Two shapes, decided by whether the line has
anything *else* to say:

- **The line is only a turn indicator** → it goes **inert but keeps its height**
  — a blank height-holder, no wording. That's the shared
  [`<TurnStatusLine>`](../src/common/info-sheet/TurnStatusLine.tsx), used by
  connections / psychicnum / strands / waffle / wordiply / wordle / scrabble
  coop, and pinned by its own test ("goes inert at terminal"). The height is held
  because dropping the element would reflow the column below on the
  play→terminal transition ([Layout stability](ui.md#layout-stability)).
- **The line carries other live state too** → replace only the turn clause with
  **"Ended"**, keeping the rest behind the same `·` separator. scrabble compete
  is the case: `Your turn · 7 in bag` becomes `Ended · 0 in bag`, because a bare
  "0 in bag" with nothing in front of it reads as a fragment.

**Don't spell the verdict here.** "Ended" names the *state*, not the outcome —
the outcome already has two surfaces at terminal (the action row's bold verdict
and the below-board terminal pill), and a third copy is noise. A turn *count*
(codenamesduet's `4/9 turns`) is state, not a claim about whose turn it is, and
needs no terminal branch.

**Locally-terminal look.** When the game continues but *this* player can't act
(out of guesses, waiting for others while they race on), reuse the **terminal
look** — a bold status line ("Waiting for others") + their End/Concede on the
right — rather than a quietly-changed help line: being unable to act is basically
terminal *for them*, so show it that way. Terminal **and** locally-terminal always
show in **both** the action row (terse, carrying the button) and the below-board
local-feedback slot (which reads slightly fuller — "Conceded — race continues"
against the row's "You conceded"; the shared `FeedbackMessage.outOfRace()`).
That dual placement is the rule, not redundancy to trim.

| class | what it is | style | terminal? |
|---|---|---|---|
| **`<SetupDisclosure>`** | the choices made at game *creation* (psychicnum: tiles / secrets / difficulty) | full text color; behind a `<details>` disclosure ("Setup options"), collapsed by default. A common COMPONENT with its own stylesheet, not a class a game applies — see below | **shown** (still useful in review) |
| **`.infoState`** | the important *live* state (psychicnum: "0/3 found · 2/9 guesses used") | full text color, bold figures | **shown** |
| **`.infoHelp`** | UI instructions ("Click or type a word and hit submit") | **muted** | **hidden** |
| **`.infoActions`** | the action-button row | — | **swaps** (see below) |
| **`.terminalExtra`** | extra info shown **only at game over** (wordle: the answer reveal) | a content-height block **above the setup disclosure** | **terminal-only** (absent during play) |

- **The rows come from `<game>/lib/setupSummary.ts`** — the same array the game's
  PDF prints, so the panel and the paper can't drift apart. See
  [pdf.md → Setup rows](pdf.md#setup-rows) for the rules that shape it (the recap is
  the setup dialog read back; the roster leads; values are plain strings).
- **Setup is the one allowed growth-during-play.** It's a closable `<details>`,
  so opening it grows the column but it *reclaims* the space — the rationale
  that earns the exception to [Layout stability](ui.md#layout-stability): "what did I
  pick at setup? — but I don't want it taking room the whole game."
- **Action row = turn/game-altering actions only.** Hint, Reveal, End (all
  change the game/turn). A control that's *purely visual and about the board
  itself* does **not** go here — psychicnum's **Shuffle** (reorders the same
  tiles, changes nothing about the game) **floats over the board** (top-right)
  instead, and stays live even at terminal ("could I have found that with a
  reshuffle?"). The test: changes game state/turn → action row; board-only view
  aid → on the board.
- **Terminal swap.** Setup + state stay; help hides; the action row replaces the
  play buttons with a **bold, outcome-colored result line** (won = green / lost =
  red / manual-end = neutral, via the `--outcomes-*-ink-color` tones), any
  per-game terminal actions (Restart / Reveal / New game), and a **compact**
  back-to-club button — the shared `<InfoActionsRow>`, icon-only in most games
  so four items survive a ~22rem column (see
  [ui.md → Terminal results](ui.md#terminal-results--the-moment-vs-the-record)).
- **`.terminalExtra` — the one allowed growth on the play→terminal transition.**
  A region that appears *only* at game over, for terminal content too big for the
  below-board slot — wordle's "The answer was PLUMB", which there would overflow
  the viewport and scroll the page (a hard no). It sits **above the setup
  disclosure** (see the canonical order above). It **grows the info column** when
  the game ends: a deliberate exception to [Layout stability](ui.md#layout-stability),
  allowed because the play surface is done, the **board doesn't move**, and the
  scrolling event log below gives way so the *page* never scrolls (`flex-shrink: 0`
  on it; the log's `flex: 1` + `min-height: 0` absorbs it). Users today: wordle,
  stackdown, letterboxed (its revealed "Solvable in two" pair); reuse it when a
  game needs an end-of-game readout that doesn't fit below the board. (waffle's
  answer reveal is NOT one of these — it's progressive and shows all game, part
  of the status readout.)

Shared in `common/game-page/playArea.module.css` — `.infoState` / `.infoHelp` /
`.infoActions` / `.terminalActions` / `.outcome_*` / `.terminalExtra`. **The
setup recap is the odd one and is not among them**: the rest are classes a
game's own InfoCol puts on its own markup, while the recap is a common
component every game mounts, so its three rules live beside it in
`setup-form/SetupDisclosure.module.css`. A button in the row carries nothing of its own: it is an
`<ActionButton>`, sized by its own icon and label. connections
fills them with: setup = puzzle words / categories / mistakes / timer; state =
"N/4 categories found"; help = "Pick 4 tiles…"; actions = **Hint** + **End**
(bound actions, placed here and as menu rows). codenamesduet
fills them with: setup = turn cap + first clue-giver; state = "{green}/15 agents ·
turn {n}/{cap}"; help = the current phase instruction — and in **sudden death** a
leading red **SUDDEN DEATH:** before the explanation; actions = **End** (the
same bound action as its menu row). codenamesduet's *move* controls are deliberately **not** here — the
clue form / active clue + Pass / waiting line live in the below-board input row
(critical-to-playing belongs in the board column; see
[Text entry](#text-entry--capture-not-input)).

## Text entry — capture, not `<input>`

For **single-token entry** (a word, a number — psychicnum, spellingbee, boggle,
wordwheel, letterboxed), the play surface does **not** use a real
`<input>`. These are board-first games: the board is where the eyes and clicks
go, and a focused `<input>` loses focus the instant you click a board tile, so
typing silently stops. Instead we **capture keystrokes off the window** (the
shared **`useCaptureKeys`** hook, which binds the entry actions) and show the
pending value in a read-only display box (the shared **`<WordEntryInput>`**), so there's
no focus to lose — typing and tile-clicks both feed one pending value, and clicking
anywhere never interrupts entry.

Every such game renders the shared **`<WordEntryArea>`** (`common/word-entry/WordEntryArea.tsx`):
one component bundling the whole entry control so it looks + behaves identically
everywhere — the `useCaptureKeys` keyboard, the **pill swap** (pass the
below-board `localFeedbackSlot` and it renders whatever is on top of it as a
`<FeedbackPill>` in place of the controls — the own-move result / terminal
verdict — without unmounting, so a keystroke still dismisses it), and the row
itself. The host owns only the below-board *slot* (its board-matched width +
reserved height) and which messages go into it. A new word game gets the entire
entry for free.

**The row is its own component** — **`<WordEntryRow>`** (`common/word-entry/WordEntryRow.tsx`):
`⌫ | whatever you're entering | Submit`, the two icon-only buttons at the ends
and the display flex-filling between them. Split out from `<WordEntryArea>` because
two games need that exact control *without* the capture keyboard, since a
keystroke there doesn't mean "append this character":

| | what's being entered | why not `<WordEntryArea>` |
|---|---|---|
| **stackdown** | five slots holding picked-up **tiles** | no text buffer at all — a letter names a tile |
| **strands** | a `<WordEntryInput>` over the **traced path** | the string is *derived* from the path, so `value`/`onChange` run backwards |

Reach for `<WordEntryArea>` when a keystroke appends a character; reach for
`<WordEntryRow>` directly when it doesn't. Both games bring their own keyboard and
hand `<WordEntryRow>` the two **bound actions** their `⌫` and `↵` keys fire — the row
places the very bindings rather than callbacks beside them, so a button and its
key cannot disagree about when either may act. That is the seam that lets the
control look identical while meaning something different.

**Free-text / phrase entry** (codenamesduet's clue — arbitrary words, spaces,
mid-string editing) is the exception: it stays a real `<input data-game-input>`,
where native cursor/selection/editing earns its keep. The rule: *single token →
capture; free text → `<input>`.*

The contract for the capture model:

- **Simulated caret = honesty.** `<WordEntryInput>` draws a blinking caret to say "type
  here" (recovering the one thing a real input's cursor gave). It blinks **only
  while the game owns the keyboard *and* something's been typed** — keyboard
  ownership is gated on `useGameHasKeyboard` (no
  `<input>`/`<textarea>`/`<select>`/contenteditable focused), the *same*
  condition under which the action dispatcher fires an entry key. So **caret
  visible ⟺ keyboard-owned AND non-empty**: an empty box shows only its gray
  placeholder (which already says "type here"), and the caret never duels with the
  chat box's cursor. The non-empty gate lives in the shared `<WordEntryInput>`, so it's
  uniform, not a per-game choice.
- **No tabbing between controls.** The play surface declares an empty tab ring,
  so `Tab` is caught and goes nowhere — these games are navigated by clicks +
  typing, not by tabbing focus between buttons, and a caret blinking on the
  board while focus sits on some button reads as two cursors. (Focused text
  fields like chat keep their own `Tab`.)
- **Modified keystrokes pass through.** The chord matcher (`common/actions/chord.ts`)
  never matches a pattern key against a modified press, so `Cmd-R`, `Ctrl-Tab`,
  etc. stay the browser's.
- **What can be entered is per-game; the rest is shared, in two layers.** The
  GENERIC key-capture **core** is `useCaptureKeys` (`common/keyboard/useCaptureKeys.ts`):
  the any-key feedback dismissal (`act-dismiss-feedback`),
  Backspace / Enter (Enter only when non-empty), and the ~16-char cap — identical
  for every key-capture game. The **last-move history** — `ArrowUp` recalls the
  `recall` value, `ArrowDown` clears — is a SEPARATE layer, `useArrowHistory`,
  because it answers a different question: the core is about the characters going
  IN, the arrows about the whole entry coming BACK, and a game may want either
  without the other. `<WordEntryArea>` composes both, so a typing game gets the arrows
  by rendering it and opts out with `hasHistory={false}` where a submitted entry
  doesn't come back (letterboxed: the word joins the chain); a game running its
  own capture loop calls `useArrowHistory` directly if recall helps it (wordiply,
  whose next guess is often the last one plus a letter), and simply doesn't if it
  doesn't (wordle, where a played guess is on the board in front of you). A game
  supplies *what
  may be entered* — `charFor` (letters vs digits + the stored case; the exported
  `asciiLetters('lower' | 'upper')` covers the word games) — plus the `recall`
  value (for the ArrowUp layer), and the `disabled` (loading / terminal) / `busy`
  (mid-submit) gates; a board key like shuffle (`⌥Z`) is the board's own action,
  not the entry's. The board-cursor games (bananagrams, scrabble) are a
  different capture shape again — a 2-D cursor where arrows *move* it — with their
  own shared hook, **`useBoardCursorKeys`** (four bound actions): it
  owns the arrows→cursor / letter / Backspace / Enter dispatch, and each game
  supplies the per-cell edit rule
  (bananagrams overwrites any tile; scrabble locks committed ones) and what a
  letter / Enter does (place-from-hand + peel vs stage + play word).
- **The verdict leaves only with the game.** A `terminalVerdict` is
  owner-cleared: the effect that shows it retracts it when `isTerminal` flips
  (a restart), and no key, click or tap can — a kind's exit is absolute
  ([ui.md → Feedback pill](ui.md#feedback-pill)). During play, the shared
  `useDismissLocalFeedbackOnKey` makes "any key dismisses a result" universal
  (even games with no keyboard capture, like waffle / connections), while the
  focused-input guard keeps a chat keystroke from wiping a game's feedback.

**Local own-result feedback.** The player's own last move shows a `result` for
the *local* half of the feedback split (the *group* half is the header,
[Feedback pill](ui.md#feedback-pill) above): "Correct" / "Incorrect" / "One
away!" or a validation sentence, in the green/red/amber outcome palette.

**How it renders.** It's the same **`<FeedbackPill>`** as the header/global
area — identical CSS, centered, in the fixed-height **local feedback area**
(`.localFeedback`) in the `belowBoard` region — so local and global feedback read as
one register (see [ui.md → Feedback pill](ui.md#feedback-pill)). Every game's
PlayArea makes the slot with `useFeedbackSlot('local')`, shows into it (a
result, a not-ok, and its standing conditions as effects), and hands it to
its BoardCol to draw; the four word-list games show their results through
`useWordSubmit`. The slot reserves its height so swapping the pill in for the
move controls never reflows the board. In the eight turn-order coop games the
same slot also carries the "Waiting for ● Name…" standing note
(`FeedbackMessage.waiting()`), which ranks under the verdict, out-of-race and a
result ([common.md → Turn-order](common.md#turn-order--opt-in-turn-by-turn-for-coop-games)).

**Terminal reveal goes where the entry was.** When the game ends, render the
reveal ("The words were …") in the slot the entry vacated — *below* the
top-anchored board, never as a heading above it (a heading shifts the board down
on state change — [Layout stability](ui.md#layout-stability)). It lands where the
player was already looking and explains why the entry is gone.

**Locked names for the below-board row.** The row below the board and its parts
use one vocabulary across games, and the parts that are the same everywhere have
become shared stylesheets rather than a name each game retypes: **`.wordEntryRow`**
(`common/word-entry/WordEntryRow.module.css`) is the `⌫ | entry | Submit` control
itself, and **`.localFeedback`** + **`.moveAreaOrLocalFeedback`**
(`common/game-page/playArea.module.css`) are the pill's centering box and the
reserved-height box the controls and the pill swap inside. What stays in each
game's *own* module is the naming of its region: **`.belowBoard`** (the wrapper
under the board, often `display: contents`) and **`.moveArea`** (that game's move
controls where they aren't a `<WordEntryRow>` — connections' Clear / Submit pair,
wordle's on-screen keyboard). Reuse these names when a new game grows the same
row; connections keeps one of its own, **`.inputButton`**, for the floor width on
a labeled button in its commit row.

## Event log

The shared **`<EventLog>`** (`src/common/event-log/EventLog.tsx`) is a game's per-turn
history — one **item** per turn (= per guess for most games; a codenamesduet turn can
span a clue + several guesses, so an item is a "turn", never a "guess" in the
shared vocabulary). It's the chronological counterpart to the alphabetical
`<WordList>` (spellingbee/boggle); a game has whichever fits.

**The game owns its rows.** `<EventLog>` is the **panel only** — heading, scroll
box, `<table>` — and makes **no** assumption about row shape, because row anatomy
genuinely differs game to game: a one-row three-column guess, a two-`<tr>`
clue-then-guesses turn, a row with an inline mini-board. So a game renders its
**own `<tr>`s** inside `<EventLog>` (its children *are* the rows). The only shared
contract is *"an event-log item is a `<tr>` in this table."* Even the column count
isn't shared — psychicnum's one-guess row and a future five-column stat row are
both valid. (Parameterizing one row shape into a shared row component is
overfitting — it grows a prop per game-shape.)

What *is* shared is **vocabulary a game composes into its own rows**, so logs look
consistent without imposing structure:

- **It's a `<table>`,** so when a game *does* use the same columns across its
  rows, they line up (number column, who column, …) — a flex/grid-of-rows can't.
  **Use that structure: give each distinct piece its own `<td>`** (and put a
  second line on a second `<tr>` with a `rowSpan`ned bar — *not* a stacked div in
  one cell). **Don't** collapse a row into one `<td>` and rebuild the columns with
  flexbox/grid inside it, and **don't** stack two lines in one cell — both throw
  away the alignment the table exists for (the codenamesduet *and* connections
  conversion bugs: connections first kept its tiles + a `verdict | who` flex
  sub-line in a single cell; it's now a two-`<tr>` turn). A lone `<td>` (often
  `colSpan`) is right only when the row's content is genuinely **one piece** — a
  phrase like psychicnum's hint row (`Hint: <clue>`) or a single joined string —
  never a way to fit two pieces (a verdict *and* an actor) side by side. Default
  cell padding/size lives on `:where(.eventLogTable) td` (held at single-*element*
  specificity by `:where()`, so any game cell class or the bar atom overrides it
  without a fight).
- **`<EventLogOutcomeBar outcome rowSpan?>`** — the colored outcome-bar **cell**, the one
  row piece common to most logs. It's *optional* (a game's row needn't include
  it) and self-contained (its CSS doesn't depend on the `<tr>` carrying any
  class), so a game drops it into whatever row it builds. `outcome` is an
  `Outcome` — the whole shared vocabulary ([outcomes.md](outcomes.md)), because
  any outcome can be a turn's; it picks straight out of the `--outcomes-*`
  palette, so a lost turn reads the same everywhere. `rowSpan` lets a multi-row turn have the
  bar cover the whole turn (codenamesduet). The bar is a real `<span>`, not a
  styled empty cell (**an empty table cell collapses — its `width` is ignored —
  and has no content box to paint**); a zero-height `::before` spacer reserves the
  column width so a content-rich row can't squeeze the bar to nothing. The cell's
  padding sets the spacing; the span is absolutely positioned + inset top/bottom
  so it tracks the (possibly multi-row) cell height and adjacent bars read as
  individual segments.
- **`.divider`** — the between-turns **divider line**. A game puts it on
  the **first `<tr>` of each turn** (it alone knows where a turn starts — one row
  or several). It's a *top* border, so a multi-row turn gets **no** mid-turn line;
  `:first-child` suppresses it on the very first turn, so a game applies it to
  every turn-start row unconditionally. Full width, reaching the left edge (over
  the bar column too). Flat rows, no per-row card border, no vertical borders.
- **Multi-row hug (`.entryHead` / `.entryCont`).** When a turn is several `<tr>`s,
  the game tags the **first** row `.entryHead` and each **continuation** row
  `.entryCont`; the shared CSS trims the facing padding so the rows read as one
  entry, not several. Explicit classes (the component knows the row kind) rather
  than a structural `:has()` selector — readability over cleverness. Single-row
  turns carry neither.
- **Column-sizing classes** — a small model for a row's cells: an optional
  `<EventLogOutcomeBar>` (col 0), an optional **`<EventLogNumber>`** (the turn number —
  muted, shrinks, never wraps; a live handle or a plain number, see the viewer
  below), one or more content columns, and **`<EventLogActor>`** (the who cell:
  right-aligned, shrinks to the actor's "name ●"). Exactly **one** content column
  is **`.main`** (`width: 100%` — it absorbs the row's slack so it's least likely
  to wrap; put it where the gap should land, typically the last content cell
  before the actor); any other content columns are **`.other`** (sized to fit, one
  line). These carry **sizing only, no emphasis** — compose a look on top (e.g.
  `cls(gameEventLog.other, gameEventLog.primary)` for a bold word). The slack lives
  in `.main`, **not** the who cell — a `width: 100%` there would steal it and wrap
  a sibling (the connections "Not a match" bug).
- **Emphasis classes** — `.primary` (the bold lead value) and `.muted`
  (de-emphasized text inside a row: "(no guesses)", a `Hint:` label) — plus the
  shared [`<ActorDot>`](ui.md#player-identity--a-colored-disc) for the actor (name +
  identity disc). The game-side classes live in `gameEventLog.module.css` under
  bare names, read as `gameEventLog.primary` (namespaced by the import alias); what
  the atoms draw themselves is `EventLog.module.css`, which no game imports. Reach
  for an existing class/component before inventing one.
- **Scroll box.** Heading over an *evident* bordered, fixed-height box (a 2px
  frame, not a hairline) that stays the same height whether empty or full and
  auto-snaps to the newest row; the table scrolls inside it.

psychicnum, connections, and codenamesduet each render their own rows:
psychicnum's is a single `<tr>` (number / word / result / who columns);
connections's is a **two-`<tr>`** turn — row 1 `verdict | who` columns, row 2 the
four guessed tiles spanning beneath; **codenamesduet's is the multi-guess case**
the "item, not guess" vocabulary was named for — a **two-`<tr>`** turn (the bar
`rowSpan`s both) with real `# | clue | clue-giver` columns on row 1 and the turn's
guesses spanning beneath on row 2 (its per-turn outcome derived in
`codenamesduet/lib/turnOutcome.ts`).

### Whose turns? — the shared player picker

Every event-log game carries the same **"whose turns?"** dropdown in its log
header, from
[`useEventLogPlayerPicker`](../src/common/event-log/useEventLogPlayerPicker.tsx).
One vocabulary, settled 2026-08-02:

| game shape | options |
|---|---|
| solo | *your handle* |
| co-op | **Team**, then every player by handle |
| compete | **All**, then every player by handle |

The aggregate leads and is normally the default; the per-player entries are for
pulling one thread out — "which clues did I give?", "just my own scrabble plays",
"how did moth spend their psychicnum budget?". **Players are named by handle,
including you.** An earlier version labeled the viewer "You", which made your own
row read as a different *kind* of thing from everyone else's; a list of handles is
one list. You're still ordered first.

The pieces travel with the hook, and re-deriving any of them per game is how they
drift: the dropdown, its default selection, the aggregate label (mode-dependent),
the row filter and the empty-state wording. **The panel takes the hook's result whole** — `<EventLog picker={eventLogPicker}
shown={shown}>` — rather than being handed the control and the wording
separately, so there is one way to wire it and nothing to get out of step. What
stays the game's is `shown`: every game but codenamesduet builds it with
`eventLogPicker.filter`, and codenamesduet filters turn numbers rather than
rows. Two of them need care:

- **`emptyText` stays honest.** In compete, RLS hides an opponent's rows until the
  game ends, so an empty opponent log mid-game means *"hidden"*, not *"they
  haven't played"*. At terminal their rows reveal and empty really is empty. Which
  is why the compete games' row policies all carry an `or cg.is_terminal` arm —
  psychicnum's was added when it got the picker.
- **The number and the link are different values.** `#N` counts the rows on
  show — under a filter it numbers what you are looking at, which from your seat
  is honest — while the handle carries the row's own `id` (codenamesduet's a
  `turn_number`, since its log is a table of turns). So every handle is live
  whatever the filter, and a builder resolves the id against the list it folds:
  ask for a row that list does not hold and it replays nothing.

Some games bend the defaults, each documented at its call site:

- **scrabble and setgame** pass `competeSharesOneGame` — their compete race
  happens on one public board, so `All` is what you're actually looking at.
  scrabble's roster also carries its **bots**, which need no special case: a bot
  is an account with a profile and a `game_players` row, so its plays carry its
  user_id and it takes its alphabetical place in the dropdown.
- **codenamesduet** files a turn under its **clue-giver** — the person the row's
  actor column already names — since a duet turn is one clue plus the guesses that
  answered it.

## Word list

The shared **`<WordList>`** (`common/components/game/lists/WordList.tsx`) is the
alphabetical counterpart to the event log, worn by the three word-hunt games —
spellingbee, wordwheel, boggle. A column-major grid in a fixed-height card; each
row leads with a **circle marker** carrying attribution (a filled ● in the finder's
color for a find, a hollow ○ in gray for a missed word), with the word itself plain
black so identity rides the disc, not the text ([ui.md → Player identity](ui.md)).

### The reveal covers BOTH shipped lists

At terminal, every word **nobody found** folds in — required *and* bonus. The
missed-bonus half is the point as much as the required half: it's where the
interesting vocabulary lives (`ACRITARCH`, `CACCIATORA`, `ARRACACHA`), and seeing
it is a real part of the post-game read. Both lists are already on the client from
game start (the FE validates and scores guesses against them locally), so
`buildRevealWords` is a pure client-side fold — nothing new crosses the wire at
game end, and the gate is the viewer's own reveal toggle.

Sizing, measured against the local dictionary at the default bands (required 3 /
legal 5): the bonus set is roughly the **same size** as the required set, not the
multiple it looks like — band 3→5 is a narrow widening, and what really separates
the two is the `american / not slang / clean` filter. So the terminal list roughly
doubles. The grid is fixed-height and column-major, so that reads as *more
columns*, never a taller panel — no vertical reflow.

**When a board has no real bonus list**, the reveal skips it and the KIND filter
disappears. That's `legal_band === band` (boggle) / `legal === required`
(spellingbee, wordwheel), where "bonus" degenerates to nothing but the words the
clean filter removed from required — crude/slang/slur, not a wider dictionary, and
not a list to hand anyone as "here's what you missed." One flag per game gates the
reveal, the KIND select, and (in boggle) the Bonus stat cells, so the three can't
disagree about whether this board has bonus words.

### The two-axis filter

The list header carries **two** selects, from
[`useWordListFilter`](../src/common/word-list/useWordListFilter.tsx):

| axis | options | gated? |
|---|---|---|
| **KIND** | **Legal** · Required · Bonus | never — only hidden entirely when the board has no bonus list |
| **WHO** | **All** · Found · Missed · *every player by handle* | yes — see below |

Resting state reads **"Legal · All"**. The aggregates are the defaults in both
modes (unlike the event log's compete default — here the list already *is* yours).

### The heading tallies the FILTERED list

The card's heading counts, scores and measures whatever the two filters
currently show — **"Words: 7 · Score: 10 · Longest: 5"** — which turns the
filters into a reading tool: flip WHO to a player to see their coop
contribution, to Missed at terminal to see what the reveal cost, KIND to Bonus
to see what the wider dictionary was worth.

Rows carry an optional `points`; the score segment renders only when the
game's rows carry points at all, gated on ALL rows rather than the filtered
set, so an empty filter reads "Score: 0" instead of the segment vanishing
(no heading reflow as filters flip). Games whose lists don't score (none
today, but the prop is optional) get a count-only heading.

**Longest** is the longest shown word in LETTERS. Ungated — every word list has
lengths, so there's no "does this game have it" question to ask — and
**desktop-only**: below the breakpoint the info column becomes the off-canvas
sheet, where this heading shares one line with both filter selects, and the
third clause is what doesn't fit. It's hidden by a media query rather than
dropped from the tree, so there's one string to reason about at every width;
`spellingbee-mobile.e2e.ts` pins both halves (visible in `innerText` on
desktop, absent there but still present in `textContent` in the sheet), which
is what stops a future fix from removing the span instead of hiding it.

Pinned by `WordList.test.tsx` — whole-list, per-player, missed, count-only, and
the longest tracking the filter.

- **Why two controls and not one flat list.** They answer independent questions, so
  one select can't express "leah's bonus words" — and worse, picking `Bonus` would
  silently discard a `leah` selection with nothing on screen admitting it. Two
  controls make the whole state readable at rest.
- **Why WHO is one axis and not two.** `Missed` looks like it belongs on a separate
  found-vs-missed axis beside a person, but a missed word *has* no finder:
  `Missed × leah` is a contradiction and `All × leah` is just `Found × leah` again.
  "Everyone / somebody / nobody / this person" is one proper enumeration.
- **`Legal`, not a second "All".** Both selects render bare and side by side; two
  adjacent dropdowns reading "All" can't be told apart at a glance. `Legal` is also
  the games' own word — boggle's setup disclosure already says "Dictionary
  (required) / Dictionary (legal)".
- **Which axis needs gating.** KIND is always live: it narrows whatever rows you can
  already see, which is correct mid-game in compete too (RLS has scoped them to
  you). WHO carries the honesty rules — `Found`/`Missed` appear only once a missed
  row actually exists (derived from the rows, so a team that found everything isn't
  offered a `Missed` that resolves to nothing), and the per-player entries only in
  coop or compete-post-terminal, never solo. Because an option that would be
  dishonest simply *isn't offered*, this hook needs no "hidden until the game ends"
  empty line — unlike the event log's picker, every empty it explains is a real one.
- **The empty line names the axis that emptied the list.** "No words yet" is a lie
  when you've picked Bonus and simply have none.

**Two things it does differently from the event log's picker**, both deliberate: the
hook is called **inside** `<WordList>` rather than by the game, since nothing
outside the list consumes the selection (a word list isn't chronological — there's
no history viewer for it to address at all), and keeping it
in there guarantees the **PDF prints the full list** no matter what's filtered on
screen — the printers build their own rows from the same `buildDisplayRows` and
never see this state.

**`finderIds` on a found row.** A word several people found shows **once**,
attributed to the first finder — that's whose color the dot carries. But every
finder is kept on the row, because the WHO filter matches against the whole list:
without it, filtering to *yourself* would hide a word you genuinely found because
someone else got there a second earlier. Compete-post-terminal only (coop's
`submit_word` rejects a word anyone already found).

## Turn-history viewer

Every game whose board can replay past turns (scrabble, stackdown, connections,
psychicnum, codenamesduet, wordle, waffle, strands, letterboxed, setgame) lets you
**click a past turn to see the board as it was then**. The affordance is shared and
looks identical everywhere:

- **The `#N` handle** (`<EventLogNumber>` in `src/common/event-log/EventLog.tsx`) — each
  turn's number cell is the click target; clicking it opens that turn on the board.
  **Not** the whole row: several games render a turn as multiple `<tr>`s
  (codenamesduet's clue + guesses), where a row-wide "viewing" outline draws a broken
  box — a single small handle stays crisp regardless. It's a `<span>`, not a
  `<button>` (a focused button re-fires its click on Space, and Space is a viewer
  exit), and it carries `data-history-handle` so the click-to-exit handler can tell
  "open a turn" from "click away."
- **The framed board.** While viewing, the board wears the shared
  `historyViewer.module.css → .historyFrame` (a "viewing" outline in the history blue +
  banner, input frozen to the eye — it stays mounted underneath, so an in-progress
  entry survives) and the open turn's `#N` wears `.historyNumber` (the matching ring).
  `.historyFrame` also sets `pointer-events: none`, so a board click falls through to the
  exit handler — a viewed board is a read-only snapshot.
- **Three exits, all shared.** A keystroke (the hook binds `act-exit-history`, whose
  any-key wildcard consumes the press) and a click anywhere (except another `#N`
  handle, which switches turns) are intrinsic to the hook — a game wires neither.
  The third is the banner **✕**, which `<HistoryBanner>` draws and the game points
  at `exitHistory`.
- **On a phone, opening a turn leaves the info page.** `showHistory` clears the info-sheet
  flag (`setInfoSheetOpen(false)`) as well as setting the viewed turn, because below
  the breakpoint the `#N` handle lives in the event log — which is *on* the off-canvas
  info page, while the board it replays is on the other one. Without it the viewer
  opened behind the page you were standing on, and the tap on "Switch views" that
  would have revealed it counted as click-anywhere-to-exit and dropped you back to
  live: the feature was unusable on a phone rather than broken, which is exactly why
  it read as working. Unconditional rather than `useIsMobile`-gated — the flag is
  already false on desktop, so it's a no-op there, and a second breakpoint read would
  only give the two a way to disagree.

The coordination — which turn is open + the enter/exit affordances — is the shared
**`useHistoryViewer`** hook (`src/common/event-log/useHistoryViewer.ts`); the `PlayArea`
holds it as its one cross-column "am I viewing" state. What stays **per-game** is how
a snapshot is *computed* from the viewed turn (each game's **`lib/history.ts`** — the
board shape and even the boundary differ: an ADD-style board shows the turn's own
move *included*, a removal-style board like stackdown/connections shows the fuller
*pre-move* board) and how a turn is *identified* (the row's own id, or
codenamesduet's `turn_number`). See
[Per-game history-viewer specifics](#per-game-history-viewer-specifics) below for the
full seam and the per-game keying.

## Board sizing

**Vocabulary.** The board is the **`.board`** element; inside it is usually a
**`.grid`** — the place where tiles are laid out (need not be graph-paper-regular:
spellingbee's hex cluster is still a "grid"). Border, background, and padding are the
**`.board`'s** job — sometimes present (boggle looks like a wooden tray), often not;
the `.grid` has none of them. And whatever the real-world piece is — a Scrabble tile,
a Codenames card, a Boggle cube — **we always call it a tile** (see [Interactive tile
states](ui.md#interactive-tile-states) for tile look + decided/draggable states).

A game board grows as large as the space allows. **Every board-grid game shares one
model: the board column HUGS its board.** The column is only as wide as the board,
and the board+info pair centers (`justify-content: center` on `.layout`). **"Fill" is
just the no-cap case of hug** — with no max tile size the board grows to the full
available width, so a capless game reads exactly like the old fill model. (Each game
exposes a max-tile-size knob; psychicnum caps, most ship uncapped today — so they
still *look* like they fill, but they're on the hug structure.) The **square boards**
(waffle, scrabble, boggle, letterboxed) compute a single **`--side`** bounded by BOTH the width
left beside the info column (`--avail-w`) AND the height above their input/rack row
(`--avail-h`); the non-square boards hug width alone. (bananagrams is the one FILL
exception — a fixed 25×25 arena; see docs/games/bananagrams.md.)

### The shared scaffold

In `common/game-page/playArea.module.css`:
- **`.boardCol { flex: 0 0 auto }`** — hugs its board (was `flex: 1` fill).
- **`.layout`** defines **`--avail-w`** = `calc(var(--client-width, 100vw) -
  var(--info-col-width) - var(--layout-gap) - 2 * var(--page-padding-x))` — the
  width left beside the fixed info column, built from shared tokens (so a change to
  the info-column width, the layout gap, or the page padding flows through to every
  board automatically). This is the *input* to each game's board width — see [Why
  the width is computed](#why-the-width-is-computed) for why it can't just flex.
  `.layout` also carries an explicit `width` (the content area) — see below.

**Two things had to be right for the board+info pair to stop drifting off the
right edge at the game-over `WordList` reveal (a big list forces the info column
tall/wide):**

1. **`.layout` has a definite `width`, not shrink-to-fit** (`calc(var(--client-width, 100vw) - 2 * var(--page-padding-x))`).
   `body` is `place-items: start center`, which sizes its grid item to its content's
   *max-content* width. The shared `WordList`'s column-major grid has an enormous
   max-content (every column laid out) at the reveal, and **WebKit (Safari) leaks
   that up through the grid's `overflow` clamp into the shrink-to-fit sizing** —
   ballooning the whole frame to ~9500px and shoving the board+info pair
   off-screen. Blink (Chrome) bounds it, so it only showed in Safari/Firefox.
   Pinning `.layout`'s width breaks the cycle: the list's intrinsic width can't
   inflate a fixed-width layout, and `justify-content: center` still centers the
   pair. **Verified in the Playwright WebKit + Firefox engines** (Chromium never
   reproduced it — see [layout verification](#) note in the memory).
2. **`--client-width`, not `100vw`, for the width math.** `100vw` *includes* the
   vertical scrollbar; the content box doesn't. On classic (space-taking)
   scrollbars (macOS "always show", most Windows) that overstates the width by
   ~15px and the board overflows right — invisible with overlay scrollbars (0px),
   so headless can't see it. `--client-width` (`document.documentElement.clientWidth`)
   excludes the scrollbar in every engine; it's measured and kept current with a
   **ResizeObserver** (`common/lib/util/layoutWidth.ts`) so a *content-driven* scrollbar
   (the reveal) updates it — a `resize` listener misses that. `html {
   scrollbar-gutter: stable }` (theme.css) additionally avoids a cosmetic
   board-resize when the scrollbar toggles, where supported.

### Each game's board

A board computes a **definite width** and hugs it; its **height flex-fills** the
column, capped:

```css
.grid  { width: min(var(--avail-w),
                     calc(var(--cols) * var(--max-tile-width, 999rem)
                          + (var(--cols) - 1) * var(--grid-gap))); }
.board { flex: 1 1 0;            /* fills the column height; grid's 1fr rows fill it */
         max-height: calc(var(--rows) * var(--max-tile-height, 999rem)
                          + (var(--rows) - 1) * var(--grid-gap)); }
```

The grid is `repeat(var(--cols), 1fr) / repeat(var(--rows), 1fr)` with a fixed
`var(--grid-gap)`, so tiles divide the definite size evenly with **constant gaps**
(capping a tile no longer stretches the spacing). `--cols`/`--rows` are per game —
static in CSS where the board shape is fixed (codenamesduet/waffle 5×5), or set
inline where they vary (psychicnum `ceil(√N)`; connections `bands + tile-rows`,
set on `.board` in `Board.tsx`).

**The tinker knobs.** Each game's board module carries a `─── TINKER HERE ───`
block with **`--max-tile-width`**, **`--max-tile-height`**, and **`--grid-gap`**
(rem). **Comment a cap line out → that axis is uncapped** (the `999rem` fallback
wins, so the board fills the available space on that axis). The knob lives
wherever the game keeps its board CSS — psychicnum `Board.module.css`,
connections `PlayArea.module.css`, codenamesduet `Board.module.css`, waffle
`Board.module.css` (a known inconsistency — consolidating them onto `.layout`
is a possible follow-up).

**`--info-col-width` is game-specific** — set per game on its `.layout` (the
shared scaffold has **no default**, so each game must declare it), since the right
column's needs differ (psychicnum narrow; spellingbee wide when it converts). It
feeds both the shared `.infoCol` width and `--avail-w`. The value is a **rem**:
"fixed-width" means `flex: 0 0` (never grows/shrinks), *not* a pixel lock.

**Waffle is the square variant.** A square is bounded by *both* dimensions, so it
can't size by width alone: `side = min(var(--avail-w), var(--avail-h), <cap>)`,
where **`--avail-h`** = `calc(100vh - var(--game-chrome-height) - <its
below-board slot>)` is the vertical counterpart of `--avail-w` (only waffle needs
it — the rectangular games flex-fill height). Its `.board` is `flex: 0 0 auto`
(the grid is definite in both dims) and its tinker knob is a single
**`--max-tile-size`** (square → one cap, not separate width/height). A solved
connections category is still **"one long tile"** (`grid-column: 1 / -1`) — a band
spanning all columns at the same row height/padding/depth as a tile.

### Why the width is computed

A shrink-wrapped flex column can only hug a child whose width is *already known*.
A square's width comes from its height; a `flex:1` / `container-type: size`
board's width comes from the column — both circular, so the column **collapses**.
Computing the width from the viewport (`--avail-w`, plus `--avail-h` for the square
boards — waffle, scrabble, boggle) breaks the cycle. (This is exactly why the
container-query square waffle used before couldn't be hugged: the size container
collapsed in a hugging column.)

**Single-glyph vs word tiles** is unchanged: scale a single glyph (a digit, an
A-game letter) with the tile via `cqmin`/`cqi`; multi-char content auto-fits via
`cqi` + `--len` (see [Tile content](ui.md#tile-content-letter-vs-word-a-vs-b-games)).

---

## The BoardCol / InfoCol decomposition

Every standard game is decomposed into `BoardCol` / `InfoCol` (bananagrams via its
own engine-hook + views shape — see below). The shared turn-history viewer
(`useHistoryViewer` + a per-game replay helper) ships in the **ten** games whose
board can replay a past turn — stackdown, connections, psychicnum, codenamesduet,
wordle, waffle, strands, letterboxed, setgame (each via its own `lib/history.ts`)
and scrabble (via `historyBoard` in `lib/play.ts`); spellingbee + boggle are
decomposed but have **no** viewer (a `WordList` isn't chronological).

**Read [What building it taught us](#what-building-it-taught-us) before extracting
`InfoCol` / `BoardCol` for a new game** — it records where the "target architecture"
table below was too clean, learned by actually building it.

## Why

The per-game `PlayArea.tsx` files are large — most were 450–900 lines
(scrabble 892, spellingbee 680, connections 670, …). Per CLAUDE.md's
"the codebase itself is part of the artifact" priority, a 450+-line React
component is too big to hold in your head. We want a **consistent, readable
decomposition** across games, and we want it shaped by the one feature that most
stresses the seams: **turn-history viewing**.

## Target architecture — four layers

A per-game recipe, applied to the ~9 standard two-column games (bananagrams is the
layout exception — see below):

| layer | owns | interface |
|---|---|---|
| **`Board`** | pure presentation of a board state | state **down**, clicks **up**. |
| **`BoardCol`** | the **live input engine** (drag / cursor / keyboard / word-building) + local below-board feedback; renders `Board` | **takes the board-state-to-render** (live *or* a historical snapshot) + a `readOnly` flag **down**; emits **one committed action up** (`onPlayWord` / `onGuess` / `onSubmitWord`). |
| **`InfoCol`** | almost nothing — arranges the shared pieces (`OpponentStrip`, `InfoActionsRow`, `SetupDisclosure`, `EventLog`) around a game-specific readout | props **down** — the bound actions it places among them (`actHint`, `actEndGame`, `actConcede`, …) — + a few named callbacks **up** (`onShowHistory`, …). Near-zero internal state. |
| **`PlayArea`** | game data (`useGame`), server mutations (RPCs), and **cross-column coordination state** (e.g. `historyId`) | wires `BoardCol` ↔ `InfoCol`. |

### The load-bearing contract

**`BoardCol` owns *editing*; `PlayArea` hands it the *board to show*.** This is the
one seam to get right. `BoardCol` does NOT own the live game state — it owns "how
I'm editing, given a board handed to me." That's what makes turn-history a drop-in
everywhere: viewing a past turn is just "hand `BoardCol` a historical snapshot +
`readOnly=true`", no reopening the columns.

### Cautions

- **A review overclaims uniformity every time.** Always diff all N PlayAreas
  before extracting; the shared core is real, the tail is deliberate per-game
  difference. Extract the core, name it honestly, leave the outlier, document it.
- **Refactor ≠ feature.** A decomposition step must be a behavior-preserving no-op
  (verify via the render tests + `e2e/board-geometry.e2e.ts`); a feature adds
  behavior. Never mix them in one commit.
- **bananagrams is the v3 layout exception** (board fills / hand+peel+dump in the
  info area / no event log). It does NOT map onto the two-column `BoardCol`/`InfoCol`
  model, because its input engine spans BOTH columns (the hand tiles are drag SOURCES
  into the board; the dump zone is a drop TARGET during a board drag; the derived hand
  is a function of board state; the keyboard cursor types onto the board but checks the
  hand). It's handled via its **OWN shape** — the honest analog of "engine + views + thin
  coordinator": the cross-column engine lifted into a hook **`usePlayerBoard`** (557),
  two thin presentational VIEWS **`BoardArena`** (board column, 137) + **`HandCard`**
  (info column, 125) — deliberately NOT named `BoardCol`/`InfoCol` since they own no
  input — and a now-thin **`PlayerBoard`** (711→183) that lays out the two columns.
  Note the TWO-LEVEL coordinator: `PlayArea` (298) stays the OUTER
  coordinator (data / peel-dump-concede RPCs / feedback channel / terminal verdict, via
  the `infoTop`/`infoActions`/`localPill` slots) above `PlayerBoard`, the columns'
  coordinator. CSS left INTACT (`PlayerBoard.module.css` imported by all three) — the
  board + hand tiles SHARE `.tile`/`.handTile`/`.lifted`, so a split would duplicate
  them (same call as connections). bananagrams is OUT of the geometry harness (a fill
  arena, not a hug board), so the no-op net is the 4 `PlayArea.test.tsx` render tests +
  the full `e2e/bananagrams.e2e.ts`. See docs/games/bananagrams.md.

## Per-game history-viewer specifics

The viewer is one shared machine (`useHistoryViewer` + the `#N` handle + the shared
exit paths — see [What building it taught us](#what-building-it-taught-us)). What
stays per-game is **snapshot computation** (each game's `lib/history.ts`) and **turn
identity** — which is the row's own id everywhere now except codenamesduet,
whose log is a table of turns and addresses a `turn_number`. The variations that matter when
adding a viewer to a new game:

- **stackdown** — keyed by the **row's id**; **strictly-before** snapshot: the board
  minus tiles cleared by valid submissions written before it, so the viewed turn's own
  word tiles are still present and greened (the same green scrabble uses for a turn's
  placements). Invalid / hint / spoiler turns carry no tiles → snapshot = removed-by-valid
  before it, no green, a kind-aware description. `lib/history.ts`, pure + unit-tested.
- **scrabble** — keyed by the **row's id**; the snapshot is `historyBoard` in
  `lib/play.ts`. Its fat `BoardCol` runs `historyBoard`
  itself (the raw `plays` already live there for the live board) rather than being handed
  a ready board.
- **connections** — keyed by the **row's id**; the first **mutating** board (a correct
  guess collapses four tiles into a band), so **strictly-before** like stackdown: the
  viewed turn's four tiles stay on the grid, tinted by outcome + ringed. Needed a `#N`
  column added to its two-`<tr>` log.
- **wordle** — keyed by the **row's id**; **inclusive / add-style**: the snapshot
  (`src/wordle/lib/history.ts`) is the first N guess rows, the last ringed in the
  history blue (`Board` gains `isViewingHistory` + `historyLitBoardRow`). Twist: the log has a
  **"whose board" picker**, so the number counts the rows on show while the
  handle carries the row's own id — an opponent's revealed log (compete
  terminal) numbers 1..N from their seat and opens their rows.
- **psychicnum** — keyed by the **row's id**; add-style; the guessed tile shows its
  green/red outcome color + a ring in the history blue.
- **strands** — keyed by the **row's id**; **inclusive** fold over the rows so far;
  `historyLitTiles` = the viewed word's tiles, ringed in the history blue.
- **codenamesduet** — keyed by **`turn_number`**, because its log is a table of
  turns rather than of rows; the snapshot (`src/codenamesduet/lib/history.ts`) folds the
  guess log onto the fixed board (global `revealed_as` + per-seat `neutral_a/b`) and
  rings that turn's own cells. A two-input game — its `BoardCol` owns the **guess** RPC
  (the guess is a board click; `CluePanel` keeps the clue RPCs).
- **waffle** — keyed by the **row's id**; `historyLitTiles` = a viewed swap's neutral cell ring.
- **setgame** — keyed by the **row's id**, and a pure **lookup** rather than a
  replay: the event row carries `board_after`, so `lib/history.ts` reads the
  board out rather than replaying anything. Deliberate — replaying setgame's
  deal rule on the FE would be a second implementation of the subtlest logic in
  that game, with nothing testing that the two agree. `historyLitCards` = the viewed
  event's own cards, which for a hint row is one, two or three of them.
- **wordiply** — keyed by the **row's id**, and the one game where what the viewer
  is FOR is the rows that are NOT on the board. Its five slots are all visible at once, so
  replaying an accepted word shows what you can already see; a REJECT is on no
  board, and opening its `#N` is the only way to see the table as it stood when
  that word was tried. So `lib/history.ts` folds the rows *including* rejects to
  find the one addressed, and fills a slot only per accepted word.
- **letterboxed** — keyed by the **row's id**; **inclusive** fold over the event
  stream (`historyChainAt` in `lib/history.ts`: played pushes, undone pops, cleared
  empties, help rows change nothing) — the log records retreats precisely so this
  replay works, since a chain is a stack that can shrink, not a board that
  accumulates. Like wordle, the log has a "whose board" picker in compete; the number counts
  the rows on show and the handle carries the row's own id. **The only game whose frame wraps more than the board**: the
  chain strip and the board are two views of one state (the strip lists the
  words, the board shows which letters they covered), so `BoardCol` groups them
  in a `.historyFramed` box and puts `.historyFrame` on that. Framing just the board left the
  strip live while the board rolled back — the two then showed a combination that
  never existed. One box rather than two also avoids stacking `.historyFrame`'s 3px-offset
  outlines a few pixels apart. Row COUNT for the strip still comes from the LIVE
  chain (`chainRowsStyle`), or reviewing an early turn would shrink the strip,
  hand the space to the board via `--avail-h`, and move the column.

UX is uniform (and matches across the history games): enter by clicking a turn's `#N`
handle; the input freezes and the board shows the historical state; any interaction
(keystroke / click anywhere / the banner ✕) returns to live; works at terminal too
(reviewing the finished board is a prime use).

**In compete, a `#N` can open someone else's board, and the banner says whose.**
At terminal an opponent's rows are visible (mid-game the RLS arm hides them, so
there is no handle to click), and reading a finished wordle as six lines of text
when the app can draw it as a board is the gap this closes. The PlayArea resolves
the row first and folds *that player's* rows, so the snapshot is built from their
sequence rather than yours; `<HistoryBanner>` then takes an `actor` and reads
`● moth: GUESS 3` — the DotActor, then the game's own label, which is otherwise
unchanged. The actor is passed **only** in compete and **only** for a row that
isn't yours: coop is one shared board, and naming a teammate there would claim a
board everyone played on. Three games pass no actor at all — setgame's table is
contended (every row stores its own `board_after`), scrabble's label already names
the player, and codenamesduet addresses a `turn_number`.

**The banner prints the `#N` you clicked, not one it works out.** The log numbers
the rows IT is showing; a game's label builder is folding the other list and would
count a different number. So the handle hands up both halves — `showHistory(id, n)`
— and the hook gives them back as `historyId` and `historyN`. It is null for an
opening that came from no numbered row, which today is scrabble's shared-move
preview.

## Prop conventions for the columns

These keep the columns legible AND consistent across games — the second is
load-bearing: a `BoardCol`/`InfoCol` prop that means the same thing in two games
MUST be spelled the same, or reading the second game means re-deriving what you
already knew. Drift here causes real head-scratching.

- **Flat prop lists, grouped by region, NOT prefixed.** A long, explicit prop list
  beats a giant component with no seams. Keep the props flat (no `actionsOnHint` /
  `oppStripHintCount` prefixes — they stutter against the `on*` convention, reinvent
  namespacing as strings, and force a single taxonomy onto props that serve two
  regions). Instead, order the props to mirror the render order and separate them
  with `// ── Section ──` header comments, and mirror that same order at the call
  site. That answers "what is this prop for?" by eye at zero cost. (No React.memo
  anywhere in the app, so grouping into objects would buy nothing; if a future
  memoized *child* ever needs a grouped object, `useMemo` it — but that's not today.)
  **Header placement: the `// ── Section ──` headers live on the TYPE block** (next
  to the per-prop docstrings, which document each group); the destructure above is a
  flat list with a short lead comment pointing at them. All six columns
  (stackdown/waffle/scrabble × BoardCol/InfoCol) follow this — don't put the headers
  in the destructure and leave the type block bare.
- **One vocabulary across all games.** For the same idea, use the same prop name
  everywhere: `readOnly`, `over`, `isTerminal`, `isCompete`, `isPlayer`,
  `historyLabel`, `onExitHistory`, `onShowHistory`, `players`, `selfId`,
  `playerStates`, `concededIds`, `myConceded`, `setup`, `solution`, `onEndGame`,
  `onConcede`, `onBackToClub`, … When a new game needs a prop that an earlier column
  already has under some name, REUSE that name; only diverge when the meaning truly
  differs, and say so. Treat this list as the seed glossary; grow it as games land.
  Easy to re-drift, so worth calling out:
  - **The turn-history viewer passes ONE prop that says whether it is open, and
    the flag is DERIVED, never passed.** A column that takes both a
    `historyLabel` and an `isViewingHistory` has two values that cannot disagree
    and a guard that re-checks what it already knows. So the column writes
    `const isViewingHistory = historyLabel !== null` at the top of its body, and
    the PlayArea passes the viewer as `historyLabel` + `onExitHistory` (+ that
    game's `historyLit…` marks). Settled 2026-09-16, when ten games had four
    different answers: five passed the flag, three derived it from the label, one
    from its snapshot, and one never named it and tested `historyLabel !== null`
    at seven separate places. **Two columns take a whole snapshot instead of the
    label** — connections and wordle, because their board data comes out of it
    too — and derive from that (`historySnap !== null`); **scrabble takes
    `historyTarget`**, a union of a past turn and a peer preview, because its
    column owns the plays the banner's label is built from. The rule is the
    derivation, not which prop carries the answer.
  - **Below-board feedback is the slot, under its one name:** a column takes
    **`localFeedbackSlot`** (`FeedbackSlot`), shows its own results into it and
    draws it with `<FeedbackPill>`; there is no folded pill prop and no
    show/clear callback pair (both had drifted per game before the slots).
  - **`isLocallyDone`** = "I'm out (conceded), the others race on" — the codebase
    majority (boggle/spellingbee/wordle/stackdown share the identical
    `isCompete && myConceded && !isTerminal`). waffle deliberately uses **`selfDone`**
    instead because its condition is *broader* (per-player-board race: solved / out of
    swaps / conceded); the different name flags the different meaning. Don't "unify"
    these — the split is the point.
  - **Same name, different id, on purpose:** `historyId` is the events row's own
    id in every game but codenamesduet, which addresses a `turn_number`, and
    scrabble, whose id is a union (a turn, or a teammate's shared move). The
    hook is generic over `Id`, so the name is shared and what it resolves is each
    game's `lib/history` (scrabble's `historyBoard`). The viewed turn's marks are
    `historyLit…` everywhere — `historyLitTiles` in stackdown and waffle alike,
    whatever color each game rings them in — never a name for the color.
  - **Snapshot ownership is NOT uniform, on purpose.** stackdown/waffle compute the
    historical board in PlayArea and hand a ready board *down* (the load-bearing
    contract); scrabble's fat BoardCol takes the raw `plays` + `historyId` and runs
    `historyBoard` itself, because the raw play data already lives there for the live
    board (same exception that makes it own its RPCs). Documented in its header.
- **A real object only for a genuinely cohesive cluster** that always travels
  together to one child (e.g. the OpponentStrip's inputs) — never to hit a number.

## What building it taught us

These are the places the "target architecture" table above was too clean — learned by
actually building the seam on stackdown first, then rolling it out. Read them before
extracting `InfoCol`/`BoardCol` for the next game.

- **The word-building buffer stays in the data hook, not `BoardCol`.** stackdown's
  `currentWord` / `appendTile` / `retractTo` / `commitWord` live in `useGame`
  because they're coupled to its optimistic-removal + realtime bookkeeping. So
  `BoardCol` does NOT own the buffer — `PlayArea` passes the editing primitives
  *down*, and `BoardCol` emits the completed word *up* (`onSubmitWord`); `PlayArea`
  owns the RPC + commit/clear. The contract ("BoardCol owns editing") means it owns
  the *input gesture → word*, not the *word state itself*. Expect the same wherever
  the buffer is entangled with server/realtime state (scrabble's `staged`, etc.).

- **Local below-board feedback lifts to `PlayArea`, NOT `BoardCol`.** The target
  table put "local below-board feedback" under `BoardCol`; building it disproved
  that for stackdown. The slot has **four** sources and three are outside the board
  column: the terminal verdict (a condition effect), submit results, and — critically —
  the **reveal/hint cheats, which are `InfoCol` actions**. A slot shown into from both
  columns is coordination state, so the **coordinator owns it**: `PlayArea` makes
  `useFeedbackSlot('local')`, shows the verdict and the cheats' answers into it, and
  passes the slot *down* to `BoardCol`, which draws it and shows its own input-engine
  results (no-match / ambiguous letter). Watch for this in any game whose info-column
  actions surface a result in the below-board slot.

- **Split flashes by their trigger, not by where they render.** Both of stackdown's
  flashes *render* inside `BoardCol`'s subtree, but ownership follows the trigger:
  the red ambiguous-tile flash (`useFlash`) is purely input-engine → lives in
  `BoardCol`; the green/red word-slot flash lives in `PlayArea` because a **coop
  teammate's move** (via `usePeerFeedback`) is one of its triggers. Render location
  ≠ state location — lift state to wherever all its triggers already are.

- **`readOnly` cleanly encodes `viewing || !canPlay`.** `BoardCol` takes one
  `readOnly` flag (not separate viewing/canPlay), because when NOT viewing it equals
  "can't play right now" — so the key handler is just `if (viewing) exit; if
  (readOnly) return`. This kept the board-to-show contract to two props
  (board-state + `readOnly`) as the table intended.

- **Verify a decomposition step with the geometry harness, not just render tests.**
  The no-op proof was `e2e/board-geometry.e2e.ts`: `BASELINE=1` on the
  stashed pre-refactor tree, `git stash pop`, re-run → the post-refactor `.boardCol`
  box matched to the pixel across all 8 boards. Render tests + `tsc` + eslint pass
  both before and after a botched CSS-relocation; the geometry diff is what actually
  catches a moved boundary. Use the same stash/baseline/compare dance for each
  game's `BoardCol`/`InfoCol` extraction.

- **`BoardCol` owns its RPCs when commit is inseparable from input state (scrabble).**
  The target contract is "BoardCol emits ONE committed action up; PlayArea does the
  RPC" (stackdown/waffle). scrabble breaks it: `play_word`/`exchange` claim
  `lastActionRef` *before the await* (the realtime-beats-RPC race) and their results
  mutate `optimistic`/`staged`/the flashes — all state the version-reset effect reads.
  Splitting the RPC from that state tears one atomic machine in half, so scrabble's
  `BoardCol` owns the RPCs directly (PlayArea hands it `game` + `gameId`). The rule:
  emit-up when the coordinator can own the *result*; own-the-RPC when the result
  mutates deep input state. (Feedback still lifted to PlayArea, like stackdown —
  InfoCol's End/Concede write the same below-board pill, so that channel IS
  cross-column even though the move RPCs aren't.)

- **For a heavy-input game, gate the extraction behind a real gameplay e2e first.**
  scrabble's component tests mock `useGame`/`db`, so they never exercise the turn
  machine (drag/cursor staging → `play_word` → optimistic hold → version-reset rack
  rebuild) — exactly what `BoardCol` moves. Before cutting, we added
  `e2e/scrabble.e2e.ts` (pin the coop rack via `setScrabbleRack`, type a word at the
  center, Submit, assert the "+score" acceptance + rack refill), ran it green on the
  pre-refactor tree, then re-ran it after — a behavioral before/after gate alongside
  the geometry one. Do this for any game whose input engine the tests can't reach.

- **The turn-viewer affordance is the "#N handle", shared across all history games.**
  A turn is opened on the board viewer by clicking its **`#N` number** (the shared
  `<EventLogNumber>` in `src/common/event-log/EventLog.tsx`), which rings *itself* in
  the history blue while that turn is open — NOT by clicking the whole row. Why:
  several games render a turn as multiple `<tr>`s (codenamesduet's clue + guess rows),
  where a whole-row "viewing" outline draws a broken box and a per-row hover lights
  only half the turn —
  a single small handle stays crisp regardless of row count. The "viewing" marker is
  `historyViewer.module.css → .historyNumber`. A history log therefore
  needs a `#N` cell to hang the handle on (a future history game without one must add
  it). The handle is a **`<span>`, not a `<button>`** — a focused button re-fires its
  click on Space, so pressing Space to leave the viewer would re-select the turn; a
  span takes no keystroke, so Space falls through to the viewer's `act-exit-history`.

- **Exiting the viewer is intrinsic to `useHistoryViewer` — no per-game wiring.**
  Three exits, all shared: (1) a **keystroke** — the hook binds `act-exit-history`,
  whose any-key wildcard consumes the press while a turn is open; (2) a **click
  anywhere** — a document-level listener *inside the hook* that exits on any click
  except one on a `#N` handle (`[data-history-handle]`, which opens that turn); (3)
  the banner **✕** (the shared `<HistoryBanner>`). For the click path to also cover
  the board, `historyViewer.module.css → .historyFrame` sets `pointer-events: none` (a framed board is
  a read-only snapshot), so a board click falls through to the document listener.
  Verified in a real browser (`e2e/codenamesduet-history.e2e.ts` exercises Space, a
  board click, and an info-column click).

## Resolved along the way

- **`useHistoryViewer`** (rule of three): once turn-history reached three games the
  coordination itself (the `historyId` + "am I viewing" flags + the enter/exit
  affordances) lifted into `src/common/event-log/useHistoryViewer.ts`, pulling that growth
  back out of `PlayArea`. What stays per-game is snapshot *computation* (each game's
  `lib/history.ts`) and turn *identity* (the row's id, or a `turn_number`). See
  the hook's own docstring.
- **bananagrams**: handled via its own shape — the cross-column engine hook
  `usePlayerBoard` + the `BoardArena` / `HandCard` views (NOT `BoardCol` / `InfoCol`,
  since they own no input), under a two-level coordinator. See the bananagrams
  caution above and docs/games/bananagrams.md.
