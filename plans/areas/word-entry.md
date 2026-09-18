# Area: word-entry

The folders it reads: `word-entry`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-18, eleven findings, none worked.** Roster
agreed and stamped 2026-09-18; taken OUT OF ORDER at Joel's ask (*"open
word-entry area (it's not the next, but we're taking this one out of order)"*);
§3's next in sequence is row 42, `word-list`. Nine files
`cs-audited-word-entry`.

## The roster

`src/common/word-entry/` — nine files `cs-audited-word-entry`, plus the folder's
own two docs (not stamped; the script's scope is files with a first-line
comment):

- `EntryBox.tsx` · `EntryBox.module.css` — the typed-word box. No `<input>`;
  keystrokes come off the window
- `EntryRow.tsx` · `EntryRow.test.tsx` — the row that wraps the box: Delete, the
  box, Submit, and the feedback line under it
- `MoveRow.tsx` · `MoveRow.module.css` · `MoveRow.test.tsx` — the below-board
  move row
- `useArrowHistory.ts` · `useArrowHistory.test.ts` — ↑/↓ recall of earlier
  entries
- `doc.md` · `todo.md`

**Deliberately NOT on it**, both ruled by Joel at the open:

- **`shared/onscreen-keyboard/GuessKeyboard`** — *"isn't related at all"*. It has
  its own area (§3 row 52).
- **`common/keyboard/useCaptureKeys`** — *"already handled"* (that area closed
  2026-09-10, blessed). `EntryBox` is built on it, and Joel allowed it **as
  evidence**: *"you can use it as evidence if its useful"* — read it, compare
  against it, quote it; it takes no stamp from this area and joins no roster
  (§4 → `cs-found` means found, not read).

## The state, simply — AS FOUND

Four exports, and every word game's below-board row is made of them:

```
<EntryRow>                    the typing games: psychicnum · spellingbee · boggle · wordwheel · letterboxed
├── useCaptureKeys            keyboard/ — A–Z, ⌫, ↵, the any-key dismiss (four bound actions)
├── useArrowHistory           ↑ recall · ↓ clear (two bound actions)
├── useTopFeedbackMessage     feedback/ — is anything on the slot?
└── either
    ├── <div .localFeedback>  game-page/playArea.module.css — a message is on top
    │     └── <FeedbackPill>  feedback/
    └── <MoveRow>             ⌫ | <EntryBox> | ↵
          └── <EntryBox>      the box: value or placeholder, the caret while the game owns the keyboard
                └── children  a game's <TypedWord> (spellingbee · boggle · wordwheel · letterboxed), or the plain value

<MoveRow> alone               stackdown (five tile slots) · strands (an <EntryBox> echoing the traced path)
useArrowHistory alone         wordiply (a <GuessBoard>, no box — see F-word-entry-6)
useCaptureKeys alone          wordle (letters land on the grid; no arrows)
```

The three readers of `--entryBox-font-size` (`base.css` default 1.5rem;
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

### F-word-entry-1 · `props-take-double-slash` · Every props and options block in the folder wears `/**`

`EntryBox` (four props), `EntryRow` (twelve), `MoveRow` (four) and
`useArrowHistory`'s options (three) all mark each member with `/**`. The
folder's own foundation next door, `useCaptureKeys`, has the rule right: its
`CaptureKeysOptions` members take `//` and only the hook and the exported type
carry `/**`. §4 → The docstring marker: a note on one member is a comment; the
docstring that answers *how do I call this* is the component's own. Mechanical,
one read per file; the test helpers (`action`, `glyphIn`, `press`, `setup`,
`states`) are whole declarations and keep theirs.

### F-word-entry-2 · `stale-claims` · What the files say that the tree no longer bears out

Per file, each anchored by what the code IS:

- **`EntryBox.tsx`** docstring, "What the consumer owns": *"the universal keys —
  Backspace / Enter / the ArrowUp-recall + ArrowDown-clear last-move history —
  are built into the hook"*. The arrows are not in `useCaptureKeys`; they are
  `useArrowHistory`, which `EntryRow` layers on. The box's own docstring
  contradicts the hook it names.
- **`EntryBox.module.css`** header: *"Shared by psychicnum + spellingbee +
  boggle"* is a census, and a wrong one (six readers today) — delete rather than
  recount. *"docs/playarea.md → Text entry — WordInput / EntryBox"* names a
  heading that does not exist and a component (`WordInput`) that appears nowhere
  in the repo. `.box`'s *"the model psychicnum already used — now the shared
  default"* is archaeology.
- **`EntryRow.tsx`**: *"See docs/ui.md → 'Text entry'"* — `ui.md` has no such
  section; the section is `docs/playarea.md → Text entry`. *"It bundles the
  three things that were being duplicated"* is archaeology. The `recall` prop's
  *"the universal last-move history"* — letterboxed renders an `EntryRow` and
  offers no recall. The `disabled` prop's *"the buttons are disabled"* — they are
  not drawn at all (F-word-entry-7). The `busy` prop's *"the Submit button is
  disabled"* — both buttons gray (the probe above).
- **`MoveRow.tsx`**: *"Three surfaces render it"* is a count. *"Extracted rather
  than copied because the copies had already started: the row is three files'
  worth …"* is archaeology, and its cite — *"the setup-recap sweep in
  docs/pdf.md"* — names a sweep `pdf.md` does not describe under that name (it
  has a recap section and a drift note, no sweep). The paragraph goes; the rule
  it carries — what varies stays with the caller — is already the docstring's
  last sentence.
- **`MoveRow.module.css`** header: *"Rendered by every EntryBox game (via
  <EntryRow>), by stackdown's five tile slots and by strands' traced-word echo"*
  is a census.
- **`useArrowHistory.ts`**: *"(docs/ui.md → Text entry)"*, the same dead cite;
  and *"every game that renders an `<EntryRow>` and ONLY them"* is false
  (F-word-entry-6).
- **`useArrowHistory.test.ts`** header: *"(split out of useCaptureKeys)"* is
  archaeology; *"a key-capture game that isn't an EntryBox (wordle) never wires
  this"* is F-word-entry-6 again.
- **`MoveRow.test.tsx`** header: *"That shipped for a few minutes when the entry
  keys became actions, and Joel caught it by looking rather than by any test
  failing"* — the reason the test exists (a missing glyph fails SILENTLY) is the
  keep; the incident is archaeology.
- **`doc.md`** lede: *"`<MoveRow>`'s buttons are `<ActionButton>`s placing the
  same bindings"* — read after the sentence that names the two arrow actions,
  "the same bindings" says the arrows have buttons. They do not; the buttons
  place `useCaptureKeys`' ⌫ and ↵.
- **Where the size token is set** — `base.css` says *"a consumer raises it by
  re-setting the token on its own EntryBox element ."* (with the stray space);
  `EntryBox.module.css` says *"on an ANCESTOR of its EntryBox"*. Both work
  (psychicnum sets it on the row, strands on the box) and the two comments
  should say the same thing — and `1.15em` for the caret is written in three
  places (`base.css`, twice in `EntryBox.module.css`) for one rule in `.caret`.

Owed with the pass, not a finding: the `## Intro to area` (`INTROS_OWED` lists
`common/word-entry`) and a `## Details` with the render tree above.

### F-word-entry-3 · `playarea-doc-text-entry-stale` · `docs/playarea.md → Text entry` describes an `EntryRow` that no longer exists

The section every file in this folder cites (or means to — F-word-entry-2) is
itself behind, in four places:

- *"pass a `pill` and it renders that `<FeedbackPill>`"* and *"which `pill` to
  show"* — there is no `pill` prop. `EntryRow` takes `localFeedbackSlot` and
  draws whatever is on top of it.
- *"the path boggle/spellingbee should converge on"* — they converged; both
  render `<EntryRow>`.
- *"Both games still route their keys through their own handler and hand
  `<MoveRow>` two callbacks"* — `MoveRow` takes two `BoundAction`s, and the
  docstring's whole point is that the buttons ARE the keys.
- **"Locked names for the input row"** — `.inputRow`, `.inputButton`,
  `.inputMessage` *"each still in the game's own module — same names, not yet a
  shared stylesheet"*. There is a shared stylesheet now (`MoveRow.module.css`,
  `.moveRow`); `.inputRow` and `.inputMessage` exist nowhere in `src/`; only
  connections still writes `.inputButton`. The paragraph describes the world
  before `MoveRow`.

Outside the roster (a doc), fixed by this area under §4 → not a fence; the
`connections` half (`.inputButton`) is that game's.

### F-word-entry-4 · `recall-undefined-vs-empty` · ↑ answers `disabled` where a caller offers no recall at all

From `todo.md` → Bugs, and confirmed by the probe: `recall` omitted →
`act-recall-last` says `disabled`. `useArrowHistory` reads `recall ? 'active' :
'disabled'`, so `undefined` (not offered — letterboxed, whose `handleChange`
keeps the seed letter and whose doc says "No ↑/↓ recall") and `''` (offered,
nothing submitted yet) answer the same word, and letterboxed's Help lists a
permanently gray ↑ row. The option's note — *"Omit / '' makes ArrowUp a
no-op"* — writes the conflation down as if it were the design.

**Options:**

- **(a) `undefined` → hidden, `''` → disabled.** The todo's ask. `recall?:
  string` keeps its type; `describe` reads `recall === undefined ? 'hidden' :
  recall ? 'active' : 'disabled'`; the test's "pins what the code does TODAY"
  case splits in two as its comment already promises.
- **(b) make recall a separate switch** — an `offersRecall` flag beside
  `recall`. More explicit, but it adds a prop every caller must remember for a
  distinction the value already carries.

Recommend (a). Letterboxed's sibling — ↓ half-works there because `''` is
refused once the chain carries a seed — is in `src/letterboxed/todo.md` → Bugs
and is that game's; whether ↓ should be offered at all there is the same
question as ↑, and (a) answers only ↑.

### F-word-entry-5 · `busy-hides-the-arrows` · Mid-submit, ⌫ and ↵ gray while ↑ and ↓ vanish

`EntryRow` gates the arrows with one boolean — `enabled: !disabled && !busy`
— and the hook maps `!enabled` to `hidden`. `useCaptureKeys` next to it maps
the same two props to two words: `disabled` → `hidden` (the entry is gone, its
keys leave the list), `busy` → `disabled` (frozen, grayed). So for the length
of a submit the help list shows a gray ⌫ and ↵ and no ↑/↓ row at all, and when
the RPC answers the rows come back. The row's comment — *"They gate together:
no arrows while disabled/busy"* — describes the run, not the answer, which is
where the two differ. `wordiply` passes `enabled: !entryDisabled` and has no
busy, so it is untouched either way.

**Options:**

- **(a) the same two props as the core** — `useArrowHistory({ recall, onChange,
  disabled, busy })`, answering `hidden` / `disabled` / by-value exactly as
  `useCaptureKeys` does. `EntryRow` forwards what it already holds.
- **(b) one `editState: ActionState`** computed once in `EntryRow` and handed
  to both hooks. Fewer words, but `useCaptureKeys` is blessed and does not take
  one, so the two hooks would still read differently.

Recommend (a). Works with F-word-entry-4: the describe becomes one expression
over `disabled`, `busy` and `recall`.

### F-word-entry-6 · `arrows-not-entrybox-only` · The hook says "EntryBox games and ONLY them"; wordiply is neither and wires it

`useArrowHistory`'s docstring: *"it applies to every game that renders an
`<EntryRow>` and ONLY them — a key-capture game that isn't an EntryBox (wordle)
uses the core alone"*. The test header, `useCaptureKeys`' docstring
("Layering"), `docs/playarea.md → Text entry` and wordle's `BoardCol` comment
all repeat the boundary. Wordiply renders no `EntryRow` and no `EntryBox` —
its letters land on a `<GuessBoard>` row like wordle's — and calls
`useArrowHistory` directly, with its own reason written down: *"handy here
since the next guess is often the last one plus a letter"*. Its
`PlayArea.test` pins the arrows. So the stated design is "the box's arrows",
and the tree says "any capture game whose last entry is a whole string worth
bringing back".

**Options:**

- **(a) the prose moves to what the tree does.** The arrows are the
  *whole-entry* recall, offered by any capture game that keeps a last entry;
  `EntryRow` composes them by default. Wordle's "no arrows" stays a choice
  wordle made (its test asserts it), not a rule the hook enforces. Edits in
  four places (the hook, its test, `docs/playarea.md`, wordle's comment — and
  `useCaptureKeys`' blessed docstring, one sentence).
- **(b) wordiply is wrong to wire it** and loses ↑/↓, restoring the
  EntryBox-only boundary. A behavior change in a game for the sake of a
  sentence, against a reason that game wrote down.

Recommend (a).

### F-word-entry-7 · `disabled-removes-the-buttons` · A hard-off row draws no buttons, and its prop says they are disabled

Probe: `disabled` → zero buttons. `useCaptureKeys` answers `hidden` for both
entry actions at `disabled` (deliberately — *"Gone takes its keys off the list
entirely"*), and `ActionButton` renders nothing for `hidden`, so `MoveRow`
draws the box alone between two absences. The `disabled` prop's docstring says
*"the buttons are disabled"*; stackdown, rendering the same `MoveRow` with its
own actions, states the opposite rule for the same row — *"Both buttons stay
MOUNTED and merely disabled when they can't act — including while a past turn
is being viewed — so the region never reflows"*. Where it shows: a disabled
`EntryRow` with nothing on the slot, which in the five games is the history
view (psychicnum, letterboxed) — every other `disabled` case has a pill over
the row. The board does not move (the swap box holds its height); the row's
two ends do.

**Options:**

- **(a) keep the behavior; fix the prop's sentence.** At hard-off the entry is
  gone by the keyboard folder's design, and the buttons are the keys, so they
  go with them; the swap box is what reserves the slot. Stackdown's rule stays
  stackdown's, since it binds its own actions.
- **(b) `MoveRow` holds each button's footprint** when its action is hidden
  (an empty `--iconButton-size` box), so the row's shape never changes and no
  action changes its answer. A row-level fix for a row-level rule.
- **(c) the entry actions answer `disabled` at hard-off** — puts gray ⌫/↵ rows
  in the help list of a finished game, which the blessed keyboard folder chose
  against.

Recommend (a); (b) only if the history-view look asks for it, which wants
looking at rather than reasoning about.

### F-word-entry-8 · `local-feedback-class-home` · Whose class is `.localFeedback`?

`todo.md` → Soon, parked from `setup-form` for this folder to argue. The
argument: `.localFeedback` centers a lone pill in the below-board slot and
reserves that slot's height, and it is read by codenamesduet, connections,
stackdown, wordle, waffle, bananagrams and scrabble — none of which touch this
folder. `EntryRow` reads it for the one thing those readers do: wrap a
`<FeedbackPill>` in the slot. It is play-surface chrome, in a lowercase sheet
that exists to be worn by others (`docs/deferred.md → Common / architecture`
states that half of the rule), and `EntryRow` is one wearer.

**Options:**

- **(a) it is game-page's, and the item closes** with that sentence in this
  folder's `doc.md`. Whether the below-board slot's two rules leave
  `playArea.module.css` for a sheet of their own is `game-page/todo.md`'s
  subdivision item and not changed by this answer.
- **(b) the pill wrapper moves up to each host** — the five games wrap the
  pill in `.localFeedback` themselves, as the non-swap games do, and
  `EntryRow` returns the bare pill. It unbundles the one thing the row
  bundles (the swap), and the host would need the row's `top !== null`.

Recommend (a). `terminal` and `info-sheet` hold the same question about other
classes and answer for themselves.

### F-word-entry-9 · `raw-values` · Five literals, one of them a vocabulary value already

The a/b/c pass over the two stylesheets:

| where | value | vocabulary | reading |
|---|---|---|---|
| `MoveRow.module.css` `.moveRow` | `gap: 0.5rem` | spacer | `--spacer-4` is 0.5rem — converts silently, and its `pending` row goes |
| `EntryBox.module.css` `.caret` | `margin: 0 1px` | spacer (`pending: ['1px']`) | no spacer step is a hairline; it is the breath between the last glyph and the bar — surface |
| `.caret` | `width: 2px` | none (`width` is unswept) | a bar, not a border; `--border-width-line-thick` is 2px but says the wrong thing |
| `.caret` | `height: 1.15em` | none | tracks the font-size on purpose; the number is stated in three comments (F-word-entry-2) |
| `.caret` | `animation: caretBlink 1.1s` | none (`animation` is unswept) | the only motion in the folder |
| `.box` | `letter-spacing: 0.05em` | letter-spacing (`pending`) | the ramp is `-label` 0.03em and `-wide` 0.2em; the typed word is neither a label nor tile-spaced — surface |

**Decisions:** the letter-spacing (add a step / fit to `-label` / bespoke) and
whether a caret's three numbers are one bespoke rule left as-is with a marker.
The gap is not a decision.

### F-word-entry-10 · `move-row-test-fixture` · `MoveRow.test` hand-rolls the fixture that names it

`MoveRow.test.tsx`'s `action(id)` builds `{ id, spec: ACTIONS[id], run:
vi.fn(), describe, pending: false }` — which is `boundActionFixture` from
`common/actions/boundAction.fixture.ts` line for line, and that file's
docstring lists *"a `<MoveRow>`'s two keys"* as the case it exists for. The
fixture postdates the test. Use it; no decision in it.

### F-word-entry-11 · `entrybox-untested` · The box has no test of its own

`EntryBox` owns three rules — the caret shows only while the game owns the
keyboard AND something is typed; the value wrapper is unconditional whichever
path renders it; the placeholder shows only when empty and supplied — and no
spec in the folder exercises any of them. They are pinned from outside, by
accident of other tests: `entry-value` is read by boggle's `PlayArea.test` and
by three e2e files, and none looks at the caret. A file per unit: an
`EntryBox.test.tsx` covering the three rules, the caret gate driven by focusing
an `<input>` (jsdom fires `focusin`, which is what `useGameHasKeyboard`
tracks). Mechanical once F-word-entry-2's docstring says what the box owns.

## Notes

**What `todo.md` handed the area**, its first read per §4: the ↑ bug is
F-word-entry-4, and the `.localFeedback` question is F-word-entry-8. Both
items leave `todo.md` when their finding is worked.

**Evidence, not roster.** `useCaptureKeys` was read against every claim here
and quoted in F-word-entry-5, 6 and 7; it keeps `cs-blessed-keyboard`.
F-word-entry-6 (a) touches one sentence of its docstring — a conformance edit
this area owns the rule for, under §4 → not a fence.

**Where the font-size token is set is not a finding.** psychicnum sets
`--entryBox-font-size` on the row and strands on the box; a custom property
cascades, so both reach `.box` and the caret alike. Only the two comments
disagree (F-word-entry-2).

**Three games that render this folder carry their own stale sentence about
it** and are not this area's to fix: wordle's `BoardCol` comment (F-word-entry-6),
stackdown's "both buttons stay mounted" (true for stackdown, and the contrast
F-word-entry-7 turns on), and the `.inputButton` connections still writes
(F-word-entry-3).

## Predicted test breaks

*(written when the area starts changing things)*

- F-word-entry-4 / 5: `useArrowHistory.test.ts` → "recall is disabled and
  clear is active with nothing to bring back" splits (omitted → hidden, `''` →
  disabled); "both hidden while the arrows are off" becomes two cases
  (`disabled` → hidden, `busy` → disabled). `wordiply/PlayArea.test.tsx`
  presses the arrows through `useArrowHistory` and should not move.
- F-word-entry-9: `vocabularies.test.ts` — the `MoveRow.module.css` `pending`
  row must go with the conversion (a listed value that is no longer written
  fails from the other side).

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
