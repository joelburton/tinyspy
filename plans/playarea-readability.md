# PlayArea readability — ideas only

**DO NOT READ THIS FILE UNTIL JOEL SAYS TO. IDEAS ONLY — NOT CURRENT, NOT
APPROVED, NOT ACTIONABLE.** This is a set of recommendations from a
conversation on 2026-09-07, saved so the thread can be picked up later. Nothing
in it is a decision, an area of the audit, or a queued pass. A session that
finds this file must close it: do not build from it, do not fold any item into
an area's work, do not cite it as precedent. If Joel wants any of it built, he
will say so, and the relevant part gets rewritten as a plan at that moment.

---

## 1. The question

Joel has been making the app more human-understandable. The per-game
`PlayArea.tsx` files are large and mix concerns: keystroke and menu handling,
game-play information, the input engine, and (it seemed) the board itself. What
would improve readability and understanding?

## 2. What the survey found (2026-09-07)

- The sixteen PlayAreas run 614 to 1288 lines. A quarter to two fifths of
  every file is comment lines.
- Only psychicnum renders a `Board` directly. Every other game goes through
  `BoardCol`, so the "board inside PlayArea" impression comes from the input
  engine's state and the menu, not the board. The BoardCol / InfoCol
  decomposition in `docs/playarea.md` is sound and is not what this is about.
- The recurring contents of a PlayArea, in no fixed order: the data hook
  (`useGame`), null-safe derivations, the input engine, the shared action trio
  (`useStandardGameActions`), one or two narration effects, the header-menu
  effect with its `actionsRef` ritual, the loading gates, the render, and a
  pure `buildOver` tail of 50 to 140 lines.
- `// ───` section headers exist but unevenly: spellingbee has eight, strands
  and crosswords one, and no two files order them alike.
- Null guards before the loading gate: `game?.` appears up to thirteen times
  per file (spellingbee, boggle, wordwheel), with `if (!game) return` inside
  effects and comments like "menu exists pre-load, but there's no mode yet".
- The menu effect runs 37 to 169 lines per game. Thirteen files carry an
  `actionsRef`, its type, a second effect that refreshes it, and a dependency
  list explaining why: about 119 lines whose only job is keeping handler
  identities out of the menu effect.
- The print model is built inline inside the menu effect in some games
  (spellingbee) and lives in `pdf/model.ts` in others (codenamesduet,
  connections, letterboxed).
- Fourteen PlayAreas end with a pure `buildOver` (terminal text builder) that
  no hook touches.
- Eight games call `useGlobalKeyHandler(exitOnKey)` in PlayArea solely so the
  history viewer exits on a keystroke; the hook already owns the click and
  close-button exits. Setgame and strands wire real board keys there too.
- Fifteen files cast `setup as XSetup`.
- A handful of archaeological comments per file ("moved into BoardCol", "used
  to"), which the project's comment rule already bans.

## 3. The recommendations, in the order they were offered

### 3.1 Split each PlayArea into a loader and a loaded component

A thin outer `PlayArea` owns `useGame` and the three gates (loading, failure,
not found) and hands a non-null game to an inner component. Every hook inside
the inner component can then assume the game exists: no `?.`, no
`if (!game) return` in effects, no "not loaded yet" comments. The single change
that makes the rest of the file read as "what this game does" instead of "what
this game does when it exists".

**Joel (2026-09-07):** "we did a similar thing recently with GamePage, i
believe, and that certainly helped."

### 3.2 One section order for every PlayArea, written down once

Data, derived, input engine, actions, narration, menu, gates, render, in that
order, stated in `docs/playarea.md` the way the column prop vocabulary already
is. Reading the second game then costs nothing.

### 3.3 Collapse the menu plumbing, and centralize the shared items

Two halves.

**The plumbing.** `useEffectEvent` is stable in the installed React (19.2.7)
and removes the `actionsRef` and the second effect outright. Better: a shared
`useGameMenu` hook that owns whichever mechanism is chosen, so a game writes
only its items. The print model becomes a `pdf/model.ts` pure function
everywhere, and the menu effect a one-liner.

**The items.** Joel: "for most games, the menu items are the same thing or
very close; i suspect there's a way we can get a more centralized 'items that
appear in menus' once, rather than repeating in each game." The count agrees,
and more strongly than "very close":

| item | games | sameness |
|---|---|---|
| `restart` | 16 | byte-identical: label, icon, no shortcut |
| `new-game` | 15 | identical: label, icon, the `+` shortcut |
| `print` | 16 | identical in 15; crosswords says "Print / Save as PDF" |
| `reveal` | 9 | deliberately varies: "solution" / "answer" / "best word", two shortcuts (`⌥R`, `⌥⇧R`), per-game disabled rules |
| `hint` / `spoiler` | 3 each | deliberately varies: "Hint for next word", "Show the word", "Spoiler" |
| crosswords' own | 20 | the port's menu; stays its own thing |

Accidental drift the centralization would erase: six games put Print above
Restart, ten put it below; section grouping differs for no reason anyone
decided.

The proposed shape: `buildGameMenu` grows named slots instead of a free-form
`extra` list. A game passes handlers; the builder owns label, icon, shortcut
and position.

```ts
buildGameMenu({
  menu, mode, isTerminal, conceded,
  onEndGame, onConcede,
  restart: () => ...,
  newGame: () => ...,
  print: () => ...,
  reveal: { shown, noun: 'answer', disabled: !isTerminal, toggle: () => ... },
  help: [{ kind: 'hint', label: 'Hint for next word', ... }],
})
```

`extra` survives only for crosswords. If the builder becomes the `useGameMenu`
hook above, taking handlers directly and using `useEffectEvent` inside, the
`actionsRef` ritual disappears from thirteen files in the same change. A game's
whole menu would then be one call of about ten lines.

**Open before building:** the fixed order. Today's majority is Restart and New
game together, Print after, Reveal beside them, but the order was never chosen,
so it is Joel's call rather than a count.

### 3.4 Move `buildOver` out of the component file

Into each game's `lib/`, next to `history.ts`, where it can be unit-tested
against every play state. That also puts it beside the other place play states
are named (the manifest's `labelFor`), which is a known two-home hazard.

### 3.5 A comment pass with the call-site rule

Many PlayArea comments are full explanations of shared mechanisms: twenty lines
on the reveal rule, a paragraph on reading an envelope inside a click handler.
The project's own rule is a sentence and a pointer at a call site, with the
explanation in the shared thing's docstring or doc. Delete the archaeological
comments. Most files would drop well under a third comment lines.

### 3.6 Two small ones

- An option on `useHistoryViewer` so it owns the keystroke exit itself,
  removing the `useGlobalKeyHandler(exitOnKey)` wiring from the six games with
  no other key handler.
- A typed `setup` from each game's `useGame`, ending the fifteen
  `setup as XSetup` casts.

## 4. Related

`react-context.md` (also ideas only) records the separate question of a
context for the shell slice. It is not a prerequisite for anything here.
