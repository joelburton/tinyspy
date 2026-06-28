# Feedback audit

A point-in-time inventory (**2026-06-27**) of every place each game shows the
player user-facing feedback, and how. It exists to support the deferred
**local-vs-group feedback** cleanup — see
[deferred.md → Feedback channels](deferred.md#feedback-channels-local-vs-group)
and [ui.md → Player identity = a colored disc](ui.md#player-identity--a-colored-disc).

> This is an audit snapshot, not a spec. Message strings and line-level details
> drift as code changes; re-run the inventory before treating any row as current.

## Two channels (the lens)

- **Group** — the GamePage **header slot** (`<StatusSlot>`), driven by
  `ctx.feedback.show({ tone, text, dismiss })` → `<FeedbackPill>`. It *replaces*
  the `<PlayersStrip>` while shown. Conceptually this is for shared/peer events
  ("leah found APPLE"). In practice most games dump **local** validation here.
- **Local** — anything reporting *my own* action that does **not** use the header
  slot: a dedicated near-input pill (spellingbee), inline error text in a form,
  or non-text visual cues (tile flashes, shakes, keyboard coloring).

### Header tone → color (`FeedbackPill.module.css`)

| tone | paint |
|---|---|
| `success` | green tint — `color-mix(--color-accent 12%, surface)` + accent border |
| `error` | red tint — `color-mix(--color-error 12%, surface)` + error border |
| `neutral` | plain surface, default grey border (no tint) |
| `info` | faint accent tint (reads blue-ish) |

### Header dismiss kinds (`FeedbackPill.tsx` / GamePage)

| kind | behavior |
|---|---|
| `timed` (ms) | auto-clears after `ms` (GamePage timer) |
| `closeable` | renders a `×`; stays until the user clicks it (or code calls `clear()`) |
| `sticky` | stays until the next `show()`/`clear()` — i.e. replaced by the next message or cleared in code |

The spellingbee **local** pill (`Feedback.tsx`) uses its own three tones —
`success` (#2c6e2c green), `warning` (#a86b00 amber), `error` (#b3261e red) —
note the `warning` tone the header palette lacks.

## Findings at a glance

- **Only spellingbee has a dedicated local *text* channel** (`Feedback.tsx`, a
  near-input pill). Every other game's own-action validation goes to the **header
  slot** — clobbering the player roster with "not a word" / "no X on your rack".
- **Genuine group feedback already exists in three games**, all correctly in the
  header: spellingbee (coop "peer found"/pangram, compete "reached <rank>"),
  stackdown (coop teammate found/tried/revealed), and codenamesduet (whose-turn
  pills). These are the model for what the header slot *should* mostly carry.
- **Non-text local feedback is widespread and healthy** — tile flashes (scrabble,
  stackdown, bananagrams), the connections wrong-guess shake, Wordle-style tile/
  keyboard coloring (wordle, waffle). These already live local; the gap is the
  *text* validation that wrongly rides the header.
- **Dismiss modes are inconsistent** even within a game (mix of timed-various-ms,
  closeable, sticky) — worth standardizing per channel when the cleanup lands.

---

## codenamesduet (brand TinySpy)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Sudden-death phase entered | `Sudden death — any non-green reveal loses` | error → red | timed 6000ms |
| Clue-giver's turn starts | `Give a clue to <peer>` | info → blue | sticky |
| Waiting on clue-giver | `<peer> is writing a clue` | neutral → grey | timed 6000ms |
| Guesser's turn starts | `Make your guesses` | info → blue | sticky |
| Waiting on guesser | `<peer> is guessing` | neutral → grey | timed 6000ms |

*(These are whose-turn / phase events — group-ish, correctly in the header.)*

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| CluePanel `.error` | clue submit RPC fails | `<error.message>` | red text (--color-error) | next submit / on success |
| BoardGrid `.errorBanner` | guess submit RPC fails | `<error.message>` | red-tinted banner w/ dismiss link | manual "dismiss" link, or next guess |
| CluePanel (suggestion) | AI clue suggestion returns | italic reasoning text | muted grey | replaced by next suggestion / on submit |

---

## connections (brand WordKnit)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Duplicate guess | `You already tried that` | error → red | closeable |
| Submit-guess RPC fails | `<error.message>` | error → red | closeable |
| Result: one away | `One away!` | neutral → grey | closeable |
| Result: incorrect | `Incorrect` | error → red | closeable |
| End-game RPC fails | `End game failed: <error.message>` | error → red | closeable |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| TileGrid `.tileShaking` | wrong guess (`verdict.kind==='wrong'`) | — (visual) | horizontal shake ±4px, 0.4s | setTimeout 500ms resets shaking set |

---

## psychicnum (brand PsychicNum)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Wrong guess | `<number> — not the number` | error → red | closeable |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| GuessForm `.error` | out-of-range validation | `Number must be between 1 and 10.` | red text (--color-error) | next submit / on success |
| GuessForm `.error` | submit RPC fails | `<error.message>` | red text | next submit / on success |

---

## spellingbee (brand FreeBee) — the reference for the split

### Header feedback (ctx.feedback → FeedbackPill) — group events only
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Peer found a word (coop) | `<user> found <WORD>` | success → green | timed (auto) |
| Peer found a pangram (coop) | `🐝 <user> found a pangram — <WORD>!` | success → green | timed (auto) |
| Opponent reached a rank (compete) | `<user> reached <RANK>` | info → blue | timed (auto) |

### Local feedback — dedicated `Feedback.tsx` near-input pill
| trigger | message | tone → color | how it clears |
|---|---|---|---|
| accepted (required) | `<WORD>: Good! +<pts>pts` | success → #2c6e2c green | setTimeout 2500ms (PlayArea) |
| accepted (bonus) | `<WORD>: Good! +<pts>pts` | success → green | setTimeout 2500ms |
| pangram | `<WORD>: Pangram! +<pts>pts` | success → green | setTimeout 2500ms |
| already found | `<WORD>: Already found` | warning → #a86b00 amber | setTimeout 2500ms |
| too short | `<WORD>: Too short` | warning → amber | setTimeout 2500ms |
| bad letters | `<WORD>: Bad letters` | error → #b3261e red | setTimeout 2500ms |
| missing center | `<WORD>: Missing center letter` | error → red | setTimeout 2500ms |
| not a word | `<WORD>: Not a word` | error → red | setTimeout 2500ms |
| submit RPC fails | `<error.message>` | error → red | setTimeout 2500ms |
| end-game RPC fails | `End game failed: <error.message>` | error → red | setTimeout 2500ms |

---

## bananagrams (brand MonkeyGrams)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Peel RPC fails | `<error.message>` | error → red | closeable |
| Dump RPC fails | `<error.message>` | error → red | closeable |
| Dump succeeded | `♻️ Dumped 1, drew <n>.` | neutral → grey | timed 2500ms |
| Peel succeeded | `🍌 Peel! You drew <n> tile(s).` | neutral → grey | timed 2500ms |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| PlayerBoard `.handError` | typed letter not in hand | — (visual) | red flash border (--mg-error #d84a4a) around hand | 180ms fade (nonce remount on repeat) |
| PlayerBoard `.tileInvalid` | peel blocked (disconnected / non-word) | — (visual) | red border+ring on offending cells | persists until board edited |

---

## waffle (brand SyrupSwap)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Submit-swap RPC fails | `<error.message>` | error → red | closeable |
| End-game RPC fails (shared `useEndGameMenu`) | `<error.message>` | error → red | closeable |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| WaffleGrid tiles | after a swap (server colors via realtime) | — (visual, Wordle-style) | green #6aaa64 / yellow #c9b458 / gray #787c7e / blank #d3d6da | persists until next swap mutates the position |
| WaffleGrid `.selected` | tile selected awaiting swap partner | — (visual) | select-ring border + shadow | on swap / deselect |

---

## wordle (brand WordNerd)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Submit with < 5 letters | `Not enough letters` | info → blue | timed 1200ms |
| Submit RPC fails | `<error.message>` | error → red | closeable |
| Not in word list | `Not in word list` | error → red | timed 1500ms |
| Already guessed | `Already guessed` | info → blue | timed 1500ms |
| Invalid result (RPC) | `Not enough letters` | error → red | timed 1200ms |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| Keyboard `.key` | letter used in a prior guess | — (visual) | green / yellow / gray per best result | persists for the game |
| WordleGrid `.tile` | submitted row | — (visual) | green #6aaa64 / yellow #c9b458 / gray #787c7e | persists on board |
| WordleGrid `.reveal` | freshly-submitted row | — (3D flip reveal) | reveal color at flip midpoint | animation 0.55s, fill held |
| WordleGrid `.filled` | typed-but-unsubmitted tile | — (visual) | dark text, border only (#878a8c) | on advance / soft-reject revert |

---

## stackdown (brand StackDown)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Submit RPC fails | `<error.message>` | error → red | timed 1500ms |
| Word not in dictionary | `Not a word: <WORD>` | error → red | timed 1500ms |
| Reveal-word RPC fails | `<error.message>` | error → red | timed 1500ms |
| Reveal word succeeds | `Next word: <WORD>` / `All words cleared` | info → blue | closeable |
| Reveal-hint RPC fails | `<error.message>` | error → red | timed 1500ms |
| Reveal hint succeeds | `Hint: <hint>` / `All words cleared` | info → blue | closeable |
| Typed letter: no exposed match | `No "<letter>" tile is on top` | info → blue | timed 1200ms |
| Typed letter: ambiguous | `<n> "<letter>" tiles are on top — click one` | info → blue | timed 1500ms |
| **Coop** teammate found word | `<user> found <WORD>` | success → green | timed ~2200ms |
| **Coop** teammate invalid word | `<user> tried <WORD> — not a word` | error → red | timed ~2200ms |
| **Coop** teammate revealed hint | `<user> revealed a hint` | info → blue | timed ~2200ms |
| **Coop** teammate revealed word | `<user> revealed a word` | info → blue | timed ~2200ms |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| Board `.flash` | typed letter ambiguous | — (visual) | red ring on matching tiles | setTimeout 900ms |
| WordEntry `.good` | own/teammate word accepted | — (visual) | green border+shadow on slots | setTimeout 1000ms / on new word |
| WordEntry `.bad` | teammate word rejected | — (visual) | red border+shadow on slots | setTimeout 1000ms / on new word |
| FoundWords log | every submission | `<WORD>` / struck "not a word" / italic "Requested hint" / "Requested word" | left bar green / red / amber | persists (log) |

---

## scrabble (brand RackAttack)

### Header feedback (ctx.feedback → FeedbackPill)
| trigger | message | tone → color | dismiss |
|---|---|---|---|
| Typed letter not on rack | `No "<letter>" (or blank) on your rack` | info → blue | timed 1200ms |
| Invalid geometry (`evaluatePlay`) | `<geometry error>` | error → red | timed 2000ms |
| Play-word RPC fails | `<error.message>` | error → red | timed 2000ms |
| Play accepted | `<words> — +<score>` (+ ` · BINGO! +50`) | success → green | timed 2500ms |
| Play stale (board changed) | `The board changed — your tiles came back. Take another look.` | info → blue | timed 2500ms |
| Bad words | `Not in the dictionary: <words>` | error → red | closeable (also clears on next tile move) |
| Exchange RPC fails | `<error.message>` | error → red | timed 2000ms |
| Exchange stale | `The board changed — try again.` | info → blue | timed 2000ms |
| Exchange done | `Exchanged <n> tiles` | success → green | timed 1800ms |
| Pass RPC fails | `<error.message>` | error → red | timed 2000ms |

### Local feedback
| where | trigger | message | color | how it clears |
|---|---|---|---|---|
| Board (green flash) | play accepted | — (visual) | green outline #2faa5a on new cells | setTimeout 1000ms |
| Board (red flash) | rejected (bad words) | — (visual) | red outline #d24a4a on rejected cells | setTimeout 1000ms / on edit |
| Rack (yellow flash) | new tiles drawn | — (visual) | yellow outline #e6b324 on new slots | setTimeout 1000ms |
| Inline preview | staged tiles present | `<words> — <score> pts` (`(+50 bingo)`) | green #2e7d52 (valid) / muted grey (invalid + geometry error) | replaced as staged changes; clears when empty |
| Rack tile states | staged / exchange-selected | — (visual) | greyed (opacity 0.3) / selected bg + lift | on recall / submit |
| Board drag-hover | dragging a tile | — (visual) | green (valid) / red (invalid) cell outline | on drop / drag end |
