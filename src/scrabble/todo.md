# scrabble — todo

## Bugs

## Soon

- **scrabble's three marks have no spec.** Its green, yellow and red all
  converted to `useMark` with the rest (2026-09-20), and each was planted: make
  the mark never draw and scrabble's whole suite stays green. The other nine
  games' marks each got one; these did not, because reaching them needs a
  staged-and-played move and no scrabble spec has ever staged one. That
  harness is the work, not the assertions. (Moved here from
  `common/board-marks/todo.md`.)

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 4.4rem` — and `- 6.1rem` in its other case —
  where that last term stands for everything else in the board column — the
  entry row, the feedback slot, a mobile status bar. Nothing checks that it
  matches what is actually there.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

- **A raw `<button>` takes focus on click**, where every `StandardButton`
  suppresses it: the AI suggestion rows (`SuggestPanel.tsx`). Clicking one
  stages the move and the list stays up, so the row keeps focus and the next
  Enter re-activates it natively. Nothing on a play surface should hold focus
  (Joel, 2026-09-10); the fix belongs with this game's tab ring rather than to
  a special case in the key dispatcher.
- **`shuffle` in `lib/policy.ts` is a hand-written Fisher–Yates** —
  `src/common/utils/shuffle.ts` is the same function with the rng optional,
  so the local one goes and its one seeded call site (the self-play bag)
  passes its `rng` exactly as it does today. Import it the way this file already imports
  `mulberry32` (the alias with an explicit `.ts`, because Deno loads
  `policy.ts` too).
- **The suggest panel picks a font size off the ramp, twice.**
  `SuggestPanel.module.css` writes `font-size: 0.9rem` on its lines and on
  `.suggestRow`, where the ramp's small step is `0.85rem` — 0.8px apart at the
  browser's default root, so it reads as a guess rather than a choice. The
  suggest row is a list row that IS the control rather than a general button,
  so the shared button's `small` treatment does not reach it; this is only
  about which size it means to be.
- **Where "Waiting for ● name…" belongs.** Joel, 2026-09-25: to investigate
  when auditing scrabble. Today the two modes differ. Turn-by-turn coop shows it
  as a pill in the local feedback slot, which takes the place of the move
  buttons beside the rack, and a tap on the rack or board dismisses it, though
  scrabble lets a player draft off-turn. Compete shows no pill; its whose-turn is
  the InfoCol's `<StateLine>` ("Turn: ● moth"), which the mobile status bar
  repeats above the board. The local slot has very little room while the rack
  shows, which argues for the InfoCol in both. But coop's whose-turn line there
  is the shared `<TurnStatusLine>`, which the mobile status bar does not carry,
  so dropping coop's pill would leave a phone with no whose-turn at all.

## Someday

- **`rank.test.ts` reads `trie.eow[walkWord(…)]` without checking for -1.** On
  a miss that reads `eow[-1]`, which is `undefined` rather than a band.
  Every word the test asks about is in its trie, so nothing fails today; the
  helper would hide a miss rather than report one.

- **The AI suggest-a-move box is a `SelectionList` site that did not fit.**
  Five frameless text lines pinned to `5 × 1.35rem`, whose own comment says a
  growable height would shift the setup disclosure and the Moves log below
  it — so the frame, the surface and the row padding would arrive as a
  visible redesign, roughly doubling the box. Three options are written up
  in `docs/games/scrabble.md` → Deferred: leave it bespoke, give
  `<SelectionList>` a frameless compact form, or redesign the box and redo
  the height arithmetic.
## Maybe

- **Compete's shared clock is unfair, because compete is turn-based.** A
  rival's deliberation spends your time, and a slow opponent can lose the
  game for you. The answer is a player timer whose running out is an
  automatic concede (`docs/win-lose.md` → Timer fairness) — real work:
  per-player accounting, and detecting it running out on the server. The cheap interim is for
  compete's setup to stop offering a countdown at all.
- **A coop target.** Coop's only win is going out. A
  `target_score` on plain points would make reaching it a win and arm the
  clock, the spellingbee pattern — and, with a target set, a bag played out
  below it becomes a LOSS rather than a neutral end (`docs/win-lose.md` →
  Where a coop loss comes from). Without a target, coop stays as it is.

## Won't do

- **A view to slim the blob.** Ruled 2026-10-05: the row size is accepted — a
  blob at the bag's end measures about 10 KB, three quarters of it the log.
  Joel: "people take at least a few seconds before making a move".
- **One strength for every bot.** Ruled 2026-10-05: `ai_level` stays on each
  bot's row. Joel: "it's a reasonable future feature for each ai player to
  have a different level".
- **"cell" in the player's words.** Ruled 2026-10-05: code and comments say
  cell for a board spot, and the player-facing sentences keep "square". Joel:
  "only for user-facing text 'square' is fine".
