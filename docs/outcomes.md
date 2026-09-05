# Outcomes

An **outcome** is how a thing turned out — the verdict on a move, or on a
move-like thing. It is one word, drawn from a closed list, and it is the same
word wherever that verdict is shown: a feedback pill, a turn-log bar, a board
tile, a server's answer.

That sameness is the point. A pill reporting a won game and a board showing one
are saying the same thing, and the two spellings this list used to have
(`success` / `error` for won / lost) hid that behind a rename buried in a CSS
rule. One vocabulary, spelled one way, everywhere.

The list lives in [`src/common/outcomes/outcomes.ts`](../src/common/outcomes/outcomes.ts)
— its own file because it is a vocabulary rather than a feature, and nothing
should have to import a game manifest to get at it.

## The words

| | means | reads as |
|---|---|---|
| `won` | a good move, or a won game | green |
| `lost` | a bad move, or a lost game | red |
| `near` | close — one away, nearly right | gold |
| `warning` | not a verdict on your play — notice it | orange |
| `neutral` | a move nothing adjudicates | gray |
| `noted` | a thing that happened, not a verdict | blue |
| `error` | a real failure, not a bad move | dark red |

**`won` and `lost` are moves as often as they are games.** A correct connections
guess is `won` and a wrong one is `lost`, in a game that is nowhere near over.
Reading them as "the game ended" is the most common mistake about this list.

**`near` is its own word because "nearly" is a real answer** in several games —
connections' one-away, a word that would have scored if it were longer. It is
not a weaker `lost`; it tells you the guess was on the right track, which is
information a player acts on differently.

**`warning` is the "this is not about how you're playing" tone**, and it covers
two things that turn out to be one:

- **A move not being taken.** Not a losing move — that is `lost`, red — but it
  is not happening and you should notice, the way a duplicate word needs
  noticing. Connections' "You already tried that", scrabble's "Board changed".
  It is also what a `race` defaults to (see
  [envelopes.md](envelopes.md) → Appearance).
- **Help you asked for.** Stackdown's spoiler and letterboxed's stuck-hint are
  amber for the same reason its button is: a hint is neither good nor bad play,
  and coloring it green or red would adjudicate something the player did not
  do.

What both have in common is that nothing is being judged. Which one a given case
is stays a judgment call — decide it per site rather than by rule.

**`neutral` is for a move with no verdict**: a turn that counted but that
nothing judged. It is the only one with no hue, and its pill border is a visible
dark gray precisely because a pale border read as no border at all.

**`noted` is news rather than a result.** "Leah invited you." "A hint is
showing." "Nothing on the board to check yet." It also covers a turn that COUNTS
without being adjudicated — letterboxed's help pills use it. It is deliberately
blue, so it cannot be mistaken for a verdict at a glance.

**`error` is a full member of the list.** A `not-ok`'s default appearance IS
this word — three of the four severities read `error` (see
[envelopes.md](envelopes.md) → Appearance) — so it is the one value a failure
cannot do without. It is an angrier red than `lost`, and that difference is the
whole reason it is a separate word rather than a reuse.

**One type, one name.** `Outcome` is the list, and a feedback pill's `tone` is
an `Outcome` — the claim this file makes, said in the type rather than
alongside it.

What is still true is narrower, and it lives where it can be checked: **a
successful result never reads as a failure.** No `PA` raise — the branch that
produces `type: ok` — may take `error`, and
[`raiseCodes.test.ts`](../src/guards/raiseCodes.test.ts) enforces that against
the SQL, which is where the value is actually authored. A real failure comes
back as a `not-ok` carrying a `severity` instead.

## Where they are used

### The feedback pill

The main consumer. A pill's **whole border is the tone color** — a thick left
bar plus thin sides in the same color — and the tone says which. See
[ui.md → the feedback pill](ui.md) for the anatomy; the part that matters here
is that the tone chooses the color and nothing else does.

### The turn log

Each row can carry a colored left bar naming that turn's outcome, and it is
**the same vocabulary** — a log row and a pill reporting the same turn say the
same word.

```ts
export type TurnOutcome = 'won' | 'lost' | 'near' | 'neutral'
```

The bar's prop is narrower than the vocabulary today: `TurnOutcome` is a
four-value alias declared in `TurnLog.tsx`, and `TurnLog.module.css` carries
bar classes for those four only. Nothing about a turn makes it so — any outcome
can be a turn's outcome. What is owed here is in
[`src/common/turn-log/todo.md`](../src/common/turn-log/todo.md).

### Boards and tiles

The first five families are named identically in board and tile CSS, which is
why the list is shared rather than pill-specific. A tile showing a won guess and
a pill reporting it reach for the same token.

### Server results

An `ok` envelope may carry an outcome, and a `not-ok` may too — where it
overrides the default appearance its severity would otherwise give it. See
[envelopes.md](envelopes.md).

The two arms reach a pill differently, and the asymmetry is deliberate. A
`not-ok` is mapped by one shared function (`getNotOkFeedback`), because severity
already says how it should read and fifteen boards deriving that separately
would drift. An `ok` is **not** mapped: what a successful answer shows is
game-specific — a pangram's score, a word's length, nothing at all — and no rule
has been found there yet.

Two rules from there worth repeating, because they are what keep this list from
sprawling:

- **A game-rule refusal is `ok`** when the rule was applied to a move that
  actually happened — strands refusing a duplicate path is an outcome, not a
  failure. Where the CLIENT checks the same rule first, the server seeing it
  means the client's copy was stale, and that is a race: the four word games'
  duplicates are `not-ok` for exactly that reason
  ([envelopes.md](envelopes.md) → What makes a race legitimate).
- **A successful result never reads as `error`.** A real failure carries a
  severity instead, and `error` is the appearance most of them default to.

## The colors

Defined per theme, in `src/common/themes/daylight.css` and `midnight.css`, under
the `--outcomes-*` bucket:

```
--outcomes-<family>-<role>-color
              lost    ink
```

Seven roles, each answering "what is this family painting here":

| role | what it paints |
|---|---|
| `base` | the family's identity — the anchor the others are derived FROM, and painted by nothing directly |
| `ink` | text, darkened for contrast against a pale ground |
| `fill` | a solid background |
| `edge` | a border — the base mixed toward black |
| `wash` | the family laid over the page as a tint |
| `bar` | the turn-log row's outcome bar |
| `terminalFrame` | the frame around a board that is no longer a live position |

**The grid is rectangular, and that is enforced.** Every family carries every
role in **both** themes, whether or not anything reads the cell yet;
[`cssTokens.test.ts`](../src/guards/cssTokens.test.ts) fails on a hole. A theme
redefines the values; nothing outside the theme files picks a color.

In `daylight.css`, `noted` and `error` are marked **provisional**: both are
declared at ink weight, with `ink` pointing straight at `base`, because neither
has yet been given a lighter identity color the way the five older families
have. `midnight.css` does not do this — there both carry a base and a
separately-chosen ink like everyone else. It is a fact about one theme's
values, not about the vocabulary.

## Adding one

Don't, casually. Seven words that mean seven different things is close to the
limit of what stays memorable, and every addition has to be told apart from its
neighbors at a glance and in a sentence.

If one is genuinely needed:

1. Add it to `Outcome`.
2. Give it all seven `--outcomes-*` roles in **both** themes — the grid is a
   rectangle and a guard says so, so this is not optional and not "the ones
   something reads today".
3. Say here what it means and how it differs from the nearest existing word.
