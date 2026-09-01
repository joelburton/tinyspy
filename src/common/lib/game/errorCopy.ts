// cs-unmet

import type { Outcome } from '../outcomes'

/**
 * Every player-facing sentence for a server rejection, in ONE table.
 *
 * This file is the whole point of the server-error redesign: the wording of an
 * error is a TypeScript edit, never a SQL one. The server raises
 * `chain-full|5|`; what a player reads is decided here.
 *
 * ─── Membership is the classification ────────────────────────
 * A key in this table is one we anticipated a player reaching, so it gets a
 * normal feedback pill. A key that is NOT here renders as a fault — bare red
 * text — because nobody wrote words for it, which means nobody expected anyone
 * to see it. Adding an entry promotes a key from "bug" to "expected"; deleting
 * one demotes it. There is no other switch, and SQL has no say (see
 * serverError.ts for why the frontend has to be the one to decide).
 *
 * ─── What belongs here ───────────────────────────────────────
 * Only rejections a player can actually REACH. Most server raises re-validate
 * something the frontend already checked, so they're unreachable without a
 * broken or hand-rolled client — those stay out, and show as faults if they
 * ever fire. The ones that belong are the races the frontend cannot win:
 * a coop teammate playing the word you were about to, filling the last slot,
 * or ending the game while your move was in flight.
 *
 * ─── Copy rules ──────────────────────────────────────────────
 * These land in the below-board pill: a one-line label that ellipsises at
 * phone width (docs/ui.md → Feedback pill), so **caption, not sentence** —
 * capitalized, no trailing period, and short enough to survive a phone. The
 * frontend's own local rejections (`rejectReason` and friends) are the register
 * to match: "Too short", "Already played", "Must start with D".
 *
 * Reuse their exact words where the rule is the same — a race and a local
 * rejection are the same fact arriving by different routes, and telling a
 * player two different things about one rule would be a bug in itself.
 */

/** One key's copy. `details` are the params the server sent, in order. */
export type ErrorCopyEntry = {
  /** Build the caption. Keep it short; see the copy rules above. */
  text: (details: string[]) => string
  /** Defaults to `error`. Set it when the rejection isn't a failure so much as
   *  news — a teammate finishing the game while your move was in flight reads
   *  better as `info` than as something you did wrong. */
  tone?: Outcome
}

/**
 * The table. Games are converted one at a time; anything not yet converted
 * falls through to the fault path, which is the intended "visibly broken while
 * we work" state.
 */
export const ERROR_COPY: Record<string, ErrorCopyEntry> = {
  // ── common: every game reaches these ──
  // Unlike a game's own file, common holds two quite different populations.
  // The GAME-lifecycle raises are races, same as letterboxed's: a peer ended
  // the game, took the turn, or conceded while your call was in flight.
  'not-your-turn': { text: () => 'Not your turn' },
  'game-not-in-play': { text: () => 'Game over', tone: 'noted' },
  'you-conceded': { text: () => 'Already conceded', tone: 'noted' },
  'not-a-player': { text: () => "You're not in this game" },
  // A session that expired under a page left open overnight — the one fault
  // here with a real remedy, so it names it.

  // The FORM raises are the other population, and they're the reason common
  // needs far more copy than a game does: for a club name, a username or a
  // chat message the server is the FIRST validator, not a second one. There's
  // no local check to lose a race with — these fire on ordinary use.
  // The detail is the HANDLE's minimum, not the name's: a two-letter name is a
  // fine name and an illegal handle.
  // The detail is the derived HANDLE, not the name typed — two different names
  // can slugify onto one handle, and naming it is what makes the collision
  // make sense ("Friday Night" and "friday night" are both `friday-night`).

  // Click-to-define's external dictionary API failing (down / rate-limited /
  // unreachable from the edge worker) — a wait-it-out answer, shown in the
  // definition popover's red line. Edge-fn-raised (common-define); the HTTP
  // status rides as the detail and in the serve log. Approved 2026-08-12.

  // ── scrabble ──
  // The board and the bag are SHARED even in compete, so a rival's play lands
  // between your stage and your commit: the square you were about to use is
  // taken, or the bag no longer covers your exchange. The rack is server-owned,
  // so it too can disagree with the screen for a moment.
  'square-taken': { text: () => 'That square is taken' },
  'bag-too-low': { text: () => 'Not enough tiles in the bag' },
  'tile-not-in-rack': { text: () => "That tile isn't in your rack" },

  // ── AI features (codenamesduet clue suggester; more surfaces convert soon) ──
  // Model flakiness a retry genuinely fixes — real answers, shown in the AI
  // panels' own message areas. Wording approved 2026-08-12; per-surface keys
  // where the sentence names the task (clue vs explanation), because the
  // point of messages is to be clear.

  // ── codenamesduet ──
  // Two seats taking turns, so both can race the turn flip: the clue arrives
  // just as you tap, or the flip lands just as you do — ordinary two-player
  // timing, not a broken client, which is `race` in the envelope vocabulary.
  // The turn-loop RPCs say it themselves now; the one key left is
  // `get_clue_context`'s, the last codenamesduet RPC still on this table.
  'not-clue-giver': { text: () => 'Not the clue-giver', tone: 'noted' },

  // ── strands ──
  // The earned-hint economy, which nothing else on the roster has. All three
  // are reachable, and in COOP the hint bar is shared — so a teammate can fill
  // it, spend it, or ring a word between your check and your click.
  'not-enough-hint-points': { text: () => 'Hint bar not full yet', tone: 'noted' },
  'hint-already-showing': { text: () => 'A hint is already showing', tone: 'noted' },
  // The one path check a teammate can cause: they found a word that overlaps
  // the path you were drawing. Every other path rejection means the FE built a
  // shape it should never have built.
  'path-crosses-found': { text: () => 'Crosses a found word' },


  // ── psychicnum ──
  // The two cheat rungs, exhausted. psychicnum RAISES here where stackdown
  // returns null and lets the FE narrate — a real divergence between the two
  // implementations of the same feature, recorded rather than smoothed over.
  'nothing-to-hint': { text: () => 'Nothing left to hint', tone: 'noted' },
  'nothing-to-spoil': { text: () => 'Nothing left to show', tone: 'noted' },

  // ── connections + strands (the dated archives) ──
  // Neither game lets you pick a puzzle any more: the server hands out the
  // earliest one none of the players has seen, in any club
  // (`next_puzzle_for_club`). This is what it says when there is no such
  // puzzle left, and it's reachable two ways — the setup dialog's Start, and
  // the in-game "New game". `info`, because nobody did anything wrong.
  //

  // ── wordle ──
  // Both are per-player states a second submit can land on: the coop board is
  // shared, so a teammate's winning guess can arrive while yours is in flight.
  'already-solved': { text: () => 'Already solved', tone: 'noted' },

  // The two ways a player-chosen starter (setup.custom_base) fails to make a
  // board. Unlike everything else here these fire at CREATE time and land on
  // the setup dialog's error line, not the below-board pill — but the
  // classification is the same one: the frontend validates the SHAPE of a
  // starter and deliberately can't know whether it yields a board, so a player
  // typing ING or YAKS reaches these on a perfectly good client.
  //
  // Two keys rather than one because the fixes differ: too many words wants a
  // LONGER starter, too few wants a DIFFERENT one. The dialog's slot is
  // single-line, so both stay captions.

  // ── letterboxed ──
  // Its coop chain is SHARED and free-for-all, so a teammate's word can land
  // between your local check and your submit. These four are that race — you
  // made a legal move and lost it — which is the only way a letterboxed player
  // reaches the server's validation at all. Every other raise in that file
  // re-checks something `rejectReason` already refused locally, so it can't be
  // reached without a broken client and is deliberately absent here.
  //
  // The words are `rejectReason`'s own, verbatim: the same rule arriving by a
  // different route must not be described differently.
  'chain-full': { text: () => 'Chain is full' },
  'already-in-chain': { text: () => 'Already played' },
  'wrong-tail': { text: (d) => `Must start with ${d[0]}` },
  // Not a failure — news. A teammate finished, conceded the group out, or the
  // clock ran out while your word was in flight; `info` says "this is what
  // happened" rather than "you did something wrong".
  'already-ended': { text: () => 'Game over', tone: 'noted' },
  // Undo is likewise racy in coop: two players can undo the same last word.
  'nothing-to-undo': { text: () => 'Nothing to undo' },
}
