# React context for the game shell

**ONLY A CONVERSATION — NOT ACTIONABLE.** Nothing here is approved, scheduled,
or an area of the audit. Joel asked a question on 2026-09-07, this records the
answer and the reasoning so the thread can be picked up later, and that is all
it is. A session that finds this file must NOT build from it, must NOT treat
"a context for the shell" as a decision, and must NOT fold it into an area's
work. If Joel wants it built, he will say so, and this file gets rewritten as a
plan at that moment.

---

## 1. The question

The game shell hands a lot of state down by props: `GamePage` builds a
`GamePageCtx`, the PlayArea takes it as props, and the PlayArea hands slices of
it plus its own derived state to `BoardCol` and `InfoCol`. Would the app be
better off with `useContext`, and with state changes centralized?

## 2. What the code does today (2026-09-07)

- **No context exists anywhere in `src/`.** Every value moves by props.
- **`GamePageCtx` is already one fixed-shape object** (`gamePageCtx.ts`):
  sixteen fields, every function identity stable across renders. GamePage
  builds it; the PlayArea takes it as props; its docstring says "its children
  take slices of it."
- **The drilling is wide, not deep.** Spellingbee's PlayArea hands `BoardCol`
  about fifteen props and `InfoCol` about twenty-eight; setgame and strands are
  the same shape. But `InfoCol` is one hop: it relays nearly everything straight
  into shared leaves (`OpponentStrip`, `TerminalActionRow`, `SetupDisclosure`,
  `WordList`, `RankBar`).
- **About nine of the InfoCol props are the shell, repeated in every game.**
  `onEndGame`, `onConcede`, `onRestart`, `onBackToClub`, `players`, `selfId`,
  `setupRows`, `over` and `isCompete` appear in thirteen or fourteen of the
  fourteen InfoCols. That is the real duplication, and it is pure relay.
- **State changes are already centralized, in Postgres.** Every mutation is an
  RPC; twelve games share `useStandardGameActions` for end / concede / restart;
  the FE's state is a realtime subscription (`useGame`) plus transient input
  (the pending word, a selection) plus local feedback. A PlayArea's 600 to 1300
  lines are derivation and wiring, not a state machine.

## 3. The answer given

Two separate questions, two different answers.

### 3a. A context for the SHELL slice: a modest win, worth considering

A `GamePageProvider` wrapping the PlayArea slot in `GamePage`, and a
`useGamePage()` hook. The shared leaves then read `players`, `selfId`, `over`,
`goToClub`, `menu.requestBackToClub`, `brand` and `title` themselves, and each
InfoCol loses its shell relay.

- **Re-render cost: zero relative to today.** The whole subtree already
  re-renders on every realtime event, because PlayArea takes the changing
  object as props.
- **The cost is legibility.** A leaf's dependencies leave its signature, which
  this codebase cares about more than most (the InfoCol prop groups are
  deliberately explicit contracts, with region headers). And every test or
  screenshot-gallery mount of such a leaf needs the provider.
- **Keep the per-game props explicit.** `foundWordsScore`, `wordRows`,
  `targetRankIdx` and their kin are honestly per-game; moving them into a
  per-game context trades a 28-prop signature for an invisible read. Only the
  shell slice is a candidate.

### 3b. A reducer or store for state changes: no

It would be a second source of truth in front of the first. Server-authoritative
state means the FE is a projection; the games that keep more on the client
(connections, bananagrams) are documented per game as deliberate exceptions.
Where a PlayArea feels heavy, the fix the repo already uses is another named
hook, the way `useLocalFeedback`, `useCelebration` and `useInfoSheet` came out.
A context does nothing for that weight.

## 4. The one design question, if 3a were ever taken up

Whether `status` and `players`, which change on every event, share a context
with the stable API functions (`globalFeedback`, `menu`, `goToClub`,
`goToGame`). One context is simpler and matches today's behavior. Splitting
into a live context and a stable one only pays off if leaves later get
`React.memo` and are expected to skip renders; nothing today expects that.

## 5. Open threads for the conversation

Numbered so they can be answered one at a time.

1. Does the legibility cost in 3a outweigh removing nine relayed props from
   fourteen files? The codebase's educational priority argues for explicit
   signatures; the repetition argues the other way.
2. Should PlayArea itself keep taking `GamePageCtx` as props if a provider
   exists, or read it through the hook too? Keeping the props leaves the
   `PlayArea: ComponentType<GamePageCtx>` contract in the manifest untouched.
3. Which shared leaves would read the context directly, versus keep taking
   props from a game's column? `TerminalActionRow`, `OpponentStrip` and
   `BackToClubButton` are the obvious readers; `WordList` and `RankBar` are
   presentational and should stay prop-fed.
4. Where would this fit if approved: a shell area of the audit, or its own
   small pass after the audit closes?
