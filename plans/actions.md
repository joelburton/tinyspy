# Actions — the design

**This is a target, drafted for Joel to read.** It came out of the `keyboard`
area of [app-audit.md](app-audit.md) on 2026-09-09, from a conversation about
three things that turned out to be one: games catching keys inconsistently,
buttons not showing their shortcuts, and menus carrying their shortcuts
inline. Nothing in code has changed for it. Joel read it twice on 2026-09-09
and answered every comment; the marks below reflect both reads, and nothing
is left OPEN. Building starts when Joel says so.

Every statement carries one of three marks:

- **DECIDED** — Joel has said yes. Build to it.
- **PROPOSED** — my recommendation, with the reasoning; not yet agreed.
- **OPEN** — a question with no recommendation yet, or one Joel has to make.

Not read for this plan, by rule: `plans/playarea-readability.md`. It is gated,
and this plan overlaps its subject; if it is ever opened, reconcile the two.

---

## 1. The idea in one paragraph

A game has commands: new game, end game, concede, back to club, restart,
shuffle, peel, submit, reveal, pencil. Today each one is written in up to four
shapes — a menu row with a shortcut string, a named button with a hand-written
tooltip, a branch in a key listener, and a doc row — and nothing ties the
shapes together, which is why `+` is spelled sixteen times and why a button
never says its key. The design is that a command is one thing, an **action**,
with a fixed half the app owns and a live half the game supplies, and that
every surface that shows or fires one reads the same action.

## 2. Vocabulary

**DECIDED — the unit is the action, not the menu item.** The menu was only
where the name happened to live; a menu row, a button and a key binding are
three ways of showing one action. The word "action" stands.

**DECIDED — an action has a fixed half and a live half.**

| half | owned by | holds |
|---|---|---|
| fixed | the app, in one registry | its name, its glyph, its keys, its tone, its confirmation, what it means |
| live | the game that offers it | what it does here, whether it is here right now, and what it says right now |

**DECIDED — the live half answers one callback with a three-valued state:**
`active` · `hidden` · `disabled`, plus an optional label (§4). Every surface
reads it. A menu row grays, a button disables and a key does nothing for one
reason, stated once. The sketch called it `checkActive`; since it also
returns the label, it is **`describe`** (Joel left the name to me,
2026-09-09): a bound action's `describe()` returns `{ state, label? }`, and
the pair on every bound action is `run` and `describe`.

**DECIDED — the joined thing is a bound action.** A registry entry plus this
game's callback and state function. Everything outside the game — menu,
buttons, key dispatch — sees only bound actions.

**DECIDED — names are `act-xxx`, and a binding held in a variable is
`actXxx`.** Joel, 2026-09-09: `'act-new-game'` in the registry,
`actNewGame` for the bound value, so both are trivially greppable. Two
consequences: the registry's keys are a typed union, so `bind()` takes
`keyof typeof ACTIONS` and a typo is a compile error rather than a key that
silently never fires; and a guard holds the two spellings together — a
`bind('act-new-game', …)` assigned to anything but `actNewGame` is a
mismatch a test can read off the source. Today's bare menu ids (`new-game`,
`end-game`, `concede`) are replaced by the prefixed ones as games convert.

## 3. What is fixed, app-wide

**DECIDED — same action, same keys, everywhere.** A game that offers shuffle
gets shuffle's keys; it does not choose. The keys live in the registry beside
the name, the way a glyph lives in the icon registry.

**DECIDED — the key is shown wherever the action is shown.** A menu row shows
it (it already does, from a hand-typed string); a button's tooltip shows it
(it does not today). Both read the registry.

**DECIDED — one meaning per name, no per-game override of the fixed half.**
If crosswords wants "Check letter" where another game would say "Check", it is
offering a different action. A name that can mean two things is two names.

**DECIDED — tone is fixed-half too.** End game and Concede are destructive
in every game; New game and Restart are normal. Today each named button
carries that as a default prop. It is a fact about the action, so it moves to
the registry, and the generic button (§5) reads it there.

**DECIDED — the shell's keys are actions too, and scope is mount, not a
field.** Joel asked 2026-09-09 whether `/ ? ~` and the anagram chord should
be actions and the non-game pages use the system. Yes: each already has the
shape (a chord, a label, a glyph, a state, a run — `/` even has a menu row
with a hand-typed shortcut), and the club page's `⇧<` is the same with its
own listener and its own copy of the overlay guard. What looked different is
the gate — they fire from a game input but not from a chat box or a form —
and that is a per-action flag (§6), the same one crosswords' Tab needs.

Two things follow. **The page-dependent key becomes a state, not a switch:**
`/` is hidden on a page with no chat mounted, and the `chat: false` option
and its paragraph go. **The dispatcher lives once, at the app root:** since
registration is component-based (§6), the home page, the club page, the game
page and its components each register their bound actions while mounted, and
the one dispatcher sees whatever is registered. There is no scope field in
the registry and no per-page dispatcher. The help list then works on every
page: "keys on this page" is what is registered. This also closes the
`keyboard` area's finding about the shortcuts hook binding at two scopes and
returning dialogs as JSX — an app-level host owns the two dialogs and binds
the four keys once, and no page renders anything.

What stays outside on purpose: backtick-as-Escape and the tab ring translate
or route a key rather than doing a thing a button could do, and Escape is the
panels' (§8).

## 4. What is live, per game

**DECIDED — offering is the opt-in.** A game that binds new-game gets its key,
its menu row and its button because it bound it. A game that does not bind
shuffle has no shuffle binding. There is no separate list of "which shortcuts
this game wants."

**DECIDED — `hidden` versus `disabled` have different jobs.** `hidden` is for
an action that does not apply at this moment or in this mode: play-only
actions at terminal, terminal-only actions during play, end-game in a compete
game. `disabled` is for "here, and not right now": submit with an empty entry,
concede after conceding, anything in flight. The visible set at any moment is
the actions that apply then, not the union — which is also the narrow-device
answer.

**DECIDED — the live label comes back from the same callback as the state.**
Bananagrams' Peel and scrabble's "Submit · 24" are one action each whose text
depends on state. State and text are read off the same moment, and two
functions could disagree about it, so one callback returns both. The label in
the return is optional and falls back to the registry's fixed label, so an
action whose text never changes returns only the state. The fixed half stays
fixed: the action's identity is its name, glyph and keys; its text may vary.

**DECIDED — a bound action's run is single-flight.** The app already has
`useSingleFlight`; wrapping the action's callback in it gives every surface
one shared pending state, so the button disables, the row grays and the key
no-ops while the action is in flight, because the action is busy and not
because each caller remembered. An action whose callback is synchronous is
unaffected: its flight is over before anyone reads it.

**DECIDED — bind once, reference everywhere.** A game writes each binding as
a value and hands that same value to the button it places and to its menu
list. If the callback and the state function were props on the button and
also entries in the menu, the game would have spelled the binding twice and
the drift this plan removes would be back in a new shape.

**DECIDED — confirmation is a property of the fixed half, asked by the
shared run.** Researched 2026-09-09 against the tree:

- Three confirmation texts are shared constants already —
  `NEW_GAME_CONFIRM`, `RESTART_CONFIRM`, `END_GAME_CONFIRM` in
  `useConfirmation.tsx` — plus `CONCEDE_CONFIRM` as a bare string in
  `useStandardGameActions.ts`.
- They are asked at roughly twenty call sites, one per game per action, and
  every site has the same shape: `if (!isTerminal && !(await
  confirmAction(NEW_GAME_CONFIRM))) return`. The game page's `⌥+` path asks
  the same question a twenty-first time.
- The condition is the same everywhere too: ask mid-game, go straight
  through at terminal (Restart's docs say why: at terminal there is nothing
  left to lose).
- Three confirmations are bespoke and stay in their callbacks: crosswords'
  and strands' one-off dialogs, and the word-edit dialog, which is not a game
  action at all.

So the confirmation IS fixed-half: new-game always asks the new-game question,
and always only mid-game. The registry entry carries the confirm options; the
shared run (the same wrapper that makes it single-flight) asks before calling
the game's callback, when the game is not terminal. Twenty identical lines
leave the PlayAreas, and a game cannot forget to ask. A bespoke confirmation
stays inside the callback, as now. The alternative — leave it in every
callback — keeps the registry purer at the cost of the duplication this plan
exists to remove.

## 5. Surfaces

**DECIDED — placement is imperative.** A game puts a button where it wants it,
the way it places anything. The registry knows nothing about placement,
surface or layout, and an offer answers no questions about them. This is what
keeps the registry a table and an offer small.

**DECIDED — a menu is a list of bound-action references.** Order and grouping
are the game's; label, glyph, key and state come from the action. The shared
framing (Help and chat at the top, the exits and Back to club at the bottom)
is the same list written once, with the game's own actions in the middle.
Submenus (crosswords' check and reveal by scope) are a list of lists. A header
block (the puzzle's title and credit) is not an action and stays a separate
thing the menu shows above the list.

**DECIDED — the info column's action list is plain JSX, no machinery.** A
container that reserves the list's box, holding one action button per action
the game has; each asks its own state and a hidden one renders nothing. The
container's reserved height is the size of the largest state it will hold
(the terminal set and the play set both fit without the box moving) — a
property of the list, decided once, not of any action. Rendering cost is not
a concern; no `if` is needed around a button that returns null.

**DECIDED — one generic `<ActionButton action={…} />`, and the named buttons
retire.** Joel left the shape to me and took the recommendation: the generic one,
because of what the named buttons turn out to hold: each is a thin wrapper
over `StandardButton` supplying a default label, glyph and tone — all three
now fixed-half, read from the registry — and passing everything else through.
Once the bound action carries the id, a `<NewGameActionButton>` would name
the action twice. What stays a prop is what is genuinely about this
placement: `show` (icon, label or both) and `weight`, which the button
taxonomy already treats as the caller's. So a site reads
`<ActionButton action={newGame} show="both" weight="primary" />`, and a new
action never needs a new button file. The named buttons that are not actions
(Close, Cancel, FormSubmit, the pause control) are untouched.

**DECIDED — the same bound action may appear twice.** Shuffle floating over
the board and shuffle in the menu are one binding shown in two places, and
because placement is imperative and neither placement knows about the other,
they cannot disagree.

## 6. Keys

**DECIDED — no game and no hook writes a key branch again.** Today a
command's key is a branch in some listener a game or the shell wrote: `+` is
a branch in the game page's listener, `⌥P` is a branch in crosswords' grid
hook, Space-shuffle is a branch in four games' handlers. From here there is
one dispatcher that reads the keys off the bound actions, and a game or a
component gets a key by binding an action, never by listening for it. An
earlier draft kept the entry keys (letters, arrows, Backspace on a word) in
the entry hooks as a stream; that was superseded by the next statement, and
the distinction that survives is who OFFERS a key — the PlayArea for its
commands, a shared component for its entry keys — not where it is caught.

**DECIDED — ALL keys go through the system, not almost all.** Joel raised
the question 2026-09-09: one place to look for a game's keys, rather than the
PlayArea and several hooks, and a list that could appear in the game's help
and never drift. The recommendation is all keys, for the reason that a
partial list lies: a help panel showing the commands but not Backspace, the
arrows or A–Z is one a player cannot trust, and a per-surface fallback
handler for "everything else" is exactly where keys would go to escape the
list. Three kinds of entry cover it:

- a **chord** — one discrete key, the commands and the named entry keys
  (Backspace, Enter, the arrows, `⇧⌫`, `#`, Tab-to-next-clue);
- a **pattern** — a class of keys, "any letter", "any digit", with the
  callback receiving the key. The letter stream is ONE bound action, and
  "A–Z types into the entry" is already a row in the doc;
- a **wildcard** — any key, for the two behaviors the doc already lists: the
  history viewer's "any key returns to live" (active while viewing, consumes)
  and feedback dismissal (never consumes).

The entry keys already have the shape of actions — discrete, one fixed key,
one meaning, a callback and a state, several with a button twin (the ⌫ and
Submit in stackdown and strands). What differs is only who offers them.

**DECIDED — components register their own bound actions, the way rings
register.** Joel's suggestion, and it is what makes "all keys" workable
rather than complex. A component that owns an entry surface — `EntryRow`,
the board-cursor hook, crosswords' grid — binds its keys with its own
closures, registers them into the page's list while mounted, and leaves on
unmount; the tab-ring stack is the same mechanism. The PlayArea contributes
its commands and knows nothing of what `EntryRow` bound. The dispatcher and
the help list see the union. (This is page-level state that components reach
from below; it touches the subject of the gated `react-context.md`
conversation, which was not read for this.)

**Where the cost is, honestly:**

- **Order and consumption.** Two things can want one key at different
  moments: the viewer exit takes any key and consumes it while viewing; an
  extra key runs before the entry's hard-off. In one system that is stack
  order plus a `consumes` property on a wildcard. Today it is a dozen
  hand-ordered `if`s across the hooks.
- **Gates are per action, not per dispatcher.** Commands bail on key repeat;
  arrows and letters must repeat. Commands bail inside an editable field;
  crosswords' Tab does not. So repeat and field-bail become two flags on the
  descriptor with sensible defaults.
- **Crosswords is the proof and the risk.** Its grid hook is one large
  ordered switch with the most exceptions in the app. As about twenty bound
  actions plus one letter pattern it would read better than it does, but it
  is the largest single rewrite in the plan, and goes LAST.

**The hybrid — match what is bound, pass the rest to a per-surface handler —
is the escape hatch if crosswords proves too much, not the design.** It is
where the list would start to drift.

**DECIDED — the game's key list is generated, at the bottom of Help, as a
plain loop.** Joel, 2026-09-09: the list goes at the bottom of the help
dialog, refined later, and for now it is a simple loop over the registered
actions that have keys and are not hidden — first chord, current label. It
ships when the last keys are in, not before: a generated list missing a
component's keys is worse than the hand-typed doc it replaces.
`docs/keyboard-shortcuts.md` stays hand-kept for now and is updated to the
new keys as they land; generating or guarding it is a later refinement.

**DECIDED — one generic dispatcher replaces the hand-written branches.** The
app-root listener (§3) walks the bound actions in stack order, finds the first
whose chord or pattern matches, and fires it if the state is active; a
wildcard sees the key on the way. The dispatcher's two gates (a focused text
field, a floating panel) stay as they are. Crosswords' `⌥` command chords
move out of its grid hook into this and get the disabled-state inheritance
that only `+` and `⌥⌫` have today.

**DECIDED — an action's keys are a list of chords, and the first is the one
shown.** Joel's proposal. A chord is a small descriptor rather than a string:
key or physical code plus modifiers, with one `matches(chord, e)` helper, so
the macOS dead-key cases (`⌥\``, `⌥+`, crosswords' `⌥C`) match on `code`
without each listener knowing why. The display label is written beside each
chord. Two notes on the list: a chord can be marked shift-agnostic, so
"`⌥L` and `⌥l`" is one chord rather than two entries, while genuinely
different keys (Enter and Space both peeling) are two entries; and the tooltip
and the menu row show the first only.

**DECIDED — a guard, in two parts, and only as far as it stays simple.**
First: no two actions that can be on screen together share a chord. Second:
a game file may not catch a registered chord by hand — in plainer words, if
`⌥Z` is shuffle's key, then a handler matching it may not appear in a game's
code, because the only way to bind shuffle is to bind the action. The guard
greps game code for the literals the registry owns. Joel: if that gets
complex, the second half is easy to manage by hand — so ship the first half,
and the second only if it is a short test.

**DECIDED — shuffle leaves Space and becomes `⌥Z`, and so does rotate.**
Joel, 2026-09-09. That dissolves the bananagrams conflict: Space as a second
Peel key is then just Peel's second chord. Boggle's rotate is a different
action (one meaning per name), but no game has both, the same button serves
both today, and they take the same chord — the collision guard allows two
actions to share a chord when they are never on screen together.

**DECIDED — modifiers: the dispatcher matches chords exactly, so any chord is
bindable; the convention is `⌥`.** Joel asked whether "leave `Cmd`/`Ctrl`/`Alt`
to the browser" would forbid `Ctrl-X` or `⌥X` as a game key. It would not,
and the app already binds `⌥` chords (`⌥⌫`, `⌥+`, crosswords' nine). The
bail exists for the ENTRY hooks, where a letter with a modifier held is not a
letter to type, and it belongs there. The command dispatcher is different:
it matches a registered chord, modifiers included, and lets anything
unmatched through to the browser. What the convention should say is which
modifier games use: `⌥` is safe on macOS (dead keys handled by matching on
`code`) and free of browser meanings; `Cmd` is never ours (reload, new tab,
address bar); `Ctrl` is free on macOS but is the browser's on Windows and
Linux (`Ctrl-R`, `Ctrl-T`, `Ctrl-X`), so a `Ctrl` chord would work for Joel
and break for a friend on a PC. Recommendation: `⌥` for every game chord,
and the guard rejects `Cmd`. The `keyboard` area's finding about the bail
living in one place is about the entry hooks and stands on its own.

## 7. What it replaces

Read off the tree 2026-09-09, so this can be checked when the work starts:

- `MenuAction.shortcut` — a hand-typed display string, per row; the type's
  own comment says the binding lives elsewhere.
- Sixteen `shortcut: '+'` New game rows, and the `NEW_GAME_ID` /
  `END_OR_CONCEDE_IDS` contract by which the shell finds a row to fire.
- The game page's four-branch listener for `⇧<`, `+`, `⌥+`, `⌥⌫`.
- The `actionsRef` most PlayAreas hold so a menu built early can reach a
  handler declared later (thirteen of sixteen).
- Crosswords' chord branches for commands that are already menu rows.
- Four spellings of Space-shuffle across four games, and `onExtraKey`, whose
  only use is shuffle.
- Roughly twenty `!isTerminal && !(await confirmAction(…))` lines, if §4's
  confirmation proposal is taken.
- The named action buttons (`NewGameButton`, `EndGameButton`,
  `ConcedeGameButton`, `RestartButton`, `BackToClubButton`, `ShuffleButton`,
  `PeelButton`, …), if §5's generic button is taken.
- Hand-written button tooltips that never say the key.
- Each game's `over ? <TerminalActionRow/> : (…)` split: the terminal row is
  shared, the play-time row is per game, and the two are different code paths
  for what becomes one list under the state callback.

## 8. What it does not touch

- Tab rings ([tab-rings.md](tab-rings.md)). Related by folder — both retire
  per-game listeners — but a different question: the ring says where focus
  goes, the registry says what a command is. **DECIDED: separate and
  cross-linked** — the ring is one decision from finished and would
  otherwise wait behind this. Joel was happy either way.
- The dispatcher's two gates. A keystroke aimed at a focused text field or at
  anything inside a floating panel never reaches a bound action — a left
  arrow typed in chat cannot move a board cursor. Same as today.
- Everything that is not the game surface keeps its own listener: Escape
  (the panels' own, ranking what you are in above what is on top),
  backtick-as-Escape, the tab ring, the app-wide `/ ? ~` shortcuts, the
  menu's keys while open. Stepping out is the boundary, not an exception.
- The button taxonomy's tones and the icon registry; both are read, not
  changed.
- Screen readers, per CLAUDE.md.

## 9. Sequencing

**DECIDED — it runs NOW, nested inside app-audit, once this plan is
approved.** Joel, 2026-09-09: it would be strange to audit the `menu` area
and each game's PlayArea given how much those would change. It touches
`common/keyboard`, `common/menu`, `common/buttons` (blessed),
`common/terminal`, `common/game-page`, and every PlayArea, and those areas
wait behind it — the same bargain the error sprint took. The registry, the
dispatcher, the generic button and the guard are one folder's work;
converting each game is a call-site sweep whose stamps do not move, like a
rename. Two menu shapes will coexist until the last game converts.

**DECIDED — the open `keyboard` area needs no special handling.** Joel: it is
fine for things to break there while this is being worked. Its findings that
this plan absorbs (the Space-shuffle spellings, the shortcuts hook's shape)
are worked here; the rest wait, and the area resumes when this lands.

**DECIDED — the order of construction.** Joel's shape, with the exact steps
mine: **build the common machinery first, then bind the app-wide actions so
the code can be read and basic keystrokes work on the home page and the club
page; only then roll out to the game page and the games.** It is fine for
the games to be entirely broken in between. So:

1. The registry, the chord descriptor and `matches`, `bind`, and the
   app-root dispatcher with component registration.
2. The shell's actions bound at the app level — chat, the page menu, word
   lookup, the anagram finder — and the club page's `⇧<`. The menu reads
   bound actions. This is the checkpoint: Joel reads the code and presses
   the keys on the home and club pages.
3. The generic `<ActionButton>` and the tooltip showing the key.
4. The game page: its four shell shortcuts as bound actions, the generic
   dispatch replacing its listener, the shared menu framing as a list.
5. The games' commands, one sweep; the named action buttons retire.
6. The shared entry components register theirs (`EntryRow`, the board
   cursor); then crosswords' grid, last.
7. The generated help list and the doc, once every key is in.

The guard lands with step 1 so nothing converts back.

## 10. Where it stands

Nothing is OPEN. The last questions were answered on Joel's second and third
reads (2026-09-09): where command keys are caught is settled by "all keys
through the system" (§6); shuffle's and rotate's chord is `⌥Z` (§6); the
state callback is `describe` (§2); the key list is a loop at the bottom of
Help and the doc stays hand-kept (§6); tab-rings stays a separate plan (§8);
and the open `keyboard` area needs no special handling (§9). **Part II below
is the build order, written for the session that builds it.**

---

# Part II — the implementation plan

Written 2026-09-09 for a builder that has not read this conversation. Part I
is the design and outranks anything here; this part says what to make, in
what order, and what to delete. **Every step ends with `npx tsc -b` and
`gmake test-fe ENV=local` green except for the breaks the step predicts, and
with the work left in the tree for Joel to review — nothing is committed
unless Joel asks, per CLAUDE.md.**

## II.0 Before starting — read, and rules that apply

Read, in this order: `CLAUDE.md`, `docs/code-conventions.md`,
`docs/common-folders.md`, `docs/keyboard-shortcuts.md`, Part I of this file,
then `src/common/keyboard/doc.md` and the files it names. Do NOT open
`plans/playarea-readability.md`, `plans/react-context.md` or
`plans/css-system-outdated-dont-read.md`; do not read or edit `/palette` or
`/font` (`src/common/devtools/`).

Rules that will bite here specifically:

- **New files start `// cs-unmet`** (`// cs-unmet` for TS, `/* cs-unmet */`
  for CSS) — `src/guards/csStamps.test.ts` fails otherwise. A file this work
  EDITS keeps whatever stamp it has; a sweep never moves a stamp.
- **A new folder needs `doc.md` and `todo.md`** in the shape
  `docs/common-folders.md` gives (H1 = folder name, a one-to-three-sentence
  lede, `## Design`; `todo.md` with Bugs · Soon · Someday · Maybe). Write the
  Design — this folder is built from a settled design, so it is knowable —
  and do not add the folder to `DESIGNS_OWED` in `src/guards/folderDocs.test.ts`.
- **`/**` only on a file, type, function or component; a field or prop note
  is `//`.** No rationale paragraphs in docstrings; no "used to" archaeology;
  no caller counts ("used by twelve games").
- **American spelling everywhere**, enforced by a guard.
- **No `setState` inside an effect** (eslint errors); derive during render or
  read through a ref, the way `useTabRing` and `useGlobalKeyHandler` do.
- **Ask before running any e2e spec.** Unit tests run freely; the local
  Supabase stack is always up.
- **Say "not-ok", never "refusal" or "failure", for an envelope that is not
  ok.** Say "floating panel", never "panel" alone.
- **Typecheck with `npx tsc -b`**; `tsc --noEmit` checks nothing here.

## II.1 Step 1 — the machinery (`src/common/actions/`)

A new folder, `src/common/actions/`, holding everything that is not a game's
or a page's. Files, with the shape each exports:

**`chord.ts`** — the key descriptor and its two functions.

```ts
export type Chord = {
  key?: string            // e.key, for character keys: '+', '/', '<', 'Enter', 'Backspace', ' '
  code?: string           // e.code, for physical-key matches: 'KeyZ', 'Equal', 'Backquote'
  alt?: boolean           // ⌥ required (default false: ⌥ must be UP)
  shift?: boolean         // ⇧ required; ignored when shiftAgnostic
  shiftAgnostic?: boolean // ⌥L and ⌥⇧L are one chord
  label: string           // what a tooltip, menu row and the help list show: '⌥Z', '⇧<', '+'
}
export type KeyPattern = { pattern: 'letter' | 'digit' | 'arrow' | 'any'; label: string }
export type KeySpec = Chord | KeyPattern
export function matches(spec: KeySpec, e: KeyboardEvent): boolean
```

`matches` never accepts `metaKey` (Cmd is never ours) and rejects `ctrlKey`
unless the chord says `ctrl: true` (no registry entry will; the guard checks).
A `code` chord matches on `e.code`; a `key` chord on `e.key`; `alt` and
`shift` must match exactly unless `shiftAgnostic`. A pattern matches its
class with NO modifier held (`letter` = one ASCII letter, either case;
`arrow` = the four arrow keys; `any` = anything). Unit-test every branch,
including the macOS dead-key case (`key: 'Dead', code: 'Backquote', altKey`)
that `useAppShortcuts.test.ts` covers today.

**`registry.ts`** — the fixed half, `ACTIONS`, keyed by id.

```ts
export type ActionSpec = {
  label: string                 // the fixed label; describe() may override it
  icon?: AppIcon                // from common/icons/icons.ts, never lucide-react
  tone?: ButtonTone             // 'destructive' for end/concede; default 'normal'
  keys?: KeySpec[]              // first is the one shown; [] or absent = no key
  confirm?: ConfirmOptions      // asked by the shared run when the game is not terminal
  repeat?: boolean              // default false: e.repeat is ignored. true for letters/arrows
  inField?: 'never' | 'game-inputs' | 'always'
                                // may it fire from a focused text field? default 'never';
                                // 'game-inputs' = only from a [data-game-input] field
                                // (the shell's `/ ? ~`); 'always' = crosswords' Tab
}
export const ACTIONS = { 'act-new-game': { … }, … } as const satisfies Record<`act-${string}`, ActionSpec>
export type ActionId = keyof typeof ACTIONS
```

Seed it with EVERY action in II.4–II.7 below, so the ids exist before the
games convert. Labels and glyphs come from today's menu rows and named
buttons; chords from `docs/keyboard-shortcuts.md`, with the changes Part I
decided (shuffle and rotate `⌥Z`). Confirmations from
`useConfirmation.tsx` (`NEW_GAME_CONFIRM`, `RESTART_CONFIRM`,
`END_GAME_CONFIRM`) and `CONCEDE_CONFIRM` from `useStandardGameActions.ts`,
which moves here. `ACTIONS` is a plain object with no functions in it.

**`useBoundAction.ts`** — the live half, and registration.

```ts
export type ActionState = 'active' | 'hidden' | 'disabled'
export type Described = { state: ActionState; label?: string }
export type BoundAction = {
  id: ActionId
  spec: ActionSpec
  run: (...args: unknown[]) => void   // single-flight + confirm wrapped; a pattern action receives the key
  describe: () => Described           // the game's, called at read time
  pending: boolean
}
export function useBoundAction(id: ActionId, live: {
  run: (...args: any[]) => void | Promise<void>
  describe: () => Described | ActionState   // a bare state is shorthand for { state }
  terminal?: boolean                        // when true the confirm is skipped
}): BoundAction
```

Binding IS offering: the hook registers the bound action on a module-level
stack while mounted and removes it on unmount — copy the mechanism from
`useTabRing.ts` (a stack, innermost last; the entry holds a ref that an
effect refreshes each render, so the listener reads fresh closures without
re-registering). `run` is wrapped with `useSingleFlight` and, when the spec
has `confirm` and `terminal` is false, asks through `confirmAction` first —
find how `GamePage.tsx` obtains `confirmAction` and reuse it. Also export a
subscription hook (`useSyncExternalStore` over the stack) so the menu and
the help list re-render when the set of bound actions changes.

**`dispatcher.ts`** — `useActionDispatcher()`, mounted ONCE in `App.tsx`.

One window keydown listener. In order: the two gates (a focused text field
unless the matching action's `inField` allows it; anything inside
`[data-floating-panel]` — reuse the predicate; see the note below), then
`e.repeat` unless the action allows repeat, then walk the stack innermost
(last) first: every active `any`-pattern entry marked `consumes: false`
runs and does not stop the walk (put `consumes` on the bound-action options,
default true); the first active entry whose spec matches runs,
`preventDefault`s, and stops. Hidden and disabled entries are skipped so the
key falls through. Modified keys that match nothing go to the browser.

The text-field predicate: `useGlobalKeyHandler.ts` writes it inline,
`useAppShortcuts.tsx` has `isNonGameField`, `useGameHasKeyboard.ts` exports
`isEditableField`, and `GamePage.tsx` has a fourth copy missing `<select>`.
Move `isEditableField` to `src/common/keyboard/editableField.ts`, build
`isNonGameField` on it in the same file, and make every reader import from
there. Delete the inline copies.

**`ActionButton.tsx`** — `<ActionButton action={…} show weight className />`.
Renders `StandardButton` with `label` (the described label, else the spec's),
`icon` and `tone` from the spec, `disabled` when the state is disabled or
`pending`, `tooltip` = the label plus the first chord's label when there is
one ("New game · +"), `onClick = run`. Returns null when hidden. `show` and
`weight` are the caller's. Test it against a real bound action.

**`KeyList.tsx`** — the help list: a plain loop over the registered bound
actions with keys whose state is not hidden, one row each — first chord
label, described label. No machinery, no grouping. Mounted at the bottom of
`GameHelpCompanion` (below `children`, above the Got-it row). Check whether
the club page's help uses the same frame; if it does, it gets the list too.

**`doc.md` + `todo.md`** for the folder (rules in II.0).

**Guard** — `src/guards/actionIds.test.ts`: every registry id is `act-…`;
every `useBoundAction('act-x-y', …)` in `src/` is assigned to a variable
named `actXY` (grep the source; a mismatch fails); no chord has `meta` or
`ctrl`. The chord-collision and hand-caught-literal checks from Part I §6
are added only if each is a short test; Joel is happy to manage those by hand.

**Tests**: `chord.test.ts`, `useBoundAction.test.ts` (registers on mount,
leaves on unmount, single-flight, confirm asked only when not terminal,
shorthand state), `dispatcher.test.ts` (gates, repeat, innermost wins, a
disabled entry lets the key fall through, a non-consuming wildcard runs
alongside, `preventDefault` on a match), `ActionButton.test.tsx`,
`KeyList.test.tsx`.

**Predicted breaks at the end of step 1:** none — nothing calls it yet.

## II.2 Step 2 — the app-wide actions (the checkpoint)

Bind the shell's keys as actions so Joel can read the code and press keys on
the home and club pages. Mount `useActionDispatcher()` in `App.tsx` beside
`useBacktickEscape()`.

Add `src/common/actions/AppActionsHost.tsx`, mounted once in `App.tsx`,
which owns the `WordLookupDialog` and `AnagramDialog` open state and binds:

| id | chord | inField | describe |
|---|---|---|---|
| `act-lookup-word` | `~` | `game-inputs` | active |
| `act-anagram-finder` | `⌥\`` on `code: 'Backquote'`, shiftAgnostic | `game-inputs` | active (run toggles) |
| `act-open-menu` | `?` | `game-inputs` | active; run calls `openPageMenu()` from `pageMenuStore` |
| `act-open-chat` | `/` | `game-inputs` | hidden unless a `<Chat>` is mounted — add a tiny mounted flag to `chatOpenStore` (set by `Chat` on mount) so the host can read it; run sets chat open and rAF-focuses `[data-chat-input]` as today |

`ClubPage.tsx` binds `act-back-to-home` (`⇧<`, i.e. `key: '<'`; run
navigates home) and its menu rows as key-less actions (`act-help`,
`act-edit-club`, `act-rename-club`). `HomePage.tsx` binds nothing but its
menu rows (the account section — make `useAccountMenuSection` return bound
actions). The `?` menu keeps opening through `pageMenuStore`.

**Menus read bound actions.** In `menuModel.ts`, `MenuAction` becomes a
bound action: `MenuItem = BoundAction | MenuSubmenu`, `MenuSubmenu = { label,
icon?, items: BoundAction[] }`; delete the `shortcut` field and the
`onClick`/`id`/`label`/`icon` on rows. `Menu.tsx` renders label (described,
else spec), icon, `spec.keys?.[0]?.label` in the shortcut span, `disabled`
from state or pending, omits hidden rows, and calls `run`. `MenuSection`
keeps its `header`. Update `PageHeaderMenu` and the menu's tests.

**Delete**: `useAppShortcuts.tsx` and its test; the `lookupDialog` render in
all three pages; ClubPage's `backToHomeShortcut` effect and its
`closest('[data-floating-panel], [role="menu"], [role="dialog"]')` guard
(the dispatcher's gate replaces it); the `chat: false` option.

**Update**: `docs/keyboard-shortcuts.md` → the two "Global" tables;
`docs/common.md` → "App-level keyboard shortcuts" becomes a sentence and a
link; `src/common/keyboard/doc.md` → the paragraph on the shell's keys.

**Predicted breaks**: `useAppShortcuts.test.ts` (deleted with the hook);
`src/common/menu/*.test.ts` (row shape); `e2e/anagram-finder.e2e.ts`,
`e2e/chat-keyboard.e2e.ts`, `e2e/club-keyboard.e2e.ts` (should still pass —
ask before running).

**STOP here.** Leave the tree for Joel: this is the checkpoint where he reads
the code and presses the keys.

## II.3 Step 3 — the button and its tooltip

Already built in step 1; this step places it. `StandardButton` gains nothing.
`TooltipHost` renders `data-tooltip` text as-is, so the key rides inside the
string for now ("New game · +"); a styled key cap is a later refinement.
Nothing else changes until step 5 places buttons.

## II.4 Step 4 — the game page

`GamePage.tsx` binds `act-back-to-club` (`⇧<`; run = `requestBackToClub`)
and `act-new-game-from-setup` (`⌥+` on `code: 'Equal'`, shiftAgnostic; run
= the existing `⌥+` branch's body; hidden when there is no club handle).
`useStandardGameActions.ts` returns bound actions for `act-end-game`
(`⌥⌫`, `code: 'Backspace'` + alt; `tone: 'destructive'`; hidden in compete
unless the game passes `offerEndInCompete`; disabled at terminal) and
`act-concede` (same chord; hidden in coop; disabled at terminal or once
conceded), plus `act-restart` where it exists today, all with `confirm`.
The two share a chord and are never both active, which the dispatcher's
"first active match" handles.

`buildGameMenu` takes bound actions (`help`, `chat`, the exits, `back`) and
returns `MenuSection[]` of them, with the game's `extra` lists in the
middle. Delete `NEW_GAME_ID`, `END_OR_CONCEDE_IDS`, the `globalMenuShortcuts`
effect and its fourth copy of the editable predicate.

**Predicted breaks**: `gameMenu.test.ts` (asserts `shortcut` strings);
`e2e/new-game-shortcut.e2e.ts` and `e2e/suspend-dialog.e2e.ts` (should pass;
ask). Every PlayArea fails to type-check until step 5 — expected; Joel has
said the games may be entirely broken between steps.

## II.5 Step 5 — the games' commands, one sweep

For each of the sixteen PlayAreas (`src/<game>/components/PlayArea.tsx`),
in any order, boggle first as the smallest with a shuffle-shaped action:

1. Bind each command with `useBoundAction`, named `actXxx`: `act-new-game`
   (`+`; run = the game's `createNewGame`, terminal = `isTerminal`, no
   hand-written confirm — the wrapper asks), `act-restart` where offered,
   the exits from `useStandardGameActions`, and the game's own: `act-shuffle`
   or `act-rotate` (`⌥Z`; state active whenever there are tiles, terminal
   included), `act-peel` (bananagrams; `Enter` and `' '`), `act-submit`
   (scrabble's "Submit · N" through `describe`), `act-reveal`, `act-hint`,
   `act-exchange`, `act-pass`, `act-end-turn`, `act-spoiler`,
   `act-share-preview`, and crosswords' nine menu commands (`act-pencil`,
   `act-check-letter`, `act-check-word`, `act-check-puzzle`,
   `act-reveal-letter`, `act-reveal-word`, `act-show-note`,
   `act-explain-clue`, `act-open-scratchpad`, `act-rebus`) with the chords
   the doc lists. Add any id the sweep finds missing to `ACTIONS`.
2. Replace the menu literal with a list of the bound actions in the same
   order; submenus become `{ label, icon, items: [...] }`.
3. Replace each named action button (`NewGameButton`, `RestartButton`,
   `EndGameButton`, `ConcedeGameButton`, `BackToClubButton`,
   `ShuffleButton`, `PeelButton`, `RevealButton`, `HintButton`,
   `ExchangeButton`, `PassButton`, `EndTurnButton`, `SpoilerButton`,
   `SharePreviewButton`, `AIButton` if it is a command) with
   `<ActionButton action={actXxx} show=… weight=… />` at the same spot with
   the same `show` and `weight`. The info column's action area becomes the
   flat list of action buttons in one reserved container (Part I §5);
   `TerminalActionRow` keeps the outcome line and takes the buttons as
   children until every game is converted, then is simplified to the line
   plus the container.
4. Delete: the `actionsRef` where it only served the menu (keep it if
   crosswords' grid hook still needs it until step 6); every
   `!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))` line; the
   game's own Space-shuffle handler (`onExtraKey` in spellingbee and
   wordwheel, the `useGlobalKeyHandler` shuffle handlers in connections and
   psychicnum); `handleEntryExtraKey`.
5. Update `docs/games/<game>.md` where it names a key or a button.

When the last game converts: delete the named action-button files and their
CSS from `src/common/buttons/` (leave `CloseButton`, `CancelButton`,
`FormSubmitButton`, `PauseButton`, `DeleteButton`, `ClearButton`,
`Segmented`, `StandardButton`); delete `onExtraKey` from `useCaptureKeys`;
update `docs/ui.md`'s button sections and `src/common/buttons/doc.md`.

**Predicted breaks**: each game's `PlayArea.test.tsx` where it clicks a named
button or presses a key; `CluePanel.test.tsx` is unaffected
(`data-game-input` stays). e2e: every game spec that presses `+` or clicks
New game — ask before running.

## II.6 Step 6 — entry keys, then crosswords

Convert the shared entry components so they register their own actions:

- **`useCaptureKeys`** (via `EntryRow`; wordle uses it alone): binds
  `act-type-letter` (pattern `letter`, repeat, run receives the key and
  applies `charFor`), `act-delete-last` (`Backspace`), `act-submit-entry`
  (`Enter`; disabled when the value is empty or busy). The Tab swallow STAYS
  as it is — Tab belongs to `plans/tab-rings.md`, not this plan. `onAnyKey`
  becomes `act-dismiss-feedback`: pattern `any`, `consumes: false`, bound by
  `useDismissLocalFeedbackOnKey`, which every game already calls or gets
  through `EntryRow`.
- **`useArrowHistory`** binds `act-recall-last` (`ArrowUp`; disabled with
  nothing to recall) and `act-clear-entry` (`ArrowDown`).
- **`useBoardCursorKeys`** binds `act-move-cursor` (pattern `arrow`, repeat,
  run receives the key), `act-place-tile` (pattern `letter`), `act-remove-tile`
  (`Backspace`), and the commit as `act-peel` / `act-submit` already bound by
  the game — pass the bound action in rather than `onEnter`.
- **`useHistoryViewer`** binds `act-exit-viewer`: pattern `any`, consumes,
  active only while viewing. Every `useGlobalKeyHandler(exitOnKey)` call goes.
- **stackdown, strands, setgame** replace their inline `useGlobalKeyHandler`
  handlers with bindings: `act-pick-tile` / `act-extend-trace` /
  `act-toggle-card` (pattern `letter`), `act-delete-last` /
  `act-drop-last-cell` / `act-clear-selection` (`Backspace`),
  `act-submit-entry` (`Enter`). Setgame's inline Tab swallow and strands'
  stay (tab-rings).
- **crosswords last**: `useGridKeyboard.ts` becomes bindings — the letter
  fill (pattern `letter`), `act-clear-cell` (`Backspace`), `act-clear-word`
  (`⇧⌫`), `act-advance-cell` (`' '`), `act-peek-cell` (`⇧Space`; the
  "any other key drops the peek" is a non-consuming `any` wildcard active
  while peeking), `act-move-cursor` (arrows) and `act-jump-word-edge` (`⇧` +
  arrows), `act-next-clue` / `act-previous-clue` (Tab / ⇧Tab, `inField:
  'always'`, `consumes` — this is the one place Tab is a game move),
  `act-rebus` (`⇧Enter`), `act-jump-to-number` (`#`), `act-mark-right-edge`
  (`|`), `act-mark-bottom-edge` (`_`). The grid hook's own
  `[data-floating-panel]` and `isNonGameField` checks go — the dispatcher's
  gates cover them. `suspended` (the rebus and number-jump overlays) becomes
  `describe` returning hidden.

After this, `useGlobalKeyHandler` has no callers except `useSwallowTab` and
`useCaptureKeys`' Tab clause. Leave both; tab-rings.md retires them.

**Predicted breaks**: `useCaptureKeys.test.ts`, `useArrowHistory.test.ts`,
`useBoardCursorKeys.test.ts`, `useDismissLocalFeedbackOnKey.test.ts`,
`useGridKeyboard.test.ts`, `crosswords/components/PlayArea.test.tsx`
(keyboard wiring), `wordle/components/PlayArea.test.tsx` (physical keyboard)
— each is rewritten against the bound actions, asserting the same
behavior. e2e: `wordle-keyboard.e2e.ts`, the crosswords specs, `tab-swallow`
(should pass unchanged) — ask.

## II.7 Step 7 — the help list and the docs

`KeyList` is already mounted (step 1); with every key registered it is now
complete. Rewrite `docs/keyboard-shortcuts.md`'s routing section for the
dispatcher and its per-game tables for the new chords; keep it hand-kept.
Update `src/common/keyboard/doc.md` to describe the folder as it is then
(the dispatcher's gates and the tab ring are what remain there), and
`src/common/actions/doc.md` if building changed anything Part I said.

## II.8 What to leave alone

- The two gates, `useBacktickEscape`, `useTabRing`, `useSwallowTab`, the Tab
  clauses in `useCaptureKeys`, setgame and strands, `usePanelEscape` and
  `useFocusTrap` — Tab and Escape are not this plan's.
- The `/* @@ */` markers in CSS (they are Joel's), and every `cs-` stamp on
  an edited file.
- `docs/ui.md`'s button taxonomy beyond the sections that name the retired
  buttons.
- Anything in `src/common/devtools/`.

---

# Part III — notes from building

## Answers before step 1 (Joel, 2026-09-09)

Seven questions from the first read of Part II. Each answer amends the part it
names; where they disagree, these win.

1. **The menu reads its rows when it OPENS, and does not track them.** Two
   kinds of change, two channels. SHAPE — which rows exist, in what order — is
   the game's and still arrives through `setGameSections`, which now carries
   references to bound actions rather than snapshots of label and disabled.
   LIVENESS — what a row says and whether it is usable — is never sent: the
   menu calls `describe()` as it builds its rows, which is when it opens, and
   asks nothing in between.

   Nothing is lost while it is open, because nothing the player does can reach
   past it: a row activation closes the menu before it runs the action
   (`Menu.tsx` → `activateRow`), and the popover stops its keydowns from
   reaching the board. So no `describe()` runs while you type in crosswords or
   arrow around a board — the rows are not rendered then.

   What this gives up is small and deliberate: a change that arrives WITHOUT
   the player — a peer ending the game over realtime — can leave a row looking
   enabled for the seconds the menu stays open. Closing and reopening the menu
   is the fix. Clicking the stale row is safe regardless: `run` reads the live
   ref, and the callbacks guard themselves. If that ever becomes a real
   annoyance, investigate something more complex then.
2. **The confirmation becomes an app-level service.** `useConfirmation` is a
   local hook returning JSX, and seventeen components render their own modal;
   a shared `run` cannot reach any of them. One module store plus one host
   mounted in `App.tsx`, so `run` asks without a prop and a game cannot forget.
   **Concede and Restart move onto the styled modal at the same time** — the
   two `window.confirm` calls in `useStandardGameActions.ts` go, closing the
   follow-up that hook's docstring names. Bespoke confirmations (crosswords,
   strands, the word-edit dialog) stay in their callbacks.
3. **The flight opens on the confirm, not after it.** `useSingleFlight` already
   closes its gate before the dialog resolves, and that is the wanted behavior:
   a button on screen behind the question reads gray rather than live.
4. **A dot is not an action.** The account row's member-color disc is a
   non-action menu row the menu keeps holding. `Described` stays
   `{ state, label? }`.
5. **`KeyList` mounts in step 1** and fills in as keys convert. Part I §6's
   "it ships when the last keys are in" was about a player trusting a partial
   list; nobody but Joel sees it mid-conversion, and seeing it work early is
   worth more.
6. **A stop for review at the end of every step**, plus one inside step 5 after
   the first game (boggle), so the shape is approved before it is repeated
   fifteen times.
7. **`Chord` keeps `ctrl`, and the guard does not reject it.** Build the
   machine general; whether a `Ctrl` chord is a good idea on Windows and Linux
   is a question to investigate before any action takes one. `Cmd` is still
   never ours.

## Step 1 — what was built, and where it deviates

`src/common/actions/` holds `chord.ts`, `registry.ts`, `useBoundAction.ts`,
`dispatcher.ts`, `ActionButton.tsx`, `KeyList.tsx` and the folder's two docs,
with a test beside each. The app-level confirmation service is
`common/floating-panels/confirmationService.ts` + `ConfirmationHost.tsx`, and
`App.tsx` mounts the host and the dispatcher. Nothing binds an action yet, so
the app behaves exactly as it did.

Four places where the built thing differs from II.1, each on purpose:

- **There is no `shiftAgnostic`, and the plan's one mention of it is
  superseded** (Joel, 2026-09-10). A chord states shift wherever shift makes a
  different chord — `⌥+` is Option-Shift-Equal and `⌥=` is another chord, `⇧⌫`
  is not `⌫` — and says nothing about it when the chord is written as a
  character, where shift was already spent producing it. Two presses that
  should both fire one action are two entries in `keys`. **The two chords that
  accepted either press are now shifted-only**: `⌥+` (new game from setup) and
  `⌥~` (the anagram finder), which is what their labels always said.
- **`consumes` is on the SPEC, not the binding.** Whether a wildcard claims the
  key it sees is a fact about the action — the viewer exit always consumes,
  feedback dismissal never does — and no game would set it differently.
- **Non-consuming wildcards run in a pass of their own**, before the walk,
  rather than during it. In one walk, whether "dismiss the message" ran would
  depend on which component happened to bind first, which is a bug waiting for
  the first reordering.
- **`ButtonIcon` became an alias of the icon registry's `AppIcon`.** They
  described the same thing in two slightly different ways, and the difference
  was enough to stop an action's glyph being handed to a button.

Two shared-predicate readers in game folders changed import path only (step 1)
(`crosswords/hooks/useGridKeyboard.ts`, `bananagrams/hooks/usePlayerBoard.ts`),
per II.1's instruction to leave one copy of `isEditableField`. **No other game
code is touched, and no game behavior changes.** The concede confirm's move
onto the styled modal (decision 2) waits for step 4, where concede converts
with the rest of the game work; until then the registry writes its question
inline rather than beside its three siblings.

## Step 2 — the shell binds, and the menu reads bound actions

The four app-wide keys are actions now, bound at the app root by
`AppActionsHost`, which also owns the lookup and anagram dialogs; three pages
stopped arranging that themselves and `useAppShortcuts` is deleted. The club
page binds its `⇧<` and its four menu rows; the account submenu's three rows are
actions too. **The home page, the club page and their menus run on the new
machinery; the game page and the games do not yet.**

- **The menu reads a ROW, not an item.** `menuModel.menuRow()` is the one place
  a bound action is read on its way into a menu, and `<Menu>` lays out rows —
  so it never asks what kind of row it has. A hidden action drops out before
  anything counts rows for keyboard navigation, which is how "Add word" is
  absent for a non-editor rather than present and refusing.
- **Three row shapes coexist**, as §9 said they would: a bound action, a
  submenu, and the hand-written row the unconverted surfaces still write. The
  last one goes with the last game.
- **The open submenu is held by id, not by the row.** Rows are re-read every
  render, so holding one would be holding what it said when it opened.
- **The account row stays a submenu and keeps its dot** — decision 4. It shows
  WHO you are, and an action says what you can do.
- **A binding whose only purpose is its key is assigned to nothing**, and the id
  guard no longer insists otherwise: the shell's four are bound by a host that
  places neither a button nor a row for them, and `void actX` lines to satisfy a
  guard would be noise.
- **`<Chat>` says when it is mounted** (a flag on `chatOpenStore`), so `act-open-chat`
  is hidden on the home page. The `chat: false` option and its paragraph are
  gone — the page-dependent key became a state, as §3 said.
- **The club's help gained the generated key list.** It is a different frame
  from the games' help, so it needed the mount of its own. Its prose still names
  `/`, `?` and `~` by hand a paragraph above the list — Joel's copy, left alone,
  and worth a look now that the list says the same thing.

## Steps 3 and 4 — the button, and the game page

**Step 3 needed nothing built.** `<ActionButton>` shipped in step 1 and
`TooltipHost` renders `data-tooltip` verbatim, so "New game · +" already works;
there is nowhere to place a button until the games convert, so the step folds
into step 5.

**Step 4 converts the shell's game-page keys and breaks the games**, which is
the bargain §9 named. `tsc -b` reports 92 errors, all in the sixteen PlayAreas
and their tests; every other file, test and guard is green.

- **`useStandardGameActions` returns bound actions** — `actEndGame`,
  `actConcede`, `actRestart` — and takes `mode` instead of a confirm. Which
  exit a mode offers stopped being the caller's question: End hides itself in a
  race unless the game opts in, Concede hides outside one, both disable at
  terminal. Its `window.confirm` for concede is gone, which is decision 2
  landing where it belongs.
- **`buildGameMenu` arranges rows and decides nothing.** No `mode`, no
  `isTerminal`, no `conceded`, no handlers: it takes the game's `exits` in the
  order they should read and the shell's three rows off `ctx.menu`.
- **`MenuApi` carries actions, not callbacks.** `openHelp` and
  `requestBackToClub` are replaced by `actHelp`, `actBackToClub` and `actChat`
  — the last bound at the app root and passed along, which needed a way to
  reference an action somebody else bound (`useAppAction`).
- **`NEW_GAME_ID` and `END_OR_CONCEDE_IDS` are deleted**, and with them the
  four-branch listener and the id contract by which the shell found a row to
  fire. A game gets `+` and `⌥⌫` by binding the action; until it does, in
  step 5, those keys do nothing there.
- **Two `menu/todo.md` items are answered and deleted.** A row grays while its
  action is in flight (one rule, in `menuRow`, rather than sixteen opinions),
  and the New-game id contract that fifteen games typed by hand is gone.

## Step 5 — the first game: psychicnum

Its PlayArea, BoardCol, InfoCol and tests are converted; 35 of 35 pass and its
type errors are gone. What the first conversion taught:

- **The `actionsRef` disappears rather than being replaced.** It existed so a
  menu effect written ABOVE the handlers could reach them; with bindings the
  menu is a list of values, so the effect simply moves below them. Its dep array
  went from seventeen entries to twelve stable ones.
- **Both exits are placed unconditionally**, in the menu and in the info column,
  because each hides itself in the mode that isn't its own. The `isCompete ? … :
  …` branch that picked one is gone from both.
- **A button is still called what it is called.** The tooltip carries the key
  ("End game · ⌥⌫"), and `StandardButton` takes its accessible name from the
  tooltip when there is one — which silently renamed every icon-only action
  button and broke a dozen tests. `<ActionButton>` now passes `aria-label`
  explicitly, so the key is a hint and not part of the name.
- **A component test that fires a confirming action must mount
  `<ConfirmationHost />`.** The host lives in `App.tsx`, so a test rendering a
  PlayArea alone gets a question nobody can answer — which the service reports
  and answers "no". Two psychicnum tests now render it and click through the
  modal, the way the End-game test already did.
- **`describe()` may return a GLYPH as well as words** (Joel, 2026-09-10), which
  is what let Reveal secrets convert like everything else. A toggle has two faces
  and on an icon-only control the glyph IS the label, so words that moved without
  the glyph would have the two saying different things at the same moment. §2's
  "its name, glyph and keys" is narrowed to what it meant: **how an action looks
  may vary; what it IS — its name, keys, tone and question — does not.** The
  alternative, two actions for one toggle, would have pushed "which action goes
  in this row?" back into the game, which is the branch this plan removes.
  psychicnum's Reveal is an `<ActionButton>` now; `RevealButton` retires when the
  last of its five other callers converts.
- **`<ActionButton>` takes a `tooltip` override**, for a REASON the placement
  knows and the action does not: "Can't reveal until all end", on a button gray
  because the race is still running. Rare by construction — an action that is
  merely unavailable needs no explaining.
- **A named button's TONE is part of what it means, and the registry had to
  learn it.** Hint and Spoiler are caution-amber, Reveal is destructive-red, and
  the first conversion drew all three action-blue because the rows carried no
  `tone` — Joel caught it on sight. Nine registry entries gained one, and
  psychicnum's tests now assert the three that regressed. **Every remaining game
  must carry its buttons' tones across the same way**: the named button is where
  they are written down until it retires.
- **Shuffle moved from Space to `⌥Z`** (§6), and psychicnum's own window
  listener for it is gone. The round Shuffle button is not an `<ActionButton>` —
  it is a board control with its own look — so it stays live at terminal and
  while viewing history, as documented, while the key is disabled in the viewer.
- **Three e2e specs pressed chords the shift rule changed** (`Alt+Backquote`,
  `Alt+Equal` twice) and one pressed Space to shuffle. All four are updated;
  none has been run.
