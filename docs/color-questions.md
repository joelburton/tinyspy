# Color sprint — the open questions

Working notes for closing the color minisprint. Saved because there is more here
than one reply can hold. **Delete this file when the sprint closes** and the
durable half is in [ui.md](ui.md).

---

## 1. The reservation policy, and a page that proves the cells aren't dead

I think a page is right, but not a page that just *uses* every token — that would
neuter the dead-token guard. If a palette page references everything, no token can
ever be reported dead again, and the guard's real job (catching a rename that
didn't land, a token nobody reads) quietly ends. You'd have traded one problem for
a worse, invisible one.

What I'd build instead: **one exported list that the page and the test both read.**

- `common/lib/color/palette.ts` exports the grid — five outcome families × five
  variants, four chrome tones × five values.
- `cssTokens.test.ts` asserts `theme.css` defines **exactly** that grid: a missing
  cell fails, and so does an outcome token that isn't in it. That is a *positive
  completeness* assertion, which is what you want — today's
  `VOCABULARY_COMPLETENESS` is an **exception list**, and an exception list is
  inherently arguable, which is why the argument recurs. Its own docstring has to
  plead the case ("not 'the test is annoying'"). A required grid doesn't plead;
  deleting a cell fails with "the outcome families are a complete grid."
- The dead-token guard then skips grid members by *rule* rather than by name, and
  keeps full teeth on everything else.
- The page renders from the same list. Its value isn't the guard — it's that the
  eyeball pass gets a surface where all five terminal frames sit side by side,
  which is precisely the open question the doc leaves ("whether the raised chroma
  reads right"). And it kills a live duplication: `docs/buttons.html` hardcodes its
  hexes and is kept in step by hand, with "if they disagree, the stylesheet wins"
  written into it as an admission. A page in `src/` reading the real tokens can't
  disagree.

Two things to decide if you want it: whether it's a dev-only route or a plain page
nobody links to, and whether it replaces `docs/buttons.html` or sits beside it. The
guard scans `src/**` regardless of whether the route ships, so keeping it out of
the prod route table costs nothing.

Note that the chrome half no longer needs any of this — all twenty tone values got
real readers when `ActionButton` wired both treatments, and the test comment at
`cssTokens.test.ts:56` records that. Only eight outcome cells and
`--tile-4-edge-color` are exempted today.

> **Superseded by the reply to it:** a swatch page inside `src/` needs NO new test
> machinery — the two existing guards already give both directions, provided the
> token names appear literally in a CSS module rather than being built from
> template strings. See §5 below.

## 2. historyViewer doesn't need a change

Here is the whole of it (`src/common/components/game/lists/historyViewer.module.css:41`
and `:95`):

```css
.frame {
  outline: 4px solid var(--viewer-accent, var(--view-history-color));
}
.sharePreview {
  --viewer-accent: var(--view-share-preview-color);
}
```

`--viewer-accent` is an optional override: scrabble's coop share-preview sets it on
the board column (`scrabble/components/BoardCol.tsx:777`) and it cascades to both
the frame and the banner; every other game never sets it and gets history blue.
Nothing is broken, and the shipped guard permits it deliberately — it bans a
fallback that is a **color literal**, not a fallback that names another token.

I raised it only because the *plan* said "`var()` takes exactly one argument",
which would have banned this. The plan's own words for this case were "an
optional-override fallback is a default declaration written in the wrong place" —
the alternative being `--viewer-accent: var(--view-history-color)` declared as a
default, with `.sharePreview` overriding it. That's a real but small improvement
(one place to see the default instead of two `var()` sites that must stay in step).
My recommendation is to leave the code and have the docs state the enforced floor
as *no color fallbacks*, since that's what shipped and it's the defensible line.

One thing in that file **is** wrong: its comments still say the marker is yellow,
four times — "One yellow token (`--view-history-color`…)", "a yellow outline around
the whole board", "Yellow (not an outcome green/red) on purpose". The token is
`#4a7bab`, blue, and has been since the sweep. Pure comment rot from the rename.

## 3. tileColor — half consistent, and the half that's done is the shared half

Your decision holds up everywhere it's been applied. The gap is real but small.

**Consistent:**

- Tokens: `--wordle-green-fill-color` / `-edge-color` / `-ink-color`, plus yellow,
  gray, blank. The color word is the name, the `wordle-` prefix keeps it honest in
  a theme swap.
- `TileColor = 'green' | 'yellow' | 'gray' | 'blank'` and `tileColor()`
  (`common/lib/color/tileColor.ts:21`) — the TS vocabulary is the same words.
- The shared keycap already converted: `GuessKeyboard.module.css:214-231` defines
  `.wordleGreen` / `.wordleYellow` / `.wordleGray`.

**Not consistent:** three CSS modules still define the bare words —
`wordle/components/Board.module.css:136-149`,
`wordle/components/GameTurnLog.module.css:40-49`,
`waffle/components/Board.module.css:117-140`. So the same `TileColor` key names a
prefixed class on the keycap and a bare class on the board, and the seam is a
translation table that exists only because of the mismatch:

```tsx
// GuessKeyboard.tsx:18-20
green: styles.wordleGreen,
yellow: styles.wordleYellow,
gray: styles.wordleGray,
```

That's the leftover of the plan's "own commit" — the keyboard half landed during
the sweep, the board half didn't. It's a rename of twelve class definitions plus
their `styles.x` call sites; CSS modules scope the names, so nothing can break
silently.

**One genuine collision, and it isn't psychicnum:**
`boggle/components/PlayArea.module.css:145` defines `.blank` meaning *a blank
Boggle die face* (`opacity: 0.4`), which has nothing to do with an unjudged letter.
Same word, two vocabularies. Prefixing wordle's would resolve it by making boggle's
the only unqualified `.blank`.

**Two smaller notes from the same look:**

- The register's claim that `--wordle-blank-fill-color` is "used only by waffle,
  wordle stopped reading it" is now stale — `wordle/theme.css:14` reads it as
  `--wordle-tile-border`. Don't carry that line into `ui.md`.
- The shared ink token is only half adopted. `--ink-on-dark-color` exists
  (`theme.css:796`) and wordle, boggle, scrabble, spellingbee, wordwheel, chat and
  PlayArea use it — but **twelve sites in four games still write a raw `#fff`**
  into `--tile-ink-color`: codenamesduet (3), waffle (4), connections (3),
  psychicnum (2). Three of those four are converted games. The guard can't see
  them, because a literal inside a `--` definition is legal by rule (a), so this is
  the one place where "name every color" is incomplete rather than deliberately
  deferred. The practical cost is that a theme changing `--ink-on-dark-color` would
  move wordle's tile ink and not waffle's.

## 4. psychicnum's `.correct` — a non-problem, given your decision

`psychicnum/components/Board.module.css:94` is:

```css
.correct   { --tile-bg-color: var(--outcome-won-fill-color);  … }
.incorrect { --tile-bg-color: var(--outcome-lost-fill-color); … }
```

It means *this guessed word turned out to be one of the secrets* — a decided tile,
wearing the **outcome** palette. It is not a letter judgement and never touches the
wordle colors.

The plan called it a collision because it assumed the board classes might be
renamed toward semantic names — at which point wordle's green would want to be
called `.correct` too, and two different vocabularies would be fighting over the
word in the same app. Your ruling removes that: wordle's stay color words,
psychicnum's stay outcome words, and the two never meet. There is nothing to fix.
(CSS modules scope both anyway, so it was always a vocabulary question, not a
runtime one.)

The only thing I'd flag near it is a drift inside psychicnum, unrelated to colors:
its CSS says `.correct` / `.incorrect` while its PDF model says
`'correct' | 'miss' | 'undecided'` (`psychicnum/pdf/model.test.ts:53-54`). Same
three tile states, two words for the negative one.

## 5. `docs/buttons.html` does not keep the chrome tones alive

No — `docs/buttons.html` does nothing for the guard, for two independent reasons:
it lives outside `src/` (the scanner only walks `src/**`), and it hardcodes hexes
rather than reading tokens, which is exactly why it carries "keep this in step with
theme.css" as an instruction. The chrome tones stopped needing exemptions for an
unrelated reason: `ActionButton` wires both treatments, so all twenty have real
readers.

But a swatch page **inside `src/`** would work, with no test changes at all, and
it's better than §1. The existing guards already do both halves:

- Page references `var(--outcome-near-edge-color)` → the dead-token guard sees a
  reader → not dead.
- Someone deletes the token but leaves the swatch → the phantom guard fires
  ("referenced but not defined"). That's the completeness check §1 was going to
  write a new assertion for, for free.

One implementation detail decides whether the second half works: **the token names
have to appear literally in the source.** A `palette.module.css` with 25 plain
rules (`.wonInk { background: var(--outcome-won-ink-color) }`) gets both
directions. Building the names in TSX with a template —
`var(--outcome-${family}-${variant}-color)` — does not: `cssTokens.test.ts:121`
collapses a dynamic name to its `--outcome-` prefix and lets anything starting with
it pass, so a deleted cell would go unnoticed. And a literal
`'--outcome-won-ink-color'` in a quoted TS string is read as a *definition*
(`:103`), which would be worse than nothing.

So: a CSS module with the rules spelled out, a component that maps over the
families to render the rows, and the eight `VOCABULARY_COMPLETENESS` entries get
deleted along with the stale docstring above them. You also get the surface where
all five terminal frames sit side by side, which is the one open question the doc
can't answer in prose.
