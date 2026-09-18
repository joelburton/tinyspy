# Area: word-entry

The folders it reads: `word-entry`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — all eleven findings worked 2026-09-18, all three components
renamed, and the closing re-read done the same day: six more findings
(F-word-entry-12 to 17), four worked, two waiting on a word.** Roster
agreed and stamped 2026-09-18; taken OUT OF ORDER at Joel's ask (*"open
word-entry area (it's not the next, but we're taking this one out of order)"*);
§3's next in sequence is row 42, `word-list`. Ten files
`cs-audited-word-entry`.

## The roster

`src/common/word-entry/` — ten files `cs-audited-word-entry`, plus the folder's
own two docs (not stamped; the script's scope is files with a first-line
comment):

- `WordEntryInput.tsx` · `WordEntryInput.module.css` ·
  `WordEntryInput.test.tsx` — where the typed word appears. No `<input>`;
  keystrokes come off the window. The test was WRITTEN by this area
  (F-word-entry-11) and joins the roster stamped
- `WordEntryArea.tsx` · `WordEntryArea.test.tsx` — the whole control: the row,
  the capture keyboard, the arrows, and the feedback swap
- `WordEntryRow.tsx` · `WordEntryRow.module.css` · `WordEntryRow.test.tsx` —
  the row alone: ⌫ | whatever is being entered | ↵
- `useArrowHistory.ts` · `useArrowHistory.test.ts` — ↑/↓ recall of earlier
  entries
- `doc.md` · `todo.md`

**All three components were RENAMED 2026-09-18** — `EntryBox` → `WordEntryInput`,
`EntryRow` → `WordEntryArea`, `MoveRow` → `WordEntryRow` — on Joel's call, and
this file is written in the new names throughout, quotations included. The old
ones were weak (`EntryBox`, `EntryRow`) or actively wrong (`MoveRow`: *"it's not
just about a move; it's about a word-entry. a move can be clicking on a tile"*),
and the `WordEntry` stem now matches the folder. Two objections of mine were
overruled and both deserved to be: stackdown and strands ARE entering a word,
just through a different UI, so the stem fits all three; and `Input` is the right
word for where typed letters appear even with no `<input>` element, since that is
the role it plays. Rode along: `--entryBox-font-size` → `--wordEntryInput-font-size`
(base.css + psychicnum + strands), the shared class `.moveRow` → `.wordEntryRow`,
and strands' own override class of the same name. **`data-testid="entry-value"`
was deliberately left** — boggle's `PlayArea.test` and three e2e specs read it,
and an e2e run is Joel's to authorize.

**Deliberately NOT on it**, both ruled by Joel at the open:

- **`shared/onscreen-keyboard/GuessKeyboard`** — *"isn't related at all"*. It has
  its own area (§3 row 52).
- **`common/keyboard/useCaptureKeys`** — *"already handled"* (that area closed
  2026-09-10, blessed). `WordEntryInput` is built on it, and Joel allowed it **as
  evidence**: *"you can use it as evidence if its useful"* — read it, compare
  against it, quote it; it takes no stamp from this area and joins no roster
  (§4 → `cs-found` means found, not read).

## The state, simply — AS FOUND

Four exports, and every word game's below-board row is made of them:

```
<WordEntryArea>                    the typing games: psychicnum · spellingbee · boggle · wordwheel · letterboxed
├── useCaptureKeys            keyboard/ — A–Z, ⌫, ↵, the any-key dismiss (four bound actions)
├── useArrowHistory           ↑ recall · ↓ clear (two bound actions)
├── useTopFeedbackMessage     feedback/ — is anything on the slot?
└── either
    ├── <div .localFeedback>  game-page/playArea.module.css — a message is on top
    │     └── <FeedbackPill>  feedback/
    └── <WordEntryRow>             ⌫ | <WordEntryInput> | ↵
          └── <WordEntryInput>      the box: value or placeholder, the caret while the game owns the keyboard
                └── children  a game's <TypedWord> (spellingbee · boggle · wordwheel · letterboxed), or the plain value

<WordEntryRow> alone               stackdown (five tile slots) · strands (a <WordEntryInput> echoing the traced path)
useArrowHistory alone         wordiply (a <GuessBoard>, no box — see F-word-entry-6)
useCaptureKeys alone          wordle (letters land on the grid; no arrows)
```

The three readers of `--wordEntryInput-font-size` (`base.css` default 1.5rem;
psychicnum's `.bigEntry` on the ROW, 2rem / 1.5rem on a phone; strands' `.echo`
on the BOX, 1.75rem) and the caret's `1.15em` are the whole of the box's
per-game tuning.

The probe that settled three claims below (a throwaway test, run and deleted):

| row state | buttons drawn | ⌫ / ↵ answer | ↑ / ↓ answer |
|---|---|---|---|
| `disabled` | **none** | hidden | hidden |
| `busy` | two, both grayed | disabled | **hidden** |
| `recall` omitted | two | active / — | ↑ **disabled** |

## Findings

*(`F-word-entry-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN. The first three are the prose pass; the rest wait
for a decision or a word.)*

### F-word-entry-1 · `props-take-double-slash` · Every props and options block in the folder wears `/**` — WORKED

`WordEntryInput` (four props), `WordEntryArea` (twelve), `WordEntryRow` (four) and
`useArrowHistory`'s options (three) all mark each member with `/**`. The
folder's own foundation next door, `useCaptureKeys`, has the rule right: its
`CaptureKeysOptions` members take `//` and only the hook and the exported type
carry `/**`. §4 → The docstring marker: a note on one member is a comment; the
docstring that answers *how do I call this* is the component's own. Mechanical,
one read per file; the test helpers (`action`, `glyphIn`, `press`, `setup`,
`states`) are whole declarations and keep theirs.

### F-word-entry-2 · `stale-claims` · What the files say that the tree no longer bears out — WORKED

Per file, each anchored by what the code IS:

- **`WordEntryInput.tsx`** docstring, "What the consumer owns": *"the universal keys —
  Backspace / Enter / the ArrowUp-recall + ArrowDown-clear last-move history —
  are built into the hook"*. The arrows are not in `useCaptureKeys`; they are
  `useArrowHistory`, which `WordEntryArea` layers on. The box's own docstring
  contradicts the hook it names.
- **`WordEntryInput.module.css`** header: *"Shared by psychicnum + spellingbee +
  boggle"* is a census, and a wrong one (six readers today) — delete rather than
  recount. *"docs/playarea.md → Text entry — WordInput / WordEntryInput"* names a
  heading that does not exist and a component (`WordInput`) that appears nowhere
  in the repo. `.box`'s *"the model psychicnum already used — now the shared
  default"* is archaeology.
- **`WordEntryArea.tsx`**: *"See docs/ui.md → 'Text entry'"* — `ui.md` has no such
  section; the section is `docs/playarea.md → Text entry`. *"It bundles the
  three things that were being duplicated"* is archaeology. The `recall` prop's
  *"the universal last-move history"* — letterboxed renders a `WordEntryArea` and
  offers no recall. The `disabled` prop's *"the buttons are disabled"* — they are
  not drawn at all (F-word-entry-7). The `busy` prop's *"the Submit button is
  disabled"* — both buttons gray (the probe above).
- **`WordEntryRow.tsx`**: *"Three surfaces render it"* is a count. *"Extracted rather
  than copied because the copies had already started: the row is three files'
  worth …"* is archaeology, and its cite — *"the setup-recap sweep in
  docs/pdf.md"* — names a sweep `pdf.md` does not describe under that name (it
  has a recap section and a drift note, no sweep). The paragraph goes; the rule
  it carries — what varies stays with the caller — is already the docstring's
  last sentence.
- **`WordEntryRow.module.css`** header: *"Rendered by every WordEntryInput game (via
  <WordEntryArea>), by stackdown's five tile slots and by strands' traced-word echo"*
  is a census.
- **`useArrowHistory.ts`**: *"(docs/ui.md → Text entry)"*, the same dead cite;
  and *"every game that renders a `<WordEntryArea>` and ONLY them"* is false
  (F-word-entry-6).
- **`useArrowHistory.test.ts`** header: *"(split out of useCaptureKeys)"* is
  archaeology; *"a key-capture game that isn't a WordEntryInput (wordle) never wires
  this"* is F-word-entry-6 again.
- **`WordEntryRow.test.tsx`** header: *"That shipped for a few minutes when the entry
  keys became actions, and Joel caught it by looking rather than by any test
  failing"* — the reason the test exists (a missing glyph fails SILENTLY) is the
  keep; the incident is archaeology.
- **`doc.md`** lede: *"`<WordEntryRow>`'s buttons are `<ActionButton>`s placing the
  same bindings"* — read after the sentence that names the two arrow actions,
  "the same bindings" says the arrows have buttons. They do not; the buttons
  place `useCaptureKeys`' ⌫ and ↵.
- **Where the size token is set** — `base.css` says *"a consumer raises it by
  re-setting the token on its own WordEntryInput element ."* (with the stray space);
  `WordEntryInput.module.css` says *"on an ANCESTOR of its WordEntryInput"*. Both work
  (psychicnum sets it on the row, strands on the box) and the two comments
  should say the same thing — and `1.15em` for the caret is written in three
  places (`base.css`, twice in `WordEntryInput.module.css`) for one rule in `.caret`.

Owed with the pass, not a finding: the `## Intro to area` (`INTROS_OWED` lists
`common/word-entry`) and a `## Details` with the render tree above.

### F-word-entry-3 · `playarea-doc-text-entry-stale` · `docs/playarea.md → Text entry` describes a `WordEntryArea` that no longer exists — WORKED

The section every file in this folder cites (or means to — F-word-entry-2) is
itself behind, in four places:

- *"pass a `pill` and it renders that `<FeedbackPill>`"* and *"which `pill` to
  show"* — there is no `pill` prop. `WordEntryArea` takes `localFeedbackSlot` and
  draws whatever is on top of it.
- *"the path boggle/spellingbee should converge on"* — they converged; both
  render `<WordEntryArea>`.
- *"Both games still route their keys through their own handler and hand
  `<WordEntryRow>` two callbacks"* — `WordEntryRow` takes two `BoundAction`s, and the
  docstring's whole point is that the buttons ARE the keys.
- **"Locked names for the input row"** — `.inputRow`, `.inputButton`,
  `.inputMessage` *"each still in the game's own module — same names, not yet a
  shared stylesheet"*. There is a shared stylesheet now (`WordEntryRow.module.css`,
  `.wordEntryRow`); `.inputRow` and `.inputMessage` exist nowhere in `src/`; only
  connections still writes `.inputButton`. The paragraph describes the world
  before `WordEntryRow`.

Outside the roster (a doc), fixed by this area under §4 → not a fence; the
`connections` half (`.inputButton`) is that game's.

### F-word-entry-4 · `recall-undefined-vs-empty` · ↑ answers `disabled` where a caller offers no recall at all — WORKED as (b), both arrows

From `todo.md` → Bugs, and confirmed by the probe: `recall` omitted →
`act-recall-last` says `disabled`. `useArrowHistory` read `recall ? 'active' :
'disabled'`, so `undefined` (not offered — letterboxed, whose `handleChange`
keeps the seed letter and whose doc says "No ↑ recall") and `''` (offered,
nothing submitted yet) answered the same word.

**The consequence the finding stated was wrong, and the truth is worse.** It
said letterboxed's Help lists a *permanently gray* ↑ row. `KeyList` filters
`hidden` and then draws every remaining row identically — there is no state
class and `KeyList.module.css` has no disabled rule, which `actions/doc.md`
states as the design ("the bound actions that have a key and are not hidden").
So the row was not gray: it read exactly like a working key, in a game with no
recall. Nothing else reads these two bindings — **neither arrow has a button
anywhere** (`WordEntryRow` places `actDelete` + `actSubmit` only, and the registry
gives the arrows no icon), so the key list is the whole of what the state is
for.

**Joel's ruling (2026-09-18), on the options as recorded:** (a) is out — *"i
don't like (a); it packs a distinct message into undefined, which is always
confusing."* (b), and since ↓ rides in the same hook, the flag answers for both
arrows. Given the KeyList fact above, `false` means **`hidden` for both**: a
`disabled` ↓ would still be listed, still look live, and would now not run at
all, where today's ↓ at least clears letterboxed's first word (`seed` is `''`
before a chain exists).

**Shipped:** `hasHistory?: boolean` (default true) on `ArrowHistoryOptions` and
on `WordEntryArea`, which forwards it; `act-recall-last` → `!enabled || !hasHistory ?
'hidden' : recall ? 'active' : 'disabled'`, `act-clear-entry` → `enabled &&
hasHistory ? 'active' : 'hidden'`. letterboxed passes `hasHistory={false}`; the
four games that offer recall are untouched. `recall`'s note drops the "Omit /
''" sentence and says `''` means nothing submitted yet.

**The two todo items this closes**, both deleted: `word-entry/todo.md` → Bugs
(the ↑ item), and `src/letterboxed/todo.md` → Bugs (*"`↓` half-works"*, whose
first named option — *"the binding is not offered here"* — is what shipped).
`docs/games/letterboxed.md` now says neither arrow is bound and why.

**Tests:** `useArrowHistory.test.ts` keeps the `''` → disabled case (its "pins
what the code does TODAY" comment goes, since today is the answer) and gains
two — both arrows hidden at `hasHistory: false`, and neither acting. A
game-level one in `letterboxed/components/PlayArea.test.tsx` mounts the real
PlayArea and asserts both bindings answer `hidden` to the `help` asker. Both
planted: the hook pair fails without the flag in `describe`, the letterboxed one
without the prop at the call site.

### F-word-entry-5 · `busy-hides-the-arrows` · Mid-submit, ⌫ and ↵ gray while ↑ and ↓ vanish — WORKED as (a)

`WordEntryArea` gates the arrows with one boolean — `enabled: !disabled && !busy`
— and the hook maps `!enabled` to `hidden`. `useCaptureKeys` next to it maps
the same two props to two words: `disabled` → `hidden` (the entry is gone, its
keys leave the list), `busy` → `disabled` (frozen, grayed). So for the length
of a submit the help list shows a gray ⌫ and ↵ and no ↑/↓ row at all, and when
the RPC answers the rows come back. The row's comment — *"They gate together:
no arrows while disabled/busy"* — describes the run, not the answer, which is
where the two differ. `wordiply` passes `enabled: !entryDisabled` and has no
busy, so it is untouched either way.

**Two corrections to the consequence, found at the re-verify.** The finding said
the help list shows *a gray ⌫ and ↵* — it does not: `KeyList` draws a disabled
row exactly like a live one (the same fact F-4 turned on). What the difference
actually costs is two things, and the second is not in the finding at all:

- **The Keys list blinks.** It is live (`useBoundActions` → `useSyncExternalStore`),
  so the ↑ and ↓ rows leave and come back on every submit while the rest sit
  still — a reflow on state change.
- **The keys fall through to the browser.** The dispatcher skips a hidden
  binding entirely and, matching nothing, lets the key go; a `disabled` one
  `preventDefault`s. Nothing else binds a bare ↑/↓ in these five games, so
  mid-submit they reach the page. The dispatcher's own comment names this as
  the reason `disabled` behaves that way — *"Space with no legal peel must not
  scroll the page."*

**Options:**

- **(a) the same two props as the core** — `useArrowHistory({ recall, onChange,
  disabled, busy })`, answering `hidden` / `disabled` / by-value exactly as
  `useCaptureKeys` does. `WordEntryArea` forwards what it already holds.
- **(b) one `editState: ActionState`** computed once in `WordEntryArea` and handed
  to both hooks. Fewer words, but `useCaptureKeys` is blessed and does not take
  one, so the two hooks would still read differently.

Recommend (a) — **Joel chose (a), 2026-09-18.**

**Shipped:** `ArrowHistoryOptions` takes `disabled` / `busy` in place of
`enabled`, and computes one `editState` the way `useCaptureKeys` computes its
own, so the four keys on the row can't disagree. `WordEntryArea` forwards the two
props it already holds (one boolean fewer at the call site); wordiply's call
becomes `disabled: entryDisabled`.

**What that expression says was then changed by F-word-entry-7**, hours later.
As shipped here it was `!hasHistory || disabled ? 'hidden' : busy ? 'disabled' :
'active'` — gone for the two permanent facts, frozen for the momentary one.
F-7's ruling made hard-off `disabled` too, leaving `hidden` for `hasHistory`
alone; the mirroring this finding is about survived the change, since both hooks
moved together. Of the two arguments made for it here, the browser fall-through
one holds and the blinking one is weakened — Joel's ruling is that nobody
watches the key list change.

**Tests:** the predicted split happened, and F-7 then merged the two halves back
onto `disabled`.

### F-word-entry-6 · `arrows-not-entrybox-only` · The hook says "WordEntryInput games and ONLY them"; wordiply is neither and wires it — WORKED as (c)

`useArrowHistory`'s docstring: *"it applies to every game that renders a
`<WordEntryArea>` and ONLY them — a key-capture game that isn't a WordEntryInput (wordle)
uses the core alone"*. The test header, `useCaptureKeys`' docstring
("Layering"), `docs/playarea.md → Text entry` and wordle's `BoardCol` comment
all repeat the boundary. Wordiply renders no `WordEntryArea` and no `WordEntryInput` —
its letters land on a `<GuessBoard>` row like wordle's — and calls
`useArrowHistory` directly, with its own reason written down: *"handy here
since the next guess is often the last one plus a letter"*. Its
`PlayArea.test` pins the arrows. So the stated design is "the box's arrows",
and the tree says "any capture game whose last entry is a whole string worth
bringing back".

**Wrong in BOTH directions by the time it was presented.** At the audit only
the "ONLY them" half was false (wordiply). F-4 falsified the other half the same
day: letterboxed renders a `<WordEntryArea>` and, with `hasHistory={false}`, has no
arrows. A rule that names a roster had been outrun by the tree twice in one
sitting.

**Options:**

- **(a) the prose moves to what the tree does.** The arrows are the
  *whole-entry* recall, offered by any capture game that keeps a last entry;
  `WordEntryArea` composes them by default. Wordle's "no arrows" stays a choice
  wordle made (its test asserts it), not a rule the hook enforces. Edits in
  four places (the hook, its test, `docs/playarea.md`, wordle's comment — and
  `useCaptureKeys`' blessed docstring, one sentence).
- **(b) wordiply is wrong to wire it** and loses ↑/↓, restoring the
  WordEntryInput-only boundary. A behavior change in a game for the sake of a
  sentence, against a reason that game wrote down.

- **(c) the docstrings stop naming games at all** — say what the hook is FOR
  and what `hasHistory` means; let a reader answer "does my game keep a last
  entry worth bringing back" instead of looking themselves up on a list. The
  standing rule behind it: a "who uses this" always rots.

Recommended (c); **Joel chose (c), 2026-09-18.**

**Shipped.** The hook's docstring now opens on what it is for and says
`<WordEntryArea>` composes it while a game with its own capture loop calls it
directly. The other statements: the hook's test header, `WordEntryArea`'s inline
comment, `useCaptureKeys`' **Layering** paragraph, `docs/playarea.md → Text
entry`, and wordle's `BoardCol` comment — which now says only that wordle
doesn't wire the arrows, and why (a played guess is on the board in front of
you), instead of legislating for every game. **Corrected at the re-read:** the
commit only cut the old sentence and wrote no why into wordle's comment;
F-word-entry-15 added it. `playarea.md` keeps the examples,
since illustrating a rule is not the same as listing its members.

**A SIXTH statement the audit missed**, found by grepping the phrasings rather
than the files: `common/keyboard/useCaptureKeys.test.ts`'s header, *"The
WordEntryInput-only history arrows are a separate layer"*. Fixed with the rest. Two
`cs-blessed-keyboard` files carry a conformance edit each, under §4 → not a
fence.

### F-word-entry-7 · `disabled-removes-the-buttons` · A hard-off row draws no buttons, and its prop says they are disabled — WORKED, and it turned into a ruling

Probe: `disabled` → zero buttons. `useCaptureKeys` answers `hidden` for both
entry actions at `disabled` (deliberately — *"Gone takes its keys off the list
entirely"*), and `ActionButton` renders nothing for `hidden`, so `WordEntryRow`
draws the box alone between two absences. The `disabled` prop's docstring says
*"the buttons are disabled"*; stackdown, rendering the same `WordEntryRow` with its
own actions, states the opposite rule for the same row — *"Both buttons stay
MOUNTED and merely disabled when they can't act — including while a past turn
is being viewed — so the region never reflows"*. Where it shows: a disabled
`WordEntryArea` with nothing on the slot, which in the five games is the history
view (psychicnum, letterboxed) — every other `disabled` case has a pill over
the row. The board does not move (the swap box holds its height); the row's
two ends do.

**Options:**

- **(a) keep the behavior; fix the prop's sentence.** At hard-off the entry is
  gone by the keyboard folder's design, and the buttons are the keys, so they
  go with them; the swap box is what reserves the slot. Stackdown's rule stays
  stackdown's, since it binds its own actions.
- **(b) `WordEntryRow` holds each button's footprint** when its action is hidden
  (an empty `--iconButton-size` box), so the row's shape never changes and no
  action changes its answer. A row-level fix for a row-level rule.
- **(c) the entry actions answer `disabled` at hard-off** — puts gray ⌫/↵ rows
  in the help list of a finished game, which the blessed keyboard folder chose
  against.

Recommended (a). **What actually happened is (c), because the reason (c) was
recorded against turned out to be wrong.**

**The finding's "where it shows" was wrong.** The history banner is `inset: 0`
with an opaque fill over the whole slot, so nothing of the row is visible while
viewing a past turn. And every other hard-off state across the five games puts a
message on the slot — the waiting note, the terminal verdict, "Chain is full" —
and a message makes `WordEntryArea` return the pill INSTEAD of the row. So the
buttonless row is a state the code can reach and a player cannot, with one
possible exception: the verdict goes up in a `useEffect`, which runs after
paint, so there may be one frame at game over where it is drawn. Never observed.

**stackdown does not belong in this finding** (Joel): it renders `<WordEntryRow>`,
but `WordEntryRow` decides nothing — it places two bound actions and `ActionButton`
draws what each says. `WordEntryArea`'s buttons carry `useCaptureKeys`' answer;
stackdown binds its own actions and answers for itself. Two callers deciding for
their own actions is the component working, which its docstring already says.

**The ruling that settled it** (Joel, 2026-09-18), after asking why the buttons
hide rather than gray: *"it should show those as keys. the help was never meant
to be 'exactly right now, what keys are available'. when players read the help,
they're hoping to learn the keys useful for the game. they're not keeping it
open to watch it change."*

**Shipped.** `useCaptureKeys`' `editState` is `disabled || busy ? 'disabled' :
'active'` — hard-off no longer hides — and `useArrowHistory` mirrors it, keeping
`hidden` for the one thing it now means: `hasHistory: false`, a key this game
hasn't got. So a finished word game still lists `A–Z`, `⌫`, `↵` and the arrows
in Help; the buttons gray instead of vanishing, which closes the one-frame risk
without reserving anything; and the keys are swallowed at terminal rather than
falling through to the browser. Two tests moved, both to `disabled`:
`useArrowHistory.test.ts`'s gone-case and wordiply's "a finished game takes no
letters", which now also asserts the key stays listed.

**Recorded in `common/actions/todo.md`, not decided here:** the ruling's reach
past the entry keys (every play-only action still leaves Help at terminal), and
that the never-widen constraint asserted at `useBoundAction.ts:233` is an
invention of the implementing session rather than Joel's — he proposed the asker
parameter, not the rule on it.

### F-word-entry-8 · `local-feedback-class-home` · Whose class is `.localFeedback`? — WORKED as (a), no change

`todo.md` → Soon, parked from `setup-form` for this folder to argue. The
argument: `.localFeedback` centers a lone pill in the below-board slot and
reserves that slot's height, and it is read by codenamesduet, connections,
stackdown, wordle, waffle, bananagrams and scrabble — none of which touch this
folder. `WordEntryArea` reads it for the one thing those readers do: wrap a
`<FeedbackPill>` in the slot. It is play-surface chrome, in a lowercase sheet
that exists to be worn by others (`docs/deferred.md → Common / architecture`
states that half of the rule), and `WordEntryArea` is one wearer.

**Options:**

- **(a) it is game-page's, and the item closes** with that sentence in this
  folder's `doc.md`. Whether the below-board slot's two rules leave
  `playArea.module.css` for a sheet of their own is `game-page/todo.md`'s
  subdivision item and not changed by this answer.
- **(b) the pill wrapper moves up to each host** — the five games wrap the
  pill in `.localFeedback` themselves, as the non-swap games do, and
  `WordEntryArea` returns the bare pill. It unbundles the one thing the row
  bundles (the swap), and the host would need the row's `top !== null`.

Recommended (a); **Joel chose (a), 2026-09-18.**

**Two facts settled it at the re-verify.** The sheet is not component-named and
has not been since 2026-09-14, when it was renamed to lowercase
`playArea.module.css` because no `PlayArea` component exists in `game-page` —
and `docs/deferred.md` → Common / architecture already states that lowercase IS
the repo's mark for a sheet anyone may read, so this import is the sanctioned
case rather than the violation the objection was about. And the class is
play-surface chrome by its readers, verified: seven games wrap a pill in it
themselves, none touching this folder.

**Worked as:** a struck entry in `todo.md` — a no-change ruling is kept with its
reasoning and what would reopen it (the below-board classes leaving
`playArea.module.css`, which is `game-page/todo.md`'s subdivision item) — and a
`doc.md` Details paragraph saying whose the box is. No code changed.

**Raised in passing and answered** (Joel): why the pill is rendered by
`WordEntryArea` rather than by each game's `BoardCol`. Because both hooks are called
above the early return — swapping at the host would unmount the row, taking
`useCaptureKeys` with it, so no keystroke would dismiss anything or type. It
does not separate (a) from (b), since (b) also keeps the row mounted and merely
returns a bare pill.

`terminal` and `info-sheet` hold the same question about other classes and
answer for themselves.

### F-word-entry-9 · `raw-values` · Five literals, one of them a vocabulary value already — WORKED

The a/b/c pass over the two stylesheets:

| where | value | vocabulary | reading |
|---|---|---|---|
| `WordEntryRow.module.css` `.wordEntryRow` | `gap: 0.5rem` | spacer | `--spacer-4` is 0.5rem — converts silently, and its `pending` row goes |
| `WordEntryInput.module.css` `.caret` | `margin: 0 1px` | spacer (`pending: ['1px']`) | no spacer step is a hairline; it is the breath between the last glyph and the bar — surface |
| `.caret` | `width: 2px` | none (`width` is unswept) | a bar, not a border; `--border-width-line-thick` is 2px but says the wrong thing |
| `.caret` | `height: 1.15em` | none | tracks the font-size on purpose; the number is stated in three comments (F-word-entry-2) |
| `.caret` | `animation: caretBlink 1.1s` | none (`animation` is unswept) | the only motion in the folder |
| `.box` | `letter-spacing: 0.05em` | letter-spacing (`pending`) | the ramp is `-label` 0.03em and `-wide` 0.2em; the typed word is neither a label nor tile-spaced — surface |

**Two of the five turned out not to be the guard's business at all**: `width`
and `animation` are unswept properties, so the caret's `2px` bar and its `1.1s`
blink were never pending anything. `height: 1.15em` is governed by no ramp and
already explains itself in the file.

**Joel's decisions, 2026-09-18.** The letter-spacing takes **(b), name the
band**, at 0.05em, named **`--letter-spacing-display`** — the axis between it
and `-label` is SIZE and not case, since both are uppercase: `label` is the hair
that makes a small uppercase label legible, `display` is caps set large where
that hair would vanish. The caret's `margin: 0 1px` **stays** and is recorded
rather than converted: the ramp's smallest step is `--spacer-5` (0.25rem), which
beside a 2px bar is a gap and not a hairline. The gap converted silently to
`--spacer-4`.

**Scope Joel set explicitly:** nothing outside this folder. `OpponentStrip`
(0.04em), `WordList` (0.02em) and `playArea` (0.03em) keep their `pending` rows
for their own areas — *"we'll tackle those when we hit those areas."*

**A correction I owed on my own evidence.** Presenting the options I said four
files sat in this band, implying they would be the new step's readers. On
inspection: `OpponentStrip`'s is a SMALL uppercase label and belongs on
`-label`; `WordList`'s is not uppercase at all; `playArea`'s is `-label`'s value
unconverted. So the step lands with `.box` as its only reader today — which is
not unusual here (`--letter-spacing-label` itself has none and is
declared-ahead) but is not what my framing implied.

**Planted:** writing `0.05em` back into `.box` fails the letter-spacing guard by
name.

### F-word-entry-10 · `move-row-test-fixture` · `WordEntryRow.test` hand-rolls the fixture that names it — WORKED

`WordEntryRow.test.tsx`'s `action(id)` builds `{ id, spec: ACTIONS[id], run:
vi.fn(), describe, pending: false }` — which is `boundActionFixture` from
`common/actions/boundAction.fixture.ts` line for line, and that file's
docstring lists *"a `<WordEntryRow>`'s two keys"* as the case it exists for. The
fixture postdates the test. Use it; no decision in it.

**Shipped:** the local helper is gone, the two call sites take
`boundActionFixture`, and the now-unused `vi` import went with it. The fixture's
optional `describe` override means a future case — what the row draws for a
hidden action — needs no second helper.

### F-word-entry-11 · `entrybox-untested` · The box has no test of its own — WORKED

`WordEntryInput` owns three rules — the caret shows only while the game owns the
keyboard AND something is typed; the value wrapper is unconditional whichever
path renders it; the placeholder shows only when empty and supplied — and no
spec in the folder exercises any of them. They are pinned from outside, by
accident of other tests: `entry-value` is read by boggle's `PlayArea.test` and
by three e2e files, and none looks at the caret. A file per unit: a
`WordEntryInput.test.tsx` covering the three rules, the caret gate driven by focusing
an `<input>` (jsdom fires `focusin`, which is what `useGameHasKeyboard`
tracks). Mechanical once F-word-entry-2's docstring says what the box owns.

**Shipped as `WordEntryInput.test.tsx`**, eight cases in two blocks. The caret
is selected by its `aria-hidden` rather than its class, because `css: false`
under vitest makes a module a proxy that fabricates any key asked of it — a
class assertion would prove nothing about the stylesheet. Beyond the three
rules, one case covers the way back: focus falling to `<body>` (clicking the
board) returns the keyboard to the game, and the caret with it.

**Planted, all three rules at once** — dropping the keyboard gate, making the
value wrapper conditional on `children`, and dropping the
`placeholder !== undefined` check failed exactly three cases, one per rule, and
no others.

### The closing re-read — 2026-09-18

*(One sitting over the ten roster files, the two docs, and every file outside
the folder that names one of its exports. The method from the last five
re-reads: take each worked finding and grep its defect across the siblings —
the old names, the article before a renamed name, the phrasings F-2 and F-6
deleted, the dates. Six findings; four were the day's own work standing next
door.)*

### F-word-entry-12 · `rename-articles` · The rename left "an" in front of every renamed name — WORKED

`EntryBox` and `EntryRow` took "an"; `WordEntryInput` and `WordEntryArea` take
"a", and the sweep replaced the name and not the article. Ten sites outside
this file, two of them wrapped across a line break where a one-line grep
cannot see them: `WordEntryRow.tsx` (three, two in its own docstring),
`docs/playarea.md`'s table, `docs/keyboard-shortcuts.md` (two),
`docs/games/strands.md`, wordle's `BoardCol` comment and its `PlayArea.test`
(two). And this file, which claims to be written in the new names throughout —
nine more. All fixed. The grep that finds the wrapped ones is a multi-line
one (`perl -0ne`), which is worth remembering: BSD `grep` has no `-P`, and a
line-anchored grep reported eight where there were ten.

### F-word-entry-13 · `move-row-in-prose` · The row is still "the move row" in prose, in the roster and in every host — WORKED

Joel renamed `MoveRow` because "move" was the wrong word — *"it's not just
about a move; it's about a word-entry. a move can be clicking on a tile"* — and
the rename changed the identifier and left the phrase. In the roster:
`WordEntryRow.tsx`'s docstring lede (*"The **move row**"*),
`WordEntryRow.module.css`'s header, `WordEntryRow.test.tsx`'s header, and
`WordEntryInput.module.css`'s stretch comment. Outside it, naming this
component: `useCaptureKeys.test.ts` (blessed keyboard, one phrase), stackdown's
`BoardCol.tsx`, `BoardCol.module.css` (three) and `WordEntry.module.css`,
strands' `BoardCol.tsx` (four) and `PlayArea.tsx`, `docs/games/stackdown.md`
(three), `docs/games/strands.md` (two), and `docs/common-folders.md`'s
*"move-entry box"*. All say **the word-entry row** now — Joel's own words for
it — as the tail of the rename, which §4 says ships with the area that renamed.

**Left alone, on purpose:** letterboxed's *"a move row"* (`pdf/model.ts`) and
*"the move rows"* (`useGame.ts`) are rows of the event log — a move per row —
and not this component. And `.moveArea` stays: it is the class for a game's
move controls whatever they are (wordle's keyboard, connections' pair), and
`docs/playarea.md → Locked names` defines it that way.

### F-word-entry-14 · `stackdown-doc-rebuilt-locally` · `docs/games/stackdown.md` says the row is "rebuilt locally rather than reused" — WORKED

The doc's paragraph on the row: *"the arrangement the shared `<WordEntryArea>`
gives every typing game, rebuilt locally rather than reused"*. stackdown's
`BoardCol.tsx` imports and renders the shared `<WordEntryRow>` around its own
five slots — the row IS reused; what it cannot use is `<WordEntryArea>`, the row
with the capture keyboard attached. The paragraph now says that, and that the
buttons are the same buttons because stackdown hands the row its own two
bindings. Outside the roster, a game's doc — fixed under §4 → not a fence,
since it is a false claim about this folder's component.

### F-word-entry-15 · `boundary-restated` · F-2's and F-6's deleted claims standing in four more places — WORKED

The re-read's grep for the *phrasings* rather than the listed files:

- **F-6's boundary, twice more.** `docs/keyboard-shortcuts.md` → wordle:
  *"that's an WordEntryInput affordance and wordle isn't one"* — the exact rule
  F-6 removed from six files. And wordle's `PlayArea.test` names its case
  *"wordle is not an WordEntryInput"* and explains *"In an WordEntryInput game
  ArrowDown would clear"* — the same rule as a test title. Both say now that
  wordle wires no arrows (and the doc says why: a played guess is on the board
  in front of you).
- **F-2's "the arrows are built into `useCaptureKeys`", once more.**
  `docs/games/boggle.md`: *"the universal `useCaptureKeys` last-move history"*.
  It is `useArrowHistory`, which `<WordEntryArea>` layers on. Fixed.
- **F-6's own record overstated wordle.** This file said the wordle comment
  *"now says only that wordle doesn't wire the arrows, and why"*; `de482411`
  cut the old sentence and wrote no why. The comment carries it now, and F-6's
  entry above says what happened.
- **`docs/ui.md`'s exempt-glyph table** names *"the shared `WordEntryArea`"* as
  where the ⌫ and ↵ glyphs are placed. `WordEntryRow` places them, for
  stackdown and strands as much as for the typing games. Fixed.

### F-word-entry-16 · `who-renders-the-row` · The docstring and `playarea.md` both list who renders `<WordEntryRow>`

F-2 deleted *"Three surfaces render it"* as a count and left the three-bullet
list under it — **WordEntryArea** (every typing game) · **stackdown** ·
**strands** — which is the census with the number taken off. `docs/playarea.md
→ Text entry` carries the same list as a table, opened with *"two games need
that exact control"*. The rule the list illustrates is one sentence, already
the docstring's: reach for the row alone when a keystroke doesn't mean "append
this character". And `doc.md`'s Intro already names both games as its examples.

**Options:**

- **(a) leave both.** They are examples, not a roster — the same reading F-6
  gave `playarea.md`'s arrow examples (*"illustrating a rule is not the same as
  listing its members"*). A third non-typing game would be added by hand, and a
  list that is one game short misleads nobody, since the rule sits beside it.
- **(b) the docstring keeps the rule and loses the three bullets** — the
  examples are `doc.md`'s (Intro to area) and `playarea.md`'s; the docstring is
  the hover, and twelve of its twenty-six lines are the list. `playarea.md`
  drops the number ("two games need") and keeps its table.

Recommended (b). Waiting on Joel.

### F-word-entry-17 · `capture-input-vs-capture-entry` · Two adjectives for the one model

The repo says **capture-input** in six places (`WordEntryInput.tsx` twice,
`WordEntryInput.module.css`, `StandardButton.tsx`, `PageHeaderButton.tsx`,
`daylight.css`'s caret token) and **capture-entry** in four (`WordEntryArea.tsx`'s
lede, `useCaptureKeys.ts`'s lede — blessed — `docs/playarea.md`,
`docs/games/psychicnum.md`), for the same thing: the games that read keys off
the window instead of focusing a field. `docs/playarea.md`'s own name for it is
**the capture model**. Two roster files sit on opposite sides.

**Options:**

- **(a) leave it.** Both read clearly in context; the noun that follows
  (display / keys / row / games) carries the meaning and the adjective is a
  modifier on it.
- **(b) one word, and it is `capture-entry`** — the keyboard folder's blessed
  lede already says it, `word-entry` is the folder, and "input" is the thing
  this model deliberately has none of. Six sites, none of them identifiers.

Recommended (b). Waiting on Joel.

## Notes

**What `todo.md` handed the area**, its first read per §4: the ↑ bug is
F-word-entry-4, and the `.localFeedback` question is F-word-entry-8. Both are
closed — the ↑ item deleted (it shipped), the `.localFeedback` one struck (it
closed against itself).

**Evidence, not roster.** `useCaptureKeys` was read against every claim here
and quoted in F-word-entry-5, 6 and 7; it and its test keep
`cs-blessed-keyboard`. F-word-entry-6 edited one paragraph of each — a
conformance edit this area owns the rule for, under §4 → not a fence.

**Where the font-size token is set is not a finding.** psychicnum sets
`--wordEntryInput-font-size` on the row and strands on the box; a custom property
cascades, so both reach `.box` and the caret alike. Only the two comments
disagree (F-word-entry-2).

**Three games that render this folder carry their own stale sentence about
it**: wordle's `BoardCol` comment (fixed by F-word-entry-6),
stackdown's "both buttons stay mounted" (true for stackdown, and the contrast
F-word-entry-7 turns on), and the `.inputButton` connections still writes
(F-word-entry-3).

## Predicted test breaks

*(written when the area starts changing things)*

- F-word-entry-4 — WHAT HAPPENED: nothing broke. The `''` case kept its
  answer (`disabled`) because (b) left `recall` alone, so the predicted split
  was two ADDED cases instead, plus one in `letterboxed/PlayArea.test.tsx`.
  `wordiply/PlayArea.test.tsx` did not move, as predicted.
- F-word-entry-5 — HAPPENED exactly as predicted, and nothing else moved:
  wordiply's own tests pass unchanged through the `enabled` → `disabled`
  rename at its call site.
- F-word-entry-9 — HAPPENED as predicted: `WordEntryRow.module.css`'s `pending`
  row had to go with the conversion, and `WordEntryInput.module.css`'s
  letter-spacing row with it. Its `1px` spacer row stays, annotated.

## Closing

- [x] the whole area re-read in one sitting after the last group — 2026-09-18,
      F-word-entry-12 to 17
- [x] the folder's `doc.md` Intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
