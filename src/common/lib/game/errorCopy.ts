import type { GenericFeedbackTone } from '../games'

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
 * capitalised, no trailing period, and short enough to survive a phone. The
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
  tone?: GenericFeedbackTone
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
  'game-not-in-play': { text: () => 'Game over', tone: 'info' },
  'game-not-over': { text: () => 'Not over yet', tone: 'info' },
  'you-conceded': { text: () => 'Already conceded', tone: 'info' },
  'not-a-player': { text: () => "You're not in this game" },
  'not-club-member': { text: () => "You're not in this club" },
  // A session that expired under a page left open overnight — the one fault
  // here with a real remedy, so it names it.
  'not-authenticated': { text: () => 'Signed out; try refresh' },

  // The FORM raises are the other population, and they're the reason common
  // needs far more copy than a game does: for a club name, a username or a
  // chat message the server is the FIRST validator, not a second one. There's
  // no local check to lose a race with — these fire on ordinary use.
  'club-name-too-long': { text: (d) => `Club name: max ${d[0]} characters` },
  'club-name-not-alnum': { text: () => 'Club name needs a letter or digit' },
  'club-name-start': { text: () => 'Club name must start with a letter' },
  'club-too-small': { text: () => 'A club needs at least 2 members' },
  'unknown-usernames': { text: (d) => `No such user: ${d[0]}` },
  'empty-message': { text: () => 'Nothing to send' },
  'message-too-long': { text: (d) => `Too long: max ${d[0]} characters` },
  'bad-username': { text: () => '3–15 chars: a–z, 0–9, -, starting with a letter' },
  'username-claimed': { text: () => 'That username is taken' },
  'bad-anagram-input': { text: () => '2–15 letters, or ?' },

  // Dictionary curation. Editors-only, but an editor is still a player who
  // deserves a sentence rather than a key.
  'not-word-editor': { text: () => "You can't edit the dictionary" },
  'no-such-word': { text: (d) => `No such word: ${d[0]}` },
  'word-exists': { text: (d) => `Already in the dictionary: ${d[0]}` },
  'no-word-change': { text: () => 'Nothing changed' },
  'bad-word': { text: () => 'A word is 1–45 lowercase letters' },
  'missing-difficulty': { text: () => 'Pick a difficulty' },

  // ── spellingbee / wordwheel ──
  // Custom letters are a player's own choice in the setup form, so this is a
  // real answer to a real request — not a re-check of something the FE already
  // refused. It arrives through the build-board EDGE FUNCTION, which is why
  // classifyFailure reads the key before the SQLSTATE (serverError.ts).
  'no-required-words': { text: () => 'No words for those letters — try others, or a lower band' },

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
  'already-ended': { text: () => 'Game over', tone: 'info' },
  // Undo is likewise racy in coop: two players can undo the same last word.
  'nothing-to-undo': { text: () => 'Nothing to undo' },
}
