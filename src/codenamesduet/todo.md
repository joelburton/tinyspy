# codenamesduet — todo

## Bugs

- **The turn count reads one short at the end.** A game set to 11 turns,        
  ending on win on 11th turn. There are 11 rows in the history, yet it
  shows "10/11 turns used" in the infoCol status.           
  Game was https://puzpuzpuz.joelburton.com/g/codenamesduet/4d646235-490d-4ba9-9d8b-e17d97cc3a9c

  It's a bug in another place: in game
  https://puzpuzpuz.joelburton.com/g/codenamesduet/1cc71f03-0cc2-4606-85d2-1fc38d1eaf55
  it shows two moves in history (2nd an assassin, ending the game), but it reads
  1/11 turns spent.

  Perhaps it doesn't update "turns spent" except on end-turn manually or by
  finding a neutral?

  In both games, club-page listing is correct.

- **The theme tokens don't say what they paint.** docs/tokens.md → The
  grammar ends a color token in what it paints (`-fill-color`, `-ink-color`,
  `-edge-color`); `theme.css` has none. `--codenamesduet-agent` and
  `-assassin` each fill a tile, draw its edge and color log text — one name
  for three jobs, so a reader of `Board.module.css` can't tell which change
  moves what. The pale backgrounds are named three ways (`-agent-soft-banner`,
  `-neutral-soft-bright`, `-assassin-soft`), and `-agent-key` / `-neutral-key`
  / `-assassin-key` are the key card's fills.

## Soon

## Someday

- **Teach Enter on screen.** A click guesses at once, so nothing on the board
  shows that the keyboard's pick (arrows, Space) is guessed with Enter; only
  Help and the key list say so. A `⏎ to guess` line under the board, shown
  while a keyboard pick waits, was declined because the below-board line —
  the clue, and Pass & End Turn — has no room for it.
  Something that fits would teach the key where it is used.

## Maybe

## Won't do

- **Mission / campaign mode** (2026-08-02). The rulebook's mission maps —
  variable starting turn counts. Cheap to build; nobody wants it, and a
  campaign implies cross-session persistence the club model doesn't carry.
- **Tile `aria-label`s** (2026-08-02). Screen readers are out of scope
  project-wide — see [`CLAUDE.md`](../../CLAUDE.md). The tiles keep their
  `aria-hidden`.
- **Deriving the AI companion's minimum size** (2026-09-23). The rule is that a
  companion's minimum comes from what its body needs (`docs/ui.md` → Floating
  panels); this one's 240×140 was eyeballed. Joel: *"it's fine as is."*
- **Keeping the sudden-death notice visible under a not-ok** (2026-09-23). The
  not-ok and the notice share the slot under the board, so the not-ok covers
  the notice until its × is pressed. Joel: *"not-ok messages should appear over
  sudden death; the current behavior is what we want."*
