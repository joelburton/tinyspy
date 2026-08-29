# Outcomes

An **outcome** is how a thing turned out — the verdict on a move, or on a
move-like thing. It is one word, drawn from a closed list, and it is the same
word wherever that verdict is shown: a feedback pill, a turn-log bar, a board
tile, a server's answer.

That sameness is the point. A pill reporting a won game and a board showing one
are saying the same thing, and the two spellings this list used to have
(`success` / `error` for won / lost) hid that behind a rename buried in a CSS
rule. One vocabulary, spelled one way, everywhere.

The list lives in [`src/common/lib/outcomes.ts`](../src/common/lib/outcomes.ts)
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

**`error` is the one that is not an outcome**, and the exclusion is structural:

```ts
export type Outcome = Exclude<GenericFeedbackTone, 'error'>
```

A real failure comes back as a `not-ok` envelope carrying a `severity`, so it
can never arrive as an outcome. That is how the line between `lost`, `warning`
and `error` gets drawn by the type rather than by judgment each time. `error` is
an angrier red than `lost` — that difference is the whole reason it is a
separate tone rather than a reuse.

`GenericFeedbackTone` is the seven; `Outcome` is the six a server result may
carry. The second is derived from the first rather than restated, so a new tone
cannot drift between the two lists.

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

That type lists four because four are what the games have needed so far, not
because a rule keeps the others out. Nothing stops a log row being `warning` or
`noted`; widen the type when a game wants one.

### Boards and tiles

The first five families are named identically in board and tile CSS, which is
why the list is shared rather than pill-specific. A tile showing a won guess and
a pill reporting it reach for the same token.

### Server results

An `ok` envelope may carry an outcome, and a `not-ok` may too — where it
overrides the default appearance its severity would otherwise give it. See
[envelopes.md](envelopes.md).

Two rules from there worth repeating, because they are what keep this list from
sprawling:

- **A game-rule refusal is `ok`**, so "that's a duplicate word" is an outcome,
  not a failure.
- **`error` is never an outcome.** A real failure carries a severity instead.

## The colors

Defined per theme, in `src/common/themes/daylight.css` and `midnight.css`, under
the `--outcomes-*` bucket:

```
--outcomes-<family>-<role>-color
              lost    ink
```

Roles are `base` (the family's identity), `fill` (a background), `ink` (text and
bars, darkened for contrast), and `edge` (a border, the base mixed toward
black). A theme redefines the values; nothing outside the theme files picks a
color.

`noted` and `error` are marked **provisional** in the palette: both are declared
at ink weight with no separate base, because neither has yet earned the full
four-role treatment the five outcome families have.

## Adding one

Don't, casually. Seven words that mean seven different things is close to the
limit of what stays memorable, and every addition has to be told apart from its
neighbors at a glance and in a sentence.

If one is genuinely needed:

1. Add it to `GenericFeedbackTone`. `Outcome` derives, so it follows.
2. Give it all four `--outcomes-*` roles in **both** themes.
3. Decide whether it belongs in `TurnOutcome` — most will not.
4. Say here what it means and how it differs from the nearest existing word.
