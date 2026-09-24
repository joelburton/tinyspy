# Outcomes

An **outcome** is how a thing turned out — the verdict on a move, or on a
move-like thing. It is one word, drawn from a closed list, and it is the same
word wherever that verdict is shown: a feedback pill, an event-log bar, a board
tile, a server's answer.

That sameness is the point. A pill reporting a won game and a board showing one
are saying the same thing, and the two spellings this list used to have
(`success` / `error` for won / lost) hid that behind a rename buried in a CSS
rule. One vocabulary, spelled one way, everywhere.

The list lives in
[`src/common/outcomes/outcomes.ts`](../src/common/outcomes/outcomes.ts) — its
own file because it is a vocabulary rather than a feature, and nothing should
have to import a game manifest to get at it.

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
- **A hint you asked for.** letterboxed's stuck-hint is amber for the same
  reason its button is: a hint is neither good nor bad play, and coloring it
  green or red would adjudicate something the player did not do. A SPOILER is a
  different call — it hands over the answer and ends the hunt for it, which is
  `lost` (ruled 2026-09-16; see stackdown and psychicnum).

What both have in common is that nothing is being judged. Which one a given case
is stays a judgment call — decide it per site rather than by rule.

**`neutral` is for a move with no verdict**: a turn that counted but that
nothing judged. It is the only one with no hue, and its pill border is a visible
dark gray precisely because a pale border read as no border at all.

**`noted` is news rather than a result.** "Leah invited you." "A hint is
showing." "Nothing on the board to check yet." It also covers a turn that COUNTS
without being adjudicated — letterboxed's undo and clear are `noted`, since the
chain is shorter than it was and the player who did it is telling the table so.
It is deliberately blue, so it cannot be mistaken for a verdict at a glance.

**`error` is a full member of the list.** A `not-ok`'s default appearance IS
this word — three of the four severities read `error` (see
[envelopes.md](envelopes.md) → Appearance) — so it is the one value a failure
cannot do without. It is an angrier red than `lost`, and that difference is the
whole reason it is a separate word rather than a reuse.

**One type, one name.** `Outcome` is the list, and a feedback message's
`outcome` is an `Outcome` — the claim this file makes, said in the type rather
than alongside it. The field is called `outcome`, never `tone`: that word is a
button's or a toast's styling and not one of these values.

What is still true is narrower, and it lives where it can be checked: **a
successful result never reads as a failure.** No `PA` raise — the branch that
produces `type: ok` — may take `error`, and
[`raiseCodes.test.ts`](../src/guards/raiseCodes.test.ts) enforces that against
the SQL, which is where the value is actually authored. A real failure comes
back as a `not-ok` carrying a `severity` instead.

## Where they are used

### The feedback pill

The main consumer. A pill's **whole border is the outcome color** — a thick
left bar plus thin sides in the same color — and the outcome says which. See
[ui.md → the feedback pill](ui.md) for the anatomy; the part that matters here
is that the outcome chooses the color and nothing else does.

### The event log

Each row can carry a colored left bar naming that turn's outcome, and it is
**the same vocabulary** — a log row and a pill reporting the same turn say the
same word.

```ts
outcome: Outcome
```

**Any outcome, and there is no event-log outcome type.** A narrower list for
the log would be a second name for one that already exists, and it is
load-bearing in the wrong direction: `warning` being unsayable in a log is how
a hint comes to be logged as `near`, so the log and the pill say different
words about the same turn. `EventLog.module.css` carries a bar class per
outcome. A hint is `warning` and a reveal or spoiler is `lost`, and a log
chooses no word of its own (see below).

### Boards and tiles

The first five families are named identically in board and tile CSS, which is
why the list is shared rather than pill-specific. A tile showing a won guess and
a pill reporting it reach for the same token.

### Server results

An `ok` envelope may carry an outcome, and a `not-ok` may too — where it
overrides the default appearance its severity would otherwise give it. See
[envelopes.md](envelopes.md).

The two arms reach a pill differently, and the asymmetry is deliberate. A
`not-ok` is mapped by one shared constructor (`FeedbackMessage.notOk`, reading
`notOkOutcome`), because severity already says how it should read and fifteen
boards deriving that separately would drift. An `ok` is **not** mapped: what a
successful answer shows is game-specific — a pangram's score, a word's length,
nothing at all — so the game composes both the sentence and the outcome, in the
one place it names its answers. See One event, one outcome below.

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

## One event, one outcome — and who decides it

Every event a player can see reaches them on up to three surfaces: the **tile
feedback** on the board (where a game has any), the **pill** (almost always),
and the **event log**. All three must say the same word about the same event.
They kept drifting because each was deriving the outcome for itself — the same
refused word red in the pill, amber in the log, and unmarked on the board.

Three rules, in order of authority.

**1 · The server is right.** Where an answer carries an outcome — in an
envelope, or on a row the log reads — that IS the outcome, and no surface may
re-decide it. A frontend that maps the server's answer onto its own idea of the
outcome is a frontend that will disagree with the log showing the same row.

**2 · Where the frontend decides, it decides ONCE.** A move the frontend judges
alone (a trusting-commit word, a locally-refused guess), or a server answer that
carries no outcome, is classified in exactly one place — one function — and
every surface reads it. `lib/answer.ts` is that place, and the pill, the row and
the event log all read it. The shape is written out below.

**3 · So audit a game by asking the same question three times.** For each event
a game can produce: what does the pill say, what does the log row say, what does
the board do? A game passes when one derivation answers all three.

**The outcome follows the event, not the viewer's stake.** A found word is
`won` green in both modes — a teammate's find in coop, and an opponent's in
compete, adverse to me though it is. Recoloring by stake would give one event
two colors depending on who is looking, which is hard to learn and easy to
misread; the actor's disc already says *who*, so the outcome only has to say
*what happened*.

### How a game does it

The three rules above are the rule; this is the shape a game takes, and what a
new game copies.

**Each game names its own answers in `src/<game>/lib/answer.ts`** — every move
it can answer, as a closed union, in whatever words its rows and its RPC
already use rather than a new set. Read as a list, it is the whole roster of
what that game tells anybody.

**One function turns an answer into what is SAID about it**, both halves at
once — the outcome and the words:

```ts
export type Answer =
  | { answerType: 'correct' }
  | { answerType: 'correct_peer' }   // a teammate's, off a subscription
  | { answerType: 'one_away' }
  | { answerType: 'already_tried' }

export function answerMessage(answer: Answer): AnswerMessage {
  switch (answer.answerType) {
    case 'correct':
    case 'correct_peer':  return { outcome: 'won',     text: 'Correct' }
    case 'one_away':      return { outcome: 'near',    text: 'One away!' }
    case 'already_tried': return { outcome: 'warning', text: 'You already tried that' }
  }
}
```

`AnswerMessage` is the `{ outcome, text }` pair `common/feedback` takes
([its doc.md](../src/common/feedback/doc.md)); the type lives there because the
pair is that folder's, and which answers a game has is the game's. A pair that
shares its words — mine and a teammate's — shares a branch, which is what stops
"Correct" and "● moth Correct" drifting apart.

**Anything reading a ROW asks the same file** — the event-log bar, a board
mark, a teammate's line, the PDF, the history viewer. Where a row's answer has
to be worked out from its columns, one `peerAnswerMessage(row)` (or an
`answerOf(row)` beside it) does that, and nothing else asks the columns.
(psychicnum is why: a hint row and a reveal row are both written
`is_correct = true`, so asking the verdict before asking the kind reads a hint
as a correct guess.)

**So an `ok` envelope carries no outcome** where the answer is one of these —
`outcome: null`, and the pgTAP pins assert the null. The server's word still
wins wherever it says one (rule 1), which is every `not-ok`: severity decides
how a refusal reads, and no board re-decides it.

**The frontend half gets a test, and so does the SQL half.** There is no
fixture both can read without codegen, so `lib/answer.test.ts` pins every
answer's outcome and words, and the game's pgTAP pins what its envelope
carries — including the nulls — with a comment in each naming the other. An SQL
half that nothing asserts is how a server comes to say a different word from
its log with no test going red.

**The rollout, so a reader knows which shape they are looking at.** This is the
shape the game areas are converting to, and most of the roster has not been
there yet: a game not yet converted has a static `ANSWER_OUTCOME` table from
answer words to outcomes, and a pill that reads `res.outcome` off the envelope
— the outcome-fix area's shape, which was one derivation per game and is now
becoming one function. Each game converts as its area opens
([plans/app-audit.md](../plans/app-audit.md) → The areas, in order), except
that the four games sharing `useFoundWordSubmit` converted together, since the
engine's shape changed under all of them; the rule that the outcome is decided
once has not changed.

**waffle deliberately has no answer file, and that is not an oversight.** It has
one move kind whose bar is always `neutral`. One move, one word, one reader: a
file of its own would be ceremony. codenamesduet has one, but no answer about a
guess of its own: a guess is one tile, it answers with a reveal, and the board
says it — so a guess's outcome is worn only by its TURN, folded in
`lib/turnOutcome.ts`.

**An event that writes no row stays out of it.** A duplicate wordle guess,
scrabble's dictionary refusal, psychicnum's "already guessed" — none reaches a
log, so the pill (and a board flash where there is one) are its only surfaces.
There is nothing to derive twice.

**A different vocabulary is not a disagreement.** wordle's and waffle's tile
colors, codenamesduet's key card, setgame's card fills, strands' printed glyphs,
the terminal frame: these are games saying their own thing, deliberately outside
`--outcomes-*`. Don't route them through this list, and don't name a field
`outcome` when it holds one of them.

**Where the frontend and the server both classify, they must share a
vocabulary.** wordiply's engine reports one refusal for "not a word" and "does
not contain the stem" while the server distinguishes them — so the frontend
splits its own answer into the server's words (`not_a_word` / `missing_base`)
before asking `lib/answer.ts` what they say. Otherwise the log, which reads the
server's reason, is answering a different question from the pill.

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
| `bar` | the event-log row's outcome bar |
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

## A narrower Outcome type is almost always a mistake

**Any outcome is a valid outcome.** A type that admits only some of them says
the opposite, and the cost is paid twice: the day a game's answer legitimately
becomes one of the missing words, the type has to change before the game can say
it — and until someone notices, the value is squeezed into the nearest word that
compiles. That is exactly what `TurnOutcome` did, and it is why it no longer
exists: `warning` was unsayable in a log, so several games logged a hint as
`near` and their logs disagreed with their own pills.

So when an audit meets one, the question is not "is this list right today?" but
**"is this a genuinely closed set, or a ceiling nobody revisited?"**

**`TerminalOutcome`** (`won` / `lost` / `neutral`) is the one that answers it
cleanly, and its reason is written where it is declared: a finished game has
been won, been lost, or was stopped with neither happening. `near` and `warning`
judge a MOVE, and once the game is over there are no more moves. The terminal
section is where it gets its full hearing.

**The info action row was the other narrowing, and it is gone** (2026-09-18). It
had excluded `error` with the reason "error is never an outcome", which
contradicted this file two screens up, and nothing else was holding the
exclusion up: every caller happens to pass a `TerminalOutcome` or a literal
`neutral` today, which is the census this rule forbids as an argument. So
`InfoActionsMessage.outcome` is now `Outcome`, the stylesheet inks all seven,
and the three surfaces that show an outcome — the pill, the event log's bar, the
action row's line — agree about the vocabulary.

`Extract`/`Exclude` rather than a hand-written union, always: a subset spelled
out by hand is a second vocabulary that drifts, where a derived one breaks
loudly when the parent changes.

## Adding one

Don't, casually. Seven words that mean seven different things is close to the
limit of what stays memorable, and every addition has to be told apart from its
neighbors at a glance and in a sentence.

If one is genuinely needed:

1. Add it to `Outcome`.
2. Give it all seven `--outcomes-*` roles in **both** themes — the grid is a
   rectangle and a guard says so, so this is not optional and not "the ones
   something reads today".
3. Give it a verdict class in `common/game-page/playArea.module.css` and name it
   in `OUTCOME_TO_VERDICT_CLASS` — that map is total, so this one will not compile until you
   do. Same for the event log's bar class. Both are deliberate gates: a new word
   that reaches a board or a log before anyone has decided what it looks like
   gets whatever color the nearest branch happened to end on.
4. Say here what it means and how it differs from the nearest existing word.
