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
  // Click-to-define's external dictionary API failing (down / rate-limited /
  // unreachable from the edge worker) — a wait-it-out answer, shown in the
  // definition popover's red line. Edge-fn-raised (common-define); the HTTP
  // status rides as the detail and in the serve log. Approved 2026-08-12.
  'dictionary-source-failed': { text: () => "Dictionary service couldn't be reached — try again later" },

  // ── spellingbee / wordwheel ──
  // Custom letters are a player's own choice in the setup form, so this is a
  // real answer to a real request — not a re-check of something the FE already
  // refused. It arrives through the build-board EDGE FUNCTION, which is why
  // classifyFailure reads the key before the SQLSTATE (serverError.ts).
  'no-required-words': { text: () => 'No words for those letters' },

  // ── wordwheel ──
  // Two more setup answers the server is first to check: a low required band
  // can have zero nine-letter pangram seeds at all, and the "unique letters
  // only" option can empty the pool at a low band. Both are edge-fn-raised
  // (wordwheel-build-board); the words are Joel's, approved 2026-08-12 —
  // note "higher difficulty" is the CORRECT direction here (the seed pool
  // grows with the band), unlike no-required-words' old backwards advice.
  'no-pangram-seeds': { text: (d) => `No pangram seeds at required difficulty ${d[0]}` },
  'no-unique-letter-boards': {
    text: (d) =>
      `No unique-letter boards at required difficulty ${d[0]} — try a higher difficulty or turn off "unique letters only"`,
  },

  // ── boggle ──
  // The constraint pickers are the setup form's own input, and an
  // unsatisfiable combination is a real answer the server is first to give
  // (the generator ran out of attempts under its CPU budget). Edge-fn-raised
  // (boggle-build-board); the words are the function's original sentence,
  // approved verbatim 2026-08-12.
  'no-board-fits': { text: () => 'No board met those constraints — please relax them.' },

  // ── scrabble ──
  // The board and the bag are SHARED even in compete, so a rival's play lands
  // between your stage and your commit: the square you were about to use is
  // taken, or the bag no longer covers your exchange. The rack is server-owned,
  // so it too can disagree with the screen for a moment.
  'square-taken': { text: () => 'That square is taken' },
  'bag-too-low': { text: () => 'Not enough tiles in the bag' },
  'tile-not-in-rack': { text: () => "That tile isn't in your rack" },

  // ── bananagrams ──
  // The bunch is SHARED, so a rival's peel can empty it between your check and
  // your dump. And the board is FE-owned while the tiles are server-owned
  // (docs/games/bananagrams.md), so the server's view of your hand can
  // legitimately differ from the screen's for a moment — which makes these
  // three ordinary play, not broken clients.
  'bunch-too-low': { text: () => 'Bunch too low to dump', tone: 'info' },
  'hand-not-empty': { text: () => 'Place all your tiles first' },
  'tile-not-held': { text: () => "You don't have that tile" },
  // A setup pair that can't seat everyone: players x hand size beats the bunch.
  'bunch-too-small': { text: (d) => `Bunch too small: ${d[2]} tiles needed, ${d[3]} in the bunch` },

  // ── AI features (codenamesduet clue suggester; more surfaces convert soon) ──
  // Model flakiness a retry genuinely fixes — real answers, shown in the AI
  // panels' own message areas. Wording approved 2026-08-12; per-surface keys
  // where the sentence names the task (clue vs explanation), because the
  // point of messages is to be clear.
  'ai-clue-declined': { text: () => 'The model declined to suggest a clue — try again' },
  'ai-explain-declined': { text: () => 'The model declined to explain this clue — try again' },
  'ai-truncated': { text: () => 'The model response was truncated — try again' },
  'ai-malformed': { text: () => 'The model returned a garbled answer — try again' },

  // ── codenamesduet ──
  // Two seats taking turns, so both can race the turn flip: the clue arrives
  // just as you tap, or the flip lands just as you do. All four are ordinary
  // two-player timing, not broken clients.
  'not-clue-giver': { text: () => 'Not the clue-giver', tone: 'info' },
  'you-are-clue-giver': { text: () => "You're giving the clue", tone: 'info' },
  'no-clue-yet': { text: () => 'Wait for the clue', tone: 'info' },
  'clue-already-given': { text: () => 'Clue already given', tone: 'info' },
  // Your partner turned that cell over in the same moment.
  'already-revealed': { text: () => 'Already revealed', tone: 'info' },

  // ── strands ──
  // The earned-hint economy, which nothing else on the roster has. All three
  // are reachable, and in COOP the hint bar is shared — so a teammate can fill
  // it, spend it, or ring a word between your check and your click.
  'not-enough-hint-points': { text: () => 'Hint bar not full yet', tone: 'info' },
  'hint-already-showing': { text: () => 'A hint is already showing', tone: 'info' },
  // The one path check a teammate can cause: they found a word that overlaps
  // the path you were drawing. Every other path rejection means the FE built a
  // shape it should never have built.
  'path-crosses-found': { text: () => 'Crosses a found word' },

  // ── crosswords (the two importers) ──
  // Importing a puzzle depends on an outside service and, for NYT, a pasted
  // cookie — so these are real answers a player can fix (a fresh cookie, a
  // different date) or wait out (the service is down). Edge-fn-raised
  // (crosswords-import-nyt / -guardian); wording approved 2026-08-12. The
  // specific cause (HTTP status, bot challenge, bad JSON) stays in the
  // function's serve log.
  // The weekday walk found nothing: this club's players have done every
  // Monday (or whichever) back to the 2015 floor. Unreachable in practice —
  // that's ~600 games of one weekday — but it is a real branch, and a fault
  // would tell the player nothing they could act on. `info`: nobody erred.
  'no-unplayed-weekday': {
    text: () => "You've played every one of those",
    tone: 'info',
  },
  'nyt-auth': { text: () => 'NYT rejected the cookie — it may be expired' },
  'nyt-no-puzzle': { text: (d) => `No NYT crossword published for ${d[0]}` },
  'nyt-fetch': { text: () => "NYT couldn't be reached — try again later" },
  'guardian-fetch': { text: () => "The Guardian couldn't be reached — try again later" },

  // ── psychicnum ──
  // The FE checks board membership before submitting but NOT whether a word was
  // already tried, so this one is reached by ordinary typing — not a race, not a
  // broken client. The most straightforwardly player-facing key in the sweep.
  'already-guessed': { text: () => 'Already guessed' },
  // The two cheat rungs, exhausted. psychicnum RAISES here where stackdown
  // returns null and lets the FE narrate — a real divergence between the two
  // implementations of the same feature, recorded rather than smoothed over.
  'nothing-to-hint': { text: () => 'Nothing left to hint', tone: 'info' },
  'nothing-to-spoil': { text: () => 'Nothing left to show', tone: 'info' },
  // A setup choice the dictionary can't satisfy: more words than that band has.
  'too-few-words': { text: () => 'Not enough words at that difficulty' },

  // ── connections + strands (the dated archives) ──
  // Neither game lets you pick a puzzle any more: the server hands out the
  // earliest one none of the players has seen, in any club
  // (`next_puzzle_for_club`). This is what it says when there is no such
  // puzzle left, and it's reachable two ways — the setup dialog's Start, and
  // the in-game "New game". `info`, because nobody did anything wrong.
  //
  // The wording carefully doesn't say "you've played them all": with the
  // exclusion spanning clubs and players, the usual cause is that SOMEONE at
  // the table has, which reads as a lie to everyone else.
  'no-unplayed-puzzle': {
    text: () => 'Everyone here has played every puzzle',
    tone: 'info',
  },

  // ── connections ──
  // Elimination is connections' own end-state — four mistakes and you're out —
  // and in coop the mistake budget is SHARED, so a teammate's fourth wrong
  // guess can eliminate the team while your submit is in flight. `info`: it's
  // the state of the game, not a complaint about the guess.
  'eliminated': { text: () => 'Out of mistakes', tone: 'info' },

  // ── waffle ──
  // A shared coop grid with a shared swap budget, so both are lost races: a
  // teammate spent the last swap, or solved it, while your swap was in flight.
  'no-swaps-left': { text: () => 'No swaps left', tone: 'info' },

  // ── wordle ──
  // Both are per-player states a second submit can land on: the coop board is
  // shared, so a teammate's winning guess can arrive while yours is in flight.
  'already-solved': { text: () => 'Already solved', tone: 'info' },

  // ── wordiply ──
  // The guess budget is REAL and, in coop, SHARED — so a teammate can spend the
  // last of five between your check and your submit. That's a lost race, same
  // family as letterboxed's below.
  'no-guesses-left': { text: () => 'No guesses left', tone: 'info' },
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
  'base-too-common': { text: (d) => `${d[0]?.toUpperCase()} matches too many words` },
  'base-too-narrow': { text: (d) => `No long enough word contains ${d[0]?.toUpperCase()}` },

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
  // The three ways a player-typed board (setup.custom_sides) fails to make a
  // game. Like wordiply's pair above, these fire at CREATE time and land on the
  // setup dialog's error line rather than the below-board pill — and for the
  // same reason: the frontend validates the SHAPE of a board (twelve distinct
  // letters) and deliberately can't know whether those letters are one we can
  // prove solvable in two, since that needs the seed table.
  //
  // Three keys rather than one because the fixes are genuinely different, and
  // the dialog's slot is single-line so each stays a caption:
  //
  //   • unknown-board    — nothing to do but check what you typed. Named as
  //                        "letters" because the sorted SET is what missed;
  //                        rearranging them wouldn't help.
  //   • unverified-board — the letters were right, so this one says the
  //                        arrangement is wrong. Two letters swapped between
  //                        sides is the shape of it.
  //   • board-needs-band — the only one with an in-dialog fix, so the copy
  //                        names the number to raise the dictionary TO.
  //
  // A board this app produced reaches none of them: it came out of the seed
  // table, and its partition is the one that kept the pair playable.
  'unknown-board': { text: (d) => `No known solution for the letters in ${d[0]}` },
  'unverified-board': { text: (d) => `${d[0]} isn't solvable in two — check the sides` },
  'board-needs-band': { text: (d) => `That board needs dictionary ${d[0]} or higher` },
}
