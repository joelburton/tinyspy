# Spectating — a club member watching a game they are not in

**Status: PROPOSED, nothing built, nothing decided.** Opened by Joel 2026-09-22,
at the wordle area's F-12 (`spectator-notice`), when the finding leaned on
CLAUDE.md's "no spectators" prior: *"CLAUDE.md is wrong; there can be
spectators. make a new plan file … so we can comprehensively think about this.
keep the line in wordle for now."* CLAUDE.md's audience section was corrected in
the same commit. Every decision below is Joel's and none is made; this file is
where the thinking accumulates until it is.

Not a scheduled sprint. It is cross-cutting — the shell, every game's play
surface, the pause rule and the club page — so it is nobody's area, and it is
listed in CLAUDE.md's plans table so a session finds it before deciding a
spectator question from inside one game.

## Why this needs a plan rather than a fix

The app already lets it happen. Club membership gates VIEWING a game and a
`game_players` seat gates ACTING (docs/common-schema.md → Membership gates viewing;
playership gates acting; pinned by `tests/spellingbee/player_subset_test.sql`). So a club of
five with a two-player game running has three members who can open it from the
club list and see a board they cannot touch. What they see there was never
designed: each game answers "is this viewer a player?" with `!!self` or an
`isPlayer` prop and does something local with it, or nothing.

Four games say something, in three different ways:

| game | where | what a non-player sees |
|---|---|---|
| wordle | `InfoCol` | a help line, *Watching — you're not in this game.* |
| scrabble | `BoardCol` | a muted paragraph, *Watching — you're not in this game.* |
| waffle | `InfoCol` | the action row's line, *Watching — not in this game* (`neutral`) |
| stackdown | `InfoCol` | the action row's line, *Watching — not in this game* (`neutral`) |

The other twelve show a locked board and whatever their column looks like with
no self row. That is UI drift of the kind the audit exists to kill, and the
wordle area declined to settle it from one game (`plans/areas/wordle.md` →
F-12).

## What is true today, by layer

**SQL.** Reads are club-gated: `games`, `players` and the events tables' select
policies use `common.is_club_member`. Moves are player-gated
(`require_game_player`). The viewing-adjacent RPCs — `set_current_view`,
`unset_current_view`, `tick_timer` — use `require_club_member` on purpose
(docs/common.md), so a watcher can drive the club's current-view pointer and
the clock. **Hidden information holds for a watcher exactly as for a rival**: a
compete game's per-player rows are `user_id = auth.uid() or is_terminal`, so a
spectator of a wordle race sees nobody's guesses until it ends; a coop game
shows them everything the team sees.

**The pause rule.** `computePause(present, players)` counts the game's ROSTER
(`pause.ts`), so a spectator's absence never pauses the game and their presence
holds nothing open. A spectator closing the tab is a non-event — correct, and
worth pinning if spectating becomes a feature.

**The shell.** `GamePageCtx.players` is the roster; a game learns it is being
watched only by failing to find itself there. `isMyTurn` is derived from the
turn pointer and is true in a free-for-all game — for a spectator too, which is
why every game's `readOnly` also checks the self row. The event-log picker
already handles a viewer who is not a player (`viewerIsPlayer`, and the
wordle test "when a club member spectates a solo game").

**The club page.** A game a member is not in appears in the club's list like
any other; opening it is an ordinary navigation. Nothing marks it as one they
would be watching rather than playing.

**Chat.** Club-wide, so a spectator can talk. (Is that right? — below.)

## What a design has to decide (Joel's)

1. **Is a spectator a first-class state or an accident?** If first-class, the
   shell knows it (`ctx.isSpectator`, or the roster hands it) and every game
   reads one flag instead of `!!self`; if an accident, the games keep their local
   checks and only the notice is unified.
2. **What does a watcher see?** One notice in one place — the action row's
   line (waffle's and stackdown's choice, the `neutral` outcome), the info help
   line (wordle's), a header pill, or the board's own frame — or nothing but a
   locked board.
3. **What may a watcher do?** Today: chat, drive the current view, tick the
   clock, print, read the event log, replay history, reveal a terminal answer,
   and press nothing else (every game's `readOnly`). Restart and New game are
   player-gated by the RPCs but the BUTTONS may still draw — each game's
   `describe` decides, and none was written with a watcher in mind.
4. **Hidden information.** Coop shows a watcher the team's board; is a watcher
   of a coop wordle allowed the same thing a teammate is? Compete already
   withholds by RLS. Games whose frontend knows the answer (connections) show a
   watcher what any player sees, which is fine only because a watcher is not a
   player.
5. **Presence.** Should a watcher appear in the members strip at all — as a
   present member without a seat — or stay invisible? The Zoom-call metaphor
   says a friend on the call who is not playing is still on the call.
6. **Joining.** Can a watcher become a player mid-game? Today no game seats a
   player after `create_game`, and the presence roster would change under a
   running game.
7. **Screen-reader and mobile priors are unchanged**; the audience prior in
   CLAUDE.md changes only on this one point.

## What NOT to do until this is decided

- Do not remove the four games' notices, and do not add a fifth. wordle's stays
  by Joel's word (2026-09-22).
- Do not write `isSpectator` into `GamePageCtx` from inside a game area; that is
  question 1, and it is the shell's.
- Do not file the same item into four `todo.md`s. This file is the one home.
